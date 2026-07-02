import { Show } from "solid-js"
import { useTheme } from "../../context/theme"

export function SpineHeader(props: { session: () => { id: string; title?: string } | undefined }) {
  const { theme: themeObj } = useTheme()
  const t = themeObj as Record<string, unknown>

  return (
    <box flexDirection="row" height={1} paddingLeft={2} paddingRight={2} paddingTop={1}>
      <text fg={t.primary as any}>ARCANA</text>
      <box flexGrow={1} />
      <Show when={props.session()?.title}>
        <text fg={t.textMuted as any}>{props.session()!.title}</text>
      </Show>
    </box>
  )
}
