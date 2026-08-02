import { describe, expect, it } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ed25519 } from "@noble/curves/ed25519.js"
import { buildOutboxRecords, listLocalProofs } from "../../src/node/local-proof-source"

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
  return bytes
}

const nodeKey = ed25519.keygen(hexToBytes("51".repeat(32)))

function writeProof(dir: string, id: string, createdAt: string): void {
  const proofsDir = join(dir, ".arcana", "proofs")
  mkdirSync(proofsDir, { recursive: true })
  writeFileSync(
    join(proofsDir, `${id}.json`),
    JSON.stringify({ id, created_at: createdAt, events: [] }),
  )
}

describe("local proof source (D-8B)", () => {
  it("lists, orders, and batches local proofs with deterministic sequences", () => {
    const dir = mkdtempSync(join(tmpdir(), "arcana-proof-source-"))
    try {
      writeProof(dir, "proof-b", "2026-08-02T12:00:00.000Z")
      writeProof(dir, "proof-a", "2026-08-02T11:00:00.000Z")
      writeProof(dir, "proof-c", "2026-08-02T13:00:00.000Z")
      writeFileSync(join(dir, ".arcana", "proofs", "corrupt.json"), "{not json")

      const entries = listLocalProofs(dir)
      expect(entries.map((e) => e.id)).toEqual(["proof-a", "proof-b", "proof-c"])
      expect(entries.every((e) => e.hash.length === 64)).toBe(true)

      const { records, sequences } = buildOutboxRecords(
        {
          directory: dir,
          nodeId: "node-alpha",
          trustDomain: "arcana.test",
          nodeKeyEpoch: 1,
          policySequence: 1,
          policyDigest: "policy-1",
          revocationSequence: 0,
          revocationDigest: "revocation-0",
          emergencyEpoch: 0,
          firstSequence: 100,
        },
        nodeKey.secretKey,
      )
      expect(sequences).toEqual([
        { id: "proof-a", localSequence: 100 },
        { id: "proof-b", localSequence: 101 },
        { id: "proof-c", localSequence: 102 },
      ])
      expect(records).toHaveLength(1)
      expect(records[0].firstLocalSequence).toBe(100)
      expect(records[0].lastLocalSequence).toBe(102)
      expect(records[0].runProofHashes).toEqual(entries.map((e) => e.hash))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("splits large proof sets into chained batches", () => {
    const dir = mkdtempSync(join(tmpdir(), "arcana-proof-source-many-"))
    try {
      for (let i = 0; i < 5; i++) {
        writeProof(dir, `proof-${i}`, `2026-08-02T11:00:0${i}.000Z`)
      }
      const { records } = buildOutboxRecords(
        {
          directory: dir,
          nodeId: "node-alpha",
          trustDomain: "arcana.test",
          nodeKeyEpoch: 1,
          policySequence: 1,
          policyDigest: "policy-1",
          revocationSequence: 0,
          revocationDigest: "revocation-0",
          emergencyEpoch: 0,
          firstSequence: 1,
          maximumRunProofs: 2,
        },
        nodeKey.secretKey,
      )
      expect(records).toHaveLength(3)
      expect(records.map((r) => r.firstLocalSequence)).toEqual([1, 3, 5])
      expect(records[1].previousBatchRoot).toBe(records[0].batchRoot)
      expect(records[2].previousBatchRoot).toBe(records[1].batchRoot)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
