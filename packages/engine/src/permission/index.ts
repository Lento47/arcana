import { LayerNode } from "@arcana/core/effect/layer-node"
import { ConfigPermissionV1 } from "@arcana/core/v1/config/permission"
import { InstanceState } from "@/effect/instance-state"
import { Wildcard } from "@arcana/core/util/wildcard"
import { Context, Deferred, Effect, Layer, Schema } from "effect"
import { existsSync } from "node:fs"
import os from "os"
import path from "node:path"
import { PermissionV1 } from "@arcana/core/v1/permission"
import { EventV2Bridge } from "@/event-v2-bridge"
import { EventV2 } from "@arcana/core/event"
import { AgentV2 } from "@arcana/core/agent"
import { ProjectV2 } from "@arcana/core/project"
import { PermissionSaved } from "@arcana/core/permission/saved"
import { desktopOnline } from "@/approval/desktop-subscribers"
import { EventStore } from "@/session/epistemic/event-store"
import {
  deploymentModeFromEnv,
  loadApprovalRoutingPolicy,
  resolveApprovalRoute,
} from "@/approval/routing"
import { riskFromMetadata, riskRequiresFreshAsk, riskRequiresInitialAsk } from "./risk-policy"
import { commandLooksLikeInstall, commandLooksLikeOpaqueExec } from "@/execution/install"
import { inspectEffect, type EffectInspectReport } from "@/execution/inspect"
import { loadGovernanceConfig } from "@arcana/core/governance-config"
import type { RiskLevel } from "@/execution/action"
import { enrichInspectOnline } from "@/execution/inspect-online"
import { noteParkedInstall } from "@/execution/install-notice"
import { mergeInspectWithClassifier } from "@/execution/inspect-ml"
import { SessionStatus } from "@/session/status"
import { Global } from "@arcana/core/global"

const LEGACY_APPROVALS_FILE = path.join(Global.Path.state, "permission-approvals.json")

export const Event = {
  Asked: EventV2.define({ type: "permission.asked", schema: PermissionV1.Request.fields }),
  Routed: EventV2.define({ type: "permission.routed", schema: PermissionV1.Request.fields }),
  Replied: EventV2.define({
    type: "permission.replied",
    schema: {
      sessionID: PermissionV1.Request.fields.sessionID,
      requestID: PermissionV1.ID,
      reply: PermissionV1.Reply,
    },
  }),
  Allowed: EventV2.define({
    type: "permission.allowed",
    schema: {
      sessionID: PermissionV1.Request.fields.sessionID,
      permission: PermissionV1.Request.fields.permission,
      patterns: PermissionV1.Request.fields.patterns,
      reason: Schema.Literals(["benign", "configured"]),
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
    const eventStore = yield* EventStore.Service
    const saved = yield* PermissionSaved.Service
    const status = yield* SessionStatus.Service
    if (existsSync(LEGACY_APPROVALS_FILE)) {
      yield* Effect.logWarning(
        "Ignoring legacy machine-global remembered permissions; review and recreate grants for this workspace and agent",
        { path: LEGACY_APPROVALS_FILE },
      )
    }
    const state = yield* InstanceState.make<State>(
      Effect.fn("Permission.state")(function* (ctx) {
        void ctx
        const state = {
          pending: new Map<PermissionV1.ID, PendingEntry>(),
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

    const rememberedRules = Effect.fn("Permission.rememberedRules")(function* (input: {
      projectID: ProjectV2.ID
      agentID: AgentV2.ID
    }) {
      return (yield* saved.list(input)).map(
        (item): PermissionV1.Rule => ({ permission: item.action, pattern: item.resource, action: "allow" }),
      )
    })

    const routeFor = (input: {
      directory: string
      sessionID: PermissionV1.Request["sessionID"]
      permission: string
      risk: ReturnType<typeof riskFromMetadata>
    }): NonNullable<PermissionV1.Request["routing"]> => {
      const online = desktopOnline(input.directory)
      const resolution = resolveApprovalRoute(loadApprovalRoutingPolicy(input.directory), {
        sessionId: input.sessionID,
        workspaceId: input.directory,
        action: input.permission,
        riskClass: input.risk
          ? ({ low: "LOW", medium: "MODERATE", high: "HIGH", critical: "CRITICAL" } as const)[input.risk.level]
          : "LOW",
        deploymentMode: deploymentModeFromEnv(),
        desktopOnline: online,
      })
      return {
        route: resolution.route,
        decisionSurface: resolution.decisionSurface,
        localFallbackAllowed: resolution.localFallbackAllowed,
        desktopOnline: resolution.desktopOnline,
        policyVersion: resolution.policyVersion,
      }
    }

    const refreshPermissionStatus = Effect.fn("Permission.refreshStatus")(function* (
      sessionID: PermissionV1.Request["sessionID"],
    ) {
      const { pending } = yield* InstanceState.get(state)
      const next = Array.from(pending.values()).find((item) => item.info.sessionID === sessionID)
      if (!next) {
        yield* status.set(sessionID, { type: "busy" })
        return
      }
      yield* status.set(sessionID, {
        type: "waiting",
        reason: "permission",
        requestID: next.info.id,
        decisionSurface: next.info.routing?.decisionSurface ?? "LOCAL_TUI",
      })
    })

    const ask = Effect.fn("Permission.ask")(function* (input: PermissionV1.AskInput) {
      const { pending } = yield* InstanceState.get(state)
      const directory = yield* InstanceState.directory
      const governance = loadGovernanceConfig(directory)
      const { ruleset, ...request } = input
      const engineRisk = riskFromMetadata(request.metadata)
      // Machine layer: the Signal Engine classifier runs on governed tool
      // asks (default "signals") and can only escalate deterministic
      // findings — it never downgrades a firewall verdict. "off" restores
      // the pure deterministic path.
      const baseInspect = inspectReportFromMetadata(request.metadata)
      const inspect =
        governance.config.policy.classifierMode === "off"
          ? baseInspect
          : mergeInspectWithClassifier(baseInspect, request.permission, request.metadata)
      const command = typeof request.metadata.command === "string" ? request.metadata.command : ""
      const installAttempt = commandLooksLikeInstall(command) || inspectIsInstall(inspect)
      const opaqueAttempt = commandLooksLikeOpaqueExec(command)
      const forceInitialAskFromRisk = riskRequiresInitialAsk(engineRisk) || installAttempt || opaqueAttempt
      const forceFreshAskFromRisk = riskRequiresFreshAsk(engineRisk) || installAttempt || opaqueAttempt
      // Legacy/non-session callers do not carry project identity. Scope their
      // remembered rules to the active instance directory instead of falling
      // back to the machine-global project.
      const projectID = request.projectID ?? ProjectV2.ID.make(directory)
      const agentID = request.agentID ?? AgentV2.defaultID
      const rememberedPolicy = governance.config.policy.rememberedPermissions
      const rememberedEligible =
        rememberedPolicy?.enabled !== false
        && engineRisk?.level !== "critical"
        // Missing risk metadata is treated as MODERATE for persistence. It
        // may pass the default ceiling, but never a LOW-only policy.
        && (rememberedPolicy?.maxRisk !== "LOW" || engineRisk?.level === "low")
      const approved = rememberedEligible ? yield* rememberedRules({ projectID, agentID }) : []
      let needsAsk = false
      let benignAutoAllowedAny = false
      // Local-firewall benign: allow by default unless this is an install or
      // opaque exec (which always need analysis), a configured deny matches,
      // or the coarse kernel risk disagrees at high/critical (fail closed).
      const benignAutoAllowed =
        inspect?.verdict === "benign" &&
        governance.config.policy.autoAllowBenign !== false &&
        !installAttempt &&
        !opaqueAttempt &&
        engineRisk?.level !== "high" &&
        engineRisk?.level !== "critical" &&
        !engineRisk?.required_controls.includes("human_review")

      if (inspect?.verdict === "block") {
        return yield* new PermissionV1.DeniedError({
          ruleset: [{ permission: request.permission, pattern: "*", action: "deny" }],
        })
      }

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
        if (approvedRule.action === "allow") continue
        if (rule.action === "allow" && !forceInitialAskFromRisk) continue
        if (benignAutoAllowed) {
          benignAutoAllowedAny = true
          yield* Effect.logInfo("benign auto-allowed", {
            permission: request.permission,
            patterns: request.patterns,
            verdict: inspect?.verdict,
            risk: engineRisk?.level,
          })
          continue
        }
        needsAsk = true
      }

      if (!needsAsk) {
        const allowed: EventV2.Data<typeof Event.Allowed> = {
          sessionID: request.sessionID,
          permission: request.permission,
          patterns: request.patterns,
          reason: benignAutoAllowedAny ? "benign" : "configured",
        }
        yield* events.publish(Event.Allowed, allowed)
        // Durable operator evidence: the governance bridge only forwards
        // committed ArcanaEvents, so the decision must land in the EventStore
        // (best-effort — a storage failure never fails the permission grant).
        yield* eventStore.append({
          sessionId: request.sessionID,
          actor: { kind: "policy", id: "permission" },
          type: "permission.allowed",
          payload: allowed,
        }).pipe(Effect.catch(() => Effect.void), Effect.ignore)
        return
      }

      let metadata = request.metadata
      if (installAttempt) {
        const seeded = inspectReportFromMetadata(metadata)
          ?? inspectEffect({ tool: request.permission, args: { command, ...metadata } })
        const enriched = yield* Effect.promise(() => enrichInspectOnline(seeded)).pipe(
          Effect.catch(() => Effect.succeed(seeded)),
        )
        metadata = mergeInspectMetadata(metadata, enriched)
        if (enriched.verdict === "block") {
          return yield* new PermissionV1.DeniedError({
            ruleset: [{ permission: request.permission, pattern: "*", action: "deny" }],
          })
        }
      }

      const id = request.id ?? PermissionV1.ID.ascending()
      const info: PermissionV1.Request = {
        id,
        sessionID: request.sessionID,
        projectID,
        agentID,
        permission: request.permission,
        patterns: request.patterns,
        metadata,
        // `always` is also the wire-level capability advertisement. Strip it
        // when the engine would downgrade an `always` reply so every client
        // renders the same authoritative eligibility decision.
        always: rememberedEligible ? request.always : [],
        tool: request.tool,
        routing: routeFor({ directory, sessionID: request.sessionID, permission: request.permission, risk: engineRisk }),
      }
      if (installAttempt) {
        const parkedCommand =
          command
          || (typeof metadata.command === "string" ? metadata.command : "")
          || info.patterns.join(" ")
        noteParkedInstall(request.sessionID, id, parkedCommand)
      }
      yield* Effect.logInfo("asking", {
        id,
        permission: info.permission,
        patterns: info.patterns,
        engineRisk: engineRisk?.level,
        riskReasons: engineRisk?.reasons,
      })

      const deferred = yield* Deferred.make<void, PermissionV1.RejectedError | PermissionV1.CorrectedError>()
      pending.set(id, { info, deferred })
      yield* events.publish(Event.Asked, info).pipe(
        Effect.onError(() => Effect.sync(() => pending.delete(id))),
      )
      yield* refreshPermissionStatus(info.sessionID)

      const monitorRoute = Effect.gen(function* () {
        while (true) {
          yield* Effect.sleep("1 second")
          const current = pending.get(id)
          if (!current) return yield* Effect.never
          if (current.info.routing?.decisionSurface === "LOCAL_TUI") continue
          const routing = routeFor({
            directory,
            sessionID: current.info.sessionID,
            permission: current.info.permission,
            risk: riskFromMetadata(current.info.metadata),
          })
          if (
            routing.decisionSurface === current.info.routing?.decisionSurface
            && routing.desktopOnline === current.info.routing.desktopOnline
          ) continue
          current.info = { ...current.info, routing }
          yield* events.publish(Event.Routed, current.info)
          yield* refreshPermissionStatus(current.info.sessionID)
        }
      })
      return yield* Effect.ensuring(
        Effect.raceFirst(Deferred.await(deferred), monitorRoute),
        Effect.gen(function* () {
          pending.delete(id)
          yield* refreshPermissionStatus(info.sessionID)
        }),
      )
    })

    const reply = Effect.fn("Permission.reply")(function* (input: PermissionV1.ReplyInput) {
      const { pending, resolved } = yield* InstanceState.get(state)
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

      if (input.reply === "reject") {
        pending.delete(input.requestID)
        resolved.add(input.requestID)
        yield* events.publish(Event.Replied, {
          sessionID: existing.info.sessionID,
          requestID: existing.info.id,
          reply: input.reply,
        })
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
        yield* refreshPermissionStatus(existing.info.sessionID)
        return
      }

      let effectiveReply = input.reply
      if (input.reply === "always" && existing.info.always.length) {
        const governance = loadGovernanceConfig(yield* InstanceState.directory)
        const risk = riskFromMetadata(existing.info.metadata)
        const command = typeof existing.info.metadata.command === "string" ? existing.info.metadata.command : ""
        const maxRisk = governance.config.policy.rememberedPermissions?.maxRisk ?? "MODERATE"
        const eligible =
          governance.config.policy.rememberedPermissions?.enabled !== false
          && !riskRequiresFreshAsk(risk)
          && !commandLooksLikeInstall(command)
          && !commandLooksLikeOpaqueExec(command)
          && (maxRisk !== "LOW" || risk?.level === "low")
        if (eligible) {
          yield* saved.add({
            projectID: existing.info.projectID ?? ProjectV2.ID.global,
            agentID: existing.info.agentID ?? AgentV2.defaultID,
            action: existing.info.permission,
            resources: existing.info.always,
          })
        } else effectiveReply = "once"
      }
      if (input.reply === "always" && existing.info.always.length === 0) effectiveReply = "once"

      pending.delete(input.requestID)
      resolved.add(input.requestID)
      yield* events.publish(Event.Replied, {
        sessionID: existing.info.sessionID,
        requestID: existing.info.id,
        reply: effectiveReply,
      })
      yield* Deferred.succeed(existing.deferred, undefined)
      if (effectiveReply === "once") {
        yield* refreshPermissionStatus(existing.info.sessionID)
        return
      }

      const approved = yield* rememberedRules({
        projectID: existing.info.projectID ?? ProjectV2.ID.global,
        agentID: existing.info.agentID ?? AgentV2.defaultID,
      })

      for (const [id, item] of pending.entries()) {
        if (item.info.sessionID !== existing.info.sessionID) continue
        if ((item.info.projectID ?? ProjectV2.ID.global) !== (existing.info.projectID ?? ProjectV2.ID.global)) continue
        if ((item.info.agentID ?? AgentV2.defaultID) !== (existing.info.agentID ?? AgentV2.defaultID)) continue
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
      yield* refreshPermissionStatus(existing.info.sessionID)
    })

    const list = Effect.fn("Permission.list")(function* () {
      const pending = (yield* InstanceState.get(state)).pending
      return Array.from(pending.values(), (item) => item.info)
    })

    return Service.of({ ask, reply, list })
  }),
)

function inspectFromMetadata(metadata: Record<string, unknown>): { verdict?: string; findings?: unknown } | undefined {
  const action = metadata.engine_action
  if (!action || typeof action !== "object" || Array.isArray(action)) return undefined
  const inspect = (action as { inspect?: unknown }).inspect
  if (!inspect || typeof inspect !== "object" || Array.isArray(inspect)) return undefined
  return inspect as { verdict?: string; findings?: unknown }
}

function inspectReportFromMetadata(metadata: Record<string, unknown>): EffectInspectReport | undefined {
  const inspect = inspectFromMetadata(metadata)
  if (!inspect) return undefined
  const findings = Array.isArray(inspect.findings)
    ? inspect.findings.flatMap((item) => {
        if (!item || typeof item !== "object") return []
        const row = item as { code?: unknown; severity?: unknown; title?: unknown; detail?: unknown }
        if (typeof row.code !== "string" || typeof row.title !== "string") return []
        const severity: RiskLevel = row.severity === "low" || row.severity === "medium" || row.severity === "high" || row.severity === "critical"
          ? row.severity
          : "high"
        return [{
          code: row.code,
          severity,
          title: row.title,
          detail: typeof row.detail === "string" ? row.detail : "",
        }]
      })
    : []
  const action = metadata.engine_action
  const full = action && typeof action === "object" && !Array.isArray(action)
    ? (action as { inspect?: { risk?: unknown; subjects?: unknown; controls?: unknown; verdict?: unknown } }).inspect
    : undefined
  const risk = full?.risk === "low" || full?.risk === "medium" || full?.risk === "high" || full?.risk === "critical"
    ? full.risk
    : "high"
  return {
    verdict: inspect.verdict === "block" || inspect.verdict === "benign" || inspect.verdict === "review"
      ? inspect.verdict
      : "review",
    risk,
    findings,
    subjects: Array.isArray(full?.subjects)
      ? full.subjects.flatMap((item) => {
          if (!item || typeof item !== "object") return []
          const row = item as { kind?: unknown; value?: unknown }
          if (typeof row.value !== "string") return []
          const kind = row.kind === "package" || row.kind === "url" || row.kind === "command" || row.kind === "path" || row.kind === "repo"
            ? row.kind
            : "command"
          return [{ kind, value: row.value }]
        })
      : [],
    controls: Array.isArray(full?.controls)
      ? full.controls.filter((item): item is string => typeof item === "string")
      : [],
  }
}

function mergeInspectMetadata(
  metadata: Record<string, unknown>,
  inspect: EffectInspectReport,
): Record<string, unknown> {
  const action = metadata.engine_action
  const current = action && typeof action === "object" && !Array.isArray(action)
    ? { ...(action as Record<string, unknown>) }
    : {}
  return {
    ...metadata,
    engine_action: {
      ...current,
      inspect,
    },
  }
}

function inspectIsInstall(inspect: { findings?: unknown } | undefined): boolean {
  if (!Array.isArray(inspect?.findings)) return false
  return inspect.findings.some(
    (item) =>
      item
      && typeof item === "object"
      && (item as { code?: unknown }).code === "PACKAGE_MUTATION",
  )
}

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

export const defaultLayer = layer.pipe(
  Layer.provide(PermissionSaved.defaultLayer),
  Layer.provide(SessionStatus.defaultLayer),
  Layer.provide(EventStore.defaultLayer),
  Layer.provide(EventV2Bridge.defaultLayer),
)

export const node = LayerNode.make(layer, [EventV2Bridge.node, EventStore.node, PermissionSaved.node, SessionStatus.node])

export * as Permission from "."
