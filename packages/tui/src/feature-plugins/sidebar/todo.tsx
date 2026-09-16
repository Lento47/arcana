import type { TuiPlugin, TuiPluginApi } from "@arcana/plugin/tui"
import type { BuiltinTuiPlugin } from "../builtins"
import { createMemo, For, Show, createSignal } from "solid-js"
import { TodoItem } from "../../component/todo-item"

const id = "internal:sidebar-todo"

function View(props: { api: TuiPluginApi; session_id: string }) {
  const [open, setOpen] = createSignal(true)
  const [hovered, setHovered] = createSignal(false)
  const theme = () => props.api.theme.current
  const list = createMemo(() => props.api.state.session.todo(props.session_id))

  return (
    <box>
      <box
        flexDirection="row"
        gap={1}
        onMouseDown={() => list().length > 2 && setOpen((x) => !x)}
        onMouseOver={() => setHovered(true)}
        onMouseOut={() => setHovered(false)}
        backgroundColor={hovered() && list().length > 2 ? theme().backgroundElement : undefined}
      >
        <Show when={list().length > 2}>
          <text fg={theme().text}>{open() ? "▼" : "▶"}</text>
        </Show>
        <text fg={theme().text}>
          <span style={{ fg: theme().accent }}>◆ </span>
          <b>TODO</b>
        </text>
      </box>
      <Show when={list().length <= 2 || open()}>
        <Show when={list().length === 0}>
          <text fg={theme().textMuted}>No tasks yet — the agent's plan will appear here</text>
        </Show>
        <For each={list()}>{(item) => <TodoItem status={item.status} content={item.content} />}</For>
      </Show>
    </box>
  )
}

const tui: TuiPlugin = async (api) => {
  api.slots.register({
    order: 400,
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
