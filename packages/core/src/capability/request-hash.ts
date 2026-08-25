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

  // Contract-scoped intent extension. Keep the original v1 byte stream for
  // contractless requests, but bind every supplied revision/criterion into
  // H(q). A binding for one contract revision must never authorize another.
  if (req.contractRevision !== undefined || req.criterionIds !== undefined) {
    parts.push(str("intent-contract-v1"))
    parts.push(strOpt(req.contractRevision))
    parts.push(labelArr(req.criterionIds ?? []))
  }

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

  // Exact child-environment binding. Values never enter the request object;
  // only the process gate's canonical digest is retained. Tagged and optional
  // so requests without an explicit environment keep their v1 byte stream.
  if (req.environment !== undefined) {
    parts.push(str("process-environment-v1"))
    parts.push(labelArr(req.environment.variableNames))
    parts.push(str(req.environment.digest))
  }

  // Provenance and sensitivity (sorted for determinism)
  parts.push(labelArr(req.provenance))
  parts.push(labelArr(req.sensitivity))

  // Timing
  parts.push(str(req.requestedAt))
  parts.push(str(req.nonce))

  // K2 identity chain — tagged extension, emitted only when present so
  // legacy (principal+session) request hashes remain byte-identical.
  if (
    req.instanceId !== undefined ||
    req.parentInstanceId !== undefined ||
    req.onBehalfOf !== undefined ||
    req.toolInstance !== undefined
  ) {
    parts.push(str("identity-k2-v1"))
    parts.push(strOpt(req.instanceId))
    parts.push(strOpt(req.parentInstanceId))
    parts.push(strOpt(req.onBehalfOf))
    if (req.toolInstance) {
      parts.push(Buffer.from([0x01]))
      parts.push(str(req.toolInstance.toolId))
      parts.push(strOpt(req.toolInstance.origin))
      parts.push(strOpt(req.toolInstance.schemaHash))
    } else {
      parts.push(Buffer.from([0x00]))
    }
  }

  // K7 influence claims — tagged extension, present only when supplied.
  if (req.influenceClaims && req.influenceClaims.length > 0) {
    parts.push(str("influence-k7-v1"))
    const sorted = [...req.influenceClaims].sort((a, b) =>
      a.argument < b.argument ? -1 : a.argument > b.argument ? 1 : 0,
    )
    parts.push(str(String(sorted.length)))
    for (const c of sorted) {
      parts.push(str(c.argument))
      parts.push(strOpt(c.value))
      parts.push(labelArr(c.claimedSources ?? []))
      const objective = [
        ...(c.availableSources ?? []),
        ...(c.directDerivations ?? []),
      ].sort()
      parts.push(labelArr(objective))
      parts.push(strOpt(c.assertedBy))
    }
  }

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
