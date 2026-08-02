/**
 * D-8B (node side): Proof Batch Uploader and Durable Outbox
 *
 * The node builds deterministic proof batches (D-8A), signs them, and must
 * deliver them to the control plane exactly-once-ish: idempotent by batch
 * root, crash-recoverable, with bounded exponential backoff and a poisoned
 * state for permanent failures.
 *
 * This module is transport-neutral: the caller supplies an upload function
 * (HTTP client in the engine package). Persistence is pluggable through
 * `ProofOutboxPort` (SQLite implementation in `proof-outbox-sqlite.ts`).
 */

import type { ProofBatchEnvelope, ProofRegistrationReceipt } from "./proof-registration"

// ─── Outbox Record ──────────────────────────────────────────────────

export type ProofOutboxState = "PENDING_REGISTRATION" | "REGISTERED" | "POISONED"

/** Durable node-side record of one signed proof batch awaiting/confirming
 * control-plane registration. */
export type ProofOutboxRecord = {
  nodeId: string
  batchRoot: string
  trustDomain: string
  nodeKeyEpoch: number
  firstLocalSequence: number
  lastLocalSequence: number
  previousBatchRoot?: string
  eventMerkleRoot: string
  runProofHashes: readonly string[]
  policySequence: number
  policyDigest: string
  revocationSequence: number
  revocationDigest: string
  emergencyEpoch: number
  issuedAt: string
  /** JSON-serialized ProofBatchEnvelope. */
  signedEnvelopeJson: string
  state: ProofOutboxState
  attempts: number
  nextAttemptAt?: string
  registrationReceiptJson?: string
  lastError?: string
  createdAt: string
  registeredAt?: string
}

export function createProofOutboxRecord(
  envelope: ProofBatchEnvelope,
  now: Date,
): ProofOutboxRecord {
  const p = envelope.payload
  return {
    nodeId: p.nodeId,
    batchRoot: envelope.batchRoot,
    trustDomain: p.trustDomain,
    nodeKeyEpoch: p.nodeKeyEpoch,
    firstLocalSequence: p.firstLocalSequence,
    lastLocalSequence: p.lastLocalSequence,
    previousBatchRoot: p.previousBatchRoot ?? undefined,
    eventMerkleRoot: p.eventMerkleRoot,
    runProofHashes: p.runProofHashes,
    policySequence: p.policySequence,
    policyDigest: p.policyDigest,
    revocationSequence: p.revocationSequence,
    revocationDigest: p.revocationDigest,
    emergencyEpoch: p.emergencyEpoch,
    issuedAt: p.issuedAt,
    signedEnvelopeJson: JSON.stringify(envelope),
    state: "PENDING_REGISTRATION",
    attempts: 0,
    createdAt: now.toISOString(),
  }
}

// ─── Upload Policy and Transport ────────────────────────────────────

export type ProofUploadPolicy = {
  /** Base backoff for the first retry. */
  baseBackoffMs: number
  /** Hard cap for any single backoff delay. */
  maximumBackoffMs: number
  /** Total attempts before a retryable batch is poisoned. */
  maximumAttempts: number
  /** Jitter ratio applied around the exponential delay. */
  jitterRatio: number
}

export const DEFAULT_PROOF_UPLOAD_POLICY: ProofUploadPolicy = {
  baseBackoffMs: 1_000,
  maximumBackoffMs: 60_000,
  maximumAttempts: 10,
  jitterRatio: 0.2,
}

/**
 * Transport result contract. The HTTP client maps control-plane responses
 * onto these kinds:
 * - REGISTERED / DUPLICATE: durable receipt returned by the control plane.
 * - RETRYABLE: transient (network, 5xx, throttling) — schedule a retry.
 * - PERMANENT: the control plane rejected the batch definitively.
 */
export type ProofUploadTransportResult =
  | { kind: "REGISTERED"; receipt: ProofRegistrationReceipt }
  | { kind: "DUPLICATE"; receipt: ProofRegistrationReceipt }
  | { kind: "RETRYABLE"; error: string }
  | { kind: "PERMANENT"; error: string }

// ─── Backoff ────────────────────────────────────────────────────────

/**
 * Exponential backoff with jitter:
 *   delay = clamp(base * 2^attempt, 1, maximum) ± jitterRatio * delay
 */
export function computeProofBackoffMs(
  attempt: number,
  policy: ProofUploadPolicy = DEFAULT_PROOF_UPLOAD_POLICY,
  random: () => number = Math.random,
): number {
  const exponential = Math.min(policy.baseBackoffMs * 2 ** attempt, policy.maximumBackoffMs)
  const jitter = (random() * 2 - 1) * policy.jitterRatio * exponential
  return Math.max(1, Math.round(exponential + jitter))
}

// ─── State Machine ──────────────────────────────────────────────────

export type ProofUploadAdvance =
  | { outcome: "ALREADY_REGISTERED" }
  | {
      outcome: "REGISTERED"
      record: ProofOutboxRecord
    }
  | {
      outcome: "RETRYING"
      record: ProofOutboxRecord
      nextAttemptAt: string
      attempts: number
    }
  | {
      outcome: "POISONED"
      record: ProofOutboxRecord
      error: string
    }

/**
 * Advance one outbox record based on the transport result.
 *
 * Invariants:
 * - A REGISTERED record is never uploaded again (idempotency).
 * - REGISTERED/DUPLICATE persists the receipt and clears the retry timer.
 * - RETRYABLE increments attempts and schedules nextAttemptAt with backoff.
 * - Reaching maximumAttempts (or a PERMANENT result) poisons the record;
 *   a poisoned record is never re-uploaded automatically.
 */
export function advanceProofUpload(
  record: ProofOutboxRecord,
  transportResult: ProofUploadTransportResult,
  policy: ProofUploadPolicy = DEFAULT_PROOF_UPLOAD_POLICY,
  now: Date = new Date(),
  random: () => number = Math.random,
): ProofUploadAdvance {
  if (record.state === "REGISTERED" && record.registrationReceiptJson) {
    return { outcome: "ALREADY_REGISTERED" }
  }

  if (transportResult.kind === "REGISTERED" || transportResult.kind === "DUPLICATE") {
    const updated: ProofOutboxRecord = {
      ...record,
      state: "REGISTERED",
      registrationReceiptJson: JSON.stringify(transportResult.receipt),
      nextAttemptAt: undefined,
      lastError: undefined,
      registeredAt: now.toISOString(),
    }
    return { outcome: "REGISTERED", record: updated }
  }

  if (transportResult.kind === "PERMANENT") {
    const updated: ProofOutboxRecord = {
      ...record,
      state: "POISONED",
      attempts: record.attempts + 1,
      lastError: transportResult.error,
      nextAttemptAt: undefined,
    }
    return { outcome: "POISONED", record: updated, error: transportResult.error }
  }

  // RETRYABLE
  const attempts = record.attempts + 1
  if (attempts >= policy.maximumAttempts) {
    const updated: ProofOutboxRecord = {
      ...record,
      state: "POISONED",
      attempts,
      lastError: transportResult.error,
      nextAttemptAt: undefined,
    }
    return { outcome: "POISONED", record: updated, error: transportResult.error }
  }

  const backoffMs = computeProofBackoffMs(record.attempts, policy, random)
  const nextAttemptAt = new Date(now.getTime() + backoffMs).toISOString()
  const updated: ProofOutboxRecord = {
    ...record,
    state: "PENDING_REGISTRATION",
    attempts,
    lastError: transportResult.error,
    nextAttemptAt,
  }
  return { outcome: "RETRYING", record: updated, nextAttemptAt, attempts }
}

// ─── Outbox Port and Loop ───────────────────────────────────────────

export interface ProofOutboxPort {
  pendingDue(nodeId: string, now: Date): ProofOutboxRecord[]
  update(record: ProofOutboxRecord): void
}

export type ProofUploadAttemptSummary = {
  batchRoot: string
  outcome: "REGISTERED" | "RETRYING" | "POISONED" | "ALREADY_REGISTERED"
  attempts: number
}

/**
 * Upload every due batch for a node, persisting each state transition before
 * moving to the next batch. Crash recovery: a batch whose transition was not
 * persisted stays PENDING and is retried; the control plane deduplicates by
 * batch root.
 */
export async function processDueProofUploads(
  port: ProofOutboxPort,
  nodeId: string,
  upload: (envelope: ProofBatchEnvelope) => Promise<ProofUploadTransportResult>,
  policy: ProofUploadPolicy = DEFAULT_PROOF_UPLOAD_POLICY,
  now: Date = new Date(),
  random: () => number = Math.random,
): Promise<ProofUploadAttemptSummary[]> {
  const due = port.pendingDue(nodeId, now)
  const summaries: ProofUploadAttemptSummary[] = []

  for (const record of due) {
    const envelope = JSON.parse(record.signedEnvelopeJson) as ProofBatchEnvelope
    const transportResult = await upload(envelope)
    const advanced = advanceProofUpload(record, transportResult, policy, now, random)
    if (advanced.outcome !== "ALREADY_REGISTERED") {
      port.update(advanced.record)
    }
    summaries.push({
      batchRoot: record.batchRoot,
      outcome: advanced.outcome,
      attempts: advanced.outcome === "ALREADY_REGISTERED" ? record.attempts : advanced.record.attempts,
    })
  }

  return summaries
}
