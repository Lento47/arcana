import { createHash } from "node:crypto"

/**
 * Canonical hash computation for Arcana events.
 *
 * IMPORTANT: `payload` must be the RAW JSON string produced by
 * `JSON.stringify(input.payload)` at append time — NOT a parsed object.
 * Re-parsing and re-serializing can change key order and break verification.
 */
export function computeEventHash(input: {
  id: string
  sequence: number
  timestamp: string
  previousHash: string | null
  actorKind: string
  actorId: string
  type: string
  payload: string
}): string {
  const canonical = JSON.stringify({
    id: input.id,
    sequence: input.sequence,
    timestamp: input.timestamp,
    previousHash: input.previousHash,
    actorKind: input.actorKind,
    actorId: input.actorId,
    type: input.type,
    payload: input.payload,
  })
  return createHash("sha256").update(canonical).digest("hex")
}
