import type { AssistantMessage } from "@arcana/sdk/v2"
import type { TuiPlugin, TuiPluginApi } from "@arcana/plugin/tui"
import type { BuiltinTuiPlugin } from "../builtins"
import { Lexicon, Glyph } from "../../branding"
import { contextUsageFor, hasContextUsage, type ContextUsageSnapshot } from "../../util/context-pressure"
import { Locale } from "../../util/locale"
import { createMemo, Show } from "solid-js"

const id = "internal:sidebar-context"

function View(props: { api: TuiPluginApi; session_id: string }) {
  const theme = () => props.api.theme.current
  const msg = createMemo(() => props.api.state.session.messages(props.session_id))
  const session = createMemo(() => props.api.state.session.get(props.session_id))
  const cost = createMemo(() => session()?.cost ?? 0)

  const state = createMemo<ContextUsageSnapshot>(() => {
    const last = msg().findLast(
      (item): item is AssistantMessage => item.role === "assistant" && hasContextUsage(item.tokens),
    )
    if (!last) {
      return {
        tokens: 0,
        percent: null,
        overBudget: false,
        pressure: undefined,
        performanceBudget: 0,
        performanceHot: false,
      }
    }
    const model = props.api.state?.provider?.find((item) => item.id === last.providerID)?.models[last.modelID]
    return contextUsageFor({
      tokens: last.tokens,
      limit: model?.limit,
      compaction: props.api.state?.config?.compaction,
    })
  })

  return (
    <box>
      <text fg={theme().text}>
        <span style={{ fg: theme().accent }}>◆ </span>
        <b>CONTEXT</b>
      </text>
      <text fg={theme().textMuted}>
        {Glyph.charge} {state().tokens.toLocaleString()} {Lexicon.Token.label}
      </text>
      <text fg={theme().textMuted}>
        {Glyph.meter} {state().percent ?? 0}%
      </text>
      <Show when={state().pressure}>
        {(label) => <text fg={label() === "compact now" ? theme().error : theme().warning}>{label()}</text>}
      </Show>
      <Show when={state().performanceHot}>
        <text fg={theme().warning}>
          over budget · {Locale.number(state().performanceBudget)}
        </text>
      </Show>
      <text fg={theme().textMuted}>
        {Glyph.diamond} {Locale.currency(cost())} {Lexicon.Token.cost}
      </text>
    </box>
  )
}

const tui: TuiPlugin = async (api) => {
  api.slots.register({
    order: 100,
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
