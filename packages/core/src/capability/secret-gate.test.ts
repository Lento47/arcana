// packages/core/src/capability/secret-gate.test.ts
// Authority Kernel M1 acceptance tests — SecretUse mediation.
//
// Killer properties:
//   - a secret is resolvable ONLY through a mediated, receipted access
//   - unprovisioned names fail closed (no grant ⇒ DENY)
//   - the value exists in the result ONLY on EXECUTED

import { describe, expect, it, afterAll } from "bun:test"
import { existsSync, mkdirSync, rmSync } from "node:fs"
import { join } from "node:path"
import { authorizeSecretUse, seedNamedSecretGrant } from "./secret-gate"

const dir = join(import.meta.dir, ".tmp-secret-gate")

function dbPath(n: string): string {
  mkdirSync(dir, { recursive: true })
  return join(dir, n)
}
const registry = new Map<string, string>([["REGISTERED_KEY", "super-secret-value"]])
const resolver = (n: string) => registry.get(n)

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe("secret-gate (Authority Kernel M1)", () => {
  it("ALLOW path: seeded + provisioned secret resolves with receipt", async () => {
    const db = dbPath("allow.db")
    const opts = { dbPath: db, principalId: "test-agent", sessionId: "s-sec" }
    await seedNamedSecretGrant(opts, "REGISTERED_KEY")
    const result = await authorizeSecretUse(
      opts,
      { secretName: "REGISTERED_KEY", purpose: "speak" },
      resolver,
    )
    expect(result.status).toBe("EXECUTED")
    if (result.status === "EXECUTED") {
      expect(result.value).toBe("super-secret-value")
      expect(result.requestHash).toBeTruthy()
    }
    rmSync(db, { force: true })
  })

  it("DENY path: unseeded name fails closed — value never surfaces", async () => {
    const db = dbPath("deny.db")
    const result = await authorizeSecretUse(
      { dbPath: db, principalId: "test-agent", sessionId: "s-deny" },
      { secretName: "UNSEEDED_KEY", purpose: "web_search" },
      (n) => (n === "UNSEEDED_KEY" ? "leak-attempt" : undefined),
    )
    expect(result.status).toBe("DENIED")
    if (result.status === "DENIED") expect(result.reasons.length).toBeGreaterThan(0)
    // The resolver could have returned the value — prove it never did.
    expect(JSON.stringify(result)).not.toContain("leak-attempt")
    rmSync(db, { force: true })
  })

  it("DENY path: ALLOW without provisioned value normalizes to SECRET_NOT_PROVISIONED", async () => {
    const db = dbPath("noprov.db")
    const opts = { dbPath: db, principalId: "test-agent", sessionId: "s-noprov" }
    await seedNamedSecretGrant(opts, "GHOST_KEY")
    const result = await authorizeSecretUse(
      opts,
      { secretName: "GHOST_KEY", purpose: "speak" },
      () => undefined,
    )
    expect(result.status).toBe("DENIED")
    if (result.status === "DENIED") {
      expect(result.reasons.some((r) => r.code === "SECRET_NOT_PROVISIONED")).toBe(true)
    }
    rmSync(db, { force: true })
  })

  it("deterministic: captured inputs produce identical request hashes (P3)", async () => {
    const db = dbPath("det.db")
    const opts = { dbPath: db, principalId: "test-agent", sessionId: "s-det" }
    await seedNamedSecretGrant(opts, "REGISTERED_KEY")
    const req = {
      secretName: "REGISTERED_KEY",
      purpose: "determinism",
      nonce: "replay-nonce-sec-001",
      requestedAt: "2026-08-23T00:00:00.000Z",
      requestId: "req-replay-sec-001",
    }
    const a = await authorizeSecretUse(opts, req, resolver)
    const b = await authorizeSecretUse(opts, req, resolver)
    expect(a.status).toBe("EXECUTED")
    expect(b.status).toBe("EXECUTED")
    if (a.status === "EXECUTED" && b.status === "EXECUTED") {
      expect(a.requestHash).toBe(b.requestHash)
    }
    rmSync(db, { force: true })
  })

  it("delegation barrier: seeded secret grant cannot be re-delegated", async () => {
    // makeSecretGrant sets delegation.allowed=false — verify the stored shape.
    const db = dbPath("barrier.db")
    const opts = { dbPath: db, principalId: "test-agent", sessionId: "s-barrier" }
    await seedNamedSecretGrant(opts, "REGISTERED_KEY")
    // Indirect check: a child principal requesting the same name stays denied
    // because the narrow grant is bound to the provisioning principal.
    const child = await authorizeSecretUse(
      { dbPath: db, principalId: "child-agent", sessionId: "s-barrier" },
      { secretName: "REGISTERED_KEY", purpose: "subagent" },
      resolver,
    )
    expect(child.status).toBe("DENIED")
    rmSync(db, { force: true })
  })
})
