// packages/core/src/capability/network-gate.test.ts
// Authority Kernel M1 acceptance tests — NetworkMutation vertical slice.
//
// Killer property: a denied outbound call makes ZERO network connections —
// proven with a local server whose request counter must stay at zero.

import { describe, expect, it, afterAll } from "bun:test"
import { authorizeNetwork } from "./network-gate"

const opts = { dbPath: ":memory:", principalId: "test-agent", sessionId: "s-net" }

let hitCount = 0
const server = Bun.serve({
  port: 0, // random free port
  fetch() {
    hitCount++
    return new Response("probe-ok")
  },
})
const base = `http://127.0.0.1:${server.port}`

afterAll(() => {
  server.stop(true)
})

describe("network-gate (Authority Kernel M1)", () => {
  it("ALLOW path: bootstrapped request reaches destination exactly once", async () => {
    const before = hitCount
    const result = await authorizeNetwork(
      { ...opts },
      { toolName: "web_fetch", url: `${base}/allow`, nonce: "n1", requestedAt: "2026-08-23T00:00:00Z", requestId: "req-n1" },
      async () => {
        const res = await fetch(`${base}/allow`)
        return { httpStatus: res.status, summary: await res.text() }
      },
    )
    expect(result.status).toBe("EXECUTED")
    if (result.status === "EXECUTED") {
      expect(result.httpStatus).toBe(200)
      expect(result.summary).toBe("probe-ok")
    }
    expect(hitCount).toBe(before + 1)
  })

  it("DENY path: unbootstrapped store denies — zero network requests", async () => {
    const before = hitCount
    const result = await authorizeNetwork(
      { ...opts, skipBootstrap: true },
      { toolName: "web_fetch", url: `${base}/deny-probe` },
      async () => {
        const res = await fetch(`${base}/deny-probe`)
        return { httpStatus: res.status, summary: "should never happen" }
      },
    )
    expect(result.status).toBe("DENIED")
    expect(hitCount).toBe(before) // THE assertion: no connection attempt
    if (result.status === "DENIED") expect(result.reasons.length).toBeGreaterThan(0)
  })

  it("deterministic: captured inputs produce identical request hashes (P3)", async () => {
    const req = {
      toolName: "web_fetch",
      url: `${base}/det`,
      nonce: "replay-nonce-net-001",
      requestedAt: "2026-08-23T00:00:00.000Z",
      requestId: "req-replay-net-001",
    }
    const a = await authorizeNetwork({ ...opts }, req, async () => {
      const res = await fetch(`${base}/det`)
      return { httpStatus: res.status, summary: "x" }
    })
    const b = await authorizeNetwork({ ...opts }, req, async () => {
      const res = await fetch(`${base}/det`)
      return { httpStatus: res.status, summary: "x" }
    })
    expect(a.status).toBe("EXECUTED")
    expect(b.status).toBe("EXECUTED")
    if (a.status === "EXECUTED" && b.status === "EXECUTED") {
      expect(a.requestHash).toBe(b.requestHash)
    }
  })
})
