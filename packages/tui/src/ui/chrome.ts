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

/** Double frame — accent / high-emphasis surfaces. */
export const DoubleBorder = {
  ...EmptyBorder,
  topLeft: "╔",
  topRight: "╗",
  bottomLeft: "╚",
  bottomRight: "╝",
  horizontal: "═",
  vertical: "║",
  topT: "╦",
  bottomT: "╩",
  leftT: "╠",
  rightT: "╣",
  cross: "╬",
}

/** Thin dashed — message separators, subtle dividers. */
export const DashBorder = {
  ...EmptyBorder,
  horizontal: "┈",
  vertical: "┊",
}

/** Heavy vertical rule used for message role rails. */
export const RAIL = "┃"

/** Standard spacing scale (terminal cells). */
export const Space = {
  padX: 2,
  padY: 1,
  gap: 1,
  gapWide: 2,
} as const

/** Layout widths / breakpoints previously hardcoded across components. */
export const Size = {
  sidebarWidth: 42,
  wideBreakpoint: 120,
  promptMaxWidth: 75,
  dialogMedium: 60,
  dialogLarge: 88,
  dialogXLarge: 116,
} as const
