import type { TuiPlugin, TuiPluginApi } from "@arcana/plugin/tui"
import { Space } from "../../ui/chrome"
import type { BuiltinTuiPlugin } from "../builtins"
import { createMemo, For, Show, createSignal } from "solid-js"
import { Locale } from "../../util/locale"

const id = "internal:sidebar-files"

function changeCountWidth(item: { additions: number; deletions: number }) {
  return [item.additions ? `+${item.additions}` : "", item.deletions ? `-${item.deletions}` : ""]
    .filter(Boolean)
    .join(" ").length
}

function View(props: { api: TuiPluginApi; session_id: string }) {
  const [open, setOpen] = createSignal(true)
  const [hovered, setHovered] = createSignal(false)
  const theme = () => props.api.theme.current
  const list = createMemo(() => props.api.state.session.diff(props.session_id))

  return (
    <box>
      <box
        flexDirection="row"
        gap={Space.gap}
        onMouseDown={() => list().length > 2 && setOpen((x) => !x)}
        onMouseOver={() => setHovered(true)}
        onMouseOut={() => setHovered(false)}
        backgroundColor={hovered() && list().length > 2 ? theme().backgroundElement : undefined}
      >
        {/* The carets are the affordance and the label is the heading: both are
            fixed, so neither is the segment the row gives up. The label is only
            18 columns against the column's 38, and this is the one row here
            that is a hover target — a heading that decoded would be a control
            that no longer says what it opens. */}
        <Show when={list().length > 2}>
          <text fg={theme().text} wrapMode="none" flexShrink={0}>
            {open() ? "▼" : "▶"}
          </text>
        </Show>
        <text fg={theme().text} wrapMode="none" flexShrink={0}>
          <span style={{ fg: theme().accent }}>◆ </span>
          <b>MODIFIED FILES</b>
        </text>
      </box>
      <Show when={list().length <= 2 || open()}>
        <Show when={list().length === 0}>
          <text fg={theme().textMuted}>No files changed yet — edits will appear here</text>
        </Show>
        <For each={list()}>
          {(item) => (
            <box flexDirection="row" gap={Space.gap} justifyContent="space-between">
              <text fg={theme().textMuted} wrapMode="none">
                {Locale.truncateLeft(item.file, Math.max(2, 36 - changeCountWidth(item)))}
              </text>
              <box flexDirection="row" gap={Space.gap} flexShrink={0}>
                <Show when={item.additions}>
                  <text fg={theme().diffAdded}>+{item.additions}</text>
                </Show>
                <Show when={item.deletions}>
                  <text fg={theme().diffRemoved}>-{item.deletions}</text>
                </Show>
              </box>
            </box>
          )}
        </For>
      </Show>
    </box>
  )
}

const tui: TuiPlugin = async (api) => {
  api.slots.register({
    order: 500,
    slots: {
      sidebar_content(_ctx, props) {
        return <View api={api} session_id={props.session_id} />
      },
    },
  })
}

const plugin: BuiltinTuiPlugin = {
  id,
  tui,
}

export default plugin
