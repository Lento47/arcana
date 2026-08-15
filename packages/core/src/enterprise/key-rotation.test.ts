/**
 * F7: key rotation automation tests.
 *
 * Dry-run preview vs confirmed rotation, rotation evidence, D-5 rotated-key
 * rejection (superseded keys stop verifying), RECEIVE/GENERATE modes, and
 * tenant isolation.
 */

import { describe, expect, it } from "bun:test"
import { Database } from "bun:sqlite"
import { ed25519 } from "@noble/curves/ed25519.js"
import { decodeCanonicalBase64url, encodeBase64url } from "../crypto/canonical-serializer"
import {
  createJoinToken,
  enrollNode,
  setNodeStatus,
  verifyNodeKey,
  type EnrollmentContext,
  type EnrollmentRegistry,
} from "../crypto/node-enrollment"
import { SqliteEnrollmentRegistry } from "../crypto/node-enrollment-sqlite"
import {
  executeNodeKeyRotation,
  getRotationEvidence,
  keyFingerprint,
  keyFingerprintFromB64,
  listRotationEvidence,
  previewNodeKeyRotation,
} from "./key-rotation"
import { SqliteKeyRotationStore } from "./key-rotation-sqlite"

const NOW = new Date("2026-08-12T12:00:00.000Z")

const ISSUER = ed25519.keygen(new Uint8Array(32).fill(0x51))

function context(now: Date = NOW): EnrollmentContext {
  return {
    issuerId: "issuer-arcana",
    issuerSecretKey: ISSUER.secretKey,
    issuerPublicKeys: new Map([["issuer-arcana", ISSUER.publicKey]]),
    certificateDurationMs: 365 * 24 * 60 * 60 * 1000,
    now,
  }
}

function enrolledNode(
  registry: EnrollmentRegistry,
  nodeId: string,
  organizationId: string,
  seed: Uint8Array,
  now: Date = NOW,
): EnrollmentContext {
  const keys = ed25519.keygen(seed)
  const ctx = context(now)
  const token = createJoinToken(
    { organizationId, trustDomain: "arcana.test", nodeId, issuedAt: now, expiresAt: new Date(now.getTime() + 10 * 60 * 1000) },
    ISSUER.secretKey,
  )
  const result = enrollNode(token, keys.publicKey, registry, ctx)
  if (result.kind !== "ENROLLED") {
    throw new Error(`fixture enrollment failed: ${result.kind}`)
  }
  return ctx
}

function rotationStore() {
  return new SqliteKeyRotationStore(new Database(":memory:"))
}

function registry() {
  return new SqliteEnrollmentRegistry(new Database(":memory:"))
}

describe("F7 key rotation automation", () => {
  it("dry-run preview records DRY_RUN evidence without touching the registry", () => {
    const reg = registry()
    enrolledNode(reg, "node-a", "tenant-a", new Uint8Array(32).fill(0x11))
    const store = rotationStore()

    const preview = previewNodeKeyRotation({
      tenantId: "tenant-a",
      nodeId: "node-a",
      registry: reg,
      store,
      seed: new Uint8Array(32).fill(0x22),
      rotationId: "rot-preview-1",
      now: NOW,
    })

    expect(preview.kind).toBe("PREVIEW")
    if (preview.kind !== "PREVIEW") return
    expect(preview.currentEpoch).toBe(1)
    expect(preview.nextEpoch).toBe(2)
    expect(preview.currentFingerprint).toBe(keyFingerprintFromB64(reg.get("node-a")!.publicKey)!)
    expect(preview.nextFingerprint).not.toBe(preview.currentFingerprint)
    expect(preview.record.mode).toBe("DRY_RUN")
    expect(preview.record.previousEpoch).toBe(1)
    expect(preview.record.nextEpoch).toBe(2)
    expect(preview.record.rotatedAt).toBe(NOW.toISOString())

    // Evidence persisted; registry untouched (epoch and key unchanged).
    expect(getRotationEvidence("tenant-a", "rot-preview-1", store)?.mode).toBe("DRY_RUN")
    expect(reg.get("node-a")?.nodeKeyEpoch).toBe(1)
  })

  it("confirmed GENERATE rotation advances the epoch, persists the new key, and records evidence", () => {
    const reg = registry()
    const ctx = enrolledNode(reg, "node-a", "tenant-a", new Uint8Array(32).fill(0x11))
    const store = rotationStore()
    const oldKey = reg.get("node-a")!.publicKey

    const result = executeNodeKeyRotation({
      tenantId: "tenant-a",
      nodeId: "node-a",
      registry: reg,
      store,
      context: ctx,
      seed: new Uint8Array(32).fill(0x22),
      rotationId: "rot-1",
      now: NOW,
    })

    expect(result.kind).toBe("ROTATED")
    if (result.kind !== "ROTATED") return
    expect(result.record.mode).toBe("CONFIRMED")
    expect(result.record.previousEpoch).toBe(1)
    expect(result.record.nextEpoch).toBe(2)
    expect(result.record.previousFingerprint).toBe(keyFingerprintFromB64(oldKey)!)
    expect(result.record.nextFingerprint).not.toBe(result.record.previousFingerprint)
    expect(result.record.rotatedAt).toBe(NOW.toISOString())
    expect(result.newSecretKeyB64).toBeTruthy()

    // Registry holds the rotated key at epoch 2 with a re-issued certificate.
    const updated = reg.get("node-a")!
    expect(updated.nodeKeyEpoch).toBe(2)
    expect(updated.publicKey).not.toBe(oldKey)
    expect(updated.lastKeyRotatedAt).toBe(NOW.toISOString())

    // D-5 rotated-key handling: the superseded key fails, the current key verifies.
    const oldPublicKey = decodeCanonicalBase64url(oldKey)!
    expect(
      verifyNodeKey("node-a", oldPublicKey, 1, "arcana.test", reg).valid,
    ).toBe(false)
    expect(
      verifyNodeKey("node-a", oldPublicKey, 2, "arcana.test", reg).valid,
    ).toBe(false)
    const newPublicKey = decodeCanonicalBase64url(updated.publicKey)!
    expect(
      verifyNodeKey("node-a", newPublicKey, 2, "arcana.test", reg).valid,
    ).toBe(true)

    // Evidence persisted, tenant-scoped.
    expect(getRotationEvidence("tenant-a", "rot-1", store)?.mode).toBe("CONFIRMED")
    expect(listRotationEvidence("tenant-a", store)).toHaveLength(1)
  })

  it("RECEIVE mode accepts an operator-submitted public key and returns no secret", () => {
    const reg = registry()
    const ctx = enrolledNode(reg, "node-a", "tenant-a", new Uint8Array(32).fill(0x11))
    const store = rotationStore()
    const submitted = ed25519.keygen(new Uint8Array(32).fill(0x33)).publicKey

    const result = executeNodeKeyRotation({
      tenantId: "tenant-a",
      nodeId: "node-a",
      registry: reg,
      store,
      context: ctx,
      newPublicKey: submitted,
      rotationId: "rot-recv-1",
      now: NOW,
    })

    expect(result.kind).toBe("ROTATED")
    if (result.kind !== "ROTATED") return
    expect(result.newSecretKeyB64).toBeUndefined()
    expect(reg.get("node-a")!.publicKey).toBe(encodeBase64url(submitted))
    expect(reg.get("node-a")!.nodeKeyEpoch).toBe(2)
  })

  it("rejects rotation of nodes that are not enrolled, not TRUSTED, or from another tenant", () => {
    const reg = registry()
    const ctx = enrolledNode(reg, "node-a", "tenant-a", new Uint8Array(32).fill(0x11))
    const store = rotationStore()

    const unknown = executeNodeKeyRotation({
      tenantId: "tenant-a",
      nodeId: "node-ghost",
      registry: reg,
      store,
      context: ctx,
      now: NOW,
    })
    expect(unknown).toMatchObject({ kind: "REJECTED" })

    const crossTenant = executeNodeKeyRotation({
      tenantId: "tenant-b",
      nodeId: "node-a",
      registry: reg,
      store,
      context: ctx,
      now: NOW,
    })
    expect(crossTenant).toMatchObject({ kind: "REJECTED" })
    // Fail closed: the cross-tenant attempt changed nothing and left no evidence.
    expect(reg.get("node-a")!.nodeKeyEpoch).toBe(1)
    expect(listRotationEvidence("tenant-b", store)).toHaveLength(0)

    const previewCrossTenant = previewNodeKeyRotation({
      tenantId: "tenant-b",
      nodeId: "node-a",
      registry: reg,
      store,
      now: NOW,
    })
    expect(previewCrossTenant).toMatchObject({ kind: "REJECTED" })

    // A suspended node cannot rotate (fail closed on non-TRUSTED status).
    setNodeStatus("node-a", "SUSPENDED", reg, NOW)
    const suspended = executeNodeKeyRotation({
      tenantId: "tenant-a",
      nodeId: "node-a",
      registry: reg,
      store,
      context: ctx,
      newPublicKey: ed25519.keygen(new Uint8Array(32).fill(0x44)).publicKey,
      rotationId: "rot-susp",
      now: NOW,
    })
    expect(suspended).toMatchObject({ kind: "REJECTED" })
    expect(reg.get("node-a")!.nodeKeyEpoch).toBe(1)
  })

  it("rotation evidence is tenant-isolated (withTenantAccess)", () => {
    const reg = registry()
    const ctx = enrolledNode(reg, "node-a", "tenant-a", new Uint8Array(32).fill(0x11))
    const store = rotationStore()
    executeNodeKeyRotation({
      tenantId: "tenant-a",
      nodeId: "node-a",
      registry: reg,
      store,
      context: ctx,
      seed: new Uint8Array(32).fill(0x22),
      rotationId: "rot-1",
      now: NOW,
    })

    // A different tenant can neither read the evidence nor list it.
    expect(getRotationEvidence("tenant-b", "rot-1", store)).toBeUndefined()
    expect(listRotationEvidence("tenant-b", store)).toHaveLength(0)
    expect(listRotationEvidence("tenant-a", store)).toHaveLength(1)
  })

  it("fingerprints are deterministic SHA-256 digests of the public key", () => {
    const key = ed25519.keygen(new Uint8Array(32).fill(0x77)).publicKey
    expect(keyFingerprint(key)).toBe(keyFingerprint(key))
    expect(keyFingerprint(key)).toMatch(/^[0-9a-f]{64}$/)
    expect(keyFingerprintFromB64(encodeBase64url(key))).toBe(keyFingerprint(key))
    expect(keyFingerprintFromB64("not-base64url!!")).toBeUndefined()
  })
})
