/**
 * Phase C: Canonical authorization request hashing.
 *
 * requestHash = SHA-256("arcana-authorization-request-v1" ∥ canonical(request))
 *
 * The canonical form is a deterministic byte sequence derived from
 * the AuthorizationRequest fields in a fixed order.
 */

import { createHash } from "node:crypto"
import type { AuthorizationRequest } from "./types"

const DOMAIN = "arcana-authorization-request-v1"

function u32(len: number): Buffer {
  const buf = Buffer.alloc(4)
  buf.writeUInt32BE(len, 0)
  return buf
}

function str(s: string): Buffer {
  const bytes = Buffer.from(s, "utf-8")
  return Buffer.concat([u32(bytes.length), bytes])
}

function strOpt(s: string | undefined): Buffer {
  if (s === undefined) return Buffer.from([0x00])
  return Buffer.concat([Buffer.from([0x01]), str(s)])
}

function strArr(arr: string[]): Buffer {
  const parts: Buffer[] = [u32(arr.length)]
  for (const s of arr) {
    parts.push(str(s))
  }
  return Buffer.concat(parts)
}

function labelArr(arr: string[]): Buffer {
  // Sorted for determinism
  const sorted = [...arr].sort()
  return strArr(sorted)
}

/**
 * Canonical encoding of an AuthorizationRequest.
 * Fixed field order. All strings length-prefixed.
 */
export function canonicalizeRequest(req: AuthorizationRequest): Buffer {
  const parts: Buffer[] = []

  // Schema version
  parts.push(str(req.schemaVersion))

  // Identity
  parts.push(str(req.requestId))
  parts.push(str(req.principalId))
  parts.push(str(req.sessionId))
  parts.push(strOpt(req.contractId))

  // Action
  parts.push(str(req.tool))
  parts.push(str(req.action))

  // Resource
  parts.push(str(req.resource.kind))
  parts.push(strOpt(req.resource.path))
  parts.push(strOpt(req.resource.host))
  parts.push(strOpt(req.resource.executable))
  parts.push(strOpt(req.resource.secretKind))

  // Execution context
  parts.push(strOpt(req.executable))
  parts.push(strArr(req.arguments ?? []))
  parts.push(strOpt(req.workingDirectory))
  parts.push(strOpt(req.networkDestination))

  // Provenance and sensitivity (sorted for determinism)
  parts.push(labelArr(req.provenance))
  parts.push(labelArr(req.sensitivity))

  // Timing
  parts.push(str(req.requestedAt))
  parts.push(str(req.nonce))

  return Buffer.concat(parts)
}

/**
 * Compute the authorization request hash.
 */
export function computeRequestHash(req: AuthorizationRequest): string {
  const canonical = canonicalizeRequest(req)
  const domain = Buffer.from(DOMAIN, "utf-8")
  const hash = createHash("sha256")
  hash.update(domain)
  hash.update(canonical)
  return hash.digest("hex")
}
