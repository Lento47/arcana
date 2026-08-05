import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiError, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { Authorization } from "../middleware/authorization"
import { InstanceContextMiddleware } from "../middleware/instance-context"
import { WorkspaceRoutingMiddleware, WorkspaceRoutingQuery } from "../middleware/workspace-routing"
import { described } from "./metadata"

export const ManagerPaths = {
  governance: "/manager/governance",
} as const

export const ManagerApprovalCounts = Schema.Struct({
  total: Schema.Int,
  pending: Schema.Int,
  approved: Schema.Int,
  claimed: Schema.Int,
  consumed: Schema.Int,
  denied: Schema.Int,
  revoked: Schema.Int,
  expired: Schema.Int,
})

export const ManagerGovernanceStatus = Schema.Struct({
  workspaceId: Schema.String,
  generatedAt: Schema.String,
  authority: Schema.Literal("ARCANA_RUNTIME"),
  approvalCounts: ManagerApprovalCounts,
  endpoints: Schema.Struct({
    events: Schema.String,
    approvals: Schema.String,
    approveTemplate: Schema.String,
    denyTemplate: Schema.String,
    revokeTemplate: Schema.String,
  }),
})

export const ManagerApi = HttpApi.make("manager").add(
  HttpApiGroup.make("manager")
    .add(
      HttpApiEndpoint.get("governanceStatus", ManagerPaths.governance, {
        query: WorkspaceRoutingQuery,
        success: described(ManagerGovernanceStatus, "Arcana Manager governance connection status"),
        error: [HttpApiError.BadRequest],
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "manager.governance.status",
          summary: "Get Arcana Manager governance status",
          description:
            "Discover the authenticated governance endpoints exposed by this runtime and summarize durable approval state for the routed workspace. This endpoint grants no authority and does not decide approvals; Arcana Runtime remains the sole authority.",
        }),
      ),
    )
    .middleware(InstanceContextMiddleware)
    .middleware(WorkspaceRoutingMiddleware)
    .middleware(Authorization)
    .annotateMerge(
      OpenApi.annotations({
        title: "manager",
        description: "Read-only discovery surface for Arcana Manager governance connections.",
      }),
    ),
)
