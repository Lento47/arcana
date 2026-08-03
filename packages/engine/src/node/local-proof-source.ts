/**
 * D-8B (node side): local proof store → upload outbox integration.
 *
 * Reads the durable local RunProof JSON store (`.arcana/proofs/*.json`,
 * written by `saveRunProof`), assigns deterministic local sequences ordered
 * by proof creation time, builds signed proof batches (D-8A), and returns
 * outbox records ready for `processDueProofUploads`.
 *
 * D-7.1: every proof file read routes through `SafeBoundedFileReader`
 * (handle-relative kernel containment). Proofs are expected to live strictly
 * under `.arcana/proofs` within the node directory; a proof whose resolved
 * path escapes that root (symlink/junction, reparse point) is treated as
 * unreadable and is skipped — it can never be batched or uploaded. This
 * fails closed: an escaped or oversize proof is omitted from the outbox
 * rather than read through a hostile path.
 */

import { createHash } from "node:crypto"
import { existsSync, readdirSync, statSync } from "node:fs"
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
import { SafeBoundedFileReader } from "@arcana/core/crypto/bounded-file-reader"

export type LocalProofEntry = {
  id: string
  hash: string
  createdAt: string
}

/**
 * Maximum bytes accepted for a single local proof file. Proofs beyond this
 * budget (or that exceed it after a hostile resize) are treated as
 * unreadable and skipped, mirroring the corrupt-file skip path.
 */
export const MAX_PROOF_BYTES = 16 * 1024 * 1024

/**
 * Read a proof file through the bounded, handle-relative containment reader.
 * Returns the decoded file text on a contained, in-budget read; otherwise
 * returns `undefined` so the caller can skip the entry (fail closed).
 */
async function readBoundedProofFile(directory: string, relativePath: string, maxBytes: number): Promise<string | undefined> {
  const reader = new SafeBoundedFileReader()
  const result = await reader.read({
    workspaceRoot: directory,
    requestedPath: relativePath,
    maximumBytes: maxBytes,
  })
  if (!result.success) return undefined
  return result.content.toString("utf8")
}

export async function listLocalProofs(directory: string, maxBytes: number = MAX_PROOF_BYTES): Promise<LocalProofEntry[]> {
  const proofsDir = join(directory, ".arcana", "proofs")
  if (!existsSync(proofsDir)) return []

  const entries: LocalProofEntry[] = []
  for (const file of readdirSync(proofsDir)) {
    if (!file.endsWith(".json")) continue
    const relativePath = join(".arcana", "proofs", file)
    try {
      const raw = await readBoundedProofFile(directory, relativePath, maxBytes)
      if (raw === undefined) {
        // Containment rejection (symlink/junction escape, reparse point,
        // oversize, or unreadable) — skip; never read through a hostile path.
        continue
      }
      const parsed = JSON.parse(raw) as { id?: string; created_at?: string }
      const id = parsed.id ?? file.replace(/\.json$/, "")
      const createdAt = parsed.created_at ?? statSync(join(directory, relativePath)).mtime.toISOString()
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
  /** Bounded-read byte budget per proof file (defaults to MAX_PROOF_BYTES). */
  maximumProofBytes?: number
}

export async function buildOutboxRecords(
  input: BuildOutboxInput,
  secretKey: Uint8Array,
): Promise<{ records: ProofOutboxRecord[]; sequences: Array<{ id: string; localSequence: number }> }> {
  const proofs = await listLocalProofs(input.directory, input.maximumProofBytes)
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
