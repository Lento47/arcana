/**
 * Non-color design tokens for the arcana TUI redesign.
 *
 * The `Theme` type only carries colors; spacing, widths, breakpoints and
 * border-character styles were previously scattered as inline literals across
 * components. This module centralizes them so the cyberpunk chrome stays
 * consistent and is tunable from one place.
 *
 * Border-char shapes match `@opentui/core`'s `customBorderChars` contract
 * (see `ui/border.ts` for the minimal `EmptyBorder` baseline).
 */

import { EmptyBorder } from "./border"
import type { RGBA } from "@opentui/core"

/** Heavy square frame — primary cyberpunk panel chrome. */
export const FrameBorder = {
  ...EmptyBorder,
  topLeft: "┏",
  topRight: "┓",
  bottomLeft: "┗",
  bottomRight: "┛",
  horizontal: "━",
  vertical: "┃",
  topT: "┳",
  bottomT: "┻",
  leftT: "┣",
  rightT: "┫",
  cross: "╋",
}

/** Rounded frame — softer surfaces (dialogs, prompts). */
export const RoundBorder = {
  ...EmptyBorder,
  topLeft: "╭",
  topRight: "╮",
  bottomLeft: "╰",
  bottomRight: "╯",
  horizontal: "─",
  vertical: "│",
  topT: "┬",
  bottomT: "┴",
  leftT: "├",
  rightT: "┤",
  cross: "┼",
}

/** Thin dashed — message separators, subtle dividers. */
export const DashBorder = {
  ...EmptyBorder,
  horizontal: "┈",
  vertical: "┊",
}

/** Heavy vertical rule used for message role rails. */
export const RAIL = "┃"

/**
 * Standard spacing scale (terminal cells).
 *
 * `frame()` is the one definition of the user's `density` preference:
 * `spine-types.framePadding()` delegates here so a density change moves every
 * consumer instead of only the session frame.
 */
export const Space = {
  padX: 2,
  padY: 1,
  gap: 1,
  gapWide: 2,
  /** 3-cell inset (24pt): nested rows, list indents, hint lines. */
  inset: 3,
  /** 4-cell inset (32pt): nested blocks inside an inset row. */
  insetWide: 4,
  /** Per-side horizontal padding of the session frame for a density. */
  frame(density?: "compact" | "cozy" | "spacious"): number {
    if (density === "compact") return 1
    if (density === "spacious") return 3
    return 2
  },
  /** One vertical block gap between top-level spine entries, by density. */
  blockGap(density?: "compact" | "cozy" | "spacious"): number {
    if (density === "compact") return 0
    if (density === "spacious") return 2
    return 1
  },
} as const

/** Layout widths / breakpoints previously hardcoded across components. */
export const Size = {
  wideBreakpoint: 120,
  promptMaxWidth: 75,
  dialogMedium: 60,
  dialogLarge: 88,
  dialogXLarge: 116,
  /** Widest a toast card may grow; a notification is read at a glance, not scanned. */
  toastMaxWidth: 60,
  /** Columns the toast card reserves for its right inset and left margin. */
  toastInset: 6,
  /** Terminal rows below which chrome collapses (header detail row, statusbar rule). */
  shortRows: 20,
} as const

/**
 * Theme token names that the brand surface touches. Use with a resolved Theme
 * to pull the canonical accent / highlight / muted color for sigils, idle
 * phrase chrome, and splash transition glyphs.
 */
export const BrandToken = {
  /** Primary brand accent — sigils, idle phrases, splashes (violet/gold per theme). */
  sigil: "accent",
  /** Quiet chrome for secondary brand marks in status bar / chrome bar. */
  chrome: "highlight",
  /** Dimmed brand marks used when the footer / status row is at rest. */
  muted: "muted",
} as const

export type BrandTokenName = (typeof BrandToken)[keyof typeof BrandToken]

/**
 * Resolve a brand token to its RGBA color from a resolved Theme. Provides a
 * single import surface for engine callers that don't otherwise touch the
 * theme module.
 */
export function pickBrandColor(
  theme: { accent: RGBA; highlight?: RGBA },
  name: BrandTokenName = BrandToken.sigil,
): RGBA {
  if (name === BrandToken.sigil) return theme.accent
  return theme.highlight ?? theme.accent
}
