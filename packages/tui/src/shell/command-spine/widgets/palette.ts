import type { ColorInput } from "@opentui/core"

/** Colors a widget needs; sourced from the active theme, never hardcoded in widgets. */
export interface WidgetPaletteInput {
  sev1: ColorInput
  sev2: ColorInput
  sev3: ColorInput
  open: ColorInput
  done: ColorInput
  mit: ColorInput
  muted: ColorInput
  warn: ColorInput
}

/**
 * Map theme tokens to widget palette. Falls back only when a token is absent
 * (themes are expected to define all of these — arcana/ansi palettes do).
 */
export function widgetPalette(theme: Record<string, unknown>): WidgetPaletteInput {
  const pick = (...keys: string[]): ColorInput => {
    for (const key of keys) {
      const value = theme[key]
      if (value !== undefined && value !== null) return value as ColorInput
    }
    return "#888888"
  }
  return {
    sev1: pick("error"),
    sev2: pick("warning"),
    sev3: pick("info", "spineInspect"),
    open: pick("error"),
    done: pick("success"),
    mit: pick("accent"),
    muted: pick("textMuted", "markdownText"),
    warn: pick("warning"),
  }
}
