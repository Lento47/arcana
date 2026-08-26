import { describe, expect, test } from "bun:test"
import { createGovernanceSampler, governanceCounterFor } from "./governance-sampler"

function ok(): Response {
  return new Response(JSON.stringify({ accepted: 1 }), { status: 202 })
}

describe("governance sampler", () => {
  test("maps known event types to counter families; unknown ignored", () => {
    expect(governanceCounterFor("authorization.denied")).toBe("authority_denied")
    expect(governanceCounterFor("capability.created")).toBe("capabilities_created")
    expect(governanceCounterFor("session.drive_decision")).toBe("drive_decisions")
    expect(governanceCounterFor("totally.unknown")).toBeNull()
  })

  test("aggregates a window and flushes counts-only payload", async () => {
    const bodies: any[] = []
    const sampler = createGovernanceSampler({
      enabled: true,
      windowMs: 60_000,
      endpoints: ["https://gov.test/rollup"],
      resolveKey: () => "k",
      fetchImpl: async (_url, init) => {
        bodies.push(JSON.parse(String(init?.body)))
        return ok()
      },
    })
    const base = 1_700_000_000_000
    sampler.record("session.started", base)
    sampler.record("authorization.denied", base + 1)
    sampler.record("authorization.denied", base + 2)
    sampler.record("capability.created", base + 3)
    // Crossing the window boundary closes the first window.
    sampler.record("turns_started" in {} ? "session.started" : "session.started", base + 60_001)
    await sampler.flush()
    expect(bodies.length).toBeGreaterThanOrEqual(1)
    const allCounters = bodies.flatMap((b) => b.windows.map((w: any) => w.counters))
    const flat: Record<string, number> = {}
    for (const c of allCounters) for (const [k, v] of Object.entries(c)) flat[k] = (flat[k] ?? 0) + (v as number)
    // turns_started appears once per window (w1 opener + w2 opener).
    expect(flat["turns_started"]).toBe(2)
    expect(flat["authority_denied"]).toBe(2)
    expect(flat["capabilities_created"]).toBe(1)
    sampler.dispose()
  })

  test("disabled sampler never buffers or sends", async () => {
    let calls = 0
    const sampler = createGovernanceSampler({
      enabled: false,
      resolveKey: () => "k",
      fetchImpl: async () => {
        calls++
        return ok()
      },
    })
    sampler.record("session.started")
    await sampler.flush()
    expect(calls).toBe(0)
    expect(sampler.pendingWindows()).toBe(0)
  })

  test("no credential drops windows without fetching", async () => {
    let calls = 0
    const sampler = createGovernanceSampler({
      enabled: true,
      endpoints: ["https://gov.test/rollup"],
      resolveKey: () => undefined,
      fetchImpl: async () => {
        calls++
        return ok()
      },
    })
    sampler.record("session.started")
    await sampler.flush()
    expect(calls).toBe(0)
    expect(sampler.pendingWindows()).toBe(0)
  })

  test("transport failure requeues (retryable), then delivers on next flush", async () => {
    let fail = true
    let calls = 0
    const sampler = createGovernanceSampler({
      enabled: true,
      endpoints: ["https://gov.test/rollup"],
      resolveKey: () => "k",
      fetchImpl: async () => {
        calls++
        if (fail) throw new Error("down")
        return ok()
      },
    })
    sampler.record("session.started", 1_000)
    await sampler.flush()
    expect(calls).toBe(1)
    expect(sampler.pendingWindows()).toBe(1) // requeued after transport failure
    fail = false
    await sampler.flush()
    expect(calls).toBe(2)
    expect(sampler.pendingWindows()).toBe(0)
  })
})
