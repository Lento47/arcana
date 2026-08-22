import { render, TimeToFirstDraw, useRenderer, useTerminalDimensions } from "@opentui/solid"
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui"
import "opentui-spinner/solid"

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
import { useClipboard } from "./context/clipboard"
import { useExit } from "./context/exit"
import * as Selection from "./util/selection"
import { CliRenderEvents, createCliRenderer, MouseButton, type CliRenderer } from "@opentui/core"
import { useRoute } from "./context/route"
import {
  Switch,
  Match,
  createEffect,
  createMemo,
  createSignal,
  onMount,
  onCleanup,
  batch,
  Show,
  on,
  For,
} from "solid-js"
import { useTuiStartup } from "./context/runtime"
import { useDialog } from "./ui/dialog"
import { ArcanaMetricLine, ArcanaSection, ArcanaSurface, ArcanaTapeItem } from "./ui/arcana"
import { DialogProvider as DialogProviderList } from "./component/dialog-provider"
import { PluginRouteMissing } from "./component/plugin-route-missing"
import { useProject } from "./context/project"
import { useEvent } from "./context/event"
import { useSDK, getLastSseEventMeta } from "./context/sdk"
import { parseStallIntervalMs, startStallWatchdog } from "./util/stall-watchdog"
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
import { DialogAlert } from "./ui/dialog-alert"
import { DialogConfirm } from "./ui/dialog-confirm"
import { Toast, useToast } from "./ui/toast"
import { displaySessionTitle } from "./util/session"
import { truncate, truncateMiddle } from "./util/locale"
import { useKV } from "./context/kv"
import * as Model from "./util/model"
import { useArgs, type Args } from "./context/args"

import { usePromptRef } from "./context/prompt"
import { useTuiConfig, type TuiConfig } from "./config"
import { createTuiApiAdapters } from "./plugin/adapters"
import { createTuiApi } from "./plugin/api"
import { createPluginRuntime, usePluginRuntime, type TuiPluginHost } from "./plugin/runtime"
import { ProviderTree } from "./provider-tree"
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

function errorMessage(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "data" in error &&
    typeof error.data === "object" &&
    error.data !== null &&
    "message" in error.data &&
    typeof error.data.message === "string"
  ) {
    return error.data.message
  }
  return error instanceof Error ? error.message : String(error)
}

function isVersionGreater(left: string, right: string) {
  const parse = (value: string) => {
    const [core, prerelease] = value.replace(/^v/, "").split("-", 2)
    return { core: core.split(".").map((part) => Number.parseInt(part, 10) || 0), prerelease }
  }
  const a = parse(left)
  const b = parse(right)
  for (let index = 0; index < Math.max(a.core.length, b.core.length); index++) {
    const difference = (a.core[index] ?? 0) - (b.core[index] ?? 0)
    if (difference) return difference > 0
  }
  if (a.prerelease === b.prerelease) return false
  if (!a.prerelease) return true
  if (!b.prerelease) return false
  return a.prerelease.localeCompare(b.prerelease, undefined, { numeric: true }) > 0
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
                  // Windows Terminal + kitty "all keys as escapes" floods modifier
                  // CSI on ALT hold and can take the native renderer down. Win32
                  // push-to-talk reads the physical Alt key instead.
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
      // Optional custom background image. Half-block compositing needs truecolor
      // (audit C1/D6): on ANSI-256 terminals RGBA→palette quantization shifts hues
      // and the bottom half of "▀" can inherit the default background (ghosted,
      // mispositioned blocks). Gate on renderer.capabilities.rgb; when truecolor
      // is available, prefer renderer.setBackgroundColor (OSC 11) — mirroring
      // context/theme.tsx — so the terminal itself paints the background instead of
      // a per-frame post-process pass. See background.ts.
      //
      // Capabilities are finalized only after the terminal answers the probe
      // (the renderer re-reads and emits CAPABILITIES in processCapabilitySequence;
      // the snapshot from setupTerminal can still be a pre-detection default). Apply
      // immediately when rgb is already definitive, otherwise wait for the event.
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
            // CAPABILITIES fires once per capability reply (DA1/DA2/XTVERSION arrive
            // progressively), so only tear down once rgb is confirmed true — an early
            // partial snapshot must not discard the listener.
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
        // Prewarm palette before ThemeProvider mounts so `system` theme avoids a first-paint fallback flash.
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
        // Flush profile marks after TUI is interactive
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

  // Let selection copy/dismiss win ahead of normal bindings when explicit copy is required.
  const offSelectionKeys = keymap.intercept(
    "key",
    ({ event }) => {
      if (!Flag.ARCANA_EXPERIMENTAL_DISABLE_COPY_ON_SELECT) return
      Selection.handleSelectionKey(renderer, toast, event, clipboard)
    },
    { priority: 1 },
  )
  const eventUnsubs: (() => void)[] = []
  onCleanup(() => {
    offSelectionKeys()
    attention.dispose()
    for (const fn of eventUnsubs) {
      try {
        fn()
      } catch {}
    }
  })

  // Wire up console copy-to-clipboard via opentui's onCopySelection callback
  renderer.console.onCopySelection = async (text: string) => {
    if (!text || text.length === 0) return

    await clipboard
      .write?.(text)
      .then(() => toast.show({ message: COPY.inscribedToClipboard, variant: "info" }))
      .catch(toast.error)

    renderer.clearSelection()
  }
  const [terminalTitleEnabled, setTerminalTitleEnabled] = createSignal(kv.get("terminal_title_enabled", true))
  const [pasteSummaryEnabled, setPasteSummaryEnabled] = createSignal(
    kv.get("paste_summary_enabled", !sync.data.config.experimental?.disable_paste_summary),
  )
  const [mlRuntimeEnabled, setMlRuntimeEnabled] = createSignal(kv.get("ml_runtime_enabled", Flag.ARCANA_ML_RUNTIME))

  // Update terminal window title based on current route and session
  createEffect(() => {
    if (!terminalTitleEnabled() || Flag.ARCANA_DISABLE_TERMINAL_TITLE) return

    if (route.data.type === "home") {
      renderer.setTerminalTitle("⛧ ARCANA")
      return
    }

    if (route.data.type === "session") {
      const session = sync.session.get(route.data.sessionID)
      if (!session) {
        renderer.setTerminalTitle("⛧ ARCANA")
        return
      }

      const label = displaySessionTitle({
        title: session.title,
        created: session.time?.created,
      })
      const title = truncate(label, 40)
      renderer.setTerminalTitle(`${APP_ABBR} | ${title}`)
      return
    }

    if (route.data.type === "plugin") {
      renderer.setTerminalTitle(`${APP_ABBR} | ${route.data.id}`)
    }
  })

  const args = useArgs()
  onMount(() => {
    // Opt-in long-session freeze detector: ARCANA_DEBUG_STALL_MS=200
    const stallInterval = parseStallIntervalMs()
    if (stallInterval !== undefined) {
      const stopStall = startStallWatchdog({
        intervalMs: stallInterval,
        getSnapshot: () => {
          const data = route.data
          const sessionID = data.type === "session" ? data.sessionID : undefined
          const meta = getLastSseEventMeta()
          return {
            sessionID,
            routeType: data.type,
            msgCount: sessionID ? (sync.data.message[sessionID]?.length ?? 0) : undefined,
            compacting: sessionID ? (sync.data.session_compacting[sessionID] ?? false) : undefined,
            lastEventType: meta.type,
            lastEventAgeMs: meta.at ? Date.now() - meta.at : undefined,
          }
        },
        getHeavySnapshot: () => {
          const data = route.data
          const sessionID = data.type === "session" ? data.sessionID : undefined
          if (!sessionID) return {}
          let partApproxBytes = 0
          const messages = sync.data.message[sessionID] ?? []
          for (const m of messages) {
            const parts = sync.data.part[m.id] ?? []
            for (const p of parts) {
              if (p.type === "text" && typeof p.text === "string") partApproxBytes += p.text.length
              if (p.type === "reasoning" && typeof (p as { text?: string }).text === "string") {
                partApproxBytes += (p as { text: string }).text.length
              }
              if (p.type === "tool" && p.state && typeof p.state === "object") {
                const st = p.state as { output?: string; error?: string }
                if (typeof st.output === "string") partApproxBytes += st.output.length
                if (typeof st.error === "string") partApproxBytes += st.error.length
              }
            }
          }
          return { partApproxBytes }
        },
      })
      onCleanup(stopStall)
    }

    batch(() => {
      if (args.agent) local.agent.set(args.agent)
      if (args.model) {
        const { providerID, modelID } = Model.parse(args.model)
        if (!providerID || !modelID)
          return toast.show({
            variant: "warning",
            message: `Invalid model format: ${args.model}`,
            duration: 3000,
          })
        local.model.set({ providerID, modelID }, { recent: true })
      }
      if (args.sessionID && !args.fork) {
        route.navigate({
          type: "session",
          sessionID: args.sessionID,
        })
      }
    })
  })

  let continued = false
  createEffect(() => {
    // When using -c, session list is loaded in blocking phase, so we can navigate at "partial"
    if (continued || sync.status === "loading" || !args.continue) return
    const match = sync.data.session
      .toSorted((a, b) => b.time.updated - a.time.updated)
      .find((x) => x.parentID === undefined)?.id
    if (match) {
      continued = true
      if (args.fork) {
        void sdk.client.session.fork({ sessionID: match }).then((result) => {
          if (result.data?.id) {
            route.navigate({ type: "session", sessionID: result.data.id })
          } else {
            toast.show({ message: "Failed to fork session", variant: "error" })
          }
        })
      } else {
        route.navigate({ type: "session", sessionID: match })
      }
    }
  })

  // Handle --session with --fork: wait for sync to be fully complete before forking
  // (session list loads in non-blocking phase for --session, so we must wait for "complete"
  // to avoid a race where reconcile overwrites the newly forked session)
  let forked = false
  createEffect(() => {
    if (forked || sync.status !== "complete" || !args.sessionID || !args.fork) return
    forked = true
    void sdk.client.session.fork({ sessionID: args.sessionID }).then((result) => {
      if (result.data?.id) {
        route.navigate({ type: "session", sessionID: result.data.id })
      } else {
        toast.show({ message: "Failed to fork session", variant: "error" })
      }
    })
  })

  createEffect(
    on(
      () => sync.status === "complete" && sync.data.provider.length === 0,
      (isEmpty, wasEmpty) => {
        // only trigger when we transition into an empty-provider state
        if (!isEmpty || wasEmpty) return
        dialog.replace(() => <DialogProviderList />)
      },
    ),
  )

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

  eventUnsubs.push(
    event.on("tui.command.execute", (evt, { workspace }) => {
      if (workspace !== project.workspace.current()) return
      keymap.dispatchCommand(evt.properties.command)
    }),
  )

  eventUnsubs.push(
    event.on("tui.toast.show", (evt, { workspace }) => {
      if (workspace !== project.workspace.current()) return
      toast.show({
        title: evt.properties.title,
        message: evt.properties.message,
        variant: evt.properties.variant,
        duration: evt.properties.duration,
      })
    }),
  )

  eventUnsubs.push(
    event.on("tui.session.select", (evt, { workspace }) => {
      if (workspace !== project.workspace.current()) return
      route.navigate({
        type: "session",
        sessionID: evt.properties.sessionID,
      })
    }),
  )

  eventUnsubs.push(
    event.on("session.deleted", (evt) => {
      if (route.data.type === "session" && route.data.sessionID === evt.properties.info.id) {
        route.navigate({ type: "home" })
        toast.show({
          variant: "info",
          message: "The current session was deleted",
        })
      }
    }),
  )

  eventUnsubs.push(
    event.on("session.error", (evt, { workspace }) => {
      if (workspace !== project.workspace.current()) return
      const error = evt.properties.error
      if (error && typeof error === "object" && error.name === "MessageAbortedError") return
      const message = errorMessage(error)

      toast.show({
        variant: "error",
        message,
        duration: 5000,
      })
    }),
  )

  eventUnsubs.push(
    event.on("installation.update-available", async (evt) => {
      console.log("installation.update-available", evt)
      const version = evt.properties.version

      const skipped = kv.get("skipped_version")
      if (skipped && !isVersionGreater(version, skipped)) return

      const choice = await DialogConfirm.show(
        dialog,
        `Update Available`,
        `A new release v${version} is available. Would you like to update now?`,
        "skip",
      )

      if (choice === false) {
        kv.set("skipped_version", version)
        return
      }

      if (choice !== true) return

      toast.show({
        variant: "info",
        message: `Updating to v${version}...`,
        duration: 30000,
      })

      const result = await sdk.client.global.upgrade({ target: version })

      if (result.error || !result.data?.success) {
        toast.show({
          variant: "error",
          title: "Update Failed",
          message: "Update failed",
          duration: 10000,
        })
        return
      }

      await DialogAlert.show(
        dialog,
        "Update Complete",
        `Successfully updated to ${APP_NAME} v${result.data.version}. Please restart the application.`,
      )

      void exit()
    }),
  )

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
