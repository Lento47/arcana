import { EventV2Bridge } from "@/event-v2-bridge"
import { Session } from "@/session/session"
import type { SessionID } from "@/session/schema"
import { ApprovalEvent } from "@/approval/events"
import { loadSessionApprovals, submitApprovalCommand } from "@/approval/command"
import { Effect, Option } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { InstanceHttpApi } from "../api"
import { WorkspaceRouteContext } from "../middleware/workspace-routing"
import { ApprovalCommandPayload } from "../groups/approval"

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
          .pipe(Effect.ignore)
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

    return handlers.handle("command", command).handle("list", list)
  }),
)
