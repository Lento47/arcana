import { useTheme } from "../../context/theme"

/**
 * Per-row forensic error fallback. One broken row renders this local line
 * (source file + message) instead of crashing the whole spine.
 */
export function SpineRowError(props: {
  /** Source file the row was rendered from - e.g. "spine-entry.tsx". */
  file: string
  error: Error
}) {
  const { theme } = useTheme()
  return (
    <box flexDirection="row" flexShrink={0} width="100%" paddingLeft={1}>
      <text fg={theme.error} wrapMode="word">
        spine row error
      </text>
      <text fg={theme.textMuted} wrapMode="word">
        {" \u00B7 file: "}{props.file}{" \u00B7 "}{props.error.message}
      </text>
    </box>
  )
}
