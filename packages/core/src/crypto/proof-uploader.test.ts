/**
 * D-8B (node side): proof uploader + durable outbox tests.
 */

import { describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Database } from "bun:sqlite"
import { ed25519 } from "@noble/curves/ed25519.js"
import { buildProofBatch, type SequencedRunProof } from "./proof-batching"
import { signProofBatch, type ProofBatchEnvelope, type ProofRegistrationReceipt } from "./proof-registration"
import { SqliteProofOutbox } from "./proof-outbox-sqlite"
import {
  advanceProofUpload,
  computeProofBackoffMs,
  createProofOutboxRecord,
  processDueProofUploads,
  type ProofOutboxRecord,
  type ProofUploadPolicy,
  type ProofUploadTransportResult,
} from "./proof-uploader"

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
  }
  return bytes
}

const nodeKey = ed25519.keygen(hexToBytes("33".repeat(32)))

function makeEnvelope(sequences: number[], previousBatchRoot?: string): ProofBatchEnvelope {
  const built = buildProofBatch(
    sequences.map((seq): SequencedRunProof => ({
      localSequence: seq,
      runProofHash: `proof-hash-${seq}`,
      evidenceHash: `evidence-${seq}`,
      traceHealth: "COMPLETE",
      timestamp: `2026-08-02T12:00:00.${String(seq).padStart(3, "0")}Z`,
    })),
    {
      trustDomain: "arcana.test",
      nodeId: "node-alpha",
      nodeKeyEpoch: 1,
      policySequence: 1,
      policyDigest: "policy-1",
      revocationSequence: 0,
      revocationDigest: "revocation-0",
      emergencyEpoch: 0,
      previousBatchRoot,
      issuedAt: "2026-08-02T12:00:00.000Z",
    },
  )
  if (!built.success) throw new Error(`fixture: ${built.reason}`)
  return signProofBatch(built.payload, nodeKey.secretKey)
}

const NOW = new Date("2026-08-02T12:00:00.000Z")

function receiptFor(record: ProofOutboxRecord): ProofRegistrationReceipt {
  return {
    receiptId: "receipt-1",
    nodeId: record.nodeId,
    batchRoot: record.batchRoot,
    acknowledgedFirstSequence: record.firstLocalSequence,
    acknowledgedLastSequence: record.lastLocalSequence,
    acknowledgedAt: NOW.toISOString(),
    status: "REGISTERED",
  }
}

function seededRandom(seed = 42): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

describe("D-8B proof upload backoff", () => {
  it("grows exponentially and respects the cap", () => {
    const random = seededRandom()
    const policy: ProofUploadPolicy = {
      baseBackoffMs: 1000,
      maximumBackoffMs: 8000,
      maximumAttempts: 10,
      jitterRatio: 0,
    }
    expect(computeProofBackoffMs(0, policy, random)).toBe(1000)
    expect(computeProofBackoffMs(1, policy, random)).toBe(2000)
    expect(computeProofBackoffMs(2, policy, random)).toBe(4000)
    expect(computeProofBackoffMs(3, policy, random)).toBe(8000)
    expect(computeProofBackoffMs(10, policy, random)).toBe(8000)
  })

  it("applies bounded jitter", () => {
    const random = seededRandom()
    const policy: ProofUploadPolicy = {
      baseBackoffMs: 1000,
      maximumBackoffMs: 8000,
      maximumAttempts: 10,
      jitterRatio: 0.2,
    }
    for (let attempt = 0; attempt < 20; attempt++) {
      const ms = computeProofBackoffMs(attempt, policy, random)
      expect(ms).toBeGreaterThanOrEqual(1)
      expect(ms).toBeLessThanOrEqual(9600)
    }
  })
})

describe("D-8B proof upload state machine", () => {
  const policy: ProofUploadPolicy = {
    baseBackoffMs: 1000,
    maximumBackoffMs: 8000,
    maximumAttempts: 3,
    jitterRatio: 0,
  }

  it("creates a PENDING record from a signed envelope", () => {
    const record = createProofOutboxRecord(makeEnvelope([1, 2]), NOW)
    expect(record.state).toBe("PENDING_REGISTRATION")
    expect(record.attempts).toBe(0)
    expect(record.nodeId).toBe("node-alpha")
    expect(record.firstLocalSequence).toBe(1)
    expect(record.lastLocalSequence).toBe(2)
    expect(JSON.parse(record.signedEnvelopeJson).batchRoot).toBe(record.batchRoot)
  })

  it("persists the receipt on REGISTERED", () => {
    const record = createProofOutboxRecord(makeEnvelope([1, 2]), NOW)
    const result = advanceProofUpload(
      record,
      { kind: "REGISTERED", receipt: receiptFor(record) },
      policy,
      NOW,
      seededRandom(),
    )
    expect(result.outcome).toBe("REGISTERED")
    if (result.outcome !== "REGISTERED") return
    expect(result.record.state).toBe("REGISTERED")
    expect(result.record.registrationReceiptJson).toContain("receipt-1")
    expect(result.record.nextAttemptAt).toBeUndefined()
    expect(result.record.registeredAt).toBe(NOW.toISOString())
  })

  it("treats DUPLICATE as a durable registration", () => {
    const record = createProofOutboxRecord(makeEnvelope([1, 2]), NOW)
    const result = advanceProofUpload(
      record,
      { kind: "DUPLICATE", receipt: receiptFor(record) },
      policy,
      NOW,
      seededRandom(),
    )
    expect(result.outcome).toBe("REGISTERED")
    if (result.outcome !== "REGISTERED") return
    expect(result.record.state).toBe("REGISTERED")
  })

  it("never re-uploads an already registered batch", () => {
    const record = createProofOutboxRecord(makeEnvelope([1, 2]), NOW)
    const first = advanceProofUpload(
      record,
      { kind: "REGISTERED", receipt: receiptFor(record) },
      policy,
      NOW,
      seededRandom(),
    )
    if (first.outcome !== "REGISTERED") throw new Error("fixture")
    const second = advanceProofUpload(
      first.record,
      { kind: "RETRYABLE", error: "should never be reached" },
      policy,
      NOW,
      seededRandom(),
    )
    expect(second.outcome).toBe("ALREADY_REGISTERED")
  })

  it("schedules a retry with backoff on RETRYABLE", () => {
    const record = createProofOutboxRecord(makeEnvelope([1, 2]), NOW)
    const result = advanceProofUpload(
      record,
      { kind: "RETRYABLE", error: "network timeout" },
      policy,
      NOW,
      seededRandom(),
    )
    expect(result.outcome).toBe("RETRYING")
    if (result.outcome !== "RETRYING") return
    expect(result.record.attempts).toBe(1)
    expect(result.record.state).toBe("PENDING_REGISTRATION")
    expect(result.record.lastError).toBe("network timeout")
    expect(new Date(result.nextAttemptAt).getTime()).toBe(NOW.getTime() + 1000)
  })

  it("poisons after maximum attempts", () => {
    let record = createProofOutboxRecord(makeEnvelope([1, 2]), NOW)
    for (let i = 0; i < 2; i++) {
      const r = advanceProofUpload(
        record,
        { kind: "RETRYABLE", error: `try ${i}` },
        policy,
        NOW,
        seededRandom(),
      )
      if (r.outcome !== "RETRYING") throw new Error("fixture")
      record = r.record
    }
    const final = advanceProofUpload(
      record,
      { kind: "RETRYABLE", error: "try 3" },
      policy,
      NOW,
      seededRandom(),
    )
    expect(final.outcome).toBe("POISONED")
    if (final.outcome !== "POISONED") return
    expect(final.record.state).toBe("POISONED")
    expect(final.record.attempts).toBe(3)
    expect(final.record.nextAttemptAt).toBeUndefined()
  })

  it("poisons immediately on PERMANENT", () => {
    const record = createProofOutboxRecord(makeEnvelope([1, 2]), NOW)
    const result = advanceProofUpload(
      record,
      { kind: "PERMANENT", error: "signature invalid" },
      policy,
      NOW,
      seededRandom(),
    )
    expect(result.outcome).toBe("POISONED")
    if (result.outcome !== "POISONED") return
    expect(result.record.state).toBe("POISONED")
    expect(result.record.lastError).toBe("signature invalid")
  })
})

describe("D-8B SQLite proof outbox", () => {
  it("persists records across store instances and selects due batches", () => {
    const dir = mkdtempSync(join(tmpdir(), "arcana-proof-outbox-"))
    try {
      const dbPath = join(dir, "node.db")
      const db1 = new Database(dbPath)
      const outbox1 = new SqliteProofOutbox(db1)
      const record = createProofOutboxRecord(makeEnvelope([1, 2]), NOW)
      outbox1.upsert(record)

      const future = new Date(NOW.getTime() + 60_000)
      const delayed: ProofOutboxRecord = {
        ...createProofOutboxRecord(makeEnvelope([3, 4], record.batchRoot), NOW),
        nextAttemptAt: future.toISOString(),
      }
      outbox1.upsert(delayed)

      expect(outbox1.pendingDue("node-alpha", NOW)).toHaveLength(1)
      expect(outbox1.pendingDue("node-alpha", future)).toHaveLength(2)
      expect(outbox1.stats("node-alpha")).toEqual({ pending: 2, registered: 0, poisoned: 0 })
      db1.close()

      const db2 = new Database(dbPath)
      const outbox2 = new SqliteProofOutbox(db2)
      expect(outbox2.get("node-alpha", record.batchRoot)?.state).toBe("PENDING_REGISTRATION")
      expect(outbox2.pendingDue("node-alpha", NOW)).toHaveLength(1)
      db2.close()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe("D-8B upload loop", () => {
  it("uploads due batches, persists transitions, and skips not-due records", async () => {
    const db = new Database(":memory:")
    const outbox = new SqliteProofOutbox(db)
    const first = createProofOutboxRecord(makeEnvelope([1, 2]), NOW)
    const second = createProofOutboxRecord(makeEnvelope([3, 4], first.batchRoot), NOW)
    outbox.upsert(first)
    outbox.upsert(second)

    const uploaded: string[] = []
    const transport = async (envelope: ProofBatchEnvelope): Promise<ProofUploadTransportResult> => {
      uploaded.push(envelope.batchRoot)
      return { kind: "REGISTERED", receipt: receiptFor(createProofOutboxRecord(envelope, NOW)) }
    }

    const summaries = await processDueProofUploads(outbox, "node-alpha", transport, {
      baseBackoffMs: 1000,
      maximumBackoffMs: 8000,
      maximumAttempts: 3,
      jitterRatio: 0,
    }, NOW, seededRandom())

    expect(uploaded).toEqual([first.batchRoot, second.batchRoot])
    expect(summaries.map((s) => s.outcome)).toEqual(["REGISTERED", "REGISTERED"])
    expect(outbox.stats("node-alpha")).toEqual({ pending: 0, registered: 2, poisoned: 0 })
    expect(outbox.get("node-alpha", first.batchRoot)?.registrationReceiptJson).toContain("receipt-1")

    // Idempotent second pass: nothing due, nothing uploaded again.
    const secondPass = await processDueProofUploads(outbox, "node-alpha", transport, {
      baseBackoffMs: 1000,
      maximumBackoffMs: 8000,
      maximumAttempts: 3,
      jitterRatio: 0,
    }, NOW, seededRandom())
    expect(secondPass).toHaveLength(0)
    expect(uploaded).toHaveLength(2)
  })
})
