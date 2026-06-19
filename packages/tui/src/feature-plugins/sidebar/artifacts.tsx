import type { TuiPlugin, TuiPluginApi } from "@arcana/plugin/tui"
import type { BuiltinTuiPlugin } from "../builtins"
import { createMemo, createSignal, For, Show } from "solid-js"
import { listArtifacts } from "../../util/artifacts"
import type { ArtifactSummary } from "../../util/artifacts"

const id = "internal:sidebar-artifacts"

function View(props: { api: TuiPluginApi; session_id: string }) {
  const theme = () => props.api.theme.current
  const [selectedId, setSelectedId] = createSignal<string | null>(null)

  const artifacts = createMemo(() => {
    // Force re-evaluate when session changes
    void props.session_id
    return listArtifacts()
  })

  const hasArtifacts = createMemo(() => artifacts().length > 0)

  return (
    <Show when={hasArtifacts()}>
      <box flexDirection="column" gap={1}>
        <text fg={theme().text}>
          <span style={{ fg: theme().accent }}>◇ </span>
          <b>ARTIFACTS</b>
        </text>
        <For each={artifacts()}>
          {(item) => (
            <box
              onMouseUp={() => setSelectedId(selectedId() === item.id ? null : item.id)}
            >
              <text
                fg={selectedId() === item.id ? theme().accent : theme().textMuted}
              >
                {item.type === "svg" || item.type === "html" ? "◈ " : "▣ "}
                {item.title}
                <text fg={theme().textMuted}> v{item.version}</text>
              </text>
            </box>
          )}
        </For>
      </box>
    </Show>
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
