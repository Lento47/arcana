import { render, TimeToFirstDraw, useRenderer, useTerminalDimensions } from "@opentui/solid"
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui"
// Spinner registration (spinner-crash fix B): explicit + idempotent, imported
// FIRST so it always evaluates before any component tree mounts. Bare
// side-effect imports scattered through components are tree-shake/chunk-order
// fragile under Bun compile and caused "[Reconciler] Unknown component type:
// spinner" fatals.
import "./bootstrap-spinner"

import { Deferred, Effect } from "effect"
import { Global } from "@arcana/core/global"
import { Flag } from "@arcana/core/flag/flag"
import { InstallationVersion } from "@arcana/core/installation/version"
import { APP_NAME, APP_ABBR, DOCS_URL, COPY, setLexiconVoice } from "./branding"
import type { RunProofView } from "./proof-view/run-proof-view"
import { buildAppCommands } from "./app-commands"
import {
  type ProofLoadResult,
  loadActiveRunProof,
  stageActiveRunProofRollbackRestore,
  approveActiveRunProofRollbackRestore,
} from "./proof-io"
import * as Selection from "./util/selection"
import { CliRenderEvents, createCliRenderer, MouseButton, type CliRenderer } from "@opentui/core"
import {
  Switch,
  Match,
  createMemo,
  createSignal,
  Show,
  For,
} from "solid-js"
import { useTuiStartup } from "./context/runtime"
import { ArcanaMetricLine, ArcanaSection, ArcanaSurface, ArcanaTapeItem } from "./ui/arcana"
import { PluginRouteMissing } from "./component/plugin-route-missing"
import { useProject } from "./context/project"
import { useEvent } from "./context/event"
import { useSDK } from "./context/sdk"
import { isSpinnerStyle, nextSpinnerStyle, spinnerStyleName } from "./util/spinner-style"
import { densityName, isDensity, nextDensity } from "./shell/command-spine/spine-types"
import { StartupLoading } from "./component/startup-loading"
import { useSync } from "./context/sync"
import { useLocal } from "./context/local"
import { DialogModel } from "./component/dialog-model"
import { useConnected } from "./component/use-connected"
import { DialogMcp } from "./component/dialog-mcp"
import { DialogStatus } from "./component/dialog-status"
import { DialogPermissions } from "./component/dialog-permissions"
import { DialogThemeList } from "./component/dialog-theme-list"
import { DialogHelp } from "./ui/dialog-help"
import { DialogAgent } from "./component/dialog-agent"
import { DialogAgentPrompt } from "./component/dialog-agent-prompt"
import { DialogTools } from "./component/dialog-tools"
import { DialogSoul } from "./component/dialog-soul"
import { DialogSessionList } from "./component/dialog-session-list"
import { DialogWorkspaceList } from "./component/dialog-workspace-list"
import { DialogConsoleOrg } from "./component/dialog-console-org"
import { useTheme } from "./context/theme"
import { Home } from "./routes/home"
import { Session } from "./routes/session"
import { usePromptQueue } from "./context/prompt-queue"
import { Toast, useToast } from "./ui/toast"
import { truncate, truncateMiddle } from "./util/locale"
import { useKV } from "./context/kv"
import { useClipboard } from "./context/clipboard"
import { useExit } from "./context/exit"
import { useRoute } from "./context/route"
import { useDialog } from "./ui/dialog"
import { useArgs, type Args } from "./context/args"

import { usePromptRef } from "./context/prompt"
import { useTuiConfig, type TuiConfig } from "./config"
import { createTuiApiAdapters } from "./plugin/adapters"
import { createTuiApi } from "./plugin/api"
import { createPluginRuntime, usePluginRuntime, type TuiPluginHost } from "./plugin/runtime"
import { ProviderTree } from "./provider-tree"
import { useAppEffects } from "./app-effects"
import { CommandPaletteDialog } from "./component/command-palette"
import {
  COMMAND_PALETTE_COMMAND,
  ARCANA_BASE_MODE,
  registerOpencodeKeymap,
  useBindings,
  useOpencodeKeymap,
} from "./keymap"

import type { EventSource } from "./context/sdk"
import { DialogVariant } from "./component/dialog-variant"
import { createTuiAttention } from "./attention"
import * as TuiAudio from "./audio"
import { win32DisableProcessedInput, win32EnableUtf8Console, win32FlushInputBuffer } from "./terminal-win32"
import { destroyRenderer } from "./util/renderer"
import { cliErrorMessage, errorFormat } from "./util/error"
import { resolveInteractiveStdin } from "./util/stdin"

const appGlobalBindingCommands = [
  "session.list",
  "session.new",
  "session.quick_switch.1",
  "session.quick_switch.2",
  "session.quick_switch.3",
  "session.quick_switch.4",
  "session.quick_switch.5",
  "session.quick_switch.6",
  "session.quick_switch.7",
  "session.quick_switch.8",
  "session.quick_switch.9",
] as const

const appBindingCommands = [
  "command.palette.show",
  "model.list",
  "model.cycle_recent",
  "model.cycle_recent_reverse",
  "model.cycle_favorite",
  "model.cycle_favorite_reverse",
  "agent.list",
  "mcp.list",
  "agent.cycle",
  "agent.cycle.reverse",
  "variant.cycle",
  "variant.list",
  "provider.connect",
  "console.org.switch",
  "arcana.status",
  "theme.switch",
  "theme.switch_mode",
  "theme.mode.lock",
  "help.show",
  "docs.open",
  "workspace.list",
  "app.debug",
  "app.console",
  "app.heap_snapshot",
  "terminal.suspend",
  "terminal.title.toggle",
  "app.toggle.animations",
  "app.toggle.file_context",
  "app.toggle.diffwrap",
  "app.toggle.paste_summary",
  "app.toggle.session_directory_filter",
] as const


export type TuiInput = {
  url: string
  args: Args
  config: TuiConfig.Resolved
  onSnapshot?: () => Promise<string[]>
  directory?: string
  fetch?: typeof fetch
  headers?: RequestInit["headers"]
  events?: EventSource
  pluginHost: TuiPluginHost
  /** Optional pre-created renderer for embedding and deterministic harnesses. */
  renderer?: CliRenderer
}

export const run = Effect.fn("Tui.run")(function* (input: TuiInput) {
  // Apply the configured interface voice (arcane | plain) before anything
  // renders — setLexiconVoice swaps the live branding bindings once at
  // startup; consumers read them at call time.
  setLexiconVoice(input.config.lexicon)
  const global = yield* Global.Service
  const exit = { epilogue: undefined as string | undefined, reason: undefined as unknown }
  const result = yield* Effect.scoped(
    Effect.gen(function* () {
      const { stdin: resolvedStdin } = resolveInteractiveStdin()
      const renderer = yield* Effect.acquireRelease(
        Effect.tryPromise(() =>
          input.renderer
            ? Promise.resolve(input.renderer)
            : createCliRenderer({
                externalOutputMode: "passthrough",
                targetFps: 60,
                gatherStats: false,
                exitOnCtrlC: false,
                useKittyKeyboard: {
                  events: true,
                  allKeysAsEscapes: process.platform === "win32" ? false : (input.config.voice?.enabled ?? false),
                },
                autoFocus: false,
                openConsoleOnError: false,
                stdin: resolvedStdin,
                useMouse: !Flag.ARCANA_DISABLE_MOUSE && input.config.mouse,
                consoleOptions: {
                  keyBindings: [{ name: "y", ctrl: true, action: "copy-selection" }],
                },
              }),
        ),
        (renderer) =>
          Effect.sync(() => {
            destroyRenderer(renderer)
          }),
      )
      win32EnableUtf8Console()
      win32DisableProcessedInput()
      const keymap = createDefaultOpenTuiKeymap(renderer)
      yield* Effect.acquireRelease(
        Effect.sync(() => registerOpencodeKeymap(keymap, renderer, input.config)),
        (unregister) => Effect.sync(unregister),
      )
      const bg = input.config.background
      if (!process.env.NO_COLOR && bg?.enabled && bg.image) {
        yield* Effect.promise(async () => {
          const applyBackground = () => {
            if (renderer.capabilities?.rgb !== true || renderer.isDestroyed) return
            void import("./background").then(async ({ decodeImage, dominantColor }) => {
              const image = await decodeImage(bg.image!)
              if (image && !renderer.isDestroyed) {
                renderer.setBackgroundColor(dominantColor(image, { opacity: bg.opacity ?? 0.5 }))
              }
            })
          }
          if (renderer.capabilities?.rgb === true) {
            applyBackground()
          } else {
            const onCapabilities = () => {
              if (renderer.capabilities?.rgb !== true || renderer.isDestroyed) return
              renderer.off(CliRenderEvents.CAPABILITIES, onCapabilities)
              applyBackground()
            }
            renderer.on(CliRenderEvents.CAPABILITIES, onCapabilities)
          }
        })
      }
      yield* Effect.addFinalizer(() =>
        Effect.promise(async () => {
          try {
            await input.pluginHost.dispose()
          } catch (error) {
            console.error("Failed to dispose TUI plugins", error)
          }
        }),
      )
      yield* Effect.addFinalizer(() => Effect.sync(TuiAudio.dispose))
      const shutdown = yield* Deferred.make<unknown>()
      const onSighup = () => destroyRenderer(renderer)
      yield* Effect.acquireRelease(
        Effect.sync(() => process.on("SIGHUP", onSighup)),
        () => Effect.sync(() => process.off("SIGHUP", onSighup)),
      )
      renderer.once("destroy", () => Deferred.doneUnsafe(shutdown, Effect.void))
      const pluginRuntime = createPluginRuntime()

      yield* Effect.tryPromise(async () => {
        void renderer.getPalette({ size: 16 }).catch(() => undefined)
        const mode = (await renderer.waitForThemeMode(1000)) ?? "dark"
        if (renderer.isDestroyed) return

        await render(() => {
          return (
            <ProviderTree
              mode={mode}
              global={global}
              keymap={keymap}
              pluginRuntime={pluginRuntime}
              config={input.config}
              args={input.args}
              url={input.url}
              directory={input.directory}
              fetch={input.fetch}
              headers={input.headers}
              events={input.events}
              onExit={(reason) => {
                if (renderer.isDestroyed) return
                exit.reason = reason
                destroyRenderer(renderer)
              }}
              setEpilogue={(value) => (exit.epilogue = value)}
            >
              <App
                onSnapshot={input.onSnapshot}
                pluginHost={input.pluginHost}
              />
            </ProviderTree>
          )
        }, renderer)
      })
      yield* Deferred.await(shutdown)
      return { epilogue: exit.epilogue, reason: exit.reason }
    }),
  )
  yield* Effect.sync(() => {
    win32FlushInputBuffer()
    if (result.reason !== undefined)
      process.stderr.write((cliErrorMessage(result.reason) ?? errorFormat(result.reason)) + "\n")
    if (result.epilogue) process.stdout.write(result.epilogue + "\n")
  })
})

export function App(props: { onSnapshot?: () => Promise<string[]>; pluginHost: TuiPluginHost }) {
  const startup = useTuiStartup()
  const tuiConfig = useTuiConfig()
  const route = useRoute()
  const dimensions = useTerminalDimensions()
  const renderer = useRenderer()
  const dialog = useDialog()
  const local = useLocal()
  const kv = useKV()
  const keymap = useOpencodeKeymap()
  const event = useEvent()
  const sdk = useSDK()
  const toast = useToast()
  const themeState = useTheme()
  const { theme, mode, setMode, locked, lock, unlock } = themeState
  const sync = useSync()
  const promptQueue = usePromptQueue()
  const project = useProject()
  const exit = useExit()
  const promptRef = usePromptRef()
  const pluginRuntime = usePluginRuntime()
  const attention = createTuiAttention({ renderer, config: tuiConfig, kv })
  const clipboard = useClipboard()

  const api = createTuiApi(
    createTuiApiAdapters({
      version: InstallationVersion,
      tuiConfig,
      dialog,
      keymap,
      kv,
      route,
      routes: pluginRuntime.routes,
      event,
      sdk,
      sync,
      theme: themeState,
      toast,
      renderer,
      attention,
      Slot: pluginRuntime.Slot,
    }),
  )

  // ── Wire up all side effects via the extracted hook ──
  const {
    terminalTitleEnabled,
    setTerminalTitleEnabled,
    pasteSummaryEnabled,
    setPasteSummaryEnabled,
    mlRuntimeEnabled,
    setMlRuntimeEnabled,
  } = useAppEffects({
    attention,
  })

  const [ready, setReady] = createSignal(false)
  props.pluginHost
    .start({
      api,
      config: tuiConfig,
      runtime: pluginRuntime,
      dispose: () => attention.dispose(),
    })
    .catch((error) => {
      console.error("Failed to load TUI plugins", error)
      toast.show({ message: "Failed to load plugins — check console for details", variant: "error", duration: 8000 })
    })
    .finally(() => {
      if (process.env["ARCANA_PROFILE_STARTUP"]) {
        performance.mark("tui-ready")
        setTimeout(() => {
          const entries = performance.getEntriesByType("measure")
          if (entries.length) {
            process.stderr.write("[profile] Startup phase timings:\n")
            for (const e of entries) {
              process.stderr.write(`[profile] ${e.name.padEnd(80)} ${Math.round(e.duration)}ms\n`)
            }
          }
          const allMarks = performance.getEntriesByType("mark")
          if (allMarks.length >= 2) {
            const total = Math.round(allMarks[allMarks.length - 1].startTime - allMarks[0].startTime)
            process.stderr.write(`[profile] TOTAL${"".padEnd(83)}${total}ms\n`)
          }
          performance.clearMarks()
          performance.clearMeasures()
        }, 0)
      }
      setReady(true)
    })

  const connected = useConnected()
  const currentWorktreeWorkspace = createMemo(() => {
    const workspaceID = project.workspace.current()
    if (!workspaceID) return
    const workspace = project.workspace.get(workspaceID)
    if (workspace?.type !== "worktree" || !workspace.directory) return
    return workspace
  })
  const appCommands = createMemo(() =>
    buildAppCommands({
      dialog,
      sync,
      local,
      kv,
      route,
      sdk,
      toast,
      renderer,
      exit,
      clipboard,
      pluginHost: props.pluginHost,
      currentWorktreeWorkspace: () => currentWorktreeWorkspace(),
      connected: () => connected(),
      mlRuntimeEnabled: () => mlRuntimeEnabled(),
      setMlRuntimeEnabled,
      terminalTitleEnabled: () => terminalTitleEnabled(),
      setTerminalTitleEnabled,
      pasteSummaryEnabled: () => pasteSummaryEnabled(),
      setPasteSummaryEnabled,
      mode: () => mode(),
      setMode,
      locked: () => locked(),
      lock,
      unlock,
      onSnapshot: props.onSnapshot,
    })
  )

  useBindings(() => ({
    commands: appCommands(),
  }))

  useBindings(() => ({
    mode: ARCANA_BASE_MODE,
    bindings: tuiConfig.keybinds.gather("app", appBindingCommands),
  }))

  useBindings(() => ({
    bindings: tuiConfig.keybinds.gather("app.global", appGlobalBindingCommands),
  }))

  useBindings(() => ({
    mode: ARCANA_BASE_MODE,
    enabled: () => {
      const current = promptRef.current
      if (!current?.focused) return true
      return current.current.input === ""
    },
    bindings: tuiConfig.keybinds.gather("app_exit", ["app.exit"]),
  }))

  const plugin = createMemo(() => {
    if (!ready()) return
    if (route.data.type !== "plugin") return
    const render = pluginRuntime.routes.get(route.data.id)
    if (!render) return <PluginRouteMissing id={route.data.id} onHome={() => route.navigate({ type: "home" })} />
    return render({ params: route.data.data })
  })

  return (
    <box
      width={dimensions().width}
      height={dimensions().height}
      flexDirection="column"
      backgroundColor={theme.background}
      onMouseDown={(evt) => {
        if (!Flag.ARCANA_EXPERIMENTAL_DISABLE_COPY_ON_SELECT) return
        if (evt.button !== MouseButton.RIGHT) return

        if (!Selection.copy(renderer, toast, clipboard)) return
        evt.preventDefault()
        evt.stopPropagation()
      }}
      onMouseUp={
        !Flag.ARCANA_EXPERIMENTAL_DISABLE_COPY_ON_SELECT ? () => Selection.copy(renderer, toast, clipboard) : undefined
      }
    >
      <Show when={Flag.ARCANA_SHOW_TTFD}>
        <TimeToFirstDraw />
      </Show>
      {/* D7: one app-global toast surface, above every route (home/session/
          plugin) — per-route <Toast /> instances were deleted from home and
          session so plugin-route toasts had nowhere to render. */}
      <Toast />
      <Show when={ready()}>
        <box flexGrow={1} minHeight={0} flexDirection="column">
          <Switch>
            <Match when={route.data.type === "home"}>
              <Home />
            </Match>
            <Match when={route.data.type === "session"}>
              {/* No `keyed` — <Session /> subscribes to route.sessionID directly
                  (createEffect at routes/session/index.tsx:337 + :1330) and
                  should persist across session switches. Re-mounting on every
                  switch destroys scroll ref, PathFormatterProvider, all 5
                  useBindings, the scrollInterval, and CommandSpineShell's
                  per-session cache. */}
              <Show when={route.data.type === "session"}>
                <Session />
              </Show>
            </Match>
          </Switch>
          {plugin()}
        </box>
        <box flexShrink={0}>
          <pluginRuntime.Slot name="app_bottom" />
        </box>
        <pluginRuntime.Slot name="app" />
      </Show>
      <Show when={!startup.skipInitialLoading}>
        <StartupLoading ready={ready} />
      </Show>
    </box>
  )
}
