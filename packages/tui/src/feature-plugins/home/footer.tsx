import type { TuiPlugin, TuiPluginApi } from "@arcana/plugin/tui"
import type { BuiltinTuiPlugin } from "../builtins"
import { createEffect, createMemo, createSignal, Match, onCleanup, Show, Switch } from "solid-js"
import { abbreviateHome, directoryLabel } from "../../runtime"
import { useTuiPaths } from "../../context/runtime"
import { useHomeSessionDestination } from "../../routes/home/session-destination"
import { Glyph } from "../../branding"
import { Locale } from "../../util/locale"
import { footerDirectoryWidth, rendererWidth } from "../../util/geometry"
import { CliRenderEvents } from "@opentui/core"

const id = "internal:home-footer"

/** The row's own spacing, mirrored from the box below so the budget can count it. */
const GAP = 2
const PADDING = 2

/**
 * The mark the MCP badge leads with. One constant for the glyph that is drawn
 * and the glyph that is measured, so the budget cannot drift from the render.
 */
const MCP_MARK = "⊙"

function Directory(props: { api: TuiPluginApi; budget: number | undefined }) {
  const theme = () => props.api.theme.current
  const destination = useHomeSessionDestination()
  const paths = useTuiPaths()
  const dir = createMemo(() => {
    const selected = destination?.destination()
    if (!selected || selected.type === "new") return
    const branch =
      selected.directory === (props.api.state.path.directory || paths.cwd) ? props.api.state.vcs?.branch : undefined
    return { path: abbreviateHome(selected.directory, paths.home), branch }
  })

  /**
   * A directory too long for the row loses its head, not its tail: `…/packages/tui`
   * still says where you are, where `/home/operator/work/arc…` says where you
   * came from. When the budget is unmeasured the value is passed through and
   * the clip below is what keeps the row honest.
   */
  const label = createMemo(() => {
    const value = dir()
    if (value === undefined) return undefined
    const budget = props.budget
    if (budget === undefined) return value.branch ? `${value.path}:${value.branch}` : value.path
    return directoryLabel(value, budget)
  })

  // `flexShrink={1}` with no floor is what wrapped this text in the first
  // place; the budget above is what keeps it from ever needing to. `wrapMode`
  // is the invariant: a path has no spaces to break at, so word wrap broke it
  // mid-token and grew the footer. None means the worst case is a clip.
  return (
    <Show when={label()}>
      {(value) => (
        <text flexShrink={1} minWidth={0} wrapMode="none" fg={theme().textMuted}>
          {value()}
        </text>
      )}
    </Show>
  )
}

function Mcp(props: { api: TuiPluginApi }) {
  const theme = () => props.api.theme.current
  const list = createMemo(() => props.api.state.mcp())
  const has = createMemo(() => list().length > 0)
  const err = createMemo(() => list().some((item) => item.status === "failed"))
  const count = createMemo(() => list().filter((item) => item.status === "connected").length)

  return (
    <Show when={has()}>
      <box gap={1} flexDirection="row" flexShrink={0}>
        <text wrapMode="none" fg={theme().text}>
          <Switch>
            <Match when={err()}>
              <span style={{ fg: theme().error }}>{MCP_MARK} </span>
            </Match>
            <Match when={true}>
              <span style={{ fg: count() > 0 ? theme().success : theme().textMuted }}>{MCP_MARK} </span>
            </Match>
          </Switch>
          {count()} MCP
        </text>
        <text wrapMode="none" fg={theme().textMuted}>/status</text>
      </box>
    </Show>
  )
}

function Version(props: { api: TuiPluginApi }) {
  const theme = () => props.api.theme.current

  return (
    <box flexShrink={0}>
      <text wrapMode="none" fg={theme().textMuted}>{props.api.app.version}</text>
    </box>
  )
}

function View(props: { api: TuiPluginApi }) {
  const theme = () => props.api.theme.current
  const list = createMemo(() => props.api.state.mcp())
  const mcpVisible = createMemo(() => list().length > 0)

  /**
   * The row lays out against the renderer it was handed rather than a context
   * hook: a plugin is given the renderer, and `useTerminalDimensions()` is
   * undefined outside a live terminal, which would leave the budget unmeasured.
   * The subscription keeps it honest across a resize.
   *
   * An unmeasured width is not an empty directory: arithmetic on it becomes
   * `NaN`, which `Locale.truncateLeft` answers with an empty string, so the
   * guard has to happen here, before the budget exists.
   */
  const [termWidth, setTermWidth] = createSignal(rendererWidth(props.api.renderer))
  createEffect(() => {
    const renderer = props.api.renderer
    if (!renderer) return
    const update = () => setTermWidth(rendererWidth(renderer))
    update()
    renderer.on(CliRenderEvents.RESIZE, update)
    onCleanup(() => renderer.off(CliRenderEvents.RESIZE, update))
  })

  /**
   * What the directory may not have: the sigil, the badge, the version, the
   * one-column space inside the badge, the gaps between the four or five
   * children of the row (including the spacer that pushes the version right),
   * and the box's own padding. The spacer is counted even at zero width because
   * it is a child, and `gap` charges for children whether or not they are wide.
   */
  const directoryBudget = createMemo(() => {
    const width = termWidth()
    if (width === undefined) return undefined
    const connected = list().filter((item) => item.status === "connected").length
    const badge = Locale.displayWidth(`${MCP_MARK} ${connected} MCP`) + 1 + Locale.displayWidth("/status")
    const gaps = (mcpVisible() ? 4 : 3) * GAP
    const reserved =
      Locale.displayWidth(Glyph.sigil) + Locale.displayWidth(props.api.app.version) + (mcpVisible() ? badge : 0) + gaps + PADDING * 2
    return footerDirectoryWidth(width, reserved)
  })

  return (
    <box
      width="100%"
      paddingTop={1}
      paddingBottom={1}
      paddingLeft={PADDING}
      paddingRight={PADDING}
      flexDirection="row"
      flexShrink={0}
      alignItems="center"
      gap={GAP}
    >
      <text flexShrink={0} wrapMode="none" fg={theme().primary}>
        {Glyph.sigil}
      </text>
      <Directory api={props.api} budget={directoryBudget()} />
      <Mcp api={props.api} />
      <box flexGrow={1} />
      <Version api={props.api} />
    </box>
  )
}

const tui: TuiPlugin = async (api) => {
  api.slots.register({
    order: 100,
    slots: {
      home_footer() {
        return <View api={api} />
      },
    },
  })
}

const plugin: BuiltinTuiPlugin = {
  id,
  tui,
}

export default plugin
