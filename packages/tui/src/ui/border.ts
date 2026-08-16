export const EmptyBorder = {
  topLeft: "",
  bottomLeft: "",
  vertical: "",
  topRight: "",
  bottomRight: "",
  horizontal: " ",
  bottomT: "",
  topT: "",
  cross: "",
  leftT: "",
  rightT: "",
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
