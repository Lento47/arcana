// packages/core/src/capability/supply-chain.test.ts
// Authority Kernel K10 — supply-chain identity + drift detection + signing.

import { describe, expect, it } from "bun:test"
import {
  computeProviderIdentity,
  detectIdentityDrift,
  signProviderIdentity,
  verifyProviderSignature,
  hashContent,
} from "./supply-chain"

const sample = {
  kind: "mcp_server" as const,
  providerId: "github-copilot",
  version: "1.2.3",
  sourceDir: "/plugins/copilot",
  manifestJson: '{"name":"copilot","tools":["complete","review"]}',
  schemaDeclarations: '{"tools":2}',
  description: "GitHub Copilot MCP server",
}

describe("K10 supply-chain identity", () => {
  it("content hashes are deterministic", () => {
    const a = hashContent("same input")
    const b = hashContent("same input")
    expect(a).toBe(b)
    expect(hashContent("different")).not.toBe(a)
  })

  it("computeProviderIdentity produces stable hashes", () => {
    const id1 = computeProviderIdentity(sample)
    const id2 = computeProviderIdentity(sample)
    expect(id1.content_hash).toBe(id2.content_hash)
    expect(id1.schema_hash).toBe(id2.schema_hash)
    expect(id1.description_hash).toBe(id2.description_hash)
  })

  it("drift detection catches schema changes", () => {
    const prev = computeProviderIdentity(sample)
    const curr = computeProviderIdentity({ ...sample, schemaDeclarations: '{"tools":3}' })
    const drift = detectIdentityDrift(prev, curr)
    expect(drift.drifted).toBe(true)
    expect(drift.changedFields).toContain("schema_hash")
  })

  it("version bump alone does NOT trigger drift", () => {
    const prev = computeProviderIdentity(sample)
    const curr = computeProviderIdentity({ ...sample, version: "1.2.4" })
    expect(detectIdentityDrift(prev, curr).drifted).toBe(false)
  })

  it("signing roundtrips", () => {
    const { generateKeyPairSync } = require("node:crypto")
    const { publicKey, privateKey } = generateKeyPairSync("ed25519")
    const pubPem = publicKey.export({ type: "spki", format: "pem" }).toString()
    const privPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString()

    const identity = computeProviderIdentity(sample)
    const signed = signProviderIdentity(
      { ...identity, publisher_id: "lento47", signed_at: Date.now() },
      privPem,
    )
    expect(verifyProviderSignature(signed, pubPem)).toBe(true)

    // Tampered content fails verification.
    const forged = { ...signed, content_hash: "deadbeef" }
    expect(verifyProviderSignature(forged, pubPem)).toBe(false)
  })
})
