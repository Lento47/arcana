import { describe, expect, test } from "bun:test"
import {
  getSpineLayout,
  SESSION_FRAME_CHROME,
  spineChatCardChrome,
  spineProseWidth,
  spineViewportWidth,
} from "../src/shell/command-spine/spine-types"

describe("spineProseWidth", () => {
  test("present-but-narrow width gets its real budget — never the bare 80 fallback", () => {
    // 30-col minimal chat: 30 - (0 pad + 2 gutter + 4 chat + 2 scrollbar) = 22
    expect(spineProseWidth(30, "minimal", "chat")).toBe(22)
    // 40-col minimal chat: no 40-floor anymore — 40 - 8 = 32
    expect(spineProseWidth(40, "minimal", "chat")).toBe(32)
    // 10-col minimal chat: clamps to 2, not 72/80
    expect(spineProseWidth(10, "minimal", "chat")).toBe(2)
  })

  test("clamps to >= 1 — never negative, never 80", () => {
    expect(spineProseWidth(0, "wide", "chat")).toBe(1)
    expect(spineProseWidth(1, "minimal", "chat")).toBe(1)
    expect(spineProseWidth(4, "minimal", "chat")).toBe(1)
  })

  test("non-finite width degrades to 1 (first paint race), not 80", () => {
    expect(spineProseWidth(Number.NaN, "wide", "chat")).toBe(1)
  })

  test("never exceeds the terminal width", () => {
    for (const w of [20, 30, 40, 45, 48, 60, 80, 100, 120, 160]) {
      const layout = getSpineLayout(w)
      for (const variant of ["chat", "think", "inline"] as const) {
        const result = spineProseWidth(w, layout, variant)
        expect(result).toBeGreaterThanOrEqual(1)
        expect(result).toBeLessThanOrEqual(w)
      }
    }
  })

  test("uses most of a normal terminal for chat prose", () => {
    const layout = getSpineLayout(120)
    const w = spineProseWidth(120, layout, "chat")
    expect(w).toBeGreaterThanOrEqual(100)
    expect(w).toBeLessThan(120)
  })

  test("scales with terminal width", () => {
    const a = spineProseWidth(80, "narrow", "chat")
    const b = spineProseWidth(160, "wide", "chat")
    expect(b).toBeGreaterThan(a)
  })

  test("known chrome arithmetic per layout and variant", () => {
    // wide: outerPad 1 + gutter 2 + scrollbar 2
    expect(spineChatCardChrome()).toBe(4) // border + padL + padR
    expect(spineProseWidth(120, "wide", "chat")).toBe(111) // + 4 chat chrome
    expect(spineProseWidth(120, "wide", "think")).toBe(112) // + rail 2 + 1
    expect(spineProseWidth(120, "wide", "inline")).toBe(114) // + 1
    // narrow: same outerPad as wide
    expect(spineProseWidth(80, "narrow", "chat")).toBe(71)
    // minimal: outerPad 0
    expect(spineProseWidth(60, "minimal", "chat")).toBe(52)
  })

  test("session frame chrome is 6 cells; viewport is terminal minus that", () => {
    expect(SESSION_FRAME_CHROME).toBe(6)
    expect(spineViewportWidth(80)).toBe(74)
    expect(spineViewportWidth(120)).toBe(114)
    expect(spineProseWidth(spineViewportWidth(80), "narrow", "chat")).toBe(65)
    expect(65).toBeLessThanOrEqual(67)
  })
})
