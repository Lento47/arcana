import { describe, expect, test } from "bun:test"
import {
  isSpinnerStyle,
  nextSpinnerStyle,
  SIGIL_FRAMES,
  SPINNER_FRAMES_BRAILLE,
  SPINNER_STYLES,
  spinnerFrames,
  spinnerStyleName,
} from "../src/util/spinner-style"
import {
  DENSITIES,
  densityName,
  frameChrome,
  framePadding,
  isDensity,
  nextDensity,
  spineViewportWidth,
  type StatusSegment,
} from "../src/shell/command-spine/spine-types"
import { applyConfiguredSegments, buildStatusSegments } from "../src/shell/command-spine/spine-segments"

describe("spinner styles", () => {
  test("exposes the four styles and validates stored values", () => {
    expect(SPINNER_STYLES).toEqual(["braille", "dots", "sigil", "none"])
    expect(isSpinnerStyle("dots")).toBe(true)
    expect(isSpinnerStyle("braille")).toBe(true)
    expect(isSpinnerStyle(undefined)).toBe(false)
    expect(isSpinnerStyle("flames")).toBe(false)
  })

  test("maps styles onto frame sets", () => {
    expect(spinnerFrames("braille")).toEqual(SPINNER_FRAMES_BRAILLE)
    expect(spinnerFrames("sigil")).toEqual(SIGIL_FRAMES)
    expect(spinnerFrames("dots").length).toBeGreaterThan(1)
    expect(spinnerFrames("none")).toEqual(["⋯"])
  })

  test("cycles styles braille → dots → sigil → none → braille", () => {
    expect(nextSpinnerStyle("braille")).toBe("dots")
    expect(nextSpinnerStyle("dots")).toBe("sigil")
    expect(nextSpinnerStyle("sigil")).toBe("none")
    expect(nextSpinnerStyle("none")).toBe("braille")
  })

  test("labels unknown values as the default", () => {
    expect(spinnerStyleName("sigil")).toBe("sigil")
    expect(spinnerStyleName(undefined)).toBe("braille")
    expect(spinnerStyleName("kittens")).toBe("braille")
  })
})

describe("density", () => {
  test("exposes the three densities and validates stored values", () => {
    expect(DENSITIES).toEqual(["compact", "cozy", "spacious"])
    expect(isDensity("compact")).toBe(true)
    expect(isDensity("cozy")).toBe(true)
    expect(isDensity(undefined)).toBe(false)
    expect(isDensity("huge")).toBe(false)
  })

  test("maps densities onto frame padding and total chrome", () => {
    expect(framePadding("compact")).toBe(1)
    expect(framePadding("cozy")).toBe(2)
    expect(framePadding("spacious")).toBe(3)
    expect(framePadding(undefined)).toBe(2)
    // chrome = padding * 2 (borders removed)
    expect(frameChrome("compact")).toBe(2)
    expect(frameChrome("cozy")).toBe(4)
    expect(frameChrome("spacious")).toBe(6)
  })

  test("cycles densities compact → cozy → spacious → compact", () => {
    expect(nextDensity("compact")).toBe("cozy")
    expect(nextDensity("cozy")).toBe("spacious")
    expect(nextDensity("spacious")).toBe("compact")
  })

  test("labels unknown values as the default", () => {
    expect(densityName("spacious")).toBe("spacious")
    expect(densityName(undefined)).toBe("cozy")
  })

  test("viewport width subtracts exactly the density chrome", () => {
    expect(spineViewportWidth(120, frameChrome("compact"))).toBe(118)
    expect(spineViewportWidth(120, frameChrome("cozy"))).toBe(116)
    expect(spineViewportWidth(120, frameChrome("spacious"))).toBe(114)
  })
})

describe("status-line segments", () => {
  const segments: StatusSegment[] = buildStatusSegments({
    sessionID: "ses_1",
    branch: "arcanagov",
    model: "deepseek/deepseek-v4-flash",
    ctxPercent: 42,
    state: "busy",
    path: "/work/proj",
  })

  test("unset config keeps auto behavior", () => {
    expect(applyConfiguredSegments(segments, undefined)).toBeUndefined()
    expect(applyConfiguredSegments(segments, [])).toBeUndefined()
  })

  test("picks and orders exactly the configured segments", () => {
    const picked = applyConfiguredSegments(segments, ["path", "model", "session"])
    expect(picked?.map((s) => s.key)).toEqual(["path", "model", "session"])
    expect(picked?.[0]?.value).toBe("/work/proj")
  })

  test("drops picked keys that have no segment available", () => {
    // No state segment here — the source omitted it.
    const partial = buildStatusSegments({ sessionID: "ses_1", branch: "arcanagov" })
    const picked = applyConfiguredSegments(partial, ["branch", "state", "session"])
    expect(picked?.map((s) => s.key)).toEqual(["branch", "session"])
  })
})
