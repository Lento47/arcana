import { ed25519 } from '@noble/curves/ed25519.js'
import { canonicalize } from '../src/crypto/canonical-serializer'

function b64url(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function hexEncode(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

function sign(domain: string, payload: unknown, seedHex: string) {
  const seed = new Uint8Array(Buffer.from(seedHex, 'hex'))
  const pub = ed25519.getPublicKey(seed)
  const canonical = new TextEncoder().encode(canonicalize(payload))
  const domainBytes = new TextEncoder().encode(domain)
  const sigInput = new Uint8Array(domainBytes.length + canonical.length)
  sigInput.set(domainBytes, 0)
  sigInput.set(canonical, domainBytes.length)
  const sig = ed25519.sign(sigInput, seed)
  const verified = ed25519.verify(sig, sigInput, pub)
  return {
    publicKey: b64url(pub),
    signature: b64url(sig),
    canonicalPayloadHex: hexEncode(canonical),
    signatureInputHex: hexEncode(sigInput),
    verified,
  }
}

const seeds = {
  s1: '0000000000000000000000000000000000000000000000000000000000000001',
  s2: '0000000000000000000000000000000000000000000000000000000000000002',
  s3: '0000000000000000000000000000000000000000000000000000000000000003',
  s4: '0000000000000000000000000000000000000000000000000000000000000004',
  s5: '0000000000000000000000000000000000000000000000000000000000000005',
}

const cap1 = {
  schemaVersion: 1, issuerId: 'node-alpha', issuerEpoch: 1, audienceNodeId: 'node-beta',
  grant: { grantId: 'grant-001', principal: { kind: 'agent', id: 'arcana' }, actions: ['filesystem.read'], resources: ['packages/**'], workspaceId: 'arcana', contractId: 'contract-001', contractRevision: 1, maxUses: 10, delegationDepth: 0 },
  issuedAt: '2026-07-29T12:00:00.000Z', expiresAt: '2026-07-29T13:00:00.000Z', nonce: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
}

const cap2 = {
  schemaVersion: 1, issuerId: 'node-alpha', issuerEpoch: 1, audienceNodeId: 'node-gamma',
  grant: { grantId: 'grant-002', principal: { kind: 'subagent', id: 'investigator' }, actions: ['filesystem.read'], resources: ['packages/core/src/**'], workspaceId: 'arcana', contractId: 'contract-001', contractRevision: 1, maxUses: 5, delegationDepth: 1, delegationAncestry: { parentGrantId: 'grant-001', parentSignature: 'parent-sig-placeholder', depth: 1 } },
  issuedAt: '2026-07-29T12:00:00.000Z', expiresAt: '2026-07-29T12:30:00.000Z', nonce: 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e',
}

const policy1 = {
  schemaVersion: 1, issuerId: 'node-alpha', issuerEpoch: 1, sequence: 1, policyId: 'policy-default', policyVersion: '1.0.0', policyDigest: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  issuedAt: '2026-07-29T12:00:00.000Z', expiresAt: '2026-07-30T12:00:00.000Z',
}

const node1 = {
  schemaVersion: 1, nodeId: 'node-alpha', organizationId: 'arcana-org', publicKey: 'nBGylMGlNRkDfaLSk9wZ4cORuz9FqBP0EpTDlWIGf0c=', issuerId: 'trust-registry', issuerEpoch: 1,
  issuedAt: '2026-07-29T12:00:00.000Z', expiresAt: '2026-08-29T12:00:00.000Z', capabilities: ['grant', 'revoke', 'verify'],
}

const rev1 = {
  schemaVersion: 1, issuerId: 'node-alpha', issuerEpoch: 1, sequence: 1, subjectType: 'GRANT', subjectId: 'grant-001', reason: 'operator requested revocation', effectiveAt: '2026-07-29T12:00:00.000Z', issuedAt: '2026-07-29T12:00:00.000Z',
}

// Sign all positive vectors
const v1 = sign('arcana:signed-capability:v1', cap1, seeds.s1)
const v2 = sign('arcana:signed-capability:v1', cap2, seeds.s2)
const v3 = sign('arcana:signed-policy:v1', policy1, seeds.s3)
const v4 = sign('arcana:node-identity:v1', node1, seeds.s4)
const v5 = sign('arcana:revocation:v1', rev1, seeds.s5)

// Generate wrong-pub-key (seed2's key for cap1)
const wrongPub = b64url(ed25519.getPublicKey(new Uint8Array(Buffer.from(seeds.s2, 'hex'))))

// Generate mutated signature (flip first byte)
const sigBytes = new Uint8Array(Buffer.from(v1.signature.replace(/-/g, '+').replace(/_/g, '/'), 'base64'))
sigBytes[0] ^= 0xff
const mutatedSig = b64url(sigBytes)

// Cap with missing nonce (for negative test)
const capNoNonce = { ...cap1 } as any
delete capNoNonce.nonce

// Cap with unknown field
const capExtra = { ...cap1, extraField: 'should-not-be-here' }

// Cap with float
const capFloat = { ...cap1, issuerEpoch: 1.5 }

const vectors = [
  { vectorId: 'cap-v1-001', domain: 'arcana:signed-capability:v1', description: 'Basic filesystem.read capability grant', privateKeySeed: seeds.s1, publicKey: v1.publicKey, unsignedPayload: cap1, canonicalPayloadHex: v1.canonicalPayloadHex, signatureInputHex: v1.signatureInputHex, signature: v1.signature, verificationExpected: true },
  { vectorId: 'cap-v1-002', domain: 'arcana:signed-capability:v1', description: 'Capability with delegation ancestry', privateKeySeed: seeds.s2, publicKey: v2.publicKey, unsignedPayload: cap2, canonicalPayloadHex: v2.canonicalPayloadHex, signatureInputHex: v2.signatureInputHex, signature: v2.signature, verificationExpected: true },
  { vectorId: 'policy-v1-001', domain: 'arcana:signed-policy:v1', description: 'Basic policy envelope', privateKeySeed: seeds.s3, publicKey: v3.publicKey, unsignedPayload: policy1, canonicalPayloadHex: v3.canonicalPayloadHex, signatureInputHex: v3.signatureInputHex, signature: v3.signature, verificationExpected: true },
  { vectorId: 'node-id-v1-001', domain: 'arcana:node-identity:v1', description: 'Node identity certificate', privateKeySeed: seeds.s4, publicKey: v4.publicKey, unsignedPayload: node1, canonicalPayloadHex: v4.canonicalPayloadHex, signatureInputHex: v4.signatureInputHex, signature: v4.signature, verificationExpected: true },
  { vectorId: 'revocation-v1-001', domain: 'arcana:revocation:v1', description: 'Grant revocation statement', privateKeySeed: seeds.s5, publicKey: v5.publicKey, unsignedPayload: rev1, canonicalPayloadHex: v5.canonicalPayloadHex, signatureInputHex: v5.signatureInputHex, signature: v5.signature, verificationExpected: true },
  // Negative vectors
  { vectorId: 'neg-audience', description: 'Negative: wrong audience node', privateKeySeed: seeds.s1, publicKey: v1.publicKey, unsignedPayload: { ...cap1, audienceNodeId: 'node-DELTA' }, signature: v1.signature, verificationExpected: false, expectedRejectionReason: 'WRONG_AUDIENCE', expectedStage: 'AUDIENCE' },
  { vectorId: 'neg-wrong-key', description: 'Negative: wrong public key', privateKeySeed: seeds.s1, publicKey: wrongPub, unsignedPayload: cap1, signature: v1.signature, verificationExpected: false, expectedRejectionReason: 'INVALID_SIGNATURE', expectedStage: 'SIGNATURE' },
  { vectorId: 'neg-schema-ver', description: 'Negative: unsupported schema version', privateKeySeed: seeds.s1, publicKey: v1.publicKey, unsignedPayload: { ...cap1, schemaVersion: 99 }, signature: v1.signature, verificationExpected: false, expectedRejectionReason: 'SCHEMA_UNSUPPORTED', expectedStage: 'SCHEMA' },
  { vectorId: 'neg-expired', description: 'Negative: expired envelope', privateKeySeed: seeds.s1, publicKey: v1.publicKey, unsignedPayload: cap1, signature: v1.signature, verificationExpected: false, expectedRejectionReason: 'EXPIRED', expectedStage: 'FRESHNESS', nowOverride: new Date('2026-07-30T00:00:00.000Z').getTime() },
  { vectorId: 'neg-unknown-issuer', description: 'Negative: unknown issuer', privateKeySeed: seeds.s1, publicKey: v1.publicKey, unsignedPayload: cap1, signature: v1.signature, verificationExpected: false, expectedRejectionReason: 'UNKNOWN_ISSUER', expectedStage: 'TRUST', overrideIssuer: 'unknown-node' },
  { vectorId: 'neg-sig-mutation', description: 'Negative: one-byte signature mutation', privateKeySeed: seeds.s1, publicKey: v1.publicKey, unsignedPayload: cap1, signature: mutatedSig, verificationExpected: false, expectedRejectionReason: 'INVALID_SIGNATURE', expectedStage: 'SIGNATURE' },
  { vectorId: 'neg-seq-rollback', description: 'Negative: policy sequence rollback', privateKeySeed: seeds.s3, publicKey: v3.publicKey, unsignedPayload: policy1, signature: v3.signature, verificationExpected: false, expectedRejectionReason: 'SEQUENCE_ROLLBACK', expectedStage: 'REVOCATION', knownSequenceOverride: 5 },
  { vectorId: 'neg-missing-field', description: 'Negative: missing required field (nonce)', privateKeySeed: seeds.s1, publicKey: v1.publicKey, unsignedPayload: capNoNonce, signature: v1.signature, verificationExpected: false, expectedRejectionReason: 'SCHEMA_UNSUPPORTED', expectedStage: 'SCHEMA' },
  { vectorId: 'neg-unknown-field', description: 'Negative: unknown field in envelope', privateKeySeed: seeds.s1, publicKey: v1.publicKey, unsignedPayload: capExtra, signature: v1.signature, verificationExpected: false, expectedRejectionReason: 'SCHEMA_UNSUPPORTED', expectedStage: 'SCHEMA' },
  { vectorId: 'neg-float-epoch', description: 'Negative: floating-point issuerEpoch', privateKeySeed: seeds.s1, publicKey: v1.publicKey, unsignedPayload: capFloat, signature: v1.signature, verificationExpected: false, expectedRejectionReason: 'SCHEMA_UNSUPPORTED', expectedStage: 'SCHEMA' },
]

console.log(JSON.stringify(vectors, null, 2))
