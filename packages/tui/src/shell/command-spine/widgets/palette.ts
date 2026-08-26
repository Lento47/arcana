import type { ColorInput } from "@opentui/core"
import type { Theme } from "../../../theme"

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
 * Map theme tokens to widget palette. Accepts the resolved Theme (already
 * run through applyReadabilityFloor) so contrast is preserved; falls back to
 * textMuted with a warning instead of silent #888888 which erases S1/S2.
 */
export function widgetPalette(theme: Theme | Record<string, unknown>): WidgetPaletteInput {
  const raw = theme as unknown as Record<string, ColorInput | undefined>
  const maybe = (value: unknown): ColorInput | undefined =>
    typeof value === "string" || (value !== null && typeof value === "object" && "r" in (value as Record<string, unknown>)) ? (value as ColorInput) : undefined
  const pick = (label: string, ...keys: Array<keyof Theme | string>): ColorInput => {
    for (const key of keys) {
      const v = (theme as unknown as Record<string, unknown>)[key as string] ?? raw[key as string]
      const col = maybe(v)
      if (col !== undefined) return col
    }
    console.warn(`[widgets] missing theme token "${label}", falling back to textMuted`)
    return (maybe(raw["textMuted"]) ?? maybe((theme as unknown as Record<string, unknown>)["textMuted"]) ?? "#888888") as ColorInput
  }
  return {
    sev1: pick("error", "error"),
    sev2: pick("warning", "warning"),
    sev3: pick("info", "spineInspect", "info"),
    open: pick("open", "error"),
    done: pick("success", "success"),
    mit: pick("accent", "accent"),
    muted: pick("muted", "textMuted", "markdownText"),
    warn: pick("warn", "warning"),
  }
}
