import { useTheme } from "../../context/theme"

export function SpineGutter(props: { index: number; elapsed: string; layout: string }) {
  const { theme: themeObj } = useTheme()
  const t = themeObj as Record<string, unknown>
  const padded = props.index.toString().padStart(2, "0")

  if (props.layout === "minimal") {
    return (
      <text fg={t.textMuted as any} width={5}>
        {padded}
      </text>
    )
  }

  return (
    <text fg={t.textMuted as any} width={9}>
      {padded} {props.elapsed}
    </text>
  )
}
