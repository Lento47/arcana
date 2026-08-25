// packages/core/src/capability/supply-chain.ts
//
// Authority Kernel K10-full — Supply-chain identity for skills, MCP servers,
// and any externally provisioned capability provider.
//
// Identity model: immutable content hashes bind a capability to its exact
// bytes. Any change to implementation, manifest, schema, or description
// breaks the hash chain ⇒ trust inheritance stops ⇒ re-approval required.
//
// Signing: Ed25519 (same primitive as delegated leases). Publisher keys are
// provisioned out-of-band; verification requires only the public half.
//
// Drift detection: `detectIdentityDrift(previous, current)` returns the set
// of changed fields. Non-empty drift ⇒ trust inheritance broken.

import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign as cryptoSign, verify as cryptoVerify } from "node:crypto"

// ── Types ────────────────────────────────────────────────────────────────

export type ProviderKind = "skill" | "mcp_server" | "plugin"

export interface ProviderIdentity {
  kind: ProviderKind
  /** Stable logical name within its kind (e.g. "github-copilot"). */
  provider_id: string
  /** Semver or commit ref. */
  version: string
  /** SHA-256 of the implementation artifact (source dir / binary). */
  content_hash: string
  /** SHA-256 of the declared manifest (metadata without body). */
  manifest_hash: string
  /** SHA-256 of the tool/operation schema declarations. */
  schema_hash: string
  /** Human-readable description — NOT trusted for authorization. */
  description_hash: string
}

export interface SignedProviderIdentity extends ProviderIdentity {
  publisher_id: string
  signature: string // base64 Ed25519 over canonical(identity minus signature)
  signed_at: number
}

export interface RequestedCapabilities {
  actions: string[]
  resources: Array<{ kind: string; pattern: string }>
}

export interface GrantedCapabilities {
  actions: string[]
  resources: Array<{ kind: string; pattern: string }>
  granted_by: string
  granted_at: number
}

/** Result of comparing a previously-approved identity against the current one. */
export interface IdentityDrift {
  drifted: boolean
  changedFields: string[]
}

// ── Content hashing ─────────────────────────────────────────────────────

function sha256(data: string): string {
  return createHash("sha256").update(data, "utf-8").digest("hex")
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`
  const keys = Object.keys(value as Record<string, unknown>).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`).join(",")}}`
}

export function hashContent(content: string): string {
  return sha256(content)
}

export function computeProviderIdentity(input: {
  kind: ProviderKind
  providerId: string
  version: string
  sourceDir?: string
  manifestJson: string
  schemaDeclarations: string
  description: string
}): ProviderIdentity {
  return {
    kind: input.kind,
    provider_id: input.providerId,
    version: input.version,
    content_hash: sha256(input.sourceDir ?? input.schemaDeclarations),
    manifest_hash: sha256(input.manifestJson),
    schema_hash: sha256(input.schemaDeclarations),
    description_hash: sha256(input.description),
  }
}

// ── Drift detection ──────────────────────────────────────────────────────

const DRIFTABLE_FIELDS: Array<keyof ProviderIdentity> = [
  "content_hash",
  "manifest_hash",
  "schema_hash",
  "description_hash",
]

/**
 * Compare a previously approved identity against the current one.
 * Any drift means trust inheritance must stop and re-approval is required.
 * Version bumps alone do NOT count as drift if all hashes match.
 */
export function detectIdentityDrift(
  previous: ProviderIdentity,
  current: ProviderIdentity,
): IdentityDrift {
  const changedFields: string[] = []
  for (const field of DRIFTABLE_FIELDS) {
    if (previous[field] !== current[field]) changedFields.push(field)
  }
  return { drifted: changedFields.length > 0, changedFields }
}

// ── Signing ──────────────────────────────────────────────────────────────

function canonicalIdentityBytes(id: SignedProviderIdentity): Buffer {
  const { signature, ...rest } = id
  return Buffer.from(stableStringify(rest), "utf-8")
}

export function signProviderIdentity(
  identity: Omit<SignedProviderIdentity, "signature">,
  privateKeyPem: string,
): SignedProviderIdentity {
  const key = createPrivateKey(privateKeyPem)
  const sig = cryptoSign(null, canonicalIdentityBytes(identity as SignedProviderIdentity), key)
  return { ...identity, signature: sig.toString("base64") }
}

export function verifyProviderSignature(
  signed: SignedProviderIdentity,
  publicKeyPem: string,
): boolean {
  try {
    const pub = createPublicKey(publicKeyPem)
    return cryptoVerify(null, canonicalIdentityBytes(signed), pub, Buffer.from(signed.signature, "base64"))
  } catch {
    return false
  }
}
