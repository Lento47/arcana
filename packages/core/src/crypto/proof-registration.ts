/**
 * D-8B: Remote Proof Registration (control plane)
 *
 * The control plane accepts node proof batches and validates:
 *   1. Payload schema + batch-root recomputation
 *   2. Ed25519 signature over the canonical batch envelope
 *   3. Node trust (registered node key + accepted trust domain)
 *   4. Chain continuity (previous batch root + sequence adjacency)
 *   5. Duplicate detection (idempotent registration)
 *   6. Cross-batch gap detection for node/server reconciliation
 *
 * This module is transport-neutral: the same service backs the HTTP control
 * surface, the CLI, and future gRPC/queue transports. Persistence is pluggable
 * through `ProofBatchLedger` (SQLite implementation in
 * `proof-registration-sqlite.ts`).
 *
 * Node enrollment and key rotation (D-1) are intentionally out of scope here:
 * the service consumes a node registry supplied by the caller.
 */

import { randomUUID } from "node:crypto"
import { ed25519 } from "@noble/curves/ed25519.js"
import {
  buildSignatureInput,
  encodeBase64url,
  type SignatureDomain,
} from "./canonical-serializer"
import { verifyEnvelopeSignature } from "./verifier"
import {
  computeBatchRoot,
  detectBatchGaps,
  verifyBatchPayload,
  type NodeProofBatchPayload,
} from "./proof-batching"

// ─── Signed Batch Envelope ───────────────────────────────────────────

/**
 * Wire envelope for a node proof batch. The signature covers the payload AND
 * the batch root (both are part of the unsigned envelope object).
 */
export type ProofBatchEnvelope = {
  payload: NodeProofBatchPayload
  batchRoot: string
  signatureAlgorithm: "Ed25519"
  signature: string // base64url, 64 bytes
}

/**
 * Canonical signing form: optional fields are normalized to `null` so the
 * canonical serializer (which rejects `undefined`) and the batch-root
 * computation (which already treats missing as `null`) agree exactly.
 */
function normalizeBatchPayload(payload: NodeProofBatchPayload): NodeProofBatchPayload {
  // The canonical signing form uses `null` for a missing previous root so the
  // canonical serializer (which rejects `undefined`) agrees with the batch
  // root computation. Runtime semantics are unchanged.
  return { ...payload, previousBatchRoot: payload.previousBatchRoot ?? null } as NodeProofBatchPayload
}

/**
 * Sign a batch payload with the node's Ed25519 secret key.
 * Domain-separated via PROOF_BATCH_DOMAIN (arcana:node-proof-batch:v1).
 */
export function signProofBatch(
  payload: NodeProofBatchPayload,
  secretKey: Uint8Array,
): ProofBatchEnvelope {
  const normalized = normalizeBatchPayload(payload)
  const batchRoot = computeBatchRoot(normalized)
  // The verifier strips `signature` and `signatureAlgorithm` before
  // canonicalizing, so the signer must sign the same unsigned shape.
  const unsigned = { payload: normalized, batchRoot }
  const signatureInput = buildSignatureInput(PROOF_BATCH_DOMAIN, unsigned)
  const signature = ed25519.sign(signatureInput, secretKey)
  return { payload: normalized, batchRoot, signatureAlgorithm: "Ed25519", signature: encodeBase64url(signature) }
}

export const PROOF_BATCH_DOMAIN: SignatureDomain = "arcana:node-proof-batch:v1"

/**
 * Verify the envelope signature with the node's public key. Returns a
 * machine-readable reason on failure so the control plane can log it.
 */
export function verifyProofBatchSignature(
  envelope: ProofBatchEnvelope,
  publicKey: Uint8Array,
): { valid: true } | { valid: false; reason: string } {
  const result = verifyEnvelopeSignature(
    envelope as unknown as Record<string, unknown>,
    PROOF_BATCH_DOMAIN,
    publicKey,
  )
  return result.valid ? { valid: true } : { valid: false, reason: result.detail }
}

// ─── Registered Batch Record ─────────────────────────────────────────

export type RegisteredProofBatchStatus = "REGISTERED" | "DUPLICATE"

/** Durable control-plane record of an accepted node proof batch. */
export type RegisteredProofBatch = {
  batchRoot: string
  trustDomain: string
  nodeId: string
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
  receivedAt: string
  /** JSON-serialized ProofBatchEnvelope as received. */
  signedEnvelope: string
}

// ─── Ledger Abstraction ──────────────────────────────────────────────

/**
 * Durable storage for registered proof batches. Implementations must be
 * idempotent (insert-or-ignore by (nodeId, batchRoot)).
 */
export interface ProofBatchLedger {
  append(record: RegisteredProofBatch): void
  findBatch(nodeId: string, batchRoot: string): RegisteredProofBatch | undefined
  lastBatch(nodeId: string): RegisteredProofBatch | undefined
  batchesForNode(nodeId: string): RegisteredProofBatch[]
}

// ─── Registration Service ────────────────────────────────────────────

export type ProofRegistrationContext = {
  /** Trust domain the control plane accepts (strict equality). */
  acceptedTrustDomain: string
  /** Node registry: nodeId → Ed25519 public key (D-1 enrollment stub). */
  nodePublicKeys: ReadonlyMap<string, Uint8Array>
  now?: Date
}

export type ProofRegistrationReceipt = {
  receiptId: string
  nodeId: string
  batchRoot: string
  acknowledgedFirstSequence: number
  acknowledgedLastSequence: number
  acknowledgedAt: string
  status: "REGISTERED" | "DUPLICATE"
}

export type ProofRegistrationResult =
  | {
      kind: "REGISTERED"
      record: RegisteredProofBatch
      receipt: ProofRegistrationReceipt
    }
  | {
      kind: "DUPLICATE"
      record: RegisteredProofBatch
      receipt: ProofRegistrationReceipt
    }
  | {
      kind: "REJECTED"
      reason:
        | "SCHEMA_VERSION_UNSUPPORTED"
        | "BATCH_ROOT_MISMATCH"
        | "PAYLOAD_INVALID"
        | "NODE_NOT_ENROLLED"
        | "TRUST_DOMAIN_MISMATCH"
        | "SIGNATURE_INVALID"
        | "SEQUENCE_GAP"
        | "CHAIN_LINK_MISMATCH"
        | "ORPHAN_BATCH"
      detail: string
    }

function makeReceipt(
  nodeId: string,
  record: RegisteredProofBatch,
  status: "REGISTERED" | "DUPLICATE",
  now: Date,
): ProofRegistrationReceipt {
  return {
    receiptId: randomUUID(),
    nodeId,
    batchRoot: record.batchRoot,
    acknowledgedFirstSequence: record.firstLocalSequence,
    acknowledgedLastSequence: record.lastLocalSequence,
    acknowledgedAt: now.toISOString(),
    status,
  }
}

function toRecord(
  envelope: ProofBatchEnvelope,
  receivedAt: Date,
): RegisteredProofBatch {
  const p = envelope.payload
  return {
    batchRoot: envelope.batchRoot,
    trustDomain: p.trustDomain,
    nodeId: p.nodeId,
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
    receivedAt: receivedAt.toISOString(),
    signedEnvelope: JSON.stringify(envelope),
  }
}

/**
 * Register a node proof batch. Validation order is fixed so rejection reasons
 * are deterministic and auditable:
 *
 * schema → batch root → payload → node enrollment → trust domain →
 * signature → duplicate → chain continuity.
 */
export function registerProofBatch(
  input: ProofBatchEnvelope,
  ledger: ProofBatchLedger,
  context: ProofRegistrationContext,
): ProofRegistrationResult {
  const now = context.now ?? new Date()
  // Wire decoders may represent a missing previous root as `undefined`;
  // canonicalize to `null` so signature input and batch-root computation
  // agree regardless of caller.
  const envelope: ProofBatchEnvelope = {
    ...input,
    payload: normalizeBatchPayload(input.payload),
  }
  const p = envelope.payload

  if (p.schemaVersion !== 1) {
    return {
      kind: "REJECTED",
      reason: "SCHEMA_VERSION_UNSUPPORTED",
      detail: `schema version ${p.schemaVersion}`,
    }
  }

  if (computeBatchRoot(p) !== envelope.batchRoot) {
    return { kind: "REJECTED", reason: "BATCH_ROOT_MISMATCH", detail: "recomputed batch root differs from envelope" }
  }

  const payloadCheck = verifyBatchPayload(p)
  if (!payloadCheck.valid) {
    return { kind: "REJECTED", reason: "PAYLOAD_INVALID", detail: payloadCheck.reason }
  }

  const publicKey = context.nodePublicKeys.get(p.nodeId)
  if (!publicKey) {
    return { kind: "REJECTED", reason: "NODE_NOT_ENROLLED", detail: `node ${p.nodeId} has no registered key` }
  }

  if (p.trustDomain !== context.acceptedTrustDomain) {
    return {
      kind: "REJECTED",
      reason: "TRUST_DOMAIN_MISMATCH",
      detail: `trust domain ${p.trustDomain} != ${context.acceptedTrustDomain}`,
    }
  }

  const signatureCheck = verifyProofBatchSignature(envelope, publicKey)
  if (!signatureCheck.valid) {
    return { kind: "REJECTED", reason: "SIGNATURE_INVALID", detail: signatureCheck.reason }
  }

  const existing = ledger.findBatch(p.nodeId, envelope.batchRoot)
  if (existing) {
    return {
      kind: "DUPLICATE",
      record: existing,
      receipt: makeReceipt(p.nodeId, existing, "DUPLICATE", now),
    }
  }

  const last = ledger.lastBatch(p.nodeId)
  if (last) {
    if (p.firstLocalSequence !== last.lastLocalSequence + 1) {
      return {
        kind: "REJECTED",
        reason: "SEQUENCE_GAP",
        detail: `expected first sequence ${last.lastLocalSequence + 1}, got ${p.firstLocalSequence}`,
      }
    }
    if (p.previousBatchRoot !== last.batchRoot) {
      return {
        kind: "REJECTED",
        reason: "CHAIN_LINK_MISMATCH",
        detail: `previousBatchRoot ${p.previousBatchRoot ?? "undefined"} != ${last.batchRoot}`,
      }
    }
  } else if (p.previousBatchRoot != null) {
    return {
      kind: "REJECTED",
      reason: "ORPHAN_BATCH",
      detail: "previousBatchRoot set but no prior batch is registered for this node",
    }
  }

  const record = toRecord(envelope, now)
  ledger.append(record)
  return {
    kind: "REGISTERED",
    record,
    receipt: makeReceipt(p.nodeId, record, "REGISTERED", now),
  }
}

// ─── Reconciliation ──────────────────────────────────────────────────

export type NodeProofState = {
  nodeId: string
  firstLocalSequence: number
  lastLocalSequence: number
  lastBatchRoot?: string
}

export type ReconciliationResult =
  | {
      status: "RECONCILED"
      nodeId: string
      batchCount: number
      firstLocalSequence: number
      lastLocalSequence: number
      lastBatchRoot?: string
    }
  | {
      status: "GAPS_DETECTED"
      nodeId: string
      batchCount: number
      gaps: Array<{ from: number; to: number }>
      nextExpected: number
    }
  | {
      status: "MISMATCH"
      nodeId: string
      batchCount: number
      reason: string
    }

/**
 * Reconcile a node's local proof state against the control-plane ledger.
 *
 * - Empty ledger + empty node state → RECONCILED.
 * - Missing ranges between registered batches → GAPS_DETECTED.
 * - Full coverage but different terminal root/sequence → MISMATCH.
 */
export function reconcileNodeProofs(
  nodeState: NodeProofState,
  ledger: ProofBatchLedger,
): ReconciliationResult {
  const batches = ledger.batchesForNode(nodeState.nodeId)
  if (batches.length === 0) {
    if (nodeState.lastLocalSequence === 0 && nodeState.firstLocalSequence === 0) {
      return {
        status: "RECONCILED",
        nodeId: nodeState.nodeId,
        batchCount: 0,
        firstLocalSequence: 0,
        lastLocalSequence: 0,
      }
    }
    return {
      status: "MISMATCH",
      nodeId: nodeState.nodeId,
      batchCount: 0,
      reason: "node reports proofs but control plane has no registered batches",
    }
  }

  const payloads = batches.map((b) => JSON.parse(b.signedEnvelope).payload as NodeProofBatchPayload)
  const gapResult = detectBatchGaps(payloads)
  if (gapResult.hasGaps) {
    return {
      status: "GAPS_DETECTED",
      nodeId: nodeState.nodeId,
      batchCount: batches.length,
      gaps: gapResult.gaps,
      nextExpected: gapResult.nextExpected,
    }
  }

  const last = batches[batches.length - 1]
  if (nodeState.lastBatchRoot !== last.batchRoot) {
    return {
      status: "MISMATCH",
      nodeId: nodeState.nodeId,
      batchCount: batches.length,
      reason: `terminal batch root ${nodeState.lastBatchRoot ?? "undefined"} != ledger ${last.batchRoot}`,
    }
  }
  if (nodeState.lastLocalSequence !== last.lastLocalSequence) {
    return {
      status: "MISMATCH",
      nodeId: nodeState.nodeId,
      batchCount: batches.length,
      reason: `terminal sequence ${nodeState.lastLocalSequence} != ledger ${last.lastLocalSequence}`,
    }
  }

  return {
    status: "RECONCILED",
    nodeId: nodeState.nodeId,
    batchCount: batches.length,
    firstLocalSequence: batches[0].firstLocalSequence,
    lastLocalSequence: last.lastLocalSequence,
    lastBatchRoot: last.batchRoot,
  }
}
