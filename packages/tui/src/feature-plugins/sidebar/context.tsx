import type { AssistantMessage } from "@arcana/sdk/v2"
import type { TuiPlugin, TuiPluginApi } from "@arcana/plugin/tui"
import type { BuiltinTuiPlugin } from "../builtins"
import { Lexicon, Glyph } from "../../branding"
import { contextPressure } from "../../util/context-pressure"
import { createMemo, Show } from "solid-js"

const id = "internal:sidebar-context"

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
})

function clampPercent(pct: number): number {
  return Math.max(0, Math.min(100, pct))
}

function View(props: { api: TuiPluginApi; session_id: string }) {
  const theme = () => props.api.theme.current
  const msg = createMemo(() => props.api.state.session.messages(props.session_id))
  const session = createMemo(() => props.api.state.session.get(props.session_id))
  const cost = createMemo(() => session()?.cost ?? 0)

  const state = createMemo(() => {
    const last = msg().findLast((item): item is AssistantMessage => item.role === "assistant" && item.tokens.output > 0)
    if (!last) {
      return {
        tokens: 0,
        percent: null,
      }
    }

    const tokens =
      last.tokens.input + last.tokens.output + last.tokens.reasoning + last.tokens.cache.read + last.tokens.cache.write
    const model = props.api.state.provider.find((item) => item.id === last.providerID)?.models[last.modelID]
    return {
      tokens,
      percent: model?.limit.context ? clampPercent(Math.round((tokens / model.limit.context) * 100)) : null,
    }
  })

  const pressure = createMemo(() => contextPressure(state().percent))

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
      <Show when={pressure()}>
        {(label) => <text fg={label() === "compact now" ? theme().error : theme().warning}>{label()}</text>}
      </Show>
      <text fg={theme().textMuted}>
        {Glyph.diamond} {money.format(cost())} {Lexicon.Token.cost}
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
