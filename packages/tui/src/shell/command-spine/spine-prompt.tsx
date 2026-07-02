import type { PromptRef } from "../../component/prompt"
import { Prompt } from "../../component/prompt"
import { useTheme } from "../../context/theme"

export function SpinePrompt(props: {
  bind: (r: PromptRef | undefined) => void
  disabled: () => boolean
  visible: () => boolean
  sessionID: string
  toBottom: () => void
}) {
  const { theme: themeObj } = useTheme()
  const t = themeObj as Record<string, unknown>

  return (
    <box flexDirection="column" flexShrink={0}>
      <box flexDirection="row" paddingLeft={2} paddingTop={1}>
        <text width={9} />
        <text fg={t.borderSubtle as any}>└</text>
        <text width={1} />
        <text fg={t.accent as any}>✶</text>
      </box>
      <Prompt
        ref={props.bind}
        disabled={props.disabled()}
        visible={props.visible()}
        onSubmit={props.toBottom}
        sessionID={props.sessionID}
      />
    </box>
  )
}
