import { Show } from "solid-js"
import { useRoute } from "../../context/route"
import { useSync } from "../../context/sync"
import { useTheme } from "../../context/theme"
import { useCommandShortcut, useOpencodeKeymap } from "../../keymap"
import { Locale } from "../../util/locale"

/**
 * Breadcrumb shown while inside a subagent (child) session: an obvious way
 * back to the parent without hunting for the footer action. Clicking it (or
 * pressing the session.parent shortcut) navigates to the parent session.
 */
export function SubagentBreadcrumb(props: { parentID: string }) {
  const route = useRoute()
  const sync = useSync()
  const keymap = useOpencodeKeymap()
  const shortcut = useCommandShortcut("session.parent")
  const { theme } = useTheme()

  const parent = () => sync.session.get(props.parentID)

  const back = () => {
    if (sync.session.get(props.parentID)) {
      route.navigate({ type: "session", sessionID: props.parentID })
    } else {
      // Parent not in the local store yet — refresh once, then navigate.
      void sync.session.sync(props.parentID).then(() => {
        if (sync.session.get(props.parentID)) {
          route.navigate({ type: "session", sessionID: props.parentID })
        }
      })
    }
  }

  return (
    <box flexDirection="row" flexShrink={0} paddingLeft={1} paddingRight={1} paddingBottom={1}>
      <box
        flexDirection="row"
        onMouseUp={back}
        backgroundColor={theme.backgroundElement}
        paddingLeft={1}
        paddingRight={1}
      >
        <text fg={theme.accent}>← back to </text>
        <text fg={theme.text}>{Locale.truncate(parent()?.title ?? "parent session", 44)}</text>
        <Show when={shortcut()}>
          <text fg={theme.textMuted}> · {shortcut()}</text>
        </Show>
      </box>
    </box>
  )
}
