/**
 * Spinner animation style — the user-facing knob behind the working
 * indicator. Lives in KV (`spinner_style`) like `animations_enabled` and
 * `theme`, so it persists per machine without touching the config file.
 *
 * Styles:
 *   braille (default) — classic 10-frame braille cycle
 *   dots             — rising/falling block pulse, reads as a calm progress bar
 *   sigil            — the rotating arcane runes ⛤⛥⛧⛦ (brand sigil)
 *   none             — static ellipsis, no animation
 *
 * When unset, the two spinner components keep their current defaults (braille
 * for <Spinner>, sigil for <SigilSpinner>) so nothing changes out of the box.
 */

export const SPINNER_STYLES = ["braille", "dots", "sigil", "none"] as const
export type SpinnerStyle = (typeof SPINNER_STYLES)[number]

export const SPINNER_FRAMES_BRAILLE = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]

const DOTS_FRAMES = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█", "▇", "▆", "▅", "▄", "▃", "▂"]

export const SIGIL_FRAMES = ["⛤", "⛥", "⛧", "⛦"]

export function isSpinnerStyle(value: unknown): value is SpinnerStyle {
  return typeof value === "string" && (SPINNER_STYLES as readonly string[]).includes(value)
}

/** Human label for the slash-command title (braille → dots → sigil → none). */
export function spinnerStyleName(value: unknown): string {
  return isSpinnerStyle(value) ? value : "braille"
}

/** Frames for an explicitly chosen style. "none" returns a single static glyph. */
export function spinnerFrames(style: SpinnerStyle): string[] {
  switch (style) {
    case "dots":
      return DOTS_FRAMES
    case "sigil":
      return SIGIL_FRAMES
    case "none":
      return ["⋯"]
    default:
      return SPINNER_FRAMES_BRAILLE
  }
}

/** Cycle order matches the slash command: braille → dots → sigil → none → … */
export function nextSpinnerStyle(current: SpinnerStyle): SpinnerStyle {
  const idx = SPINNER_STYLES.indexOf(current)
  return SPINNER_STYLES[(idx + 1) % SPINNER_STYLES.length] ?? "braille"
}
