/**
 * Runtime API handlers: workspace-scoped durable contract for operators and
 * Arcana Desktop.
 *
 * Authority notes:
 *  - Operator identity is derived from the authenticated server context
 *    (Basic auth username when auth is required; otherwise the trusted local
 *    runtime context). Client-supplied approver fields are never accepted.
 *  - An optional `x-arcana-session` header acts only as a RESTRICTION: when
 *    present, the command must target that session's approval. It grants
 *    nothing.
 *  - Approval commands flow through the same submitApprovalCommand runtime
 *    service used by the CLI/TUI session endpoint, including the routing
 *    gate (LOCAL_TUI / DESKTOP_PREFERRED / DESKTOP_REQUIRED /
 *    CENTRAL_REQUIRED).
 */

import { EventV2Bridge } from "@/event-v2-bridge"
import { Session } from "@/session/session"
import type { SessionID } from "@/session/schema"
import { ApprovalEvent } from "@/approval/events"
import { approvalStoreForWorkspace, submitApprovalCommand, type ApprovalCommandKind } from "@/approval/command"
import { desktopSubscriberRegistry } from "@/approval/desktop-subscribers"
import { deploymentModeFromEnv } from "@/approval/routing"
import { EventStore } from "@/session/epistemic/event-store"
import { RunProof } from "@/session/epistemic/run-proof"
import { ServerAuth } from "@/server/auth"
import { Effect, Encoding, Option } from "effect"
import path from "node:path"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { HttpServerRequest } from "effect/unstable/http"
import { InstanceHttpApi } from "../api"
import { WorkspaceRouteContext } from "../middleware/workspace-routing"
import { notFound } from "../errors"
import {
  DesktopHeartbeatPayload,
  RuntimeApprovalCommandPayload,
} from "../groups/runtime"

export const runtimeHandlers = HttpApiBuilder.group(InstanceHttpApi, "runtime", (handlers) =>
  Effect.gen(function* () {
    const session = yield* Session.Service
    const events = yield* EventV2Bridge.Service
    const eventStore = yield* EventStore.Service
    const runProof = yield* RunProof.Service

    const sameDirectory = (a: string, b: string) => {
      const normalized = (value: string) => {
        const resolved = path.resolve(value)
        return process.platform === "win32" ? resolved.toLowerCase() : resolved
      }
      return normalized(a) === normalized(b)
    }

    /**
     * Resolve the AUTHORITATIVE workspace directory for this request.
     *
     * Order of authority:
     *   1. The routing middleware's directory when it came from a validated
     *      source (session record, workspace registry, or configured flag).
     *   2. The session named by the x-arcana-session header: the session
     *      record binds the operator to its workspace directory.
     *   3. The trusted local runtime directory (process.cwd()).
     *
     * A query-supplied `directory` is never authoritative: it can narrow
     * within an authorized scope but can never grant workspace authority.
     */
    const resolveAuthorizedWorkspace = Effect.fn("RuntimeHttpApi.resolveAuthorizedWorkspace")(function* () {
      const route = yield* Effect.serviceOption(WorkspaceRouteContext)
      if (Option.isSome(route)) {
        const ctx = route.value
        if (ctx.directoryAuthoritative) return ctx.directory
      }
      const sessionScope = yield* sessionScopeFromRequest()
      if (sessionScope) {
        const info = yield* session.get(sessionScope as SessionID).pipe(
          Effect.catch(() => Effect.succeed(undefined)),
        )
        if (info) return info.directory
      }
      return process.cwd()
    })

    const operatorIdentity = Effect.fn("RuntimeHttpApi.operatorIdentity")(function* (workspaceScope: string) {
      // Auth config is optional at the handler boundary: when the server has
      // no configured password, the trusted local runtime context is the
      // operator. Missing service must not turn a decision into a 500.
      const config = yield* Effect.serviceOption(ServerAuth.Config)
      let operatorId = "local-operator"
      if (Option.isSome(config) && ServerAuth.required(config.value)) {
        const request = yield* HttpServerRequest.HttpServerRequest
        const match = /^Basic\s+(.+)$/i.exec(request.headers.authorization ?? "")
        if (match) {
          const decoded = yield* Effect.fromResult(Encoding.decodeBase64String(match[1]!)).pipe(
            Effect.match({
              onFailure: () => "",
              onSuccess: (value) => value,
            }),
          )
          const username = decoded.split(":")[0] ?? ""
          if (username.length > 0) operatorId = username
        }
      }
      return {
        operatorId,
        authenticatedAt: new Date().toISOString(),
        roles: ["operator"] as const,
        workspaceScope: [workspaceScope] as const,
      }
    })

    /** Optional session restriction header; grants nothing. */
    const sessionScopeFromRequest = Effect.fn("RuntimeHttpApi.sessionScope")(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest
      const value = request.headers["x-arcana-session"]
      return value && value.length > 0 ? value : undefined
    })

    const requireApproval = Effect.fn("RuntimeHttpApi.requireApproval")(function* (
      approvalID: string,
      directory: string,
    ) {
      const record = approvalStoreForWorkspace(directory).loadApproval(approvalID)
      if (!record) return yield* Effect.fail(notFound(`approval ${approvalID} not found`))
      return record
    })

    const command = Effect.fn("RuntimeHttpApi.command")(function* (ctx: {
      params: { approvalID: string }
      payload: typeof RuntimeApprovalCommandPayload.Type
      query: { directory?: string }
      command: ApprovalCommandKind
    }) {
      const directory = yield* resolveAuthorizedWorkspace()
      const record = approvalStoreForWorkspace(directory).loadApproval(ctx.params.approvalID)
      if (!record) {
        return { success: false as const, reason: "approval not found" }
      }
      const sessionScope = yield* sessionScopeFromRequest()

      // Session isolation: a caller acting for session A cannot decide
      // session B's approval. The header is a restriction, not a grant.
      if (sessionScope && record.sessionId !== sessionScope) {
        return { success: false as const, reason: "approval belongs to another session" }
      }

      const operator = yield* operatorIdentity(directory)
      const response = submitApprovalCommand({
        sessionId: record.sessionId,
        approvalId: ctx.params.approvalID,
        command: {
          command: ctx.command,
          expectedVersion: ctx.payload.expectedVersion,
          expectedRequestHash: ctx.payload.expectedRequestHash,
          expectedContractRevision: ctx.payload.expectedContractRevision,
        },
        surface: "DESKTOP",
        workspaceCwd: directory,
        workspaceId: directory,
        operator,
      })

      if (response.success) {
        yield* events
          .publish(ApprovalEvent, { sessionID: record.sessionId as SessionID, approval: response.approval })
          .pipe(Effect.ignore)
      }

      return response
    })

    const list = Effect.fn("RuntimeHttpApi.list")(function* (ctx: { query: { directory?: string } }) {
      const directory = yield* resolveAuthorizedWorkspace()
      return approvalStoreForWorkspace(directory).loadAllApprovals()
    })

    const get = Effect.fn("RuntimeHttpApi.get")(function* (ctx: {
      params: { approvalID: string }
      query: { directory?: string }
    }) {
      const directory = yield* resolveAuthorizedWorkspace()
      return yield* requireApproval(ctx.params.approvalID, directory)
    })

    const listSessions = Effect.fn("RuntimeHttpApi.listSessions")(function* () {
      const directory = yield* resolveAuthorizedWorkspace()
      const sessions = yield* session.list()
      return sessions.filter((info) => sameDirectory(info.directory, directory))
    })

    const getSession = Effect.fn("RuntimeHttpApi.getSession")(function* (ctx: {
      params: { sessionID: SessionID }
    }) {
      const directory = yield* resolveAuthorizedWorkspace()
      const info = yield* session.get(ctx.params.sessionID).pipe(
        Effect.catch(() => notFound(`session ${ctx.params.sessionID} not found`)),
      )
      if (!sameDirectory(info.directory, directory)) {
        return yield* Effect.fail(notFound(`session ${ctx.params.sessionID} not found`))
      }
      return info
    })

    const proof = Effect.fn("RuntimeHttpApi.proof")(function* (ctx: {
      params: { sessionID: SessionID }
    }) {
      yield* getSession(ctx)
      const proof = yield* runProof.derive(ctx.params.sessionID)
      return {
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
      }
    })

    const heartbeat = Effect.fn("RuntimeHttpApi.heartbeat")(function* (ctx: {
      payload: typeof DesktopHeartbeatPayload.Type
      query: { directory?: string }
    }) {
      const directory = yield* resolveAuthorizedWorkspace()
      const subscriber = desktopSubscriberRegistry().heartbeat({
        subscriberId: ctx.payload.subscriberId,
        workspaceId: directory,
        deploymentMode: ctx.payload.deploymentMode ?? deploymentModeFromEnv(),
      })
      return {
        subscriberId: subscriber.subscriberId,
        workspaceId: subscriber.workspaceId,
        expiresAt: new Date(subscriber.expiresAt).toISOString(),
        ttlMs: subscriber.expiresAt - subscriber.lastSeenAt,
      }
    })

    return handlers
      .handle("listApprovals", list)
      .handle("getApproval", get)
      .handle("approve", (ctx) => command({ ...ctx, command: "APPROVE_ONCE" }))
      .handle("deny", (ctx) => command({ ...ctx, command: "DENY" }))
      .handle("revoke", (ctx) => command({ ...ctx, command: "REVOKE" }))
      .handle("listSessions", listSessions)
      .handle("getSession", getSession)
      .handle("proof", proof)
      .handle("desktopHeartbeat", heartbeat)
  }),
)
