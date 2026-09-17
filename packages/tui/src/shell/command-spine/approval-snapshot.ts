/**
 * PR6: exact-request snapshot resolution for approval gates.
 *
 * The durable ApprovalRecord carries the immutable requestHash but not the
 * tool/capability/policy decision context. The engine's governance events
 * DO carry that context (authorization.requested has tool/action/principal;
 * authorization.approval_required has the full PDP decision). This module
 * correlates them by requestHash and produces the SpineApprovalSnapshot the
 * inline gate renders. When correlation fails the snapshot is explicitly
 * unavailable - fail closed, never invented.
 */

import type { ApprovalRecord } from "@arcana/core/crypto/approval-lifecycle"
import type { GovernanceEventRecord } from "../types"
import type { SpineApprovalSnapshot } from "./spine-types"

import { asRecordOrEmpty, asStringTrimmed } from "../../util/record"
import { duration } from "../../util/locale"

function numberValue(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : Number(value)
  return Number.isFinite(n) ? n : undefined
}

function shortTime(iso: string | undefined): string | undefined {
  if (!iso) return undefined
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return undefined
  try {
    return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
  } catch {
    return iso
  }
}

/** Wall-clock of a record's last transition — the time we order decisions by. */
export function recordWallClock(record: ApprovalRecord): number {
  const updated = Date.parse(record.updatedAt)
  if (Number.isFinite(updated)) return updated
  const created = Date.parse(record.createdAt)
  return Number.isFinite(created) ? created : 0
}

/**
 * The most recent prior decision for the exact same request — the gate's
 * precedent.
 *
 * Same `requestHash` means the same canonical request, not a similar one: the
 * hash is computed over the intent, arguments and capability, so a match is
 * *this* call, decided before. The live approval is excluded by id, and
 * PENDING/CLAIMED records are excluded because an undecided prior request is
 * not a precedent — it is an open question that may still resolve.
 */
export function priorDecision(
  records: readonly ApprovalRecord[],
  requestHash: string,
  currentApprovalId?: string,
): ApprovalRecord | undefined {
  let best: ApprovalRecord | undefined
  for (const record of records) {
    if (record.requestHash !== requestHash) continue
    if (record.approvalId === currentApprovalId) continue
    if (record.state === "PENDING" || record.state === "CLAIMED") continue
    if (!best || recordWallClock(record) > recordWallClock(best)) best = record
  }
  return best
}

/**
 * The precedent in the operator's reading order: what was decided, how long
 * ago, and at what risk. State first — it is the answer — then the recency
 * that makes it relevant, then the risk class when the engine recorded one.
 */
export function precedentSummary(record: ApprovalRecord, now: number = Date.now()): string {
  const ms = now - recordWallClock(record)
  const ago = ms > 0 ? duration(ms) : ""
  const when = ago ? `${ago} ago` : "just now"
  const risk = record.riskClass ? ` · ${record.riskClass}` : ""
  return `${record.state.toLowerCase()} ${when}${risk}`
}

/** First event of a given type whose payload.requestHash matches. */
export function governanceEventByRequestHash(
  events: readonly GovernanceEventRecord[],
  type: string,
  requestHash: string,
): GovernanceEventRecord | undefined {
  return events.find(
    (event) =>
      event.type === type && asStringTrimmed(asRecordOrEmpty(event.payload).requestHash) === requestHash,
  )
}

/** PDP decision embedded in an authorization event payload. */
export function decisionFromPayload(payload: unknown): Record<string, unknown> {
  return asRecordOrEmpty(asRecordOrEmpty(payload).decision)
}

/**
 * Resolve the immutable exact-request projection for an approval record.
 *
 * Sources (all real, all correlated by requestHash):
 * - authorization.requested -> tool, action, principal, contract revision
 * - authorization.approval_required -> policy version, capability ids, risk
 * - authorization.executed -> execution id + arguments (change evidence)
 */
export function resolveApprovalSnapshot(
  approval: ApprovalRecord,
  events: readonly GovernanceEventRecord[],
): SpineApprovalSnapshot {
  const requested = governanceEventByRequestHash(events, "authorization.requested", approval.requestHash)
  const required = governanceEventByRequestHash(events, "authorization.approval_required", approval.requestHash)
  const executed = governanceEventByRequestHash(events, "authorization.executed", approval.requestHash)

  const requestedPayload = asRecordOrEmpty(requested?.payload)
  const requiredPayload = asRecordOrEmpty(required?.payload)
  const executedPayload = asRecordOrEmpty(executed?.payload)
  const decision = decisionFromPayload(requiredPayload)

  const capabilityIds = Array.isArray(decision.capabilityIds)
    ? decision.capabilityIds.filter((id): id is string => typeof id === "string" && id.length > 0)
    : []

  const snapshot: SpineApprovalSnapshot = {
    requestHash: approval.requestHash,
    available: Boolean(requested || required),
    tool:
      asStringTrimmed(requestedPayload.tool)
      ?? asStringTrimmed(requiredPayload.tool)
      ?? asStringTrimmed(executedPayload.tool),
    action:
      asStringTrimmed(requestedPayload.action)
      ?? asStringTrimmed(decision.action)
      ?? asStringTrimmed(executedPayload.action),
    capability: capabilityIds[0],
    principal: approval.principalId ?? asStringTrimmed(requestedPayload.principalId),
    policy: asStringTrimmed(decision.policyVersion) ?? approval.routingPolicyVersion,
    route: approval.route ?? "LOCAL TUI",
    risk: approval.riskClass ?? asStringTrimmed(decision.riskClass),
    expires: shortTime(approval.expiresAt),
    contractRevision: numberValue(approval.contractRevision),
    executionId: approval.executionId ?? asStringTrimmed(executedPayload.executionId),
    reason: asStringTrimmed(requestedPayload.reason),
    arguments: Array.isArray(executedPayload.arguments)
      ? executedPayload.arguments.filter((arg): arg is string => typeof arg === "string")
      : undefined,
  }

  const change = changeForExecuted(snapshot)
  if (change) snapshot.change = change

  return snapshot
}

/**
 * Best-effort change summary from real executed arguments. PENDING approvals
 * have no arguments yet, so the gate shows "change unavailable" (fail-closed)
 * until the effect actually runs.
 */
export function changeForExecuted(snapshot: Pick<SpineApprovalSnapshot, "tool" | "arguments">): string | undefined {
  const tool = snapshot.tool?.toLowerCase()
  if (tool !== "write" && tool !== "write_file" && tool !== "edit") return undefined
  const args = snapshot.arguments ?? []
  if (!args.length) return undefined
  const content = args.find((arg) => arg.includes("\n"))
  const path = args.find((arg) => arg.includes("/") || arg.includes("\\") || arg.endsWith(".ts") || arg.includes("."))
  if (!content && !path) return undefined
  const added = content ? content.split("\n").length : 0
  const files = path ? 1 : 0
  return `+${added} -0${files > 0 ? ` · ${files} file${files === 1 ? "" : "s"}` : ""}`
}

/** Short hash helper shared by gate/proof rows. */
export function shortHash(hash: string | undefined, length = 8): string {
  if (!hash) return "unavailable"
  return hash.length <= length ? hash : `${hash.slice(0, 4)}…${hash.slice(-4)}`
}
