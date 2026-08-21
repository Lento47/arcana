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

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

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

/** First event of a given type whose payload.requestHash matches. */
export function governanceEventByRequestHash(
  events: readonly GovernanceEventRecord[],
  type: string,
  requestHash: string,
): GovernanceEventRecord | undefined {
  return events.find(
    (event) =>
      event.type === type && stringValue(asRecord(event.payload).requestHash) === requestHash,
  )
}

/** PDP decision embedded in an authorization event payload. */
export function decisionFromPayload(payload: unknown): Record<string, unknown> {
  return asRecord(asRecord(payload).decision)
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

  const requestedPayload = asRecord(requested?.payload)
  const requiredPayload = asRecord(required?.payload)
  const executedPayload = asRecord(executed?.payload)
  const decision = decisionFromPayload(requiredPayload)

  const capabilityIds = Array.isArray(decision.capabilityIds)
    ? decision.capabilityIds.filter((id): id is string => typeof id === "string" && id.length > 0)
    : []

  const snapshot: SpineApprovalSnapshot = {
    requestHash: approval.requestHash,
    available: Boolean(requested || required),
    tool:
      stringValue(requestedPayload.tool)
      ?? stringValue(requiredPayload.tool)
      ?? stringValue(executedPayload.tool),
    action:
      stringValue(requestedPayload.action)
      ?? stringValue(decision.action)
      ?? stringValue(executedPayload.action),
    capability: capabilityIds[0],
    principal: approval.principalId ?? stringValue(requestedPayload.principalId),
    policy: stringValue(decision.policyVersion) ?? approval.routingPolicyVersion,
    route: approval.route ?? "LOCAL TUI",
    risk: approval.riskClass ?? stringValue(decision.riskClass),
    expires: shortTime(approval.expiresAt),
    contractRevision: numberValue(approval.contractRevision),
    executionId: approval.executionId ?? stringValue(executedPayload.executionId),
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
