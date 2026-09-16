import { describe, expect, test } from "bun:test"
import {
  defaultOpenForPermission,
  formatDurationMs,
  permissionLabels,
} from "./permission-types"

describe("defaultOpenForPermission", () => {
  test("pending always open", () => {
    expect(defaultOpenForPermission("pending")).toBe(true)
    expect(defaultOpenForPermission("pending", "idle")).toBe(true)
  })

  test("error execution open", () => {
    expect(defaultOpenForPermission("approved", "error")).toBe(true)
    expect(defaultOpenForPermission("auto", "error")).toBe(true)
  })

  test("success receipts closed by default", () => {
    expect(defaultOpenForPermission("approved", "success")).toBe(false)
    expect(defaultOpenForPermission("auto", "success")).toBe(false)
    expect(defaultOpenForPermission("edited", "success")).toBe(false)
  })

  test("rejected stays closed unless error", () => {
    expect(defaultOpenForPermission("rejected")).toBe(false)
    expect(defaultOpenForPermission("rejected", "cancelled")).toBe(false)
  })
})

describe("formatDurationMs", () => {
  test("formats sub-second and seconds", () => {
    expect(formatDurationMs(120)).toBe("120ms")
    expect(formatDurationMs(1500)).toBe("1.5s")
    expect(formatDurationMs(12000)).toBe("12s")
  })
})

describe("permissionLabels", () => {
  test("quiet is default product language", () => {
    const L = permissionLabels("quiet")
    expect(L.approve).toBe("Approve")
    expect(L.reject).toBe("Reject")
    expect(L.waiting).toBe("Waiting for approval")
  })

  test("arcane is skin only", () => {
    const L = permissionLabels("arcane")
    expect(L.approve).toBe("Seal")
    expect(L.reject).toBe("Refuse")
    expect(L.waiting).toBe("Awaiting seal")
  })
})
