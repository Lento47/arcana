import type { TuiPlugin, TuiPluginApi } from "@arcana/plugin/tui"
import { Space } from "../../ui/chrome"
import type { BuiltinTuiPlugin } from "../builtins"
import { createMemo, createSignal, For, Show } from "solid-js"
import { listArtifacts } from "../../util/artifacts"
import type { ArtifactSummary } from "../../util/artifacts"

const id = "internal:sidebar-artifacts"

/** Sidebar rows are a preview, not a browser; cap the list so a large
 *  ~/.arcana/artifacts directory cannot bloat the sidebar render. */
const MAX_VISIBLE_ARTIFACTS = 12

function View(props: { api: TuiPluginApi; session_id: string }) {
  const theme = () => props.api.theme.current
  const [selectedId, setSelectedId] = createSignal<string | null>(null)

  const artifacts = createMemo(() => {
    // Force re-evaluate when session changes
    void props.session_id
    return listArtifacts()
  })

  const visible = createMemo(() => artifacts().slice(0, MAX_VISIBLE_ARTIFACTS))
  const hidden = createMemo(() => Math.max(0, artifacts().length - visible().length))

  return (
    <box flexDirection="column" gap={Space.gap}>
      <text fg={theme().text}>
        <span style={{ fg: theme().accent }}>◇ </span>
        <b>ARTIFACTS</b>
      </text>
      <Show when={artifacts().length === 0}>
        <text fg={theme().textMuted}>No artifacts yet — they appear here as they are created</text>
      </Show>
      <For each={visible()}>
        {(item) => {
          const [hovered, setHovered] = createSignal(false)
          return (
            <box
              onMouseUp={() => setSelectedId(selectedId() === item.id ? null : item.id)}
              onMouseOver={() => setHovered(true)}
              onMouseOut={() => setHovered(false)}
              backgroundColor={hovered() ? theme().backgroundElement : undefined}
            >
              <text
                fg={selectedId() === item.id ? theme().accent : theme().textMuted}
                wrapMode="none"
                truncate
              >
                {item.type === "svg" || item.type === "html" ? "◈ " : "▣ "}
                {item.title}
                <span style={{ fg: theme().textMuted }}> v{item.version}</span>
              </text>
            </box>
          )
        }}
      </For>
      <Show when={hidden() > 0}>
        <text fg={theme().textMuted}>+{hidden()} more in ~/.arcana/artifacts</text>
      </Show>
    </box>
  )
}

const tui: TuiPlugin = async (api) => {
  api.slots.register({
    order: 150,
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
