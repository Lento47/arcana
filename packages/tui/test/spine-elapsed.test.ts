import { describe, expect, test } from "bun:test"
import { compactSpineElapsed } from "../src/shell/command-spine/spine-types"

describe("compactSpineElapsed", () => {
  test("returns empty for blank input or max 0 (minimal layout hides elapsed)", () => {
    expect(compactSpineElapsed(undefined, 5)).toBe("")
    expect(compactSpineElapsed("", 5)).toBe("")
    expect(compactSpineElapsed("   ", 5)).toBe("")
    expect(compactSpineElapsed("+5s", 0)).toBe("")
  })

  test("returns values that fit unchanged", () => {
    expect(compactSpineElapsed("+5s", 5)).toBe("+5s")
    expect(compactSpineElapsed("+12s", 5)).toBe("+12s")
    expect(compactSpineElapsed("+12.3s", 7)).toBe("+12.3s")
    expect(compactSpineElapsed("+123ms", 7)).toBe("+123ms")
    expect(compactSpineElapsed("+1h", 5)).toBe("+1h")
    expect(compactSpineElapsed("+5m", 5)).toBe("+5m")
    expect(compactSpineElapsed("12s", 5)).toBe("12s")
  })

  test("compacts fractional seconds to whole seconds to fit", () => {
    expect(compactSpineElapsed("+12.3s", 5)).toBe("+12s")
  })

  test("never eats the unit — re-renders at coarser precision (T6 regression)", () => {
    // Old behavior truncated "+123ms" to "+123…" — the unit was lost and the
    // result was ambiguous (seconds? minutes?). Now the value is re-rendered
    // with the unit intact.
    expect(compactSpineElapsed("+123ms", 5)).toBe("+0.1s")
    expect(compactSpineElapsed("+999ms", 5)).toBe("+1s")
    expect(compactSpineElapsed("+1234ms", 5)).toBe("+1.2s")
    expect(compactSpineElapsed("+1234ms", 7)).toBe("+1234ms")
  })

  test("keeps the unit even when no tier fits — slight overflow over truncation", () => {
    expect(compactSpineElapsed("+1h", 2)).toBe("+1h")
  })
})
