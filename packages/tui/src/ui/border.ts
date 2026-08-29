export const EmptyBorder = {
  // Use space (U+0020) instead of empty string for corners/intersections.
  // Empty string produces codePointAt(0) → undefined → 0 in the Uint32Array,
  // which the native drawBox FFI treats as "use default char", causing phantom
  // ┌│└│ corners.  A space renders as an invisible cell.
  topLeft: " ",
  bottomLeft: " ",
  vertical: " ",
  topRight: " ",
  bottomRight: " ",
  horizontal: " ",
  bottomT: " ",
  topT: " ",
  cross: " ",
  leftT: " ",
  rightT: " ",
}

/** Light horizontal/vertical rules for split panes and quiet separators. */
export const HairlineBorder = {
  ...EmptyBorder,
  horizontal: "─",
  vertical: "│",
}

export const SplitBorder = {
  border: ["left" as const, "right" as const],
  customBorderChars: HairlineBorder,
}
