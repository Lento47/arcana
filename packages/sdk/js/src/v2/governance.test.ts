import { describe, expect, it } from "bun:test"
import { ed25519 } from "@noble/curves/ed25519.js"
import {
  buildAuthorizationRequest,
  parseToolArguments,
  toAuthorizationRequest,
  unionUntrustedProvenance,
  verifySignedEnvelope,
  type GovernanceContext,
} from "./governance.js"
import { InvalidRequestError } from "./errors.js"
import { signEnvelope } from "@arcana/core/crypto/node-enrollment"
import { CAPABILITY_DOMAIN } from "@arcana/core/crypto/signed-envelopes"

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
  return bytes
}

const issuerKey = ed25519.keygen(hexToBytes("61".repeat(32)))

const CONTEXT: GovernanceContext = {
  principalId: "agent:build",
  sessionId: "session-1",
  workspaceId: "workspace-1",
  contractId: "contract-1",
  contractRevision: "3",
  action: "process.execute",
  executable: "bun",
  workingDirectory: "/workspace",
  provenance: ["USER_INSTRUCTION"],
  sensitivity: ["INTERNAL"],
}

describe("SDK 1.0 governance surface (E3)", () => {
  it("builds canonical authorization requests with exact hashes", () => {
    const a = buildAuthorizationRequest({
      schemaVersion: "1",
      requestId: "req-fixed",
      nonce: "nonce-fixed",
      requestedAt: "2026-08-02T12:00:00.000Z",
      principalId: "agent:build",
      sessionId: "session-1",
      tool: "run",
      action: "process.execute",
      resource: { kind: "process", executable: "bun" },
      arguments: ["test"],
      provenance: ["USER_INSTRUCTION"],
      sensitivity: ["INTERNAL"],
    })
    const b = buildAuthorizationRequest({
      schemaVersion: "1",
      requestId: "req-fixed",
      nonce: "nonce-fixed",
      requestedAt: "2026-08-02T12:00:00.000Z",
      principalId: "agent:build",
      sessionId: "session-1",
      tool: "run",
      action: "process.execute",
      resource: { kind: "process", executable: "bun" },
      arguments: ["test"],
      provenance: ["USER_INSTRUCTION"],
      sensitivity: ["INTERNAL"],
    })
    expect(a.requestHash).toBe(b.requestHash)

    const changed = buildAuthorizationRequest({
      ...a,
      arguments: ["test", "--changed"],
    })
    expect(changed.requestHash).not.toBe(a.requestHash)
  })

  it("maps framework tool calls through the adapter hook", () => {
    const request = toAuthorizationRequest({ name: "run", arguments: { command: "bun test" } }, CONTEXT)
    expect(request.tool).toBe("run")
    expect(request.action).toBe("process.execute")
    expect(request.principalId).toBe("agent:build")
    expect(request.contractRevision).toBe("3")
    expect(request.arguments).toContain("command=bun test")
    expect(request.requestHash.length).toBe(64)
  })

  it("canonicalizes object arguments so distinct values do not share H(q)", () => {
    const a = toAuthorizationRequest({ name: "write", arguments: { dest: { path: "/tmp" } } }, CONTEXT)
    const b = toAuthorizationRequest({ name: "write", arguments: { dest: { path: "/etc" } } }, CONTEXT)
    expect(a.arguments?.[0]).toBe('dest={"path":"/tmp"}')
    expect(b.arguments?.[0]).toBe('dest={"path":"/etc"}')
    expect(a.requestHash).not.toBe(b.requestHash)
  })

  it("rejects invalid JSON tool arguments", () => {
    expect(() => parseToolArguments("{")).toThrow(InvalidRequestError)
    expect(() => toAuthorizationRequest({ name: "run", arguments: "{" }, CONTEXT)).toThrow(InvalidRequestError)
  })

  it("unions MCP_DESCRIPTION with caller provenance instead of replacing it", () => {
    expect(unionUntrustedProvenance(["USER_INSTRUCTION"])).toEqual(["USER_INSTRUCTION", "MCP_DESCRIPTION"])
    expect(unionUntrustedProvenance()).toEqual(["MCP_DESCRIPTION"])
  })

  it("verifies signed envelopes and rejects forgeries", () => {
    const envelope = signEnvelope(
      CAPABILITY_DOMAIN,
      {
        schemaVersion: 1,
        issuerId: "issuer-arcana",
        issuerEpoch: 1,
        audienceNodeId: "node-alpha",
        grant: { grantId: "g1" },
        issuedAt: "2026-08-02T12:00:00.000Z",
        expiresAt: "2099-01-01T00:00:00.000Z",
        nonce: "n1",
      },
      issuerKey.secretKey,
    )
    const ok = verifySignedEnvelope(JSON.stringify(envelope), CAPABILITY_DOMAIN, issuerKey.publicKey)
    expect(ok.valid).toBe(true)

    const forged = { ...envelope, signature: "AAAA" }
    const bad = verifySignedEnvelope(JSON.stringify(forged), CAPABILITY_DOMAIN, issuerKey.publicKey)
    expect(bad.valid).toBe(false)
  })
})
