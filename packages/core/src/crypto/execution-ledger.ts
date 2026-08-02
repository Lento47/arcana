/**
 * D-6: Distributed Replay Resistance and Exactly-Once Coordination
 *
 * A shared execution ledger keyed by globally unique execution IDs. Every
 * distributed effect attempt binds:
 *   executionId + nodeId + sessionId + requestHash + grantId + nonce
 *
 * Guarantees:
 * - Duplicate delivery to the same node OR a second node cannot produce a
 *   second protected effect for a single-execution grant: the ledger claims
 *   the execution once; later claims are DUPLICATE.
 * - Same executionId with a different requestHash is a CONFLICT (never a
 *   silently different effect).
 * - Network/crash ambiguity is recorded as UNKNOWN_AFTER_NETWORK /
 *   UNKNOWN_AFTER_CRASH; automatic replay of irreversible effects is
 *   forbidden (replay attempt → REPLAY_FORBIDDEN).
 */

export type ExecutionStatus =
  | "PENDING"
  | "EXECUTING"
  | "COMPLETED"
  | "FAILED"
  | "UNKNOWN_AFTER_CRASH"
  | "UNKNOWN_AFTER_NETWORK"
  | "REJECTED"

export type DistributedExecutionKey = {
  executionId: string
  nodeId: string
  sessionId: string
  requestHash: string
  grantId: string
  nonce: string
}

export type ExecutionLedgerRecord = {
  key: DistributedExecutionKey
  status: ExecutionStatus
  effectOutcomeJson?: string
  firstSeenAt: string
  updatedAt: string
}

export interface ExecutionLedger {
  get(executionId: string): ExecutionLedgerRecord | undefined
  claim(record: ExecutionLedgerRecord): "CLAIMED" | "EXISTING"
  updateStatus(executionId: string, status: ExecutionStatus, updatedAt: Date): void
  attachOutcome(executionId: string, outcomeJson: string, updatedAt: Date): void
}

export type ExecutionClaimResult =
  | {
      kind: "CLAIMED"
      record: ExecutionLedgerRecord
    }
  | {
      kind: "DUPLICATE"
      record: ExecutionLedgerRecord
      detail: string
    }
  | {
      kind: "CONFLICT"
      record: ExecutionLedgerRecord
      detail: string
    }
  | {
      kind: "REPLAY_FORBIDDEN"
      record: ExecutionLedgerRecord
      detail: string
    }

/**
 * Claim an execution for a protected effect. Exactly-once semantics:
 * - Fresh key → CLAIMED (the only path that may execute).
 * - Same key, same requestHash → DUPLICATE (return the recorded outcome;
 *   the effect must NOT run again).
 * - Same executionId, different requestHash → CONFLICT (authorization
 *   identity changed; fail closed).
 * - Prior UNKNOWN_AFTER_* with a recorded outcome → REPLAY_FORBIDDEN for
 *   irreversible effects (caller passes `irreversible: true`).
 */
export function claimExecution(
  key: DistributedExecutionKey,
  ledger: ExecutionLedger,
  now: Date = new Date(),
  options: { irreversible?: boolean } = {},
): ExecutionClaimResult {
  const existing = ledger.get(key.executionId)
  if (!existing) {
    const record: ExecutionLedgerRecord = {
      key,
      status: "PENDING",
      firstSeenAt: now.toISOString(),
      updatedAt: now.toISOString(),
    }
    const claimed = ledger.claim(record)
    if (claimed === "CLAIMED") {
      return { kind: "CLAIMED", record }
    }
    // Lost a race: re-read and classify.
    const winner = ledger.get(key.executionId)!
    return classifyExisting(key, winner, options)
  }
  return classifyExisting(key, existing, options)
}

function classifyExisting(
  key: DistributedExecutionKey,
  existing: ExecutionLedgerRecord,
  options: { irreversible?: boolean },
): ExecutionClaimResult {
  if (existing.key.requestHash !== key.requestHash) {
    return {
      kind: "CONFLICT",
      record: existing,
      detail: `executionId ${key.executionId} already bound to a different requestHash`,
    }
  }
  if (existing.key.grantId !== key.grantId) {
    return {
      kind: "CONFLICT",
      record: existing,
      detail: `executionId ${key.executionId} already bound to grant ${existing.key.grantId}`,
    }
  }
  if (
    options.irreversible &&
    (existing.status === "UNKNOWN_AFTER_CRASH" || existing.status === "UNKNOWN_AFTER_NETWORK")
  ) {
    return {
      kind: "REPLAY_FORBIDDEN",
      record: existing,
      detail: `outcome ambiguous (${existing.status}); automatic replay of an irreversible effect is forbidden`,
    }
  }
  if (existing.status === "COMPLETED" || existing.status === "FAILED") {
    return {
      kind: "DUPLICATE",
      record: existing,
      detail: `execution already reached terminal status ${existing.status}`,
    }
  }
  return {
    kind: "DUPLICATE",
    record: existing,
    detail: `execution ${key.executionId} already claimed (status ${existing.status})`,
  }
}

export function completeExecution(
  executionId: string,
  ledger: ExecutionLedger,
  outcomeJson: string,
  now: Date = new Date(),
): void {
  ledger.attachOutcome(executionId, outcomeJson, now)
  ledger.updateStatus(executionId, "COMPLETED", now)
}

export function failExecution(
  executionId: string,
  ledger: ExecutionLedger,
  outcomeJson: string,
  now: Date = new Date(),
): void {
  ledger.attachOutcome(executionId, outcomeJson, now)
  ledger.updateStatus(executionId, "FAILED", now)
}

export function markUnknownAfterCrash(
  executionId: string,
  ledger: ExecutionLedger,
  now: Date = new Date(),
): void {
  ledger.updateStatus(executionId, "UNKNOWN_AFTER_CRASH", now)
}

export function markUnknownAfterNetwork(
  executionId: string,
  ledger: ExecutionLedger,
  now: Date = new Date(),
): void {
  ledger.updateStatus(executionId, "UNKNOWN_AFTER_NETWORK", now)
}
