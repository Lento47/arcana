import { describe, expect, test } from "bun:test"
import { nextThinkingMode, resolveThinkingMode } from "../src/context/thinking"

describe("resolveThinkingMode", () => {
  test("fresh install defaults to inline thinking", () => {
    expect(resolveThinkingMode({ stored: undefined, legacy: undefined, migrated: false })).toBe("show")
  })

  test("one-time migration flips the old seeded hide default", () => {
    // Old builds seeded "hide" through kv.signal, so an untouched install is
    // indistinguishable from an explicit hide until the migration runs once.
    expect(resolveThinkingMode({ stored: "hide", legacy: undefined, migrated: false })).toBe("show")
  })

  test("an explicit hide after migration sticks", () => {
    expect(resolveThinkingMode({ stored: "hide", legacy: undefined, migrated: true })).toBe("hide")
  })

  test("legacy thinking_visibility false always hides", () => {
    expect(resolveThinkingMode({ stored: "show", legacy: false, migrated: true })).toBe("hide")
    expect(resolveThinkingMode({ stored: "show", legacy: false, migrated: false })).toBe("hide")
  })

  test("legacy minimal stays collapsed", () => {
    expect(resolveThinkingMode({ stored: "minimal", legacy: undefined, migrated: true })).toBe("hide")
  })

  test("nextThinkingMode cycles show <-> hide", () => {
    expect(nextThinkingMode("show")).toBe("hide")
    expect(nextThinkingMode("hide")).toBe("show")
  })
})
