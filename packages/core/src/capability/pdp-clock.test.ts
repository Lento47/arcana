// packages/core/src/capability/pdp-clock.test.ts
//
// ADR-005 enforcement: PDP decisions are pure functions of
// (request, PolicyContext). Wall-clock time enters EXCLUSIVELY through
// context.now / request-carried timestamps — never Date.now() inside the
// evaluation path. Replay depends on it.

import { describe, expect, it } from "bun:test"
import { evaluate } from "./pdp"
import { buildAuthorizationRequest } from "./pep-integration"
import { computeRequestHash } from "./request-hash"

function makeRequest() {
  return buildAuthorizationRequest({
    toolName: "bash",
    principalId: "arcana-cli",
    sessionId: "clock-test",
    args: { command: "echo hi" },
  })
}

function makeContext(now: string) {
  return {
    now,
    policyVersion: "test-v1",
    capabilities: [],
    explicitDenyRules: [],
    approvalRules: [],
    workspaceTrust: "TRUSTED" as const,
  }
}

describe("PDP injectable clock (ADR-005)", () => {
  it("same request + same context ⇒ byte-identical decision (pure function)", () => {
    const req = makeRequest()
    const ctx = makeContext("2026-08-25T10:00:00.000Z")
    const a = evaluate(req, ctx)
    const b = evaluate(req, ctx)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it("differing context.now changes ONLY the stamped timestamp — no outcome drift", () => {
    const req = makeRequest()
    const early = evaluate(req, makeContext("2026-01-01T00:00:00.000Z"))
    const late = evaluate(req, makeContext("2030-01-01T00:00:00.000Z"))
    // Normalize the injected clock stamps away, then compare everything else.
    const strip = (s: string) => s.split("2026-01-01T00:00:00.000Z").join("<now>").split("2030-01-01T00:00:00.000Z").join("<now>")
    expect(strip(JSON.stringify(early))).toBe(strip(JSON.stringify(late)))
    // Evaluation is read-only: hashing the same object before/after must agree.
    const before = computeRequestHash(req)
    evaluate(req, makeContext("2026-01-01T00:00:00.000Z"))
    expect(computeRequestHash(req)).toBe(before)
  })

  it("replayed requests carry their ORIGINAL requestedAt — builder does not re-stamp", () => {
    const original = "2025-12-31T23:59:59.999Z"
    const req = buildAuthorizationRequest({
      toolName: "bash",
      principalId: "arcana-cli",
      sessionId: "clock-test",
      args: { command: "echo hi" },
      requestedAt: original,
    })
    expect(JSON.stringify(req)).toContain(original)
    // Fresh attempts mint fresh values.
    const fresh = buildAuthorizationRequest({
      toolName: "bash",
      principalId: "arcana-cli",
      sessionId: "clock-test",
      args: { command: "echo hi" },
    })
    expect(JSON.stringify(fresh)).not.toContain(original)
  })
})
