import { describe, expect, test } from "bun:test"
import { getSpineLayout } from "../src/shell/command-spine/spine-types"

describe("spine-types.getSpineLayout — fresh breakpoints (no current)", () => {
  test("baseline breakpoints unchanged", () => {
    expect(getSpineLayout(120)).toBe("wide")
    expect(getSpineLayout(100)).toBe("compact")
    expect(getSpineLayout(80)).toBe("narrow")
    expect(getSpineLayout(50)).toBe("minimal")
  })

  test("fresh widths between breakpoints resolve to the lower layout", () => {
    expect(getSpineLayout(119)).toBe("compact")
    expect(getSpineLayout(99)).toBe("narrow")
    expect(getSpineLayout(79)).toBe("minimal")
  })
})

describe("spine-types.getSpineLayout — hysteresis dead zones (S4)", () => {
  test("wide holds down to 115, releases at 114", () => {
    expect(getSpineLayout(119, "wide")).toBe("wide")
    expect(getSpineLayout(115, "wide")).toBe("wide")
    expect(getSpineLayout(114, "wide")).toBe("compact")
  })

  test("compact holds 95–124, releases outside", () => {
    expect(getSpineLayout(99, "compact")).toBe("compact")
    expect(getSpineLayout(95, "compact")).toBe("compact")
    expect(getSpineLayout(124, "compact")).toBe("compact")
    expect(getSpineLayout(94, "compact")).toBe("narrow")
    expect(getSpineLayout(125, "compact")).toBe("wide")
  })

  test("narrow holds 75–104, releases outside", () => {
    expect(getSpineLayout(79, "narrow")).toBe("narrow")
    expect(getSpineLayout(75, "narrow")).toBe("narrow")
    expect(getSpineLayout(104, "narrow")).toBe("narrow")
    expect(getSpineLayout(74, "narrow")).toBe("minimal")
    expect(getSpineLayout(105, "narrow")).toBe("compact")
  })

  test("minimal holds below 85, releases at 85", () => {
    expect(getSpineLayout(84, "minimal")).toBe("minimal")
    expect(getSpineLayout(85, "minimal")).toBe("narrow")
  })
})

describe("spine-types.getSpineLayout — flap-stop at boundary oscillation (S4)", () => {
  test("119↔120 oscillation never flaps wide↔compact", () => {
    let current: ReturnType<typeof getSpineLayout> = getSpineLayout(120) // fresh → wide
    current = getSpineLayout(119, current) // wide holds → wide
    current = getSpineLayout(120, current) // wide → wide
    current = getSpineLayout(119, current) // wide → wide
    expect(current).toBe("wide")
  })

  test("99↔100 oscillation never flaps compact↔narrow", () => {
    let current = getSpineLayout(100) // fresh → compact
    current = getSpineLayout(99, current) // compact holds → compact
    current = getSpineLayout(100, current) // compact → compact
    current = getSpineLayout(99, current) // compact → compact
    expect(current).toBe("compact")
  })

  test("79↔80 oscillation never flaps narrow↔minimal", () => {
    let current = getSpineLayout(80) // fresh → narrow
    current = getSpineLayout(79, current) // narrow holds → narrow
    current = getSpineLayout(80, current) // narrow → narrow
    current = getSpineLayout(79, current) // narrow → narrow
    expect(current).toBe("narrow")
  })

  test("sustained shrink still crosses breakpoints with hysteresis", () => {
    let current = getSpineLayout(120) // wide
    for (const w of [118, 116, 114, 110, 104, 100, 96, 94, 90, 84, 80, 76, 74]) {
      current = getSpineLayout(w, current)
    }
    expect(current).toBe("minimal")
  })
})
