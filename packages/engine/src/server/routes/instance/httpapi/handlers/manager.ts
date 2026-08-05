import { approvalStoreForWorkspace } from "@/approval/command"
import { Effect, Option } from "effect"
import path from "node:path"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { InstanceHttpApi } from "../api"
import { WorkspaceRouteContext } from "../middleware/workspace-routing"

export const managerHandlers = HttpApiBuilder.group(InstanceHttpApi, "manager", (handlers) =>
  Effect.gen(function* () {
    const resolveWorkspace = Effect.fn("ManagerHttpApi.resolveWorkspace")(function* () {
      const route = yield* Effect.serviceOption(WorkspaceRouteContext)
      if (Option.isSome(route) && route.value.directory) return route.value.directory
      return process.cwd()
    })

    const governanceStatus = Effect.fn("ManagerHttpApi.governanceStatus")(function* () {
      const workspaceId = path.resolve(yield* resolveWorkspace())
      const approvals = approvalStoreForWorkspace(workspaceId).loadAllApprovals()
      const counts = {
        total: approvals.length,
        pending: 0,
        approved: 0,
        claimed: 0,
        consumed: 0,
        denied: 0,
        revoked: 0,
        expired: 0,
      }

      for (const approval of approvals) {
        switch (approval.state) {
          case "PENDING":
            counts.pending++
            break
          case "APPROVED":
            counts.approved++
            break
          case "CLAIMED":
            counts.claimed++
            break
          case "CONSUMED":
            counts.consumed++
            break
          case "DENIED":
            counts.denied++
            break
          case "INVALIDATED":
            counts.revoked++
            break
          case "EXPIRED":
            counts.expired++
            break
        }
      }

      return {
        workspaceId,
        generatedAt: new Date().toISOString(),
        authority: "ARCANA_RUNTIME" as const,
        approvalCounts: counts,
        endpoints: {
          events: "/event",
          approvals: "/approvals",
          approveTemplate: "/approvals/{approvalID}/approve",
          denyTemplate: "/approvals/{approvalID}/deny",
          revokeTemplate: "/approvals/{approvalID}/revoke",
        },
      }
    })

    return handlers.handle("governanceStatus", governanceStatus)
  }),
)
