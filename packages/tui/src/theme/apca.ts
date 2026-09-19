/**
 * APCA (Accessible Perceptual Contrast Algorithm) — SAPC-8, 0.0.98G-4g, W3
 * constants.
 *
 * WCAG 2.x contrast ratios model luminance, not perception, and are known to
 * overestimate contrast on dark backgrounds — the mode terminals live in. APCA
 * predicts perceived contrast with polarity awareness: positive Lc means dark
 * text on a light surface, negative Lc means light text on a dark surface.
 *
 * Reference points (Myndex): |Lc| 60 is "roughly WCAG 4.5:1"; the ARC draft
 * asks for |Lc| 75 on body text, 60 on fluent content, 45 on sub-fluent text
 * and never below 30 (non-text/spot only).
 *
 * Constants and the algorithm follow https://github.com/Myndex/apca-w3
 * (beta 0.1.9 W3). Only the contrast predictor is ported — no string parsing,
 * no font lookup tables.
 */
import { RGBA } from "@opentui/core"
import { relativeLuminance } from "./contrast"

const APCA = {
  mainTRC: 2.4,
  sRco: 0.2126729,
  sGco: 0.7151522,
  sBco: 0.072175,
  normBG: 0.56,
  normTXT: 0.57,
  revTXT: 0.62,
  revBG: 0.65,
  blkThrs: 0.022,
  blkClmp: 1.414,
  scaleBoW: 1.14,
  scaleWoB: 1.14,
  loBoWoffset: 0.027,
  loWoBoffset: 0.027,
  deltaYmin: 0.0005,
  loClip: 0.1,
} as const

/** APCA luminance Y for one 0–1 sRGB channel (2.4 exponent, no piecewise toe). */
function channel(value: number) {
  return value ** APCA.mainTRC
}

/** APCA sRGB → luminance Y. Channels are 0–1; alpha is ignored (blend first). */
export function apcaLuminance(color: RGBA) {
  return APCA.sRco * channel(color.r) + APCA.sGco * channel(color.g) + APCA.sBco * channel(color.b)
}

/** Blend a translucent foreground over its background, APCA-style (gamma space). */
function blend(foreground: RGBA, background: RGBA): RGBA {
  if (foreground.a >= 1) return foreground
  const mix = (fg: number, bg: number) => fg * foreground.a + bg * (1 - foreground.a)
  return RGBA.fromValues(mix(foreground.r, background.r), mix(foreground.g, background.g), mix(foreground.b, background.b), 1)
}

/**
 * Signed APCA Lc for text on a background. The first argument is the text —
 * polarity matters: dark-on-light is positive, light-on-dark is negative.
 * Returns 0 for unusably low or invalid pairs.
 */
export function apcaContrast(text: RGBA, background: RGBA): number {
  const blended = blend(text, background)
  let txtY = apcaLuminance(blended)
  let bgY = apcaLuminance(background)

  // Soft black clamp (flare compensation for near-black values).
  txtY = txtY > APCA.blkThrs ? txtY : txtY + (APCA.blkThrs - txtY) ** APCA.blkClmp
  bgY = bgY > APCA.blkThrs ? bgY : bgY + (APCA.blkThrs - bgY) ** APCA.blkClmp

  if (Math.abs(bgY - txtY) < APCA.deltaYmin) return 0

  if (bgY > txtY) {
    const sapc = (bgY ** APCA.normBG - txtY ** APCA.normTXT) * APCA.scaleBoW
    return sapc < APCA.loClip ? 0 : (sapc - APCA.loBoWoffset) * 100
  }

  const sapc = (bgY ** APCA.revBG - txtY ** APCA.revTXT) * APCA.scaleWoB
  return sapc > -APCA.loClip ? 0 : (sapc + APCA.loWoBoffset) * 100
}

/** Readability bands from the APCA/ARC font lookup table. */
export type ApcaBand = "body" | "fluent" | "subFluent" | "nonText"

export const APCA_BAND_LC: Record<ApcaBand, number> = {
  /** Body text intended to be read (ARC asks for 75; +15 under 24px). */
  body: 75,
  /** Fluent content — "roughly WCAG 4.5:1". */
  fluent: 60,
  /** Sub-fluent text (labels, secondary chrome). */
  subFluent: 45,
  /** Absolute floor — below this nothing should be rendered. */
  nonText: 30,
}

/**
 * Band a token's WCAG floor maps to: 7:1 tokens are body ink, 4.5–4.8:1 are
 * fluent content, 3.8:1 sub-fluent, and the 2.2–3.2:1 rails are non-text.
 */
export function apcaBandForRatio(ratio: number): ApcaBand {
  if (ratio >= 7) return "body"
  if (ratio >= 4.5) return "fluent"
  if (ratio >= 3.8) return "subFluent"
  return "nonText"
}

/** Whether a signed Lc meets the band's magnitude. */
export function apcaPasses(lc: number, band: ApcaBand) {
  return Math.abs(lc) >= APCA_BAND_LC[band]
}

/**
 * The WCAG luminance of the gray whose APCA Lc against `background` is `lc`
 * (signed). The ramp pins WCAG luminance (that is the accessibility floor's
 * metric), so the APCA target must be converted into that metric rather than
 * solved in APCA's own space — the two curves differ, and using one as the
 * other landed designed rungs ~1.5 Lc short of their band.
 *
 * The search is monotone: light ink on a dark surface gains contrast as it
 * brightens; dark ink on a light surface as it darkens. Returns undefined when
 * the target is unreachable on that surface.
 */
export function apcaTargetLuminance(background: RGBA, lc: number): number | undefined {
  const gray = (value: number) => RGBA.fromValues(value, value, value, 1)
  const reverse = lc < 0
  if (reverse) {
    // Values decrease toward the target as the gray brightens.
    if (apcaContrast(gray(1), background) > lc) return undefined
    let lo = 0
    let hi = 1
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2
      if (apcaContrast(gray(mid), background) <= lc) hi = mid
      else lo = mid
    }
    return relativeLuminance(gray(hi))
  }
  // Forward polarity: values decrease toward the target as the gray darkens.
  if (apcaContrast(gray(0), background) < lc) return undefined
  let lo = 0
  let hi = 1
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    if (apcaContrast(gray(mid), background) >= lc) lo = mid
    else hi = mid
  }
  return relativeLuminance(gray(lo))
}
