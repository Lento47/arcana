import { describe, expect, test } from "bun:test"
import {
  clearToolActivityHint,
  getToolActivityHint,
  setToolActivityHint,
  TOOL_ACTIVITY_HINT_KEY,
} from "../../src/tool/activity-hint"

describe("tool activity hint", () => {
  test("set and get round-trip", () => {
    clearToolActivityHint()
    setToolActivityHint("tools · 2 write", { ttlMs: 5_000, source: "engine" })
    expect(getToolActivityHint()).toBe("tools · 2 write")
    clearToolActivityHint()
    expect(getToolActivityHint()).toBeUndefined()
  })

  test("expires after ttl", async () => {
    clearToolActivityHint()
    setToolActivityHint("wave 1 · 3 read", { ttlMs: 40 })
    expect(getToolActivityHint()).toBe("wave 1 · 3 read")
    await new Promise((r) => setTimeout(r, 80))
    expect(getToolActivityHint()).toBeUndefined()
  })

  test("shared globalThis key matches arcana bridge key", () => {
    expect(TOOL_ACTIVITY_HINT_KEY).toBe("arcana:toolActivityHint")
  })
})
