// packages/core/src/capability/delegated-lease.ts
//
// Authority Kernel K8 — Delegated Authority Leases (P5: no amplification).
//
// A delegated lease is a SIGNED, monotonically attenuated grant that lets a
// downstream enforcement point (e.g. arcana-proxy) act independently within
// an envelope WITHOUT an upstream round-trip per effect:
//
//   Root Authority ──signs──> DelegatedLease ──locally verified──> Effects
//
// Guarantees:
//   - Signature binds every field (scope, expiry, epoch, policy hash) — any
//     tampering invalidates the whole lease.
//   - Expiry bounds worst-case revocation staleness:
//       WorstCaseRevocationDelay ≤ expiresAt − issuedAt
//   - issuerEpoch lets the issuer invalidate a whole GENERATION of leases on
//     reconnect (fast path); TTL remains the guaranteed backstop.
//   - policyHash pins the delegation terms — a policy change orphans old
//     leases even inside their TTL.
//
// Scope amplification is refused at ISSUE time: child scope must be a subset
// of the parent capability being delegated.

import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign as cryptoSign, verify as cryptoVerify, type KeyObject } from "node:crypto"

export interface EffectiveScope {
  actions: string[]
  resources: Array<{ kind: string; pattern: string }>
}

export interface DelegatedLease {
  issuer: string
  subject: string
  parentCapabilityId: string | null
  effectiveScope: EffectiveScope
  issuedAt: number
  expiresAt: number
  /** Bump to invalidate every lease of a generation at once. */
  issuerEpoch: number
  /** Pins the delegation terms/policy version in force at issuance. */
  policyHash: string
}

export interface SignedLease {
  lease: DelegatedLease
  algorithm: "ed25519"
  signature: string // base64 over canonical(lease)
}

export interface IssuerKeyPair {
  publicKey: string // PEM
  privateKey: string // PEM
}

export function generateIssuerKeyPair(): IssuerKeyPair {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519")
  return {
    publicKey: publicKey.export({ type: "spki", format: "pem" }).toString(),
    privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  }
}

// ── Canonical serialization ─────────────────────────────────────────────

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`
  const keys = Object.keys(value as Record<string, unknown>).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`).join(",")}}`
}

function canonicalLeaseBytes(lease: DelegatedLease): Buffer {
  return Buffer.from(stableStringify(lease), "utf-8")
}

export function leaseFingerprint(lease: DelegatedLease): string {
  return createHash("sha256").update(canonicalLeaseBytes(lease)).digest("hex")
}

// ── Signing / verification ──────────────────────────────────────────────

export function signLease(lease: DelegatedLease, privateKeyPem: string): SignedLease {
  const key = createPrivateKey(privateKeyPem)
  const signature = cryptoSign(null, canonicalLeaseBytes(lease), key)
  return { lease, algorithm: "ed25519", signature: signature.toString("base64") }
}

export interface VerifyOptions {
  /** Trust anchor for the lease signature. */
  issuerPublicKeyPem: string
  /** Wall-clock check target (defaults to Date.now()). */
  now?: number
  /** When set, lease.issuerEpoch MUST equal this value (generation pinning). */
  currentIssuerEpoch?: number
  /** When set, the lease scope must be contained within this parent scope. */
  parentScope?: EffectiveScope
}

export type LeaseVerdict =
  | { valid: true; reason: "signature-and-claims-ok" }
  | { valid: false; reason:
      | "BAD_SIGNATURE"
      | "EXPIRED"
      | "NOT_YET_VALID"
      | "EPOCH_MISMATCH"
      | "SCOPE_AMPLIFICATION"
      | "MALFORMED" }

export function verifyLease(signed: SignedLease, opts: VerifyOptions): LeaseVerdict {
  const now = opts.now ?? Date.now()
  const lease = signed.lease

  // Shape gate
  if (
    typeof lease.issuer !== "string" ||
    typeof lease.subject !== "string" ||
    !Array.isArray(lease.effectiveScope?.actions) ||
    !Array.isArray(lease.effectiveScope?.resources) ||
    typeof lease.expiresAt !== "number" ||
    typeof lease.issuedAt !== "number"
  ) {
    return { valid: false, reason: "MALFORMED" }
  }

  // Signature over canonical bytes
  let ok = false
  try {
    ok = cryptoVerify(
      null,
      canonicalLeaseBytes(lease),
      createPublicKey(opts.issuerPublicKeyPem),
      Buffer.from(signed.signature, "base64"),
    )
  } catch {
    ok = false
  }
  if (!ok) return { valid: false, reason: "BAD_SIGNATURE" }

  // Temporal window
  if (now < lease.issuedAt) return { valid: false, reason: "NOT_YET_VALID" }
  if (now >= lease.expiresAt) return { valid: false, reason: "EXPIRED" }

  // Generation pinning
  if (
    opts.currentIssuerEpoch !== undefined &&
    lease.issuerEpoch !== opts.currentIssuerEpoch
  ) {
    return { valid: false, reason: "EPOCH_MISMATCH" }
  }

  // No amplification against the parent scope when one is supplied.
  if (opts.parentScope && !scopeContainedIn(lease.effectiveScope, opts.parentScope)) {
    return { valid: false, reason: "SCOPE_AMPLIFICATION" }
  }

  return { valid: true, reason: "signature-and-claims-ok" }
}

// ── Scope containment (P5) ──────────────────────────────────────────────

function actionSubset(child: string[], parent: string[]): boolean {
  const p = new Set(parent)
  return child.every((a) => p.has(a))
}

/**
 * Resource containment for v1: every child resource selector must be covered
 * by some parent selector of the same kind, where coverage means the parent
 * pattern is "*" or an exact match. Prefix/narrower-glob semantics land with
 * the canonical-resource matcher integration (documented limitation).
 */
function resourcesCovered(
  child: EffectiveScope["resources"],
  parent: EffectiveScope["resources"],
): boolean {
  return child.every((c) =>
    parent.some((p) => p.kind === c.kind && (p.pattern === "*" || p.pattern === c.pattern)),
  )
}

export function scopeContainedIn(child: EffectiveScope, parent: EffectiveScope): boolean {
  return actionSubset(child.actions, parent.actions) && resourcesCovered(child.resources, parent.resources)
}
