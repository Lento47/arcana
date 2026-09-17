import type { TuiPlugin, TuiPluginApi } from "@arcana/plugin/tui"
import { Space } from "../../ui/chrome"
import type { BuiltinTuiPlugin } from "../builtins"
import { createMemo, createSignal, Show } from "solid-js"
import { abbreviateHome } from "../../runtime"
import { useTuiPaths } from "../../context/runtime"
import { APP_NAME, Glyph } from "../../branding"
import { Locale } from "../../util/locale"

const id = "internal:sidebar-footer"

/** The sidebar column's own content budget, as the modified-files list beside
 *  the path assumes. */
const LINE_BUDGET = 36

function View(props: { api: TuiPluginApi; sessionID: string }) {
  const paths = useTuiPaths()
  const theme = () => props.api.theme.current
  const has = createMemo(() =>
    props.api.state.provider.some(
      (item) => item.id !== "arcana" || Object.values(item.models).some((model) => model.cost?.input !== 0),
    ),
  )
  const done = createMemo(() => props.api.kv.get("dismissed_getting_started", false))
  const [dismissHovered, setDismissHovered] = createSignal(false)
  const show = createMemo(() => !has() && !done())
  const path = createMemo(() => {
    const session = props.api.state.session.get(props.sessionID)
    const dir = session?.directory || props.api.state.path.directory || paths.cwd
    const out = abbreviateHome(dir, paths.home)
    const branch = session?.directory === props.api.state.path.directory ? props.api.state.vcs?.branch : undefined
    const text = branch ? out + ":" + branch : out
    const list = text.split("/")
    return {
      parent: list.slice(0, -1).join("/"),
      name: list.at(-1) ?? "",
    }
  })

  /**
   * The one line of the footer that can be any length at all: an absolute path
   * out of a deep checkout runs past the column, and a path has no spaces for
   * word wrap to break at, so it broke mid-token and grew the footer to three
   * lines. It now loses its head, not its tail — `…/packages/tui` still says
   * where you are, where a clipped `/home/operator/wor` says only where you
   * came from — and the name is measured first so it is never the part that
   * goes. The budget is the column's own, the same 36 the modified-files list
   * beside it budgets against.
   */
  const place = createMemo(() => {
    const { parent, name } = path()
    const tail = Locale.displayWidth(name) > LINE_BUDGET ? Locale.truncateLeft(name, LINE_BUDGET) : name
    const room = LINE_BUDGET - Locale.displayWidth(tail) - 1
    const head =
      room < 1
        ? ""
        : Locale.displayWidth(parent) + 1 <= room
          ? `${parent}/`
          : `${Locale.truncateLeft(parent, room - 1)}/`
    return { head, tail }
  })

  return (
    <box gap={Space.gap}>
      <Show when={show()}>
        <box
          backgroundColor={theme().backgroundElement}
          paddingTop={Space.padY}
          paddingBottom={Space.padY}
          paddingLeft={Space.padX}
          paddingRight={Space.padX}
          flexDirection="row"
          gap={Space.gap}
        >
          <text flexShrink={0} fg={theme().text}>
            ⬖
          </text>
          <box flexGrow={1} gap={Space.gap}>
            <box flexDirection="row" justifyContent="space-between">
              <text fg={theme().text}>
                <b>Getting Started</b>
              </text>
              {/* The dismiss is a control at the card's edge: reserved, and
                  never the thing that wraps. The heading beside it is elastic. */}
              <text
                fg={dismissHovered() ? theme().text : theme().textMuted}
                onMouseDown={() => props.api.kv.set("dismissed_getting_started", true)}
                onMouseOver={() => setDismissHovered(true)}
                onMouseOut={() => setDismissHovered(false)}
                wrapMode="none"
                flexShrink={0}
              >
                ✕
              </text>
            </box>
            <text fg={theme().textMuted}>{APP_NAME} includes free models so you can start immediately.</text>
            <text fg={theme().textMuted}>
              Connect from 75+ providers to use other models, including Claude, GPT, and Gemini
            </text>
            <box flexDirection="row" gap={Space.gap} justifyContent="space-between">
              <text fg={theme().text}>Connect Provider</text>
              {/* The command is a readout: whole, at its own width, at the
                  card's right edge. It is not a word to wrap. */}
              <text fg={theme().textMuted} wrapMode="none" flexShrink={0}>
                /connect
              </text>
            </box>
          </box>
        </box>
      </Show>
      <text wrapMode="none">
        <span style={{ fg: theme().textMuted }}>{place().head}</span>
        <span style={{ fg: theme().text }}>{place().tail}</span>
      </text>
      <text fg={theme().textMuted}>
        <span style={{ fg: theme().primary }}>{Glyph.sigil}</span>{" "}
        <span style={{ fg: theme().text }}>
          <b>{APP_NAME}</b>
        </span>{" "}
        <span>{props.api.app.version}</span>
      </text>
    </box>
  )
}

const tui: TuiPlugin = async (api) => {
  api.slots.register({
    order: 100,
    slots: {
      sidebar_footer(_ctx, props) {
        return <View api={api} sessionID={props.session_id} />
      },
    },
  })
}

const plugin: BuiltinTuiPlugin = {
  id,
  tui,
}

export default plugin
