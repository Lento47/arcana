/**
 * SDK 1.0: RunProof verification client (E3).
 *
 * Verifies an exported RunProof structurally (schema, lifecycle, event
 * ordering) and computes a canonical proof fingerprint for independent
 * comparison. Chain-integrity verification of the underlying event store is
 * performed by the engine; this surface is the portable verifier for
 * exported artifacts.
 */

import { createHash } from "node:crypto"
import { canonicalize } from "@arcana/core/crypto/canonical-serializer"

export type RunProofLike = {
  id: string
  schema_version: string
  timestamp: string
  lifecycle: { status: string; started_at: string; ended_at?: string }
  contract: unknown
  events: Array<{ id: string; timestamp: string; type: string }>
  fingerprint?: string
  [key: string]: unknown
}

export type RunProofVerification =
  | { valid: true; checks: string[]; fingerprint: string }
  | { valid: false; reason: string; checks: string[] }

const SUPPORTED_SCHEMA_VERSION = "0.2"
const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled", "rolled_back"])

/**
 * Canonical proof fingerprint: binds the stable identity fields, lifecycle,
 * and the ordered event list. Any tampering with events changes it.
 */
export function proofFingerprint(proof: Pick<RunProofLike, "id" | "schema_version" | "timestamp" | "lifecycle" | "events">): string {
  const canonical = canonicalize({
    id: proof.id,
    schema_version: proof.schema_version,
    timestamp: proof.timestamp,
    lifecycle: proof.lifecycle,
    events: proof.events,
  })
  return createHash("sha256").update(canonical).digest("hex")
}

export function verifyRunProofExport(input: string | Record<string, unknown>): RunProofVerification {
  const checks: string[] = []

  let proof: RunProofLike
  try {
    proof = (typeof input === "string" ? JSON.parse(input) : input) as RunProofLike
  } catch (error) {
    return { valid: false, reason: `proof is not valid JSON: ${String(error)}`, checks }
  }

  if (typeof proof !== "object" || proof === null) {
    return { valid: false, reason: "proof must be a JSON object", checks }
  }

  const require = (condition: boolean, label: string): boolean => {
    if (condition) {
      checks.push(label)
      return true
    }
    return false
  }

  if (!require(typeof proof.id === "string" && proof.id.length > 0, "id present")) {
    return { valid: false, reason: "missing or invalid proof id", checks }
  }
  if (!require(proof.schema_version === SUPPORTED_SCHEMA_VERSION, `schema_version ${SUPPORTED_SCHEMA_VERSION}`)) {
    return { valid: false, reason: `unsupported schema_version ${String(proof.schema_version)}`, checks }
  }
  if (!require(typeof proof.timestamp === "string" && !Number.isNaN(Date.parse(proof.timestamp)), "timestamp valid")) {
    return { valid: false, reason: "invalid proof timestamp", checks }
  }
  if (!require(!!proof.lifecycle && typeof proof.lifecycle.status === "string", "lifecycle present")) {
    return { valid: false, reason: "missing lifecycle", checks }
  }
  if (!require(Array.isArray(proof.events), "events array present")) {
    return { valid: false, reason: "missing events array", checks }
  }

  if (TERMINAL_STATUSES.has(proof.lifecycle.status)) {
    if (!require(typeof proof.lifecycle.ended_at === "string", "terminal status has ended_at")) {
      return { valid: false, reason: `lifecycle ${proof.lifecycle.status} requires ended_at`, checks }
    }
  }

  let previous = 0
  for (const [index, event] of proof.events.entries()) {
    if (!require(!!event.id && !!event.type, `event ${index} identity`)) {
      return { valid: false, reason: `event ${index} missing id/type`, checks }
    }
    const ts = Date.parse(event.timestamp)
    if (!require(!Number.isNaN(ts) && ts >= previous, `event ${index} ordered`)) {
      return { valid: false, reason: `event ${index} timestamp out of order`, checks }
    }
    previous = ts
  }

  const fingerprint = proofFingerprint(proof)
  checks.push("fingerprint computed")
  if (proof.fingerprint !== undefined && proof.fingerprint !== fingerprint) {
    return {
      valid: false,
      reason: "proof fingerprint mismatch — events or identity fields were tampered with",
      checks,
    }
  }
  if (proof.fingerprint !== undefined) {
    checks.push("embedded fingerprint matches")
  }

  return { valid: true, checks, fingerprint }
}
