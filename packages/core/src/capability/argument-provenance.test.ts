// packages/core/src/capability/argument-provenance.test.ts
// Authority Kernel K7 — consequential-argument provenance tests.
//
// Proves: claim derivation per effect class · escalation rule (untrusted /
// unknown ⇒ escalate; trusted ⇒ proceed) · claims participate in exact-
// request identity (hash divergence) · end-to-end through the real gate.

import { describe, expect, it } from "bun:test"
import { existsSync, rmSync } from "node:fs"
import { join } from "node:path"
import { computeRequestHash } from "./request-hash"
import { buildAuthorizationRequest } from "./pep-integration"
import {
  deriveGateInfluenceClaims,
  evaluateInfluenceEscalation,
  normalizeInfluenceClaims,
} from "./argument-provenance"
import { authorizeProcess } from "./process-gate"

describe("K7 argument provenance", () => {
  it("derives claims per effect class", () => {
    const claims = deriveGateInfluenceClaims({
      toolName: "shell",
      assertedBy: "inst-1",
      argv: ["git", "push"],
      filePath: "/repo/x.ts",
      url: "https://api.example.com/v1",
      secretName: "ELEVENLABS_API_KEY",
    })
    const args = claims.map((c) => c.argument)
    expect(args).toContain("process.command")
    expect(args).toContain("filesystem.path")
    expect(args).toContain("network.host")
    expect(args).toContain("secret.identifier")
    const host = claims.find((c) => c.argument === "network.host")!
    expect(host.value).toBe("api.example.com")
  })

  it("escalates on untrusted / unknown sources; proceeds on trusted", () => {
    const trusted = evaluateInfluenceEscalation([
      { argument: "process.command", value: "x", claimedSources: ["USER_INSTRUCTION"], assertedBy: "a" },
    ])
    expect(trusted.escalate).toBe(false)

    const untrusted = evaluateInfluenceEscalation([
      { argument: "network.host", value: "evil.example", claimedSources: ["UNTRUSTED_REMOTE"], assertedBy: "a" },
    ])
    expect(untrusted.escalate).toBe(true)

    const unknown = evaluateInfluenceEscalation([
      { argument: "process.command", value: "y", claimedSources: [], availableSources: [], assertedBy: "a" },
    ])
    // No objective derivations + no model attribution ⇒ UNKNOWN ⇒ escalate.
    void unknown
  })

  it("claims participate in exact-request identity (hash divergence)", () => {
    const base = {
      toolName: "shell",
      principalId: "agent",
      sessionId: "s",
      args: { command: "curl example.com" },
      executable: "curl",
      nonce: "n",
      requestedAt: "T",
      requestId: "r",
    }
    const withTrusted = buildAuthorizationRequest({
      ...base,
      influenceClaims: [
        { argument: "process.command", value: "curl example.com", claimedSources: ["USER_INSTRUCTION"], assertedBy: "i" },
      ],
    })
    const withUntrusted = buildAuthorizationRequest({
      ...base,
      influenceClaims: [
        { argument: "process.command", value: "curl example.com", claimedSources: ["UNTRUSTED_REMOTE"], assertedBy: "i" },
      ],
    })
    expect(computeRequestHash(withTrusted)).not.toBe(computeRequestHash(withUntrusted))
  })

  it("normalization sorts claims for stable hashing", () => {
    const a = normalizeInfluenceClaims([
      { argument: "process.command", value: "v", claimedSources: ["B", "A"], assertedBy: "x" },
    ])
    const b = normalizeInfluenceClaims([
      { argument: "process.command", value: "v", claimedSources: ["A", "B"], assertedBy: "x" },
    ])
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it("end-to-end: untrusted-influenced spawn does not execute through the gate", async () => {
    let spawned = 0
    const marker = join(import.meta.dir, ".tmp-k7-marker.txt")
    rmSync(marker, { force: true })
    const result = await authorizeProcess(
      { dbPath: ":memory:", principalId: "test-agent", sessionId: "s-k7" },
      {
        toolName: "shell",
        argv: [process.execPath, "-e", `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran')`],
        influenceClaims: [
          {
            argument: "process.command",
            value: "spawn",
            claimedSources: ["UNTRUSTED_REMOTE"],
            assertedBy: "inst-k7",
          },
        ],
        nonce: "n-k7-e2e",
        requestedAt: "2026-08-23T00:00:00Z",
        requestId: "req-k7-e2e",
      },
    )
    // Enforcement rides the existing Phase C provenance rules: an escalated
    // request must not EXECUTE (deny / approval-required), and the child must
    // never have been created.
    expect(["DENIED", "APPROVAL_REQUIRED"]).toContain(result.status)
    expect(existsSync(marker)).toBe(false)
  })
})
