/**
 * Sample: governance building blocks — authorization requests and envelope verification.
 *
 * Pure functions, no server needed. API traced to real exports:
 *   buildAuthorizationRequest, toAuthorizationRequest, canonicalize,
 *   parseStrictEnvelope, verifySignedEnvelope, SignatureDomain
 *     -> @arcana/sdk/v2/governance
 *   AuthorizationRequest, CanonicalResource, CapabilityAction, ProvenanceLabel,
 *   SensitivityLabel -> @arcana/core/capability/types
 *
 * Run with:  bun run governance-policy.ts
 */

import {
  buildAuthorizationRequest,
  toAuthorizationRequest,
  canonicalize,
  parseStrictEnvelope,
  verifySignedEnvelope,
  type SignatureDomain,
  type GovernanceContext,
} from "@arcana/sdk/v2/governance"
import type { AuthorizationRequest } from "@arcana/core/capability/types"
import { computeRequestHash } from "@arcana/core/capability/request-hash"

// 1. Build a canonical authorization request. Every consequential field is bound
//    into the exact request hash H(q) the PEP evaluates.
const request = buildAuthorizationRequest({
  schemaVersion: "1",
  principalId: "agent:primary",
  sessionId: "ses_sample",
  workspaceId: "default",
  tool: "bash",
  action: "process.execute",
  resource: { kind: "process", executable: "/usr/bin/echo" },
  arguments: ["message=hello"],
  workingDirectory: "/home/user/project",
  provenance: ["SYSTEM_POLICY", "USER_INSTRUCTION"],
  sensitivity: ["PUBLIC"],
})
console.log("requestHash:", request.requestHash)
console.log("requestId:  ", request.requestId)

// 2. Framework adapters map a tool call + governance context onto the same shape.
const context: GovernanceContext = {
  principalId: "agent:primary",
  sessionId: "ses_sample",
  action: "filesystem.read",
  resource: { kind: "file", path: "src/main.ts" },
  workingDirectory: "/home/user/project",
  provenance: ["MODEL_OUTPUT"],
  sensitivity: ["PRIVATE"],
}
const mapped: AuthorizationRequest = toAuthorizationRequest(
  { name: "read", arguments: { file_path: "src/main.ts" } },
  context,
)
console.log("tool-call requestHash:", computeRequestHash(mapped))

// 3. Envelope verification. A signed policy envelope is canonicalized, strict-parsed,
//    and verified against the issuer's 32-byte Ed25519 public key.
const domain: SignatureDomain = "arcana:signed-policy:v1"
const envelope = {
  schemaVersion: 1,
  issuerId: "node-alpha",
  issuerEpoch: 1,
  sequence: 1,
  policyId: "policy:default",
  policyVersion: "1.0.0",
  policyDigest: request.requestHash,
  issuedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
  signatureAlgorithm: "Ed25519",
  signature: "<base64url 64-byte signature>",
}

const envelopeJson = JSON.stringify(envelope)
console.log("canonical payload:", canonicalize(envelope))

try {
  const parsed = parseStrictEnvelope(envelopeJson) // throws on duplicate/unknown fields
  console.log("strict parse ok, fields:", Object.keys(parsed).length)
} catch (error) {
  console.error("strict parse rejected:", (error as Error).message)
}

// With a placeholder key the SIGNATURE stage fails — replace with the issuer's real
// 32-byte public key. The stage field tells you exactly which layer rejected it.
const publicKeyBytes = new Uint8Array(32)
const verified = verifySignedEnvelope(envelopeJson, domain, publicKeyBytes)
if (!verified.valid) {
  console.log(`verification stopped at ${verified.stage}: ${verified.reason}`)
}
