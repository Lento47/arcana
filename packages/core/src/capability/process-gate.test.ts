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
import { countingSpawnExecutor } from "./spawn-executor"

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

  it("K2: instance identity participates in the request hash", async () => {
    const db = tmp("k2.db")
    // Two different agent instances, same captured inputs ⇒ different hashes.
    const req = { toolName: "shell", argv: [process.execPath, "-e", "console.log(2)"], nonce: "n-k2", requestedAt: "2026-08-23T00:00:00Z", requestId: "req-k2" }
    const a = await authorizeProcess({ dbPath: db, principalId: "test-agent", sessionId: "s" }, { ...req, instanceId: "inst-A" })
    const b = await authorizeProcess({ dbPath: db, principalId: "test-agent", sessionId: "s" }, { ...req, instanceId: "inst-B" })
    expect(a.status).toBe("EXECUTED")
    expect(b.status).toBe("EXECUTED")
    if (a.status === "EXECUTED" && b.status === "EXECUTED") {
      expect(a.requestHash).not.toBe(b.requestHash)
    }
    // Same instance + identical captured inputs ⇒ identical hash.
    const a2 = await authorizeProcess({ dbPath: db, principalId: "test-agent", sessionId: "s" }, { ...req, instanceId: "inst-A" })
    expect(a2.status).toBe("EXECUTED")
    if (a.status === "EXECUTED" && a2.status === "EXECUTED") {
      expect(a.requestHash).toBe(a2.requestHash)
    }
    rmSync(db, { force: true })
  })

  it("S4 seam: injected executor replaces Bun.spawnSync — zero real children", async () => {
    const { executor, calls } = countingSpawnExecutor({ stdout: "injected", exitCode: 0 })
    const marker = tmp("inject-marker.txt")
    rmSync(marker, { force: true })
    // This command WOULD create the marker if a real child ran. It must not.
    const result = await authorizeProcess(
      {
        dbPath: tmp("inj.db"),
        principalId: "test-agent",
        sessionId: "s-inject",
        skipBootstrap: false,
        spawnExecutor: executor,
      },
      {
        toolName: "shell",
        argv: [process.execPath, "-e", `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran')`],
      },
    )
    expect(result.status).toBe("EXECUTED")
    if (result.status === "EXECUTED") expect(result.stdout).toBe("injected")
    expect(calls.length).toBe(1) // our executor ran
    expect(existsSync(marker)).toBe(false) // real child never created
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
