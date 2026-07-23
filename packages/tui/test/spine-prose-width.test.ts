import { describe, expect, test } from "bun:test"
import { getSpineLayout, spineProseWidth } from "../src/shell/command-spine/spine-types"

describe("spineProseWidth", () => {
  test("tiny terminal falls back to 80-col base then floors at 40", () => {
    // width < 40 → treated as missing, uses 80-col base
    const w = spineProseWidth(10, "minimal", "chat")
    expect(w).toBeGreaterThanOrEqual(40)
    expect(w).toBeLessThanOrEqual(80)
  })

  test("uses most of a normal terminal for chat prose", () => {
    const layout = getSpineLayout(120)
    const w = spineProseWidth(120, layout, "chat")
    expect(w).toBeGreaterThanOrEqual(100)
    expect(w).toBeLessThan(120)
  })

  test("tiny/missing terminal width falls back to sane 80-based width", () => {
    const w = spineProseWidth(0, "wide", "chat")
    expect(w).toBeGreaterThanOrEqual(40)
    expect(w).toBeLessThanOrEqual(80)
  })

  test("scales with terminal width", () => {
    const a = spineProseWidth(80, "narrow", "chat")
    const b = spineProseWidth(160, "wide", "chat")
    expect(b).toBeGreaterThan(a)
  })
})
