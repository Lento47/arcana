/**
 * D-8B (node side): local proof store → upload outbox integration.
 *
 * Reads the durable local RunProof JSON store (`.arcana/proofs/*.json`,
 * written by `saveRunProof`), assigns deterministic local sequences ordered
 * by proof creation time, builds signed proof batches (D-8A), and returns
 * outbox records ready for `processDueProofUploads`.
 */

import { createHash } from "node:crypto"
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import {
  buildProofBatch,
  type SequencedRunProof,
} from "@arcana/core/crypto/proof-batching"
import { signProofBatch } from "@arcana/core/crypto/proof-registration"
import {
  createProofOutboxRecord,
  type ProofOutboxRecord,
} from "@arcana/core/crypto/proof-uploader"

export type LocalProofEntry = {
  id: string
  hash: string
  createdAt: string
}

export function listLocalProofs(directory: string): LocalProofEntry[] {
  const proofsDir = join(directory, ".arcana", "proofs")
  if (!existsSync(proofsDir)) return []

  const entries: LocalProofEntry[] = []
  for (const file of readdirSync(proofsDir)) {
    if (!file.endsWith(".json")) continue
    const path = join(proofsDir, file)
    try {
      const raw = readFileSync(path, "utf8")
      const parsed = JSON.parse(raw) as { id?: string; created_at?: string }
      const id = parsed.id ?? file.replace(/\.json$/, "")
      const createdAt = parsed.created_at ?? statSync(path).mtime.toISOString()
      const hash = createHash("sha256").update(raw).digest("hex")
      entries.push({ id, hash, createdAt })
    } catch {
      // Skip corrupt proof files; trace degradation is the local store's
      // concern, not the uploader's.
      continue
    }
  }
  return entries.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export type BuildOutboxInput = {
  directory: string
  nodeId: string
  trustDomain: string
  nodeKeyEpoch: number
  policySequence: number
  policyDigest: string
  revocationSequence: number
  revocationDigest: string
  emergencyEpoch: number
  /** Local sequence of the first proof in this upload pass. */
  firstSequence: number
  maximumRunProofs?: number
}

export function buildOutboxRecords(
  input: BuildOutboxInput,
  secretKey: Uint8Array,
): { records: ProofOutboxRecord[]; sequences: Array<{ id: string; localSequence: number }> } {
  const proofs = listLocalProofs(input.directory)
  const records: ProofOutboxRecord[] = []
  const sequences: Array<{ id: string; localSequence: number }> = []

  let previousBatchRoot: string | undefined
  let first = input.firstSequence

  while (true) {
    const window = proofs.slice(0, input.maximumRunProofs ?? 100)
    if (window.length === 0) break

    const sequenced: SequencedRunProof[] = window.map((entry, index) => ({
      localSequence: first + index,
      runProofHash: entry.hash,
      evidenceHash: entry.hash,
      traceHealth: "COMPLETE",
      timestamp: entry.createdAt,
    }))

    const built = buildProofBatch(sequenced, {
      trustDomain: input.trustDomain,
      nodeId: input.nodeId,
      nodeKeyEpoch: input.nodeKeyEpoch,
      policySequence: input.policySequence,
      policyDigest: input.policyDigest,
      revocationSequence: input.revocationSequence,
      revocationDigest: input.revocationDigest,
      emergencyEpoch: input.emergencyEpoch,
      previousBatchRoot,
    })
    if (!built.success) break

    const envelope = signProofBatch(built.payload, secretKey)
    records.push(createProofOutboxRecord(envelope, new Date()))
    window.forEach((entry, index) => {
      sequences.push({ id: entry.id, localSequence: first + index })
    })
    first += window.length
    proofs.splice(0, window.length)
    previousBatchRoot = envelope.batchRoot
  }

  return { records, sequences }
}
