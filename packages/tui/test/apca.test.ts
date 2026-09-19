import { describe, expect, test } from "bun:test"
import { RGBA } from "@opentui/core"
import {
  APCA_BAND_LC,
  apcaBandForRatio,
  apcaContrast,
  apcaLuminance,
  apcaPasses,
  apcaTargetLuminance,
} from "../src/theme/apca"

const gray = (value: number) => RGBA.fromInts(value, value, value)
const black = gray(0)
const white = gray(255)

describe("APCA (SAPC 0.0.98G-4g)", () => {
  test("matches the published reference values", () => {
    // Widely cited APCA demo-tool values for these pairs.
    expect(apcaContrast(black, white)).toBeCloseTo(106.04, 1)
    expect(apcaContrast(white, black)).toBeCloseTo(-107.88, 1)
    expect(apcaContrast(gray(0x88), white)).toBeCloseTo(63.06, 1)
  })

  test("is polarity-aware: the same pair flips sign with the inputs", () => {
    expect(apcaContrast(gray(0x55), white)).toBeGreaterThan(0)
    expect(apcaContrast(white, gray(0x55))).toBeLessThan(0)
  })

  test("identical colors have no contrast", () => {
    expect(apcaContrast(gray(0x80), gray(0x80))).toBe(0)
  })

  test("alpha blends the text over its background", () => {
    const blended = apcaContrast(RGBA.fromValues(0, 0, 0, 0.5), white)
    expect(blended).toBeGreaterThan(0)
    expect(blended).toBeLessThan(apcaContrast(black, white))
  })

  test("luminance is monotone in the gray value", () => {
    expect(apcaLuminance(gray(32))).toBeLessThan(apcaLuminance(gray(64)))
    expect(apcaLuminance(gray(64))).toBeLessThan(apcaLuminance(gray(200)))
  })

  test("bands follow the ARC font guidance", () => {
    expect(apcaBandForRatio(7)).toBe("body")
    expect(apcaBandForRatio(4.7)).toBe("fluent")
    expect(apcaBandForRatio(3.8)).toBe("subFluent")
    expect(apcaBandForRatio(2.2)).toBe("nonText")
    expect(apcaPasses(-APCA_BAND_LC.body, "body")).toBe(true)
    expect(apcaPasses(-(APCA_BAND_LC.body - 1), "body")).toBe(false)
    expect(apcaPasses(APCA_BAND_LC.nonText, "nonText")).toBe(true)
  })

  test("target luminance round-trips to the requested Lc", () => {
    for (const [background, lc] of [
      [black, -60],
      [black, -45],
      [gray(0x20), -75],
      [white, 60],
      [white, 45],
    ] as const) {
      const luminance = apcaTargetLuminance(background, lc)
      expect(luminance, `target for ${lc}`).toBeDefined()
      const channel = Math.max(0, Math.min(1, 1.055 * luminance! ** (1 / 2.4) - 0.055))
      const resolved = apcaContrast(RGBA.fromValues(channel, channel, channel, 1), background)
      // The solved gray must actually meet the target (a small tolerance for
      // float/quantization noise), not sit a hair under it.
      if (lc < 0) expect(resolved, `round trip ${lc}`).toBeLessThanOrEqual(lc + 0.5)
      else expect(resolved, `round trip ${lc}`).toBeGreaterThanOrEqual(lc - 0.5)
    }
  })

  test("unreachable targets return undefined", () => {
    expect(apcaTargetLuminance(white, 200)).toBeUndefined()
    expect(apcaTargetLuminance(black, -200)).toBeUndefined()
  })
})
