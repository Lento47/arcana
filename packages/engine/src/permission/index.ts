import { LayerNode } from "@arcana/core/effect/layer-node"
import { ConfigPermissionV1 } from "@arcana/core/v1/config/permission"
import { InstanceState } from "@/effect/instance-state"
import { Wildcard } from "@arcana/core/util/wildcard"
import { Deferred, Effect, Layer, Context } from "effect"
import os from "os"
import { PermissionV1 } from "@arcana/core/v1/permission"
import { EventV2Bridge } from "@/event-v2-bridge"
import { EventV2 } from "@arcana/core/event"
import { desktopOnline } from "@/approval/desktop-subscribers"
import { riskFromMetadata, riskRequiresFreshAsk, riskRequiresInitialAsk } from "./risk-policy"

export const Event = {
  Asked: EventV2.define({ type: "permission.asked", schema: PermissionV1.Request.fields }),
  Replied: EventV2.define({
    type: "permission.replied",
    schema: {
      sessionID: PermissionV1.Request.fields.sessionID,
      requestID: PermissionV1.ID,
      reply: PermissionV1.Reply,
    },
  }),
}

export interface Interface {
  readonly ask: (input: PermissionV1.AskInput) => Effect.Effect<void, PermissionV1.Error>
  readonly reply: (input: PermissionV1.ReplyInput) => Effect.Effect<void, PermissionV1.NotFoundError>
  readonly list: () => Effect.Effect<ReadonlyArray<PermissionV1.Request>>
}

interface PendingEntry {
  info: PermissionV1.Request
  deferred: Deferred.Deferred<void, PermissionV1.RejectedError | PermissionV1.CorrectedError>
}

interface State {
  pending: Map<PermissionV1.ID, PendingEntry>
  approved: PermissionV1.Rule[]
  // IDs of requests that have already been resolved (approved, rejected, or
  // cascade-rejected). Tracked so a duplicate reply to a resolved request is
  // idempotent (double-Enter, cascade races) without swallowing genuinely
  // unknown IDs — those still surface as NotFoundError to preserve the 404
  // contract. See bc4a95d for the idempotency rationale.
  resolved: Set<PermissionV1.ID>
}

export function evaluate(permission: string, pattern: string, ...rulesets: PermissionV1.Ruleset[]): PermissionV1.Rule {
  return (
    rulesets
      .flat()
      .findLast((rule) => Wildcard.match(permission, rule.permission) && Wildcard.match(pattern, rule.pattern)) ?? {
      action: "ask",
      permission,
      pattern: "*",
    }
  )
}

export class Service extends Context.Service<Service, Interface>()("@arcana/Permission") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const events = yield* EventV2Bridge.Service
    const state = yield* InstanceState.make<State>(
      Effect.fn("Permission.state")(function* (ctx) {
        void ctx
        const state = {
          pending: new Map<PermissionV1.ID, PendingEntry>(),
          approved: [],
          resolved: new Set<PermissionV1.ID>(),
        }

        yield* Effect.addFinalizer(() =>
          Effect.gen(function* () {
            for (const item of state.pending.values()) {
              yield* Deferred.fail(item.deferred, new PermissionV1.RejectedError())
            }
            state.pending.clear()
          }),
        )

        return state
      }),
    )

    const ask = Effect.fn("Permission.ask")(function* (input: PermissionV1.AskInput) {
      const { approved, pending } = yield* InstanceState.get(state)
      const { ruleset, ...request } = input
      const engineRisk = riskFromMetadata(request.metadata)
      const forceInitialAskFromRisk = riskRequiresInitialAsk(engineRisk)
      const forceFreshAskFromRisk = riskRequiresFreshAsk(engineRisk)
      let needsAsk = false

      for (const pattern of request.patterns) {
        const configuredRule = evaluate(request.permission, pattern, ruleset)
        const approvedRule = evaluate(request.permission, pattern, approved)
        const rule = approvedRule.action !== "ask" ? approvedRule : configuredRule
        yield* Effect.logInfo("evaluated", {
          permission: request.permission,
          pattern,
          action: rule,
          configuredAction: configuredRule.action,
          approvedAction: approvedRule.action,
          engineRisk: engineRisk?.level,
          forceInitialAskFromRisk,
          forceFreshAskFromRisk,
        })
        if (configuredRule.action === "deny") {
          return yield* new PermissionV1.DeniedError({
            ruleset: ruleset.filter((rule) => Wildcard.match(request.permission, rule.permission)),
          })
        }
        if (approvedRule.action === "allow" && !forceFreshAskFromRisk) continue
        if (rule.action === "allow" && !forceInitialAskFromRisk) continue
        needsAsk = true
      }

      if (!needsAsk) return

      const id = request.id ?? PermissionV1.ID.ascending()
      const info: PermissionV1.Request = {
        id,
        sessionID: request.sessionID,
        permission: request.permission,
        patterns: request.patterns,
        metadata: request.metadata,
        always: request.always,
        tool: request.tool,
      }
      yield* Effect.logInfo("asking", {
        id,
        permission: info.permission,
        patterns: info.patterns,
        engineRisk: engineRisk?.level,
        riskReasons: engineRisk?.reasons,
      })

      // A live Arcana Desktop owns the ACTION GATE. Keep the TUI quiet and
      // let Desktop discover the pending request through /permission; when
      // no Desktop heartbeat is active, publish for the TUI as usual. This
      // must be the ONLY permission.asked publication — a second unconditional
      // publish would re-open the gate in the TUI even while Desktop is live.
      const directory = yield* InstanceState.directory
      if (!desktopOnline(directory)) {
        yield* events.publish(Event.Asked, info)
      }

      const deferred = yield* Deferred.make<void, PermissionV1.RejectedError | PermissionV1.CorrectedError>()
      pending.set(id, { info, deferred })
      return yield* Effect.ensuring(
        Deferred.await(deferred),
        Effect.sync(() => {
          pending.delete(id)
        }),
      )
    })

    const reply = Effect.fn("Permission.reply")(function* (input: PermissionV1.ReplyInput) {
      const { approved, pending, resolved } = yield* InstanceState.get(state)
      const existing = pending.get(input.requestID)
      // Idempotent: if the request was already resolved (double-Enter, race,
      // cascade reject), return silently — the user's intent was already
      // applied. A genuinely unknown ID (never asked, never resolved) is NOT
      // swallowed here — it falls through to NotFoundError to keep the 404
      // contract. See bc4a95d for the idempotency rationale.
      if (!existing) {
        if (resolved.has(input.requestID)) return Effect.void
        return yield* new PermissionV1.NotFoundError({ requestID: input.requestID })
      }

      pending.delete(input.requestID)
      resolved.add(input.requestID)
      yield* events.publish(Event.Replied, {
        sessionID: existing.info.sessionID,
        requestID: existing.info.id,
        reply: input.reply,
      })

      if (input.reply === "reject") {
        yield* Deferred.fail(
          existing.deferred,
          input.message
            ? new PermissionV1.CorrectedError({ feedback: input.message })
            : new PermissionV1.RejectedError(),
        )

        for (const [id, item] of pending.entries()) {
          if (item.info.sessionID !== existing.info.sessionID) continue
          pending.delete(id)
          resolved.add(id)
          yield* events.publish(Event.Replied, {
            sessionID: item.info.sessionID,
            requestID: item.info.id,
            reply: "reject",
          })
          yield* Deferred.fail(item.deferred, new PermissionV1.RejectedError())
        }
        return
      }

      yield* Deferred.succeed(existing.deferred, undefined)
      if (input.reply === "once") return

      for (const pattern of existing.info.always) {
        approved.push({
          permission: existing.info.permission,
          pattern,
          action: "allow",
        })
      }

      for (const [id, item] of pending.entries()) {
        if (item.info.sessionID !== existing.info.sessionID) continue
        const ok = item.info.patterns.every(
          (pattern) => evaluate(item.info.permission, pattern, approved).action === "allow",
        )
        if (!ok) continue
        pending.delete(id)
        resolved.add(id)
        yield* events.publish(Event.Replied, {
          sessionID: item.info.sessionID,
          requestID: item.info.id,
          reply: "always",
        })
        yield* Deferred.succeed(item.deferred, undefined)
      }
    })

    const list = Effect.fn("Permission.list")(function* () {
      const pending = (yield* InstanceState.get(state)).pending
      return Array.from(pending.values(), (item) => item.info)
    })

    return Service.of({ ask, reply, list })
  }),
)

function expand(pattern: string) {
  if (pattern.startsWith("~/")) return os.homedir() + pattern.slice(1)
  if (pattern === "~") return os.homedir()
  if (pattern.startsWith("$HOME/")) return os.homedir() + pattern.slice(5)
  if (pattern.startsWith("$HOME")) return os.homedir() + pattern.slice(5)
  return pattern
}

export function fromConfig(permission: ConfigPermissionV1.Info) {
  const ruleset: PermissionV1.Rule[] = []
  for (const [key, value] of Object.entries(permission)) {
    if (typeof value === "string") {
      ruleset.push({ permission: key, action: value, pattern: "*" })
      continue
    }
    ruleset.push(
      ...Object.entries(value).map(([pattern, action]) => ({ permission: key, pattern: expand(pattern), action })),
    )
  }
  return ruleset
}

export function merge(...rulesets: PermissionV1.Ruleset[]): PermissionV1.Rule[] {
  return rulesets.flat()
}

export function disabled(tools: string[], ruleset: PermissionV1.Ruleset): Set<string> {
  const edits = ["edit", "write", "apply_patch"]
  return new Set(
    tools.filter((tool) => {
      const permission = edits.includes(tool) ? "edit" : tool
      const rule = ruleset.findLast((rule) => Wildcard.match(permission, rule.permission))
      return rule?.pattern === "*" && rule.action === "deny"
    }),
  )
}

export const defaultLayer = layer.pipe(Layer.provide(EventV2Bridge.defaultLayer))

export const node = LayerNode.make(layer, [EventV2Bridge.node])

export * as Permission from "."
