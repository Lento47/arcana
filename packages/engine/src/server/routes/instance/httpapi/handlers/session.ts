import { PermissionV1 } from "@arcana/core/v1/permission"
import { Agent } from "@/agent/agent"
import { SessionV1 } from "@arcana/core/v1/session"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Command } from "@/command"
import { Permission } from "@/permission"
import { SessionShare } from "@/share/session"
import { Session } from "@/session/session"
import { SessionCompaction } from "@/session/compaction"
import { MessageV2 } from "@/session/message-v2"
import { SessionPrompt } from "@/session/prompt"
import { SessionRevert } from "@/session/revert"
import { SessionRunState } from "@/session/run-state"
import { SessionStatus } from "@/session/status"
import { SessionSummary } from "@/session/summary"
import { Todo } from "@/session/todo"
import { EventStore } from "@/session/epistemic/event-store"
import { RunProof } from "@/session/epistemic/run-proof"
import { ObligationEngine } from "@/session/epistemic/obligation-engine"
import { CapabilityRevocation } from "@/session/capability-revocation"
import { Database } from "@arcana/core/database/database"
import { SqliteGrantStore } from "@arcana/core/capability/grant-store-sqlite"
import { revokeWithCascade, type RuntimeGrantStore } from "@arcana/core/capability/runtime-delegation"
import { MessageID, PartID, SessionID } from "@/session/schema"
import { NamedError } from "@arcana/core/util/error"
import { Cause, Effect, Option, Schema, Scope } from "effect"
import * as Stream from "effect/Stream"
import { HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { HttpApiBuilder, HttpApiError, HttpApiSchema } from "effect/unstable/httpapi"
import { InstanceHttpApi } from "../api"
import {
  CommandPayload,
  DiffQuery,
  ForkPayload,
  InitPayload,
  ListQuery,
  MessagesQuery,
  PermissionResponsePayload,
  PromptPayload,
  RetryPayload,
  RevertPayload,
  ShellPayload,
  SummarizePayload,
  UpdatePayload,
  RevokeCapabilityPayload,
  RevokeCapabilityResult,
  VerifyObligationPayload,
  VerifyObligationResult,
} from "../groups/session"
import { ApiNotFoundError, ConflictError, PermissionNotFoundError, notFound } from "../errors"
import * as SessionError from "./session-errors"

const tryParseJson = (text: string) =>
  Effect.try({
    try: () => JSON.parse(text) as unknown,
    catch: () => new HttpApiError.BadRequest({}),
  })

export const sessionHandlers = HttpApiBuilder.group(InstanceHttpApi, "session", (handlers) =>
  Effect.gen(function* () {
    const session = yield* Session.Service
    const shareSvc = yield* SessionShare.Service
    const promptSvc = yield* SessionPrompt.Service
    const revertSvc = yield* SessionRevert.Service
    const compactSvc = yield* SessionCompaction.Service
    const runState = yield* SessionRunState.Service
    const agentSvc = yield* Agent.Service
    const permissionSvc = yield* Permission.Service
    const statusSvc = yield* SessionStatus.Service
    const todoSvc = yield* Todo.Service
    const summary = yield* SessionSummary.Service
    const events = yield* EventV2Bridge.Service
    const eventStore = yield* EventStore.Service
    const runProof = yield* RunProof.Service
    const obligations = yield* ObligationEngine.Service
    const database = yield* Database.Service
    const scope = yield* Scope.Scope

    const list = Effect.fn("SessionHttpApi.list")(function* (ctx: { query: typeof ListQuery.Type }) {
      return yield* session.list({
        directory: ctx.query.scope === "project" ? undefined : ctx.query.directory,
        scope: ctx.query.scope,
        path: ctx.query.path,
        roots: ctx.query.roots,
        start: ctx.query.start,
        search: ctx.query.search,
        limit: ctx.query.limit,
      })
    })

    const status = Effect.fn("SessionHttpApi.status")(function* () {
      return Object.fromEntries(yield* statusSvc.list())
    })

    const requireSession = Effect.fn("SessionHttpApi.requireSession")(function* (sessionID: SessionID) {
      return yield* SessionError.mapStorageNotFound(session.get(sessionID))
    })

    const get = Effect.fn("SessionHttpApi.get")(function* (ctx: { params: { sessionID: SessionID } }) {
      return yield* requireSession(ctx.params.sessionID)
    })

    const children = Effect.fn("SessionHttpApi.children")(function* (ctx: { params: { sessionID: SessionID } }) {
      yield* requireSession(ctx.params.sessionID)
      return yield* session.children(ctx.params.sessionID)
    })

    const todo = Effect.fn("SessionHttpApi.todo")(function* (ctx: { params: { sessionID: SessionID } }) {
      yield* requireSession(ctx.params.sessionID)
      return yield* todoSvc.get(ctx.params.sessionID)
    })

    const diff = Effect.fn("SessionHttpApi.diff")(function* (ctx: {
      params: { sessionID: SessionID }
      query: typeof DiffQuery.Type
    }) {
      return yield* summary.diff({ sessionID: ctx.params.sessionID, messageID: ctx.query.messageID })
    })

    const messages = Effect.fn("SessionHttpApi.messages")(function* (ctx: {
      params: { sessionID: SessionID }
      query: typeof MessagesQuery.Type
    }) {
      if (ctx.query.before && ctx.query.limit === undefined) return yield* new HttpApiError.BadRequest({})
      if (ctx.query.before) {
        const before = ctx.query.before
        yield* Effect.try({
          try: () => MessageV2.cursor.decode(before),
          catch: () => new HttpApiError.BadRequest({}),
        })
      }
      yield* requireSession(ctx.params.sessionID)

      // Return cursor alongside items so the client can paginate without
      // parsing response headers (SDK strips headers from typed responses).
      if (ctx.query.limit === undefined || ctx.query.limit === 0) {
        const items = yield* SessionError.mapStorageNotFound(
          session.messages({ sessionID: ctx.params.sessionID }),
        )
        return { items, cursor: undefined }
      }

      const page = yield* SessionError.mapStorageNotFound(
        MessageV2.page({
          sessionID: ctx.params.sessionID,
          limit: ctx.query.limit,
          before: ctx.query.before,
        }),
      )
      if (!page.cursor) return { items: page.items, cursor: undefined }

      const request = yield* HttpServerRequest.HttpServerRequest
      // toURL() honors the Host + x-forwarded-proto headers, so the Link
      // header echoes the real origin instead of a hard-coded localhost.
      const url = Option.getOrElse(HttpServerRequest.toURL(request), () => new URL(request.url, "http://localhost"))
      url.searchParams.set("limit", ctx.query.limit.toString())
      url.searchParams.set("before", page.cursor)
      return HttpServerResponse.jsonUnsafe(
        { items: page.items, cursor: page.cursor },
        {
          headers: {
            "Access-Control-Expose-Headers": "Link, X-Next-Cursor",
            Link: `<${url.toString()}>; rel="next"`,
            "X-Next-Cursor": page.cursor,
          },
        },
      )
    })

    const message = Effect.fn("SessionHttpApi.message")(function* (ctx: {
      params: { sessionID: SessionID; messageID: MessageID }
    }) {
      return yield* SessionError.mapStorageNotFound(
        MessageV2.get({ sessionID: ctx.params.sessionID, messageID: ctx.params.messageID }),
      )
    })

    const governance = Effect.fn("SessionHttpApi.governance")(function* (ctx: {
      params: { sessionID: SessionID }
      query: { limit?: number }
    }) {
      yield* requireSession(ctx.params.sessionID)
      // Payload slimming (2026-08-23 audit): long sessions accumulate
      // thousands of governance events; returning all of them made session
      // open slow and heavy. Cap to the most recent window — the TUI only
      // renders the tail by default.
      const limit = Math.min(Math.max(ctx.query.limit ?? 300, 50), 1000)
      const [events, trace, proof, totals] = yield* Effect.all([
        eventStore.listGovernance(ctx.params.sessionID, limit),
        eventStore.sessionTraceHealth(ctx.params.sessionID),
        runProof.derive(ctx.params.sessionID),
        eventStore.governanceTotals(ctx.params.sessionID),
      ])
      return {
        sessionId: ctx.params.sessionID,
        trace,
        events,
        eventsLimit: limit,
        ...(events.length === limit ? { eventsTruncated: true } : {}),
        totals,
        proof: {
          proofHash: proof.proofHash,
          runRoot: proof.runRoot,
          derivedAt: proof.derivedAt,
          eventCount: proof.eventCount,
          lastSequence: proof.events.at(-1)?.sequence ?? 0,
          proofLevel: proof.proofLevel,
          traceHealth: proof.traceHealth,
          integrityStatus: proof.integrityStatus,
          lifecycleStatus: proof.lifecycleStatus,
          ...(proof.completionMethod === null ? {} : { completionMethod: proof.completionMethod }),
          assuranceProfile: {
            trace: proof.assuranceProfile.trace,
            integrity: proof.assuranceProfile.integrity,
            verification: proof.assuranceProfile.verification,
            reproducibility: proof.assuranceProfile.reproducibility,
            ...(proof.assuranceProfile.reproducibilityDetail === null
              ? {}
              : { reproducibilityDetail: proof.assuranceProfile.reproducibilityDetail }),
          },
          ...(proof.contractStatus === null ? {} : { contractStatus: proof.contractStatus }),
          claimsByStatus: proof.claimsByStatus,
          obligationsByStatus: proof.obligationsByStatus,
          gaps: proof.gaps,
          authorizationProfile: proof.authorizationProfile,
        },
      }
    })

    const revokeCapability = Effect.fn("SessionHttpApi.revokeCapability")(function* (ctx: {
      params: { sessionID: SessionID; capabilityID: string }
      payload?: typeof RevokeCapabilityPayload.Type
    }) {
      yield* requireSession(ctx.params.sessionID)
      const grantStore = new SqliteGrantStore(database)
      const reason = ctx.payload?.reason ?? "OPERATOR_REVOKE"
      const result = yield* CapabilityRevocation.revokeCapabilityWithCascade(
        {
          loadGrant: (capabilityId) =>
            grantStore
              .getGrantById(capabilityId)
              .pipe(Effect.catch(() => Effect.succeed(null))),
          revokeCascade: (grantId, revokedEventId) =>
            // CAST BOUNDARY #8 — revokeWithCascade needs the RuntimeGrantStore
            // transaction member, but only uses getAllGrants + updateStatus.
            // SqliteGrantStore covers both; the cast is narrow and documented.
            revokeWithCascade(
              grantId,
              grantStore as unknown as RuntimeGrantStore,
              revokedEventId,
            ).pipe(Effect.catch(() => Effect.succeed({ revokedIds: [] as string[] }))),
          emitRevoked: ({ capabilityId, reason: revokedReason }) =>
            eventStore
              .append({
                sessionId: ctx.params.sessionID,
                actor: { kind: "policy", id: "capability-revocation" },
                type: "capability.revoked",
                payload: {
                  capabilityId,
                  reason: revokedReason,
                  sessionId: ctx.params.sessionID,
                },
              })
              .pipe(Effect.asVoid, Effect.catch(() => Effect.void)),
        },
        { sessionId: ctx.params.sessionID, capabilityId: ctx.params.capabilityID },
      ).pipe(Effect.catch(() => Effect.succeed({ revokedIds: [] as string[] })))

      if (result.revokedIds.length === 0) {
        return yield* notFound(
          `Capability ${ctx.params.capabilityID} is not an active grant of session ${ctx.params.sessionID}`,
        )
      }
      return { revokedIds: [...result.revokedIds], reason } satisfies typeof RevokeCapabilityResult.Type
    })

    const verifyObligation = Effect.fn("SessionHttpApi.verifyObligation")(function* (ctx: {
      params: { sessionID: SessionID; obligationID: string }
      payload?: typeof VerifyObligationPayload.Type
    }) {
      yield* requireSession(ctx.params.sessionID)
      const owningSession = yield* obligations.getOwningSession(ctx.params.obligationID)
      if (!owningSession || owningSession !== ctx.params.sessionID) {
        return yield* notFound(
          `Obligation ${ctx.params.obligationID} does not belong to session ${ctx.params.sessionID}`,
        )
      }
      if (!ctx.payload?.reason.trim()) {
        return yield* new HttpApiError.BadRequest({})
      }
      yield* obligations.recordVerification({
        obligationId: ctx.params.obligationID,
        outcome: ctx.payload.outcome,
        reason: ctx.payload.reason,
        ...(ctx.payload.details ? { details: ctx.payload.details } : {}),
      })
      return {
        obligationId: ctx.params.obligationID,
        status: ctx.payload.outcome,
      } satisfies typeof VerifyObligationResult.Type
    })

    const create = Effect.fn("SessionHttpApi.create")(function* (ctx: { payload?: Session.CreateInput }) {
      return yield* shareSvc.create(ctx.payload)
    })

    const createRaw = Effect.fn("SessionHttpApi.createRaw")(function* (ctx: {
      request: HttpServerRequest.HttpServerRequest
    }) {
      const body = yield* Effect.orDie(ctx.request.text)
      if (body.trim().length === 0) return yield* create({})

      const json = yield* tryParseJson(body)
      const decoded = yield* Schema.decodeUnknownEffect(Session.CreateInput)(json).pipe(
        Effect.mapError(() => new HttpApiError.BadRequest({})),
      )
      const payload = decoded
        ? {
            ...decoded,
            permission: decoded.permission ? [...decoded.permission] : undefined,
          }
        : decoded
      return yield* create({ payload })
    })

    const remove = Effect.fn("SessionHttpApi.remove")(function* (ctx: { params: { sessionID: SessionID } }) {
      yield* SessionError.mapStorageNotFound(session.remove(ctx.params.sessionID))
      return true
    })

    const update = Effect.fn("SessionHttpApi.update")(function* (ctx: {
      params: { sessionID: SessionID }
      payload: typeof UpdatePayload.Type
    }) {
      const current = yield* requireSession(ctx.params.sessionID)
      if (ctx.payload.title !== undefined) {
        yield* session.setTitle({ sessionID: ctx.params.sessionID, title: ctx.payload.title })
      }
      if (ctx.payload.metadata !== undefined) {
        yield* session.setMetadata({ sessionID: ctx.params.sessionID, metadata: ctx.payload.metadata })
      }
      if (ctx.payload.permission !== undefined) {
        yield* session.setPermission({
          sessionID: ctx.params.sessionID,
          permission: Permission.merge(current.permission ?? [], ctx.payload.permission),
        })
      }
      if (ctx.payload.time?.archived !== undefined) {
        yield* session.setArchived({ sessionID: ctx.params.sessionID, time: ctx.payload.time.archived })
      }
      return yield* requireSession(ctx.params.sessionID)
    })

    const fork = Effect.fn("SessionHttpApi.fork")(function* (ctx: {
      params: { sessionID: SessionID }
      payload?: typeof ForkPayload.Type
    }) {
      return yield* SessionError.mapStorageNotFound(
        session.fork({
          sessionID: ctx.params.sessionID,
          messageID: ctx.payload?.messageID,
        }),
      )
    })

    const forkRaw = Effect.fn("SessionHttpApi.forkRaw")(function* (ctx: {
      params: { sessionID: SessionID }
      request: HttpServerRequest.HttpServerRequest
    }) {
      const body = yield* Effect.orDie(ctx.request.text)
      if (body.trim().length === 0) return yield* fork({ params: ctx.params })

      const json = yield* tryParseJson(body)
      const payload = yield* Schema.decodeUnknownEffect(ForkPayload)(json).pipe(
        Effect.mapError(() => new HttpApiError.BadRequest({})),
      )
      return yield* fork({ params: ctx.params, payload })
    })

    const abort = Effect.fn("SessionHttpApi.abort")(function* (ctx: { params: { sessionID: SessionID } }) {
      // Abort is a best-effort no-op: cancelling a session that does not exist
      // (or cannot be reached) must still resolve, never 500.
      yield* promptSvc.cancel(ctx.params.sessionID).pipe(Effect.catchCause(() => Effect.void))
      return true
    })

    const init = Effect.fn("SessionHttpApi.init")(function* (ctx: {
      params: { sessionID: SessionID }
      payload: typeof InitPayload.Type
    }) {
      yield* requireSession(ctx.params.sessionID)
      yield* promptSvc
        .command({
          sessionID: ctx.params.sessionID,
          messageID: ctx.payload.messageID,
          model: `${ctx.payload.providerID}/${ctx.payload.modelID}`,
          command: Command.Default.INIT,
          arguments: "",
        })
        .pipe(Effect.mapError(() => new HttpApiError.BadRequest({})))
      return true
    })

    // share/unshare errors aren't all client-induced — storage and network
    // failures from SessionShare are real possibilities. Map to a typed 500
    // (matches the legacy route behavior which routed any failure through
    // ErrorMiddleware → NamedError.Unknown 500) instead of blanket-mapping
    // every failure to a 400 BadRequest.
    const share = Effect.fn("SessionHttpApi.share")(function* (ctx: { params: { sessionID: SessionID } }) {
      yield* requireSession(ctx.params.sessionID)
      yield* shareSvc.share(ctx.params.sessionID).pipe(Effect.mapError(() => new HttpApiError.InternalServerError({})))
      return yield* requireSession(ctx.params.sessionID)
    })

    const unshare = Effect.fn("SessionHttpApi.unshare")(function* (ctx: { params: { sessionID: SessionID } }) {
      yield* requireSession(ctx.params.sessionID)
      yield* shareSvc
        .unshare(ctx.params.sessionID)
        .pipe(Effect.mapError(() => new HttpApiError.InternalServerError({})))
      return yield* requireSession(ctx.params.sessionID)
    })

    const summarize = Effect.fn("SessionHttpApi.summarize")(function* (ctx: {
      params: { sessionID: SessionID }
      payload: typeof SummarizePayload.Type
    }) {
      yield* revertSvc.cleanup(yield* requireSession(ctx.params.sessionID))
      const messages = yield* SessionError.mapStorageNotFound(session.messages({ sessionID: ctx.params.sessionID }))
      const defaultAgent = yield* agentSvc.defaultAgent()
      const currentAgent = messages.findLast((message) => message.info.role === "user")?.info.agent ?? defaultAgent

      yield* compactSvc.create({
        sessionID: ctx.params.sessionID,
        agent: currentAgent,
        model: {
          providerID: ctx.payload.providerID,
          modelID: ctx.payload.modelID,
        },
        auto: ctx.payload.auto ?? false,
      })
      yield* promptSvc.loop({ sessionID: ctx.params.sessionID })
      return true
    })

    const prompt = Effect.fn("SessionHttpApi.prompt")(function* (ctx: {
      params: { sessionID: SessionID }
      payload: typeof PromptPayload.Type
    }) {
      yield* requireSession(ctx.params.sessionID)
      const message = yield* promptSvc
        .prompt({
          ...ctx.payload,
          sessionID: ctx.params.sessionID,
        })
        .pipe(Effect.mapError(() => new HttpApiError.BadRequest({})))
      return HttpServerResponse.stream(Stream.make(JSON.stringify(message)).pipe(Stream.encodeText), {
        contentType: "application/json",
      })
    })

    const promptAsync = Effect.fn("SessionHttpApi.promptAsync")(function* (ctx: {
      params: { sessionID: SessionID }
      payload: typeof PromptPayload.Type
    }) {
      yield* requireSession(ctx.params.sessionID)
      yield* promptSvc.prompt({ ...ctx.payload, sessionID: ctx.params.sessionID }).pipe(
        Effect.catchCause((cause) =>
          Effect.gen(function* () {
            yield* Effect.logError("prompt_async failed", { sessionID: ctx.params.sessionID, cause })
            yield* events.publish(Session.Event.Error, {
              sessionID: ctx.params.sessionID,
              error: new NamedError.Unknown({ message: Cause.pretty(cause) }).toObject(),
            })
          }),
        ),
        Effect.forkIn(scope, { startImmediately: true }),
      )
      return HttpApiSchema.NoContent.make()
    })

    const retry = Effect.fn("SessionHttpApi.retry")(function* (ctx: {
      params: { sessionID: SessionID }
      payload: typeof RetryPayload.Type
    }) {
      yield* requireSession(ctx.params.sessionID)
      yield* SessionError.mapBusy(runState.assertNotBusy(ctx.params.sessionID))
      if ((ctx.payload.providerID === undefined) !== (ctx.payload.modelID === undefined)) {
        return yield* new HttpApiError.BadRequest({})
      }
      const failed = yield* MessageV2.get({
        sessionID: ctx.params.sessionID,
        messageID: ctx.payload.failedMessageID,
      }).pipe(SessionError.mapStorageNotFound)
      const latest = MessageV2.latest(
        yield* MessageV2.filterCompactedEffect(ctx.params.sessionID).pipe(
          Effect.provideService(Database.Service, database),
        ),
      ).assistant
      const apiError = failed.info.role === "assistant" && failed.info.error?.name === "APIError"
        ? failed.info.error
        : undefined
      const metadata = apiError?.data.metadata
      if (
        failed.info.role !== "assistant"
        || latest?.id !== failed.info.id
        || metadata?.retryExhausted !== "true"
        || metadata?.retryResumed === "true"
      ) {
        return yield* new ConflictError({
          resource: ctx.payload.failedMessageID,
          message: "Only the latest retry-exhausted assistant turn can be resumed",
        })
      }
      failed.info.error = new SessionV1.APIError({
        ...apiError!.data,
        metadata: { ...metadata, retryResumed: "true" },
      }).toObject()
      yield* session.updateMessage(failed.info)
      yield* promptSvc.loop({
        sessionID: ctx.params.sessionID,
        failedMessageID: ctx.payload.failedMessageID,
        agent: ctx.payload.agent,
        model: ctx.payload.providerID && ctx.payload.modelID
          ? { providerID: ctx.payload.providerID, modelID: ctx.payload.modelID }
          : undefined,
      }).pipe(
        Effect.catchCause((cause) => Effect.logError("manual retry failed", { sessionID: ctx.params.sessionID, cause })),
        Effect.forkIn(scope, { startImmediately: true }),
      )
      return HttpApiSchema.NoContent.make()
    })

    const command = Effect.fn("SessionHttpApi.command")(function* (ctx: {
      params: { sessionID: SessionID }
      payload: typeof CommandPayload.Type
    }) {
      yield* requireSession(ctx.params.sessionID)
      return yield* promptSvc
        .command({ ...ctx.payload, sessionID: ctx.params.sessionID })
        .pipe(Effect.mapError(() => new HttpApiError.BadRequest({})))
    })

    const shell = Effect.fn("SessionHttpApi.shell")(function* (ctx: {
      params: { sessionID: SessionID }
      payload: typeof ShellPayload.Type
    }) {
      yield* requireSession(ctx.params.sessionID)
      return yield* SessionError.mapBusy(promptSvc.shell({ ...ctx.payload, sessionID: ctx.params.sessionID }))
    })

    const revert = Effect.fn("SessionHttpApi.revert")(function* (ctx: {
      params: { sessionID: SessionID }
      payload: typeof RevertPayload.Type
    }) {
      yield* requireSession(ctx.params.sessionID)
      return yield* SessionError.mapBusy(revertSvc.revert({ sessionID: ctx.params.sessionID, ...ctx.payload }))
    })

    const unrevert = Effect.fn("SessionHttpApi.unrevert")(function* (ctx: { params: { sessionID: SessionID } }) {
      yield* requireSession(ctx.params.sessionID)
      return yield* SessionError.mapBusy(revertSvc.unrevert({ sessionID: ctx.params.sessionID }))
    })

    const permissionRespond = Effect.fn("SessionHttpApi.permissionRespond")(function* (ctx: {
      params: { sessionID: SessionID; permissionID: PermissionV1.ID }
      payload: typeof PermissionResponsePayload.Type
    }) {
      yield* requireSession(ctx.params.sessionID)
      yield* permissionSvc.reply({ requestID: ctx.params.permissionID, reply: ctx.payload.response }).pipe(
        Effect.catchTag("Permission.NotFoundError", (error) =>
          Effect.fail(
            new PermissionNotFoundError({
              requestID: String(error.requestID),
              message: `Permission request not found: ${error.requestID}`,
            }),
          ),
        ),
      )
      return true
    })

    const deleteMessage = Effect.fn("SessionHttpApi.deleteMessage")(function* (ctx: {
      params: { sessionID: SessionID; messageID: MessageID }
    }) {
      yield* requireSession(ctx.params.sessionID)
      yield* SessionError.mapBusy(runState.assertNotBusy(ctx.params.sessionID))
      yield* session.removeMessage(ctx.params)
      return true
    })

    const deletePart = Effect.fn("SessionHttpApi.deletePart")(function* (ctx: {
      params: { sessionID: SessionID; messageID: MessageID; partID: PartID }
    }) {
      yield* requireSession(ctx.params.sessionID)
      yield* session.removePart(ctx.params)
      return true
    })

    const updatePart = Effect.fn("SessionHttpApi.updatePart")(function* (ctx: {
      params: { sessionID: SessionID; messageID: MessageID; partID: PartID }
      payload: typeof SessionV1.Part.Type
    }) {
      yield* requireSession(ctx.params.sessionID)
      const payload = ctx.payload as SessionV1.Part
      if (
        payload.id !== ctx.params.partID ||
        payload.messageID !== ctx.params.messageID ||
        payload.sessionID !== ctx.params.sessionID
      ) {
        return yield* new HttpApiError.BadRequest({})
      }
      return yield* session.updatePart(payload)
    })

    return handlers
      .handle("list", list)
      .handle("status", status)
      .handle("get", get)
      .handle("children", children)
      .handle("todo", todo)
      .handle("diff", diff)
      .handle("messages", messages)
      .handle("message", message)
      .handle("governance", governance)
      .handleRaw("create", createRaw)
      .handle("remove", remove)
      .handle("update", update)
      .handleRaw("fork", forkRaw)
      .handle("abort", abort)
      .handle("init", init)
      .handle("share", share)
      .handle("unshare", unshare)
      .handle("summarize", summarize)
      .handle("prompt", prompt)
      .handle("promptAsync", promptAsync)
      .handle("retry", retry)
      .handle("command", command)
      .handle("shell", shell)
      .handle("revert", revert)
      .handle("unrevert", unrevert)
      .handle("permissionRespond", permissionRespond)
      .handle("deleteMessage", deleteMessage)
      .handle("deletePart", deletePart)
      .handle("updatePart", updatePart)
      .handle("revokeCapability", revokeCapability)
      .handle("verifyObligation", verifyObligation)
  }),
)
