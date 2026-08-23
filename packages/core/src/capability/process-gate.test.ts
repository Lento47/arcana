// packages/core/src/capability/process-gate.test.ts
// Authority Kernel M1 acceptance tests — ProcessExecution vertical slice.
//
// Proves the killer property at the gate level:
//   a spawn attempt without an authority path creates ZERO OS children,
//   records the authorization outcome, and is deterministic.

import { describe, expect, it } from "bun:test"
import { existsSync, mkdirSync, rmSync } from "node:fs"
import { join } from "node:path"
import { authorizeProcess } from "./process-gate"

const tmp = (n: string) => {
  const dir = join(import.meta.dir, ".tmp-process-gate")
  mkdirSync(dir, { recursive: true })
  return join(dir, n)
}

function markerPath(n: string): string {
  const p = tmp(n)
  rmSync(p, { force: true })
  return p
}

describe("process-gate (Authority Kernel M1)", () => {
  it("ALLOW path: bootstrapped principal executes exact argv and returns output", async () => {
    const db = tmp("allow.db")
    const result = await authorizeProcess(
      { dbPath: db, principalId: "test-agent", sessionId: "sess-allow" },
      { toolName: "shell", argv: [process.execPath, "-e", "console.log('gate-ok')"] },
    )
    expect(result.status).toBe("EXECUTED")
    if (result.status === "EXECUTED") {
      expect(result.stdout).toContain("gate-ok")
      expect(result.exitCode).toBe(0)
      expect(result.requestHash).toBeTruthy()
    }
    rmSync(db, { force: true })
  })

  it("DENY path: unbootstrapped store denies — executor calls = 0", async () => {
    const db = tmp("deny.db")
    const marker = markerPath("deny-marker.txt")
    const result = await authorizeProcess(
      { dbPath: db, principalId: "untrusted-agent", sessionId: "sess-deny", skipBootstrap: true },
      {
        toolName: "shell",
        // If this were executed it would create the marker. It must never run.
        argv: [process.execPath, "-e", `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'x')`],
      },
    )
    expect(result.status).toBe("DENIED")
    if (result.status === "DENIED") expect(result.reasons.length).toBeGreaterThan(0)
    expect(existsSync(marker)).toBe(false)
    rmSync(db, { force: true })
  })

  it("deterministic: same captured inputs produce identical request hashes (P3)", async () => {
    const opts = { dbPath: tmp("det.db"), principalId: "test-agent", sessionId: "sess-det" }
    const captured = { nonce: "replay-nonce-001", requestedAt: "2026-08-23T00:00:00.000Z", requestId: "req-replay-001" }
    const req = { toolName: "shell", argv: [process.execPath, "-e", "1+1"], ...captured }
    const a = await authorizeProcess(opts, req)
    const b = await authorizeProcess(opts, req)
    expect(a.status).toBe("EXECUTED")
    expect(b.status).toBe("EXECUTED")
    if (a.status === "EXECUTED" && b.status === "EXECUTED") {
      expect(a.requestHash).toBe(b.requestHash)
      // Fresh attempt (no captured inputs) must hash differently — the nonce
      // exists to keep separate attempts distinguishable.
      const fresh = await authorizeProcess(opts, { toolName: "shell", argv: [process.execPath, "-e", "1+1"] })
      expect(fresh.status).toBe("EXECUTED")
      if (fresh.status === "EXECUTED") expect(fresh.requestHash).not.toBe(a.requestHash)
    }
    rmSync(tmp("det.db"), { force: true })
  })

  it("CRITICAL/unwired approval surface fails closed (no execution)", async () => {
    const db = tmp("approval.db")
    // git.push is CRITICAL-class; DEFAULT_AGENT_ACTIONS excludes it, so the
    // PDP cannot ALLOW it — with no approval store wired, nothing executes.
    const result = await authorizeProcess(
      { dbPath: db, principalId: "test-agent", sessionId: "sess-approval" },
      { toolName: "git_push", argv: ["git", "push"] },
    )
    expect(["DENIED", "APPROVAL_REQUIRED"]).toContain(result.status)
    rmSync(db, { force: true })
  })
})
