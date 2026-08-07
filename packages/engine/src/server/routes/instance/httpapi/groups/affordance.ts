import { Schema } from "effect"
import { WorkspaceRoutingQueryFields } from "../middleware/workspace-routing"

export const AuthorityActionSchema = Schema.Literals([
  "inspect",
  "approve",
  "deny",
  "revoke",
  "retry_refresh",
  "open_forensic",
])

export const AuthorityAffordanceStateSchema = Schema.Literals([
  "available",
  "unavailable",
  "in_flight",
  "completed",
])

export const AuthoritySurfaceSchema = Schema.Literals([
  "LOCAL_TUI",
  "DESKTOP",
  "CONTROL",
  "SDK",
])

export const AuthorityAffordanceReasonSchema = Schema.Literals([
  "OFFLINE",
  "STALE_RECORD",
  "RESYNC_REQUIRED",
  "PROTOCOL_MISMATCH",
  "ROUTE_LOCAL_TUI_ONLY",
  "ROUTE_DESKTOP_REQUIRED",
  "ROUTE_CENTRAL_REQUIRED",
  "LOCAL_FALLBACK_NOT_ALLOWED",
  "SURFACE_NOT_AUTHORIZED",
  "SESSION_RESTRICTION",
  "WORKSPACE_MISMATCH",
  "AUTHENTICATION_REQUIRED",
  "APPROVAL_EXPIRED",
  "APPROVAL_REVOKED",
  "ALREADY_DECIDED",
  "ALREADY_CLAIMED",
  "ALREADY_CONSUMED",
  "REQUEST_CHANGED",
  "CONTRACT_REVISION_CHANGED",
  "CAPABILITY_REVOKED",
  "POLICY_CHANGED",
  "EVIDENCE_DEGRADED",
  "UNKNOWN_RUNTIME_STATE",
])

export const AuthorityAffordanceSchema = Schema.Struct({
  action: AuthorityActionSchema,
  state: AuthorityAffordanceStateSchema,
  reasonCode: Schema.optional(AuthorityAffordanceReasonSchema),
  expectedVersion: Schema.optional(Schema.Int),
  expectedRequestHash: Schema.optional(Schema.String),
  expectedContractRevision: Schema.optional(Schema.Int),
  surface: AuthoritySurfaceSchema,
  requiresFreshRecord: Schema.Boolean,
  destructive: Schema.Boolean,
}).annotate({ identifier: "AuthorityAffordance" })

/**
 * Exact-request fields the operator's surface displayed are passed as
 * read-only viewed-state hints. They grant nothing: the runtime compares
 * them to the durable record and can only fail closed.
 */
export const ApprovalAffordanceQuery = Schema.Struct({
  ...WorkspaceRoutingQueryFields,
  viewedVersion: Schema.optional(Schema.Int),
  viewedRequestHash: Schema.optional(Schema.String),
  viewedContractRevision: Schema.optional(Schema.Int),
})
