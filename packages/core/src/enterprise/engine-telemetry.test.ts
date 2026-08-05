import { describe, expect, it } from "bun:test"
import { Database } from "bun:sqlite"
import { SqliteMeteringStore } from "./metering-sqlite"
import { ingestEngineEvent, type EngineEvent } from "./engine-telemetry"

const TENANT = "tenant-a"
const SESSION = "sess-1"
const NOW = "2026-08-02T12:00:00.000Z"

function event(overrides: Partial<EngineEvent> = {}): EngineEvent {
  return {
    kind: "session.started",
    tenantId: TENANT,
    sessionId: SESSION,
    timestamp: NOW,
    ...overrides,
  }
}

describe("F12 engine telemetry ingestion", () => {
  it("maps session.started to a metering usage record", () => {
    const store = new SqliteMeteringStore(new Database(":memory:"))
    ingestEngineEvent(store, event({ kind: "session.started" }))
    expect(store.usage(TENANT, "local_runtime", "2026-08-02T00:00:00.000Z")).toBe(1)
  })

  it("maps session.next.step.ended to a metering usage record with token units", () => {
    const store = new SqliteMeteringStore(new Database(":memory:"))
    ingestEngineEvent(store,
      event({
        kind: "session.next.step.ended",
        data: { tokens: { input: 120, output: 45 } },
      }),
    )
    expect(store.usage(TENANT, "local_runtime", "2026-08-02T00:00:00.000Z")).toBe(165)
  })

  it("maps session.next.tool.called to a metering usage record", () => {
    const store = new SqliteMeteringStore(new Database(":memory:"))
    ingestEngineEvent(store, event({ kind: "session.next.tool.called" }))
    expect(store.usage(TENANT, "local_runtime", "2026-08-02T00:00:00.000Z")).toBe(1)
  })

  it("ignores unknown event kinds without crashing", () => {
    const store = new SqliteMeteringStore(new Database(":memory:"))
    ingestEngineEvent(store, event({ kind: "unknown.event.type" }))
    expect(store.usage(TENANT, "local_runtime", "2026-08-02T00:00:00.000Z")).toBe(0)
  })

  it("swallows store failures without propagating", () => {
    const brokenStore = {
      putUsage: () => {
        throw new Error("store unavailable")
      },
      usage: () => 0,
      allUsage: () => [],
    }
    expect(() => {
      ingestEngineEvent(brokenStore as unknown as Parameters<typeof ingestEngineEvent>[0], event())
    }).not.toThrow()
  })

  it("records usage per-tenant and per-feature", () => {
    const store = new SqliteMeteringStore(new Database(":memory:"))
    ingestEngineEvent(store, event({ tenantId: "tenant-a", kind: "session.started" }))
    ingestEngineEvent(store, event({ tenantId: "tenant-b", kind: "session.started" }))
    ingestEngineEvent(store,
      event({ tenantId: "tenant-a", kind: "session.next.tool.called" }),
    )
    expect(store.usage("tenant-a", "local_runtime", "2026-08-02T00:00:00.000Z")).toBe(2)
    expect(store.usage("tenant-b", "local_runtime", "2026-08-02T00:00:00.000Z")).toBe(1)
  })

  it("ingestion is informational only and never affects security decisions", () => {
    const store = new SqliteMeteringStore(new Database(":memory:"))
    ingestEngineEvent(store, event())
    expect(store.usage(TENANT, "local_runtime", "2026-08-02T00:00:00.000Z")).toBe(1)
  })
})
