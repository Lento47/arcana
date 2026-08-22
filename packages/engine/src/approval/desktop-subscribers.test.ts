import { describe, expect, test } from "bun:test"
import { ExpiringDesktopSubscriberRegistry } from "./desktop-subscribers"

describe("desktop subscriber registry", () => {
  test("matches workspace keys across path separators", () => {
    const registry = new ExpiringDesktopSubscriberRegistry(30_000)
    registry.heartbeat({
      subscriberId: "desktop-1",
      workspaceId: "L:/PROJECTS/arcana/packages/engine",
      now: 1_000,
    })
    expect(registry.isOnline("L:\\PROJECTS\\arcana\\packages\\engine", 2_000)).toBe(true)
    expect(registry.isOnline("L:\\PROJECTS\\other", 2_000)).toBe(false)
  })

  test("expires stale subscribers", () => {
    const registry = new ExpiringDesktopSubscriberRegistry(30_000)
    registry.heartbeat({
      subscriberId: "desktop-1",
      workspaceId: "L:/w",
      now: 1_000,
    })
    expect(registry.isOnline("L:/w", 1_000)).toBe(true)
    expect(registry.isOnline("L:/w", 31_001)).toBe(false)
  })

  test("explicit removal makes a disconnected desktop unavailable", () => {
    const registry = new ExpiringDesktopSubscriberRegistry(30_000)
    registry.heartbeat({ subscriberId: "desktop-1", workspaceId: "L:/w", now: 1_000 })
    expect(registry.remove("desktop-1")).toBe(true)
    expect(registry.isOnline("L:/w", 2_000)).toBe(false)
  })
})
