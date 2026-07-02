import { useTheme } from "../../context/theme"
import { spineTone, type SpineKind, type SpineLayout } from "./spine-types"

export function SpineRail(props: { kind: SpineKind; glyph: string; layout: SpineLayout }) {
  const { theme: themeObj } = useTheme()
  const t = themeObj as Record<string, unknown>

  if (props.layout === "minimal") {
    return <text width={2}>{""}</text>
  }

  return (
    <box flexDirection="row" width={4}>
      <text fg={t.borderSubtle as any}>│</text>
      <text width={1} />
      <text fg={spineTone(props.kind, t)}>{props.glyph}</text>
    </box>
  )
}
