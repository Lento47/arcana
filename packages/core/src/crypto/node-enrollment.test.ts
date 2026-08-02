/**
 * D-1: Node enrollment, key rotation, suspension, and decommissioning tests.
 */

import { describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Database } from "bun:sqlite"
import { ed25519 } from "@noble/curves/ed25519.js"
import { encodeBase64url } from "./canonical-serializer"
import { verifyNodeIdentity } from "./verifier"
import { SqliteEnrollmentRegistry } from "./node-enrollment-sqlite"
import {
  createJoinToken,
  decommissionNode,
  enrollNode,
  registryKeysForTrustDomain,
  rotateNodeKey,
  setNodeStatus,
  verifyJoinToken,
  verifyNodeKey,
  type EnrollmentContext,
} from "./node-enrollment"

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
  return bytes
}

const issuerKey = ed25519.keygen(hexToBytes("55".repeat(32)))
const nodeKey = ed25519.keygen(hexToBytes("66".repeat(32)))
const rotatedKey = ed25519.keygen(hexToBytes("77".repeat(32)))

const NOW = new Date("2026-08-02T12:00:00.000Z")

const CONTEXT: EnrollmentContext = {
  issuerId: "issuer-arcana",
  issuerSecretKey: issuerKey.secretKey,
  issuerPublicKeys: new Map([["issuer-arcana", issuerKey.publicKey]]),
  certificateDurationMs: 365 * 24 * 60 * 60 * 1000,
  now: NOW,
}

function joinToken(nodeId = "node-alpha", overrides: Partial<Parameters<typeof createJoinToken>[0]> = {}) {
  return createJoinToken(
    {
      organizationId: "org-arcana",
      trustDomain: "arcana.test",
      nodeId,
      issuedAt: NOW,
      expiresAt: new Date(NOW.getTime() + 10 * 60 * 1000),
      ...overrides,
    },
    issuerKey.secretKey,
  )
}

function registry(): SqliteEnrollmentRegistry {
  return new SqliteEnrollmentRegistry(new Database(":memory:"))
}

describe("D-1 join tokens", () => {
  it("verifies a valid token", () => {
    const token = joinToken()
    expect(
      verifyJoinToken(token, CONTEXT.issuerPublicKeys, {
        organizationId: "org-arcana",
        trustDomain: "arcana.test",
        nodeId: "node-alpha",
        now: NOW,
      }),
    ).toEqual({ valid: true })
  })

  it("rejects a forged signature", () => {
    const token = joinToken()
    const forged = { ...token, signature: encodeBase64url(new Uint8Array(64).fill(9)) }
    const result = verifyJoinToken(forged, CONTEXT.issuerPublicKeys, {
      organizationId: "org-arcana",
      trustDomain: "arcana.test",
      nodeId: "node-alpha",
      now: NOW,
    })
    expect(result.valid).toBe(false)
  })

  it("rejects an expired token", () => {
    const token = joinToken("node-alpha", {
      issuedAt: new Date(NOW.getTime() - 60 * 60 * 1000),
      expiresAt: new Date(NOW.getTime() - 30 * 60 * 1000),
    })
    const result = verifyJoinToken(token, CONTEXT.issuerPublicKeys, {
      organizationId: "org-arcana",
      trustDomain: "arcana.test",
      nodeId: "node-alpha",
      now: NOW,
    })
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.reason).toContain("expired")
  })

  it("rejects a token for the wrong node", () => {
    const token = joinToken("node-alpha")
    const result = verifyJoinToken(token, CONTEXT.issuerPublicKeys, {
      organizationId: "org-arcana",
      trustDomain: "arcana.test",
      nodeId: "node-beta",
      now: NOW,
    })
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.reason).toContain("nodeId")
  })
})

describe("D-1 enrollment", () => {
  it("enrolls a node as TRUSTED with a verifiable certificate", () => {
    const reg = registry()
    const result = enrollNode(joinToken(), nodeKey.publicKey, reg, CONTEXT)
    expect(result.kind).toBe("ENROLLED")
    if (result.kind !== "ENROLLED") return

    expect(result.record.status).toBe("TRUSTED")
    expect(result.record.nodeKeyEpoch).toBe(1)
    expect(result.record.publicKey).toBe(encodeBase64url(nodeKey.publicKey))

    const cert = verifyNodeIdentity(
      result.record.certificate as unknown as Record<string, unknown>,
      CONTEXT.issuerPublicKeys,
      NOW.getTime(),
    )
    expect(cert).toEqual({ valid: true })
    expect(verifyNodeKey("node-alpha", nodeKey.publicKey, 1, "arcana.test", reg)).toEqual({ valid: true })
  })

  it("rejects duplicate enrollment", () => {
    const reg = registry()
    enrollNode(joinToken(), nodeKey.publicKey, reg, CONTEXT)
    const dup = enrollNode(joinToken(), nodeKey.publicKey, reg, CONTEXT)
    expect(dup).toMatchObject({ kind: "DUPLICATE_ENROLLMENT" })
  })

  it("rejects an invalid join token", () => {
    const reg = registry()
    const token = joinToken()
    const result = enrollNode({ ...token, signature: "garbage" }, nodeKey.publicKey, reg, CONTEXT)
    expect(result).toMatchObject({ kind: "REJECTED" })
  })
})

describe("D-1 key rotation", () => {
  it("advances the epoch and rejects the superseded key", () => {
    const reg = registry()
    const enrolled = enrollNode(joinToken(), nodeKey.publicKey, reg, CONTEXT)
    if (enrolled.kind !== "ENROLLED") throw new Error("fixture")

    const rotated = rotateNodeKey("node-alpha", rotatedKey.publicKey, reg, CONTEXT)
    expect(rotated.kind).toBe("ROTATED")
    if (rotated.kind !== "ROTATED") return

    expect(rotated.record.nodeKeyEpoch).toBe(2)
    expect(rotated.record.publicKey).toBe(encodeBase64url(rotatedKey.publicKey))
    expect(rotated.record.lastKeyRotatedAt).toBe(NOW.toISOString())

    expect(verifyNodeKey("node-alpha", rotatedKey.publicKey, 2, "arcana.test", reg)).toEqual({ valid: true })
    expect(verifyNodeKey("node-alpha", nodeKey.publicKey, 1, "arcana.test", reg).valid).toBe(false)
    expect(verifyNodeKey("node-alpha", rotatedKey.publicKey, 1, "arcana.test", reg).valid).toBe(false)
  })

  it("rejects rotation of a suspended node", () => {
    const reg = registry()
    enrollNode(joinToken(), nodeKey.publicKey, reg, CONTEXT)
    setNodeStatus("node-alpha", "SUSPENDED", reg, NOW)
    const rotated = rotateNodeKey("node-alpha", rotatedKey.publicKey, reg, CONTEXT)
    expect(rotated).toMatchObject({ kind: "REJECTED" })
  })

  it("rejects rotation to the same key", () => {
    const reg = registry()
    enrollNode(joinToken(), nodeKey.publicKey, reg, CONTEXT)
    const rotated = rotateNodeKey("node-alpha", nodeKey.publicKey, reg, CONTEXT)
    expect(rotated).toMatchObject({ kind: "REJECTED" })
  })
})

describe("D-1 suspension and decommissioning", () => {
  it("suspends and reinstates", () => {
    const reg = registry()
    enrollNode(joinToken(), nodeKey.publicKey, reg, CONTEXT)
    expect(setNodeStatus("node-alpha", "SUSPENDED", reg, NOW).ok).toBe(true)
    expect(verifyNodeKey("node-alpha", nodeKey.publicKey, 1, "arcana.test", reg).valid).toBe(false)
    expect(setNodeStatus("node-alpha", "TRUSTED", reg, NOW).ok).toBe(true)
    expect(verifyNodeKey("node-alpha", nodeKey.publicKey, 1, "arcana.test", reg)).toEqual({ valid: true })
  })

  it("decommissions and blocks re-enrollment", () => {
    const reg = registry()
    enrollNode(joinToken(), nodeKey.publicKey, reg, CONTEXT)
    const decommissioned = decommissionNode("node-alpha", reg, NOW)
    expect(decommissioned.ok).toBe(true)
    if (!decommissioned.ok) return
    expect(decommissioned.record.status).toBe("REVOKED")
    expect(decommissioned.record.decommissionedAt).toBe(NOW.toISOString())
    expect(verifyNodeKey("node-alpha", nodeKey.publicKey, 1, "arcana.test", reg).valid).toBe(false)

    const reenroll = enrollNode(joinToken(), nodeKey.publicKey, reg, CONTEXT)
    expect(reenroll).toMatchObject({ kind: "REJECTED" })
  })
})

describe("D-1 registry persistence and key snapshots", () => {
  it("survives restart and feeds the proof-registration registry", () => {
    const dir = mkdtempSync(join(tmpdir(), "arcana-enrollment-"))
    try {
      const dbPath = join(dir, "registry.db")
      const db1 = new Database(dbPath)
      const reg1 = new SqliteEnrollmentRegistry(db1)
      enrollNode(joinToken(), nodeKey.publicKey, reg1, CONTEXT)
      rotateNodeKey("node-alpha", rotatedKey.publicKey, reg1, CONTEXT)
      db1.close()

      const db2 = new Database(dbPath)
      const reg2 = new SqliteEnrollmentRegistry(db2)
      expect(reg2.get("node-alpha")?.nodeKeyEpoch).toBe(2)
      expect(verifyNodeKey("node-alpha", rotatedKey.publicKey, 2, "arcana.test", reg2)).toEqual({
        valid: true,
      })

      const keys = registryKeysForTrustDomain(reg2, "arcana.test")
      expect(keys.size).toBe(1)
      expect(encodeBase64url(keys.get("node-alpha")!)).toBe(encodeBase64url(rotatedKey.publicKey))
      expect(registryKeysForTrustDomain(reg2, "other.domain").size).toBe(0)
      db2.close()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
