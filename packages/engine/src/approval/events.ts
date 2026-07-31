/**
 * RB-01 (Cluster B): approval sync events + wire schemas.
 *
 * The session sync channel to the TUI is the EventV2 SSE stream (/event).
 * approval.updated carries the full ApprovalRecord so the TUI sync store can
 * upsert `approvals: Record<approvalId, ApprovalRecord>` on every state
 * transition (PENDING -> APPROVED/DENIED/CLAIMED/CONSUMED/...).
 */

import { EventV2 } from "@arcana/core/event"
import { Schema } from "effect"
import { SessionID } from "@/session/schema"

export const ApprovalStateSchema = Schema.Literals([
  "PENDING",
  "APPROVED",
  "DENIED",
  "CLAIMED",
  "CONSUMED",
  "EXPIRED",
  "INVALIDATED",
  "REJECTED",
  "RECOVERY_REQUIRED",
])

export const ApprovalRecordSchema = Schema.Struct({
  approvalId: Schema.String,
  version: Schema.Number,
  sessionId: Schema.String,
  workspaceId: Schema.String,
  requestHash: Schema.String,
  contractRevision: Schema.Number,
  principalId: Schema.optional(Schema.String),
  state: ApprovalStateSchema,
  approvedBy: Schema.optional(Schema.String),
  executionId: Schema.optional(Schema.String),
  expiresAt: Schema.String,
  updatedAt: Schema.String,
  createdAt: Schema.String,
}).annotate({ identifier: "ApprovalRecord" })

export type ApprovalRecordWire = Schema.Schema.Type<typeof ApprovalRecordSchema>

/** Pushed on every approval record transition (create/approve/deny/claim/consume). */
export const ApprovalEvent = EventV2.define({
  type: "approval.updated",
  schema: {
    sessionID: SessionID,
    approval: ApprovalRecordSchema,
  },
})
