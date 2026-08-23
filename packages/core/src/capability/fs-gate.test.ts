// packages/core/src/capability/fs-gate.test.ts
// Authority Kernel M1 acceptance tests — FsMutation vertical slice.
//
// Killer property: a file mutation attempt without an authority path leaves
// the filesystem byte-for-byte untouched, and the denial is recorded.

import { describe, expect, it, afterAll } from "bun:test"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { authorizeFileMutation } from "./fs-gate"

const dir = join(import.meta.dir, ".tmp-fs-gate")

function freshFile(n: string, initial = ""): string {
  mkdirSync(dir, { recursive: true })
  const p = join(dir, n)
  if (initial || !existsSync(p)) writeFileSync(p, initial, "utf8")
  return p
}

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe("fs-gate (Authority Kernel M1)", () => {
  it("ALLOW path: bootstrapped write mutates the file and returns output", async () => {
    const p = freshFile("allow.txt")
    const result = await authorizeFileMutation(
      { dbPath: join(dir, "allow.db"), principalId: "test-agent", sessionId: "s-fs" },
      { toolName: "write", filePath: p, content: "gate-written" },
      () => {
        writeFileSync(p, "gate-written", "utf8")
        return `Written ${p}`
      },
    )
    expect(result.status).toBe("EXECUTED")
    expect(readFileSync(p, "utf8")).toBe("gate-written")
    if (result.status === "EXECUTED") expect(result.requestHash).toBeTruthy()
  })

  it("DENY path: unbootstrapped store denies — filesystem untouched", async () => {
    const p = freshFile("deny.txt", "original")
    const db = join(dir, "deny.db")
    const result = await authorizeFileMutation(
      { dbPath: db, principalId: "untrusted-agent", sessionId: "s-deny", skipBootstrap: true },
      { toolName: "write", filePath: p, content: "malicious overwrite" },
      () => {
        writeFileSync(p, "malicious overwrite", "utf8")
        return "should never happen"
      },
    )
    expect(result.status).toBe("DENIED")
    expect(readFileSync(p, "utf8")).toBe("original")
    rmSync(db, { force: true })
  })

  it("deterministic: captured inputs produce identical request hashes (P3)", async () => {
    const opts = { dbPath: join(dir, "det.db"), principalId: "test-agent", sessionId: "s-det" }
    const req = {
      toolName: "edit",
      filePath: freshFile("det.txt", "hello world"),
      oldString: "hello",
      content: "goodbye",
      nonce: "replay-nonce-fs-001",
      requestedAt: "2026-08-23T00:00:00.000Z",
      requestId: "req-replay-fs-001",
    }
    const a = await authorizeFileMutation(opts, req, () => "a")
    const b = await authorizeFileMutation(opts, req, () => "b")
    expect(a.status).toBe("EXECUTED")
    expect(b.status).toBe("EXECUTED")
    if (a.status === "EXECUTED" && b.status === "EXECUTED") {
      expect(a.requestHash).toBe(b.requestHash)
    }
    rmSync(join(dir, "det.db"), { force: true })
  })

  it("CRITICAL/unwired approval surface fails closed — no mutation", async () => {
    // skill_create writes into the agent's own skill-load directory: treated
    // as self-modification, so the PDP demands more than a bare bootstrap
    // grant provides once risk rules engage. Whatever the decision, the rule
    // under test is: non-EXECUTED ⇒ bytes unchanged.
    const p = freshFile("skill-probe.md", "untouched")
    const result = await authorizeFileMutation(
      { dbPath: join(dir, "crit.db"), principalId: "untrusted-agent", sessionId: "s-crit", skipBootstrap: true },
      { toolName: "skill_create", filePath: p, content: "self-modification" },
      () => {
        writeFileSync(p, "self-modification", "utf8")
        return "written"
      },
    )
    expect(["DENIED", "APPROVAL_REQUIRED"]).toContain(result.status)
    expect(readFileSync(p, "utf8")).toBe("untouched")
    rmSync(join(dir, "crit.db"), { force: true })
  })
})
