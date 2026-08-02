/**
 * D-8B: Remote Proof Registration — control-plane validation suite.
 */

import { describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Database } from "bun:sqlite"
import { ed25519 } from "@noble/curves/ed25519.js"
import { buildProofBatch, type SequencedRunProof } from "./proof-batching"
import {
  registerProofBatch,
  reconcileNodeProofs,
  signProofBatch,
  type ProofBatchEnvelope,
  type ProofBatchLedger,
  type ProofRegistrationContext,
} from "./proof-registration"
import { SqliteProofBatchLedger } from "./proof-registration-sqlite"

// ─── Fixtures ───────────────────────────────────────────────────────

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
  }
  return bytes
}

const nodeKey = ed25519.keygen(hexToBytes("11".repeat(32)))
const otherKey = ed25519.keygen(hexToBytes("22".repeat(32)))

const CONTEXT: ProofRegistrationContext = {
  acceptedTrustDomain: "arcana.test",
  nodePublicKeys: new Map([["node-alpha", nodeKey.publicKey]]),
  now: new Date("2026-08-02T12:00:00.000Z"),
}

function createProof(seq: number): SequencedRunProof {
  return {
    localSequence: seq,
    runProofHash: `proof-hash-${seq}`,
    evidenceHash: `evidence-${seq}`,
    traceHealth: "COMPLETE",
    timestamp: `2026-08-02T12:00:00.${String(seq).padStart(3, "0")}Z`,
  }
}

function makeBatch(
  sequences: number[],
  options: { previousBatchRoot?: string; issuedAt?: string } = {},
): ProofBatchEnvelope {
  const built = buildProofBatch(sequences.map(createProof), {
    trustDomain: "arcana.test",
    nodeId: "node-alpha",
    nodeKeyEpoch: 1,
    policySequence: 1,
    policyDigest: "policy-1",
    revocationSequence: 0,
    revocationDigest: "revocation-0",
    emergencyEpoch: 0,
    previousBatchRoot: options.previousBatchRoot,
    issuedAt: options.issuedAt ?? "2026-08-02T12:00:00.000Z",
  })
  if (!built.success) throw new Error(`fixture build failed: ${built.reason}`)
  return signProofBatch(built.payload, nodeKey.secretKey)
}

function inMemoryLedger(): ProofBatchLedger {
  return new SqliteProofBatchLedger(new Database(":memory:"))
}

// ─── Registration ───────────────────────────────────────────────────

describe("D-8B proof batch registration", () => {
  it("registers the first batch for a node", () => {
    const ledger = inMemoryLedger()
    const result = registerProofBatch(makeBatch([1, 2, 3]), ledger, CONTEXT)

    expect(result.kind).toBe("REGISTERED")
    if (result.kind !== "REGISTERED") return
    expect(result.record.nodeId).toBe("node-alpha")
    expect(result.record.firstLocalSequence).toBe(1)
    expect(result.record.lastLocalSequence).toBe(3)
    expect(result.receipt.status).toBe("REGISTERED")
    expect(result.receipt.batchRoot).toBe(result.record.batchRoot)
    expect(ledger.lastBatch("node-alpha")?.batchRoot).toBe(result.record.batchRoot)
  })

  it("registers a contiguous chained second batch", () => {
    const ledger = inMemoryLedger()
    const first = registerProofBatch(makeBatch([1, 2]), ledger, CONTEXT)
    expect(first.kind).toBe("REGISTERED")
    if (first.kind !== "REGISTERED") return

    const second = registerProofBatch(
      makeBatch([3, 4], { previousBatchRoot: first.record.batchRoot }),
      ledger,
      CONTEXT,
    )
    expect(second.kind).toBe("REGISTERED")
    if (second.kind !== "REGISTERED") return
    expect(second.record.previousBatchRoot).toBe(first.record.batchRoot)
    expect(ledger.batchesForNode("node-alpha")).toHaveLength(2)
  })

  it("rejects a sequence gap between batches", () => {
    const ledger = inMemoryLedger()
    const first = registerProofBatch(makeBatch([1, 2]), ledger, CONTEXT)
    if (first.kind !== "REGISTERED") throw new Error("fixture")

    const gapped = registerProofBatch(
      makeBatch([4, 5], { previousBatchRoot: first.record.batchRoot }),
      ledger,
      CONTEXT,
    )
    expect(gapped).toMatchObject({ kind: "REJECTED", reason: "SEQUENCE_GAP" })
  })

  it("rejects a broken chain link", () => {
    const ledger = inMemoryLedger()
    const first = registerProofBatch(makeBatch([1, 2]), ledger, CONTEXT)
    if (first.kind !== "REGISTERED") throw new Error("fixture")

    const wrongLink = registerProofBatch(
      makeBatch([3, 4], { previousBatchRoot: "not-the-last-root" }),
      ledger,
      CONTEXT,
    )
    expect(wrongLink).toMatchObject({ kind: "REJECTED", reason: "CHAIN_LINK_MISMATCH" })
  })

  it("rejects an orphan batch (previous root with no prior batch)", () => {
    const ledger = inMemoryLedger()
    const result = registerProofBatch(
      makeBatch([1, 2], { previousBatchRoot: "some-root" }),
      ledger,
      CONTEXT,
    )
    expect(result).toMatchObject({ kind: "REJECTED", reason: "ORPHAN_BATCH" })
  })

  it("returns DUPLICATE for an idempotent re-registration", () => {
    const ledger = inMemoryLedger()
    const envelope = makeBatch([1, 2])
    const first = registerProofBatch(envelope, ledger, CONTEXT)
    expect(first.kind).toBe("REGISTERED")

    const dup = registerProofBatch(envelope, ledger, CONTEXT)
    expect(dup.kind).toBe("DUPLICATE")
    if (dup.kind !== "DUPLICATE") return
    expect(dup.receipt.status).toBe("DUPLICATE")
    expect(dup.record.batchRoot).toBe(first.kind === "REGISTERED" ? first.record.batchRoot : "")
    expect(ledger.batchesForNode("node-alpha")).toHaveLength(1)
  })

  it("rejects a tampered payload (batch root mismatch)", () => {
    const ledger = inMemoryLedger()
    const envelope = makeBatch([1, 2])
    const tampered: ProofBatchEnvelope = {
      ...envelope,
      payload: { ...envelope.payload, runProofHashes: ["tampered-hash"] },
    }
    const result = registerProofBatch(tampered, ledger, CONTEXT)
    expect(result).toMatchObject({ kind: "REJECTED", reason: "BATCH_ROOT_MISMATCH" })
  })

  it("rejects a forged signature", () => {
    const ledger = inMemoryLedger()
    const envelope = makeBatch([1, 2])
    const forged: ProofBatchEnvelope = {
      ...envelope,
      signature: signProofBatch(envelope.payload, otherKey.secretKey).signature,
    }
    const result = registerProofBatch(forged, ledger, CONTEXT)
    expect(result).toMatchObject({ kind: "REJECTED", reason: "SIGNATURE_INVALID" })
  })

  it("rejects an unenrolled node", () => {
    const ledger = inMemoryLedger()
    const built = buildProofBatch([1].map(createProof), {
      trustDomain: "arcana.test",
      nodeId: "node-stranger",
      nodeKeyEpoch: 1,
      policySequence: 1,
      policyDigest: "policy-1",
      revocationSequence: 0,
      revocationDigest: "revocation-0",
      emergencyEpoch: 0,
    })
    if (!built.success) throw new Error("fixture")
    const result = registerProofBatch(signProofBatch(built.payload, nodeKey.secretKey), ledger, CONTEXT)
    expect(result).toMatchObject({ kind: "REJECTED", reason: "NODE_NOT_ENROLLED" })
  })

  it("rejects a wrong trust domain", () => {
    const ledger = inMemoryLedger()
    const built = buildProofBatch([1].map(createProof), {
      trustDomain: "other.corp",
      nodeId: "node-alpha",
      nodeKeyEpoch: 1,
      policySequence: 1,
      policyDigest: "policy-1",
      revocationSequence: 0,
      revocationDigest: "revocation-0",
      emergencyEpoch: 0,
    })
    if (!built.success) throw new Error("fixture")
    const result = registerProofBatch(signProofBatch(built.payload, nodeKey.secretKey), ledger, CONTEXT)
    expect(result).toMatchObject({ kind: "REJECTED", reason: "TRUST_DOMAIN_MISMATCH" })
  })

  it("rejects an internally inconsistent payload", () => {
    const ledger = inMemoryLedger()
    const built = buildProofBatch([1, 2].map(createProof), {
      trustDomain: "arcana.test",
      nodeId: "node-alpha",
      nodeKeyEpoch: 1,
      policySequence: 1,
      policyDigest: "policy-1",
      revocationSequence: 0,
      revocationDigest: "revocation-0",
      emergencyEpoch: 0,
    })
    if (!built.success) throw new Error("fixture")

    // Invalid sequence range (first > last). signProofBatch recomputes the
    // root from the invalid payload, so the batch-root check passes and the
    // deterministic validation order reaches PAYLOAD_INVALID.
    const invalidPayload = { ...built.payload, firstLocalSequence: 5, lastLocalSequence: 3 }
    const envelope = signProofBatch(invalidPayload, nodeKey.secretKey)
    const result = registerProofBatch(envelope, ledger, CONTEXT)
    expect(result).toMatchObject({ kind: "REJECTED", reason: "PAYLOAD_INVALID" })
  })

  it("persists registrations across store instances (restart)", () => {
    const dir = mkdtempSync(join(tmpdir(), "arcana-proof-d8b-"))
    try {
      const dbPath = join(dir, "control.db")
      const db1 = new Database(dbPath)
      const ledger1 = new SqliteProofBatchLedger(db1)
      const first = registerProofBatch(makeBatch([1, 2]), ledger1, CONTEXT)
      if (first.kind !== "REGISTERED") throw new Error("fixture")
      const second = registerProofBatch(
        makeBatch([3, 4], { previousBatchRoot: first.record.batchRoot }),
        ledger1,
        CONTEXT,
      )
      if (second.kind !== "REGISTERED") throw new Error("fixture")
      db1.close()

      const db2 = new Database(dbPath)
      const ledger2 = new SqliteProofBatchLedger(db2)
      expect(ledger2.batchesForNode("node-alpha")).toHaveLength(2)
      expect(ledger2.lastBatch("node-alpha")?.lastLocalSequence).toBe(4)
      expect(ledger2.lastBatch("node-alpha")?.previousBatchRoot).toBe(first.record.batchRoot)
      const dup = registerProofBatch(
        makeBatch([1, 2]),
        ledger2,
        CONTEXT,
      )
      expect(dup.kind).toBe("DUPLICATE")
      db2.close()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

// ─── Reconciliation ─────────────────────────────────────────────────

describe("D-8B node/server reconciliation", () => {
  it("reconciles an empty node with an empty ledger", () => {
    const result = reconcileNodeProofs(
      { nodeId: "node-alpha", firstLocalSequence: 0, lastLocalSequence: 0 },
      inMemoryLedger(),
    )
    expect(result).toMatchObject({ status: "RECONCILED", batchCount: 0 })
  })

  it("reconciles a complete chain", () => {
    const ledger = inMemoryLedger()
    const first = registerProofBatch(makeBatch([1, 2]), ledger, CONTEXT)
    if (first.kind !== "REGISTERED") throw new Error("fixture")
    const second = registerProofBatch(
      makeBatch([3, 4], { previousBatchRoot: first.record.batchRoot }),
      ledger,
      CONTEXT,
    )
    if (second.kind !== "REGISTERED") throw new Error("fixture")

    const result = reconcileNodeProofs(
      {
        nodeId: "node-alpha",
        firstLocalSequence: 1,
        lastLocalSequence: 4,
        lastBatchRoot: second.record.batchRoot,
      },
      ledger,
    )
    expect(result).toMatchObject({
      status: "RECONCILED",
      batchCount: 2,
      lastLocalSequence: 4,
    })
  })

  it("detects a missing middle batch", () => {
    const ledger = inMemoryLedger()
    const first = registerProofBatch(makeBatch([1, 2]), ledger, CONTEXT)
    if (first.kind !== "REGISTERED") throw new Error("fixture")

    // A later segment arriving through the normal path is correctly rejected
    // as a gap.
    const late = makeBatch([5, 6], { previousBatchRoot: first.record.batchRoot })
    expect(registerProofBatch(late, ledger, CONTEXT)).toMatchObject({
      kind: "REJECTED",
      reason: "SEQUENCE_GAP",
    })

    // Simulate a split-brain control-plane writer that persisted the later
    // segment directly; reconciliation must flag the missing [3, 4] range.
    const lateBuilt = buildProofBatch([5, 6].map(createProof), {
      trustDomain: "arcana.test",
      nodeId: "node-alpha",
      nodeKeyEpoch: 1,
      policySequence: 1,
      policyDigest: "policy-1",
      revocationSequence: 0,
      revocationDigest: "revocation-0",
      emergencyEpoch: 0,
      previousBatchRoot: first.record.batchRoot,
    })
    if (!lateBuilt.success) throw new Error("fixture")
    const lateEnv = signProofBatch(lateBuilt.payload, nodeKey.secretKey)
    ledger.append({
      batchRoot: lateEnv.batchRoot,
      trustDomain: "arcana.test",
      nodeId: "node-alpha",
      nodeKeyEpoch: 1,
      firstLocalSequence: 5,
      lastLocalSequence: 6,
      previousBatchRoot: first.record.batchRoot,
      eventMerkleRoot: lateEnv.payload.eventMerkleRoot,
      runProofHashes: lateEnv.payload.runProofHashes,
      policySequence: 1,
      policyDigest: "policy-1",
      revocationSequence: 0,
      revocationDigest: "revocation-0",
      emergencyEpoch: 0,
      issuedAt: lateEnv.payload.issuedAt,
      receivedAt: CONTEXT.now!.toISOString(),
      signedEnvelope: JSON.stringify(lateEnv),
    })
    const result = reconcileNodeProofs(
      {
        nodeId: "node-alpha",
        firstLocalSequence: 1,
        lastLocalSequence: 6,
        lastBatchRoot: lateEnv.batchRoot,
      },
      ledger,
    )
    expect(result.status).toBe("GAPS_DETECTED")
  })

  it("reports a terminal root mismatch", () => {
    const ledger = inMemoryLedger()
    const first = registerProofBatch(makeBatch([1, 2]), ledger, CONTEXT)
    if (first.kind !== "REGISTERED") throw new Error("fixture")

    const result = reconcileNodeProofs(
      {
        nodeId: "node-alpha",
        firstLocalSequence: 1,
        lastLocalSequence: 2,
        lastBatchRoot: "wrong-terminal-root",
      },
      ledger,
    )
    expect(result).toMatchObject({ status: "MISMATCH" })
  })
})
