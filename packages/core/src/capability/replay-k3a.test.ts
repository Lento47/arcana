// packages/core/src/capability/replay-k3a.test.ts
// Authority Kernel K3a — pure authority replay suite (permanent fixture).
//
// Invariant under test (P3 + P4 evidence layer):
//   identical authoritative inputs ⇒ identical decision, request hash, and
//   reconstructed state hash — on ANY database instance. Divergence in any
//   input ⇒ divergence in the corresponding artifact.
//
// These fixtures are the Decision+State determinism levels of the kernel
// contract; they carry the same severity as Phase C's false-allow tests.

import { describe, expect, it } from "bun:test"
import { Effect } from "effect"
import { randomUUID } from "node:crypto"
import { replayAuthority } from "./authority-replay"

// Fixed captured clock — replay ALWAYS knows its nondeterminism ledger.
const CLOCK = {
  nonce: "k3a-nonce-0001",
  requestedAt: "2026-08-23T00:00:00.000Z",
}

function scenario(n: string, overrides: Partial<Parameters<typeof replayAuthority>[1]> = {}) {
  return {
    toolName: "shell",
    args: { command: "bun -e 'console.log(1)'", cwd: null },
    executable: "bun",
    arguments: ["-e", "console.log(1)"],
    workingDirectory: "/repo",
    nonce: `${CLOCK.nonce}-${n}`,
    requestedAt: CLOCK.requestedAt,
    requestId: `req-k3a-${n}`,
    instanceId: "inst-k3a",
    ...overrides,
  }
}

describe("K3a pure authority replay", () => {
  it("T1 same-database rerun: identical decision + request hash", async () => {
    const db = ":memory:"
    const s = scenario("t1")
    const a = await replayAuthority({ dbPath: db, principalId: "agent", sessionId: "s-t1" }, s)
    // Same store re-opened for the second identical run.
    const b = await replayAuthority({ dbPath: db, principalId: "agent", sessionId: "s-t1" }, s)
    expect(a.status).toBe(b.status)
    expect(a.requestHash).toBe(b.requestHash)
    expect(JSON.stringify(a.decision)).toBe(JSON.stringify(b.decision))
  })

  it("T2 independent reconstruction: fresh databases converge to identical artifacts", async () => {
    const s = scenario("t2")
    const a = await replayAuthority({ dbPath: ":memory:", principalId: "agent", sessionId: "s-t2" }, s)
    const b = await replayAuthority({ dbPath: ":memory:", principalId: "agent", sessionId: "s-t2" }, s)
    expect(a.requestHash).toBe(b.requestHash)
    expect(a.stateHash).toBe(b.stateHash)
    expect(JSON.stringify(a.decision)).toBe(JSON.stringify(b.decision))
    expect(a.executorCalls).toBe(b.executorCalls)
  })

  it("T3 divergence: any changed authoritative input changes the request hash", async () => {
    const a = await replayAuthority(
      { dbPath: ":memory:", principalId: "agent", sessionId: "s-t3" },
      scenario("t3-a"),
    )
    const b = await replayAuthority(
      { dbPath: ":memory:", principalId: "agent", sessionId: "s-t3" },
      scenario("t3-b", { args: { command: "bun -e 'console.log(2)'", cwd: null } }),
    )
    expect(a.requestHash).not.toBe(b.requestHash)
  })

  it("T4 ordered seed operations reconstruct identically across instances", async () => {
    const seedOps = async (store: import("./grant-store").CapabilityGrantStore) => {
      await Effect.runPromise(
        Effect.gen(function* () {
          yield* store.putGrant({
            id: "cap-extra-1",
            schemaVersion: "1",
            principal: { kind: "agent", id: "agent" },
            issuer: { kind: "policy", id: "test" },
            actions: ["filesystem.read"],
            resources: [{ kind: "file", pattern: "/repo/**" }],
            constraints: { sessionId: "s-t4" },
            delegation: { allowed: false, maximumDepth: 0, currentDepth: 0 },
            status: "ACTIVE",
            createdEventId: "evt-x1",
          })
        }),
      )
    }
    const a = await replayAuthority(
      { dbPath: ":memory:", principalId: "agent", sessionId: "s-t4" },
      scenario("t4"),
      seedOps,
    )
    const b = await replayAuthority(
      { dbPath: ":memory:", principalId: "agent", sessionId: "s-t4" },
      scenario("t4"),
      seedOps,
    )
    expect(a.stateHash).toBe(b.stateHash)
    // And the extra grant is visible in state (differs from no-seed baseline).
    const base = await replayAuthority(
      { dbPath: ":memory:", principalId: "agent", sessionId: "s-t4" },
      scenario("t4"),
    )
    expect(a.stateHash).not.toBe(base.stateHash)
  })

  it("T5 deny path replays identically with zero executor calls", async () => {
    const s = scenario("t5")
    const a = await replayAuthority(
      { dbPath: ":memory:", principalId: "agent", sessionId: "s-t5", skipBootstrap: true },
      s,
    )
    const b = await replayAuthority(
      { dbPath: ":memory:", principalId: "agent", sessionId: "s-t5", skipBootstrap: true },
      s,
    )
    expect(a.status).toBe("DENIED")
    expect(b.status).toBe("DENIED")
    expect(a.reasonCodes).toEqual(b.reasonCodes)
    expect(a.executorCalls).toBe(0)
    expect(b.executorCalls).toBe(0)
    expect(a.stateHash).toBe(b.stateHash)
  })
})

