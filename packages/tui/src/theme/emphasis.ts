/**
 * Color derivation primitives — "what color is this *relative to* something
 * else". `Theme` carries the resolved palette; this module answers the
 * questions around it: de-emphasized text, brand ink, the modal scrim, and
 * "is this surface light?".
 *
 * Each idea had two to four private copies before this module, so a palette
 * change moved some surfaces and left others behind:
 *
 *   is-this-surface-light?  theme/index.ts (selectedForeground, terminalMode,
 *                           generateGrayScale, generateMutedTextColor),
 *                           ui/dialog.tsx (scrim), component/logo.tsx (peak)
 *   de-emphasis             theme.textMuted | tint() mixes | raw alpha literals
 *   brand ink               component/logo.tsx + component/bg-pulse.tsx
 *   modal scrim             ui/dialog.tsx
 *
 * Lives beside `contrast.ts` because both are pure color math over `Theme`,
 * and because `index.ts` (which owns the palette) needs `tint` internally —
 * a module the other direction would be a cycle.
 */
import { RGBA } from "@opentui/core"
import type { Theme } from "./index"

/**
 * Blend `base` toward `overlay` by `alpha` (0 = base, 1 = overlay).
 * Opaque result: the caller's surface is already painted underneath.
 */
export function tint(base: RGBA, overlay: RGBA, alpha: number): RGBA {
  const r = base.r + (overlay.r - base.r) * alpha
  const g = base.g + (overlay.g - base.g) * alpha
  const b = base.b + (overlay.b - base.b) * alpha
  return RGBA.fromInts(Math.round(r * 255), Math.round(g * 255), Math.round(b * 255))
}

/**
 * Cheap BT.601 brightness of a color whose channels are 0–1.
 *
 * Deliberately not WCAG relative luminance (`contrast.ts`): every caller here
 * uses it for a *polarity* decision — "does this surface need dark ink?" —
 * where BT.601 is the established heuristic and swapping in the WCAG curve
 * would shift every existing palette. Use `contrast.ts` when the question is a
 * contrast *ratio* rather than which pole to aim at.
 */
export function bgLuminance(color: RGBA): number {
  return 0.299 * color.r + 0.587 * color.g + 0.114 * color.b
}

/** True when dark ink reads better on `color` than light ink. */
export function isLightBg(color: RGBA): boolean {
  return bgLuminance(color) > 0.5
}

/**
 * De-emphasize `color` by mixing it toward the theme background.
 *
 * For plain body text prefer `theme.textMuted`: that token is passed through
 * `applyReadabilityFloor`, while a tint is not — dimming past legibility is
 * exactly what the floor exists to catch. Reach for `dim` when you want a
 * *relative* recession of a specific color that has no token of its own
 * (faded paths, disabled rows, receded meta).
 */
export function dim(theme: Pick<Theme, "background">, color: RGBA, amount = 0.55): RGBA {
  return tint(color, theme.background, amount)
}

/**
 * Scale a color's existing alpha. Keeps RGB intact, so the terminal blends it
 * against whatever is already painted — use when the surface underneath is
 * itself translucent (transparent-background themes).
 */
export function fade(color: RGBA, alpha: number): RGBA {
  return RGBA.fromValues(color.r, color.g, color.b, color.a * alpha)
}

/** Replace a color's alpha outright. Round-trips through 8-bit ints. */
export function withAlpha(color: RGBA, alpha: number): RGBA {
  const [r, g, b] = color.toInts()
  const clamped = Math.max(0, Math.min(1, alpha))
  return RGBA.fromInts(r, g, b, Math.round(clamped * 255))
}

/**
 * The alpha ladder for tints and fills. Values are the ones the app actually
 * uses; naming them keeps a "whisper" a whisper wherever it appears. Logo art
 * (its gradients and shadow) keeps its own numbers: those are drawing, not
 * chrome.
 */
export const Alpha = {
  /** A fill that is present but must not compete (the focus whisper). */
  whisper: 0.3,
  /** A quiet accent lift (the think node's flare at rest). */
  quiet: 0.4,
  /** A lifted chip or bulb (the activity reel's flare). */
  lift: 0.5,
  /** The brand ink mix: text that belongs to the palette, not to a token. */
  ink: 0.62,
} as const

/** Modal backdrop alpha — heavy enough to recede the app behind the card. */
export const SCRIM_ALPHA = 150 / 255

/**
 * Panel overlay alpha — a surface painted over the dialog card so the card
 * still reads as one plane. Lighter than the scrim: the text under it must
 * stay legible.
 */
export const OVERLAY_ALPHA = 186 / 255

/**
 * Full-viewport scrim behind a dialog or gate. Opposes the background polarity
 * so it always recedes: a light theme darkens, a dark theme lifts.
 */
export function backdropScrim(theme: Pick<Theme, "background">): RGBA {
  const base = isLightBg(theme.background) ? RGBA.fromInts(0, 0, 0) : RGBA.fromInts(255, 255, 255)
  return withAlpha(base, SCRIM_ALPHA)
}

/**
 * Brand ink for the idle logo and Go artwork: a quiet neutral derived from the
 * theme's own text/background pair, so the mark belongs to the palette instead
 * of being a fixed gray.
 */
export function logoInk(theme: Pick<Theme, "background" | "text">): RGBA {
  return tint(theme.background, theme.text, Alpha.ink)
}

/**
 * Peak highlight for the animated logo halo — the pole *opposite* the ink, so
 * the glow reads as light rather than a lighter shade of the mark.
 */
export function inkPeak(ink: RGBA): RGBA {
  return isLightBg(ink) ? RGBA.fromInts(0, 0, 0) : RGBA.fromInts(255, 255, 255)
}
