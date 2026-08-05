import { EventV2Bridge } from "@/event-v2-bridge"
import { Session } from "@/session/session"
import type { SessionID } from "@/session/schema"
import { ApprovalEvent } from "@/approval/events"
import { approvalStoreForWorkspace, loadSessionApprovals, submitApprovalCommand } from "@/approval/command"
import { Effect, Option } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { InstanceHttpApi } from "../api"
import { WorkspaceRouteContext } from "../middleware/workspace-routing"
import { ApprovalCommandPayload, ApprovalSnapshotUnavailableError } from "../groups/approval"
import { notFound } from "../errors"

export const approvalHandlers = HttpApiBuilder.group(InstanceHttpApi, "approval", (handlers) =>
  Effect.gen(function* () {
    const session = yield* Session.Service
    const events = yield* EventV2Bridge.Service

    /**
     * Derive the workspace cwd for the approvals db: prefer the workspace
     * routing context (session record resolved by the middleware), then the
     * session record's directory, then the request directory, then
     * process.cwd(). Also loads the session record for operator identity.
     */
    const resolveWorkspace = Effect.fn("ApprovalHttpApi.resolveWorkspace")(function* (
      sessionID: SessionID,
      queryDirectory?: string,
    ) {
      const routeDirectory = Option.getOrUndefined(
        (yield* Effect.serviceOption(WorkspaceRouteContext)).pipe(Option.map((ctx) => ctx.directory)),
      )
      const sessionInfo = yield* session.get(sessionID).pipe(Effect.catch(() => Effect.succeed(undefined)))
      const directory = routeDirectory ?? sessionInfo?.directory ?? queryDirectory ?? process.cwd()
      return { directory, sessionInfo }
    })

    const command = Effect.fn("ApprovalHttpApi.command")(function* (ctx: {
      params: { sessionID: SessionID; approvalID: string }
      payload: typeof ApprovalCommandPayload.Type
      query: { directory?: string }
    }) {
      const { directory, sessionInfo } = yield* resolveWorkspace(ctx.params.sessionID, ctx.query.directory)

      // Operator identity: derive from the session's owner/user metadata when
      // available, else the default "operator".
      const metadata = sessionInfo?.metadata
      const owner = typeof metadata?.owner === "string" ? metadata.owner : undefined
      const user = typeof metadata?.user === "string" ? metadata.user : undefined
      const operatorId = owner ?? user ?? "operator"

      const response = submitApprovalCommand({
        sessionId: ctx.params.sessionID,
        approvalId: ctx.params.approvalID,
        command: ctx.payload,
        surface: "LOCAL_TUI",
        workspaceCwd: directory,
        workspaceId: ctx.params.sessionID,
        operator: {
          operatorId,
          authenticatedAt: new Date().toISOString(),
          roles: ["operator"],
          workspaceScope: [ctx.params.sessionID],
        },
      })

      // Push the transition to the session sync channel (same SSE stream as
      // messages/parts): the TUI upserts approvals[approvalId] from this event.
      if (response.success) {
        yield* events
          .publish(ApprovalEvent, { sessionID: ctx.params.sessionID, approval: response.approval })
          // Best-effort sync-channel push: publishing must never fail the
          // operator command. catchCause covers defects as well as typed
          // errors.
          .pipe(Effect.catchCause(() => Effect.void))
      }

      return response
    })

    const list = Effect.fn("ApprovalHttpApi.list")(function* (ctx: {
      params: { sessionID: SessionID }
      query: { directory?: string }
    }) {
      const { directory } = yield* resolveWorkspace(ctx.params.sessionID, ctx.query.directory)
      return loadSessionApprovals(ctx.params.sessionID, directory)
    })

    /**
     * Audit PR-2: detail = durable approval record + its VERIFIED immutable
     * request snapshot. The runtime recomputes the canonical request hash and
     * requires it to equal the record's requestHash. Missing or tampered
     * snapshots FAIL CLOSED with an explicit ApprovalSnapshotUnavailableError
     * — the operator is never shown a hash-associated record without the
     * verified exact request.
     */
    const detail = Effect.fn("ApprovalHttpApi.detail")(function* (ctx: {
      params: { sessionID: SessionID; approvalID: string }
      query: { directory?: string }
    }) {
      const { directory } = yield* resolveWorkspace(ctx.params.sessionID, ctx.query.directory)
      const store = approvalStoreForWorkspace(directory)
      const record = store.loadApproval(ctx.params.approvalID)
      if (!record) {
        return yield* Effect.fail(notFound(`approval ${ctx.params.approvalID} not found`))
      }
      const verification = store.getVerifiedSnapshot(ctx.params.approvalID, record)
      if (verification.status === "missing") {
        return yield* Effect.fail(
          new ApprovalSnapshotUnavailableError({
            message: `approval ${ctx.params.approvalID} has no reviewable request snapshot`,
            reason: "snapshot_missing",
            approvalId: ctx.params.approvalID,
          }),
        )
      }
      if (verification.status === "tampered") {
        return yield* Effect.fail(
          new ApprovalSnapshotUnavailableError({
            message: `approval ${ctx.params.approvalID} snapshot failed verification: ${verification.reason}`,
            reason: "snapshot_tampered",
            approvalId: ctx.params.approvalID,
          }),
        )
      }
      return {
        approval: record,
        snapshot: verification.snapshot,
        snapshotVerified: true as const,
      }
    })

    return handlers.handle("command", command).handle("list", list).handle("detail", detail)
  }),
)
