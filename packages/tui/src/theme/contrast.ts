/**
 * Pure contrast math (audit C5). Extracted from `theme/index.ts` so the
 * readability floor is unit-testable and hue-preserving.
 *
 * The old `ensureMinContrast` mixed the foreground toward pure black/white when
 * the contrast floor failed — which silently shifts *hue* (a red token walked
 * through gray toward white), so two adjacent spine kinds could collapse onto
 * the same shifted color. The rewrite walks **lightness only** (HSL), keeping
 * hue + saturation constant: the color brightens/darkens toward the pole
 * opposite the background, never loses its identity.
 */
import { RGBA } from "@opentui/core"

/** sRGB channel → linear light (WCAG 2.x). */
function linearChannel(value: number) {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

/** Relative luminance in [0, 1] — the WCAG 2.x luminance of a color. */
function relativeLuminance(color: RGBA) {
  return 0.2126 * linearChannel(color.r) + 0.7152 * linearChannel(color.g) + 0.0722 * linearChannel(color.b)
}

/** WCAG contrast ratio (≥ 1; 21 max). */
function contrastRatio(foreground: RGBA, background: RGBA) {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background))
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background))
  return (lighter + 0.05) / (darker + 0.05)
}

/** Linear RGB (0–1) → HSL. Hue in degrees [0, 360); s/l in [0, 1]. */
export function rgbaToHsl(color: RGBA): { h: number; s: number; l: number } {
  const r = color.r
  const g = color.g
  const b = color.b
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  switch (max) {
    case r:
      h = ((g - b) / d + (g < b ? 6 : 0)) * 60
      break
    case g:
      h = ((b - r) / d + 2) * 60
      break
    default:
      h = ((r - g) / d + 4) * 60
  }
  return { h, s, l }
}

/** HSL → linear RGB (0–1) with alpha preserved (0–1). */
export function hslToRgba(h: number, s: number, l: number, a: number): RGBA {
  const hue = ((h % 360) + 360) % 360
  if (s === 0) {
    const v = Math.round(l * 255)
    return RGBA.fromInts(v, v, v, Math.round(a * 255))
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const f = (t: number) => {
    let tt = t
    if (tt < 0) tt += 1
    if (tt > 1) tt -= 1
    if (tt < 1 / 6) return p + (q - p) * 6 * tt
    if (tt < 1 / 2) return q
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6
    return p
  }
  return RGBA.fromInts(
    Math.round(f(hue / 360 + 1 / 3) * 255),
    Math.round(f(hue / 360) * 255),
    Math.round(f(hue / 360 - 1 / 3) * 255),
    Math.round(a * 255),
  )
}

/**
 * Raise a color's contrast against `background` to ≥ `minRatio`, preserving its
 * hue and saturation: walk lightness from the original toward the pole opposite
 * the background (light bg → darken, dark bg → lighten), stopping at the
 * smallest excursion that meets the floor. Returns the input unchanged when it
 * already passes (identity, so callers can detect "no adjustment").
 */
export function ensureMinContrast(foreground: RGBA, background: RGBA, minRatio: number) {
  if (contrastRatio(foreground, background) >= minRatio) return foreground

  const darken = relativeLuminance(background) > 0.5
  const { h, s, l } = rgbaToHsl(foreground)
  const targetL = darken ? 0 : 1

  let low = 0
  let high = 1
  let best = foreground
  for (let i = 0; i < 12; i++) {
    const mid = (low + high) / 2
    const candidate = hslToRgba(h, s, l + (targetL - l) * mid, foreground.a)
    if (contrastRatio(candidate, background) >= minRatio) {
      best = candidate
      high = mid
    } else {
      low = mid
    }
  }
  return best
}
