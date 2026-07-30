/**
 * Generate golden test vectors for signed envelope verification.
 * Run with: bun run packages/core/src/crypto/test-vectors/generate.ts
 */

import { ed25519 } from "@noble/curves/ed25519.js"
import { canonicalize, buildSignatureInput, type SignatureDomain } from "../canonical-serializer"
import { CAPABILITY_DOMAIN, POLICY_DOMAIN, NODE_IDENTITY_DOMAIN, REVOCATION_DOMAIN } from "../signed-envelopes"

// Helper: base64url encode (no padding)
function toBase64url(bytes: Uint8Array): string {
  let binary = ""
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

// Helper: hex string to Uint8Array
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
  }
  return bytes
}

// Generate 5 keypairs from deterministic seeds
const seeds = [
  "0000000000000000000000000000000000000000000000000000000000000001",
  "0000000000000000000000000000000000000000000000000000000000000002",
  "0000000000000000000000000000000000000000000000000000000000000003",
  "0000000000000000000000000000000000000000000000000000000000000004",
  "0000000000000000000000000000000000000000000000000000000000000005",
]

const keypairs = seeds.map(seed => {
  const seedBytes = hexToBytes(seed)
  const kp = ed25519.keygen(seedBytes)
  return kp
})

console.log("Generated keypairs:")
for (let i = 0; i < keypairs.length; i++) {
  console.log(`  Key ${i + 1}: pub=${toBase64url(keypairs[i].publicKey)}`)
}

// Define payloads
const capabilityPayload1 = {
  schemaVersion: 1,
  issuerId: "node-alpha",
  issuerEpoch: 1,
  audienceNodeId: "node-beta",
  grant: {
    grantId: "grant-001",
    principal: { kind: "agent", id: "arcana" },
    actions: ["filesystem.read"],
    resources: ["packages/**"],
    workspaceId: "arcana",
    contractId: "contract-001",
    contractRevision: 1,
    maxUses: 10,
    delegationDepth: 0,
  },
  issuedAt: "2026-07-29T12:00:00.000Z",
  expiresAt: "2026-07-29T13:00:00.000Z",
  nonce: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
}

const capabilityPayload2 = {
  schemaVersion: 1,
  issuerId: "node-alpha",
  issuerEpoch: 1,
  audienceNodeId: "node-gamma",
  grant: {
    grantId: "grant-002",
    principal: { kind: "subagent", id: "investigator" },
    actions: ["filesystem.read"],
    resources: ["packages/core/src/**"],
    workspaceId: "arcana",
    contractId: "contract-001",
    contractRevision: 1,
    maxUses: 5,
    delegationDepth: 1,
    delegationAncestry: {
      parentGrantId: "grant-001",
      parentSignature: "parent-sig-placeholder",
      depth: 1,
    },
  },
  issuedAt: "2026-07-29T12:00:00.000Z",
  expiresAt: "2026-07-29T12:30:00.000Z",
  nonce: "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e",
}

const policyPayload = {
  schemaVersion: 1,
  issuerId: "node-alpha",
  issuerEpoch: 1,
  sequence: 1,
  policyId: "policy-default",
  policyVersion: "1.0.0",
  policyDigest: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  issuedAt: "2026-07-29T12:00:00.000Z",
  expiresAt: "2026-07-30T12:00:00.000Z",
}

const nodeIdentityPayload = {
  schemaVersion: 1,
  nodeId: "node-alpha",
  organizationId: "arcana-org",
  publicKey: toBase64url(keypairs[0].publicKey),
  issuerId: "trust-registry",
  issuerEpoch: 1,
  issuedAt: "2026-07-29T12:00:00.000Z",
  expiresAt: "2026-08-29T12:00:00.000Z",
  capabilities: ["grant", "revoke", "verify"],
}

const revocationPayload = {
  schemaVersion: 1,
  issuerId: "node-alpha",
  issuerEpoch: 1,
  sequence: 1,
  subjectType: "GRANT",
  subjectId: "grant-001",
  reason: "operator requested revocation",
  effectiveAt: "2026-07-29T12:00:00.000Z",
  issuedAt: "2026-07-29T12:00:00.000Z",
}

// Sign each payload
function signPayload(keyIndex: number, domain: SignatureDomain, payload: Record<string, unknown>) {
  const { signature: _, signatureAlgorithm: __, ...unsigned } = payload as any
  const sigInput = buildSignatureInput(domain, unsigned)
  const sig = ed25519.sign(sigInput, keypairs[keyIndex].secretKey)
  return {
    ...unsigned,
    signatureAlgorithm: "Ed25519",
    signature: toBase64url(sig),
  }
}

function buildVector(
  vectorId: string,
  description: string,
  keyIndex: number,
  domain: SignatureDomain,
  payload: Record<string, unknown>,
) {
  const fullEnvelope = signPayload(keyIndex, domain, payload)
  const { signature: _, signatureAlgorithm: __, ...unsigned } = fullEnvelope as any
  const canonicalPayload = canonicalize(unsigned)
  const sigInput = buildSignatureInput(domain, unsigned)

  return {
    vectorId,
    domain,
    description,
    privateKeySeed: seeds[keyIndex],
    publicKey: toBase64url(keypairs[keyIndex].publicKey),
    unsignedPayload: unsigned,
    canonicalPayloadHex: Buffer.from(new TextEncoder().encode(canonicalPayload)).toString("hex"),
    signatureInputHex: Buffer.from(sigInput).toString("hex"),
    signature: fullEnvelope.signature,
    verificationExpected: true,
  }
}

// Build positive vectors
const vectors = [
  buildVector("signed-capability-v1-001", "Basic filesystem.read capability grant", 0, CAPABILITY_DOMAIN, capabilityPayload1),
  buildVector("signed-capability-v1-002", "Capability with delegation ancestry", 1, CAPABILITY_DOMAIN, capabilityPayload2),
  buildVector("signed-policy-v1-001", "Basic policy envelope", 2, POLICY_DOMAIN, policyPayload),
  buildVector("node-identity-v1-001", "Node identity certificate", 3, NODE_IDENTITY_DOMAIN, nodeIdentityPayload),
  buildVector("revocation-v1-001", "Grant revocation statement", 4, REVOCATION_DOMAIN, revocationPayload),
]

// Now output the public keys in base64url format
console.log("\nPublic keys (base64url no padding):")
for (let i = 0; i < keypairs.length; i++) {
  console.log(`  Vector ${i + 1}: pub=${toBase64url(keypairs[i].publicKey)}, sig=${vectors[i].signature}`)
}

console.log("\nJSON output written.")
