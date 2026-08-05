/**
 * Sample: portable RunProof verification (E3).
 *
 * Pure functions, no server needed. API traced to real exports:
 *   proofFingerprint, verifyRunProofExport, RunProofLike, RunProofVerification
 *     -> @arcana/sdk/v2/proof
 *
 * Run with:  bun run proof-verify.ts
 */

import { proofFingerprint, verifyRunProofExport, type RunProofLike } from "@arcana/sdk/v2/proof"

// A minimal, valid v0.2 proof export.
const proof: RunProofLike = {
  id: "proof:sample",
  schema_version: "0.2",
  timestamp: "2026-08-05T00:00:00.000Z",
  lifecycle: {
    status: "completed",
    started_at: "2026-08-05T00:00:00.000Z",
    ended_at: "2026-08-05T00:00:00.500Z",
  },
  contract: { version: 1 },
  events: [
    { id: "evt:1", timestamp: "2026-08-05T00:00:00.000Z", type: "session.started" },
    { id: "evt:2", timestamp: "2026-08-05T00:00:00.250Z", type: "tool.requested" },
    { id: "evt:3", timestamp: "2026-08-05T00:00:00.500Z", type: "proof.exported" },
  ],
}

// SHA-256 over the canonicalized identity + lifecycle + ordered events.
const fingerprint = proofFingerprint(proof)
console.log("fingerprint:", fingerprint)

// Structural verification + fingerprint cross-check against the exported value.
const result = verifyRunProofExport({ ...proof, fingerprint })
if (result.valid) {
  console.log("VALID —", result.checks.join(", "))
} else {
  console.error("INVALID —", result.reason)
}

// Tampering with any event changes the fingerprint and fails verification.
const tampered = { ...proof, events: [...proof.events, { id: "evt:9", timestamp: "2026-08-05T00:00:00.999Z", type: "injected" }] }
const bad = verifyRunProofExport(tampered)
console.log("tampered:", bad.valid ? "still valid (BUG)" : `rejected — ${bad.reason}`)

// Out-of-order events also fail.
const reordered = verifyRunProofExport({ ...proof, events: [proof.events[2]!, proof.events[1]!, proof.events[0]!] })
console.log("reordered:", reordered.valid ? "still valid (BUG)" : `rejected — ${reordered.reason}`)
