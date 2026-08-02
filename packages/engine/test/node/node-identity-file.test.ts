import { describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  loadNodeIdentity,
  saveNodeIdentity,
  type NodeIdentityFile,
} from "../../src/node/node-identity-file"

describe("node identity file", () => {
  it("round-trips identity state and survives reload", () => {
    const dir = mkdtempSync(join(tmpdir(), "arcana-node-identity-"))
    try {
      const identity: NodeIdentityFile = {
        nodeId: "node-alpha",
        trustDomain: "arcana.test",
        secretKeyB64: "c2VjcmV0",
        publicKeyB64: "cHVibGlj",
        nodeKeyEpoch: 2,
        certificate: { nodeId: "node-alpha", issuerId: "issuer-arcana" },
        enrolledAt: "2026-08-02T12:00:00.000Z",
      }
      saveNodeIdentity(dir, identity)
      expect(loadNodeIdentity(dir)).toEqual(identity)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("returns undefined when not enrolled", () => {
    const dir = mkdtempSync(join(tmpdir(), "arcana-node-identity-empty-"))
    try {
      expect(loadNodeIdentity(dir)).toBeUndefined()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
