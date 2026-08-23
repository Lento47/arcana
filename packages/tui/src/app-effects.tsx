/**
 * app-effects — side effects, event subscriptions, and lifecycle hooks for App.
 *
 * Extracted from app.tsx to keep the App component focused on rendering.
 * `useAppEffects` is a SolidJS hook called inside the provider tree — it
 * reads context via the standard `use*` hooks and wires up all side effects.
 */
import { createEffect, createSignal, on, batch, onMount, onCleanup } from "solid-js"
import { Flag } from "@arcana/core/flag/flag"
import { APP_NAME, APP_ABBR, COPY } from "./branding"
import * as Selection from "./util/selection"
import { parseStallIntervalMs, startStallWatchdog } from "./util/stall-watchdog"
import { displaySessionTitle } from "./util/session"
import { truncate } from "./util/locale"
import { getLastSseEventMeta } from "./context/sdk"
import { DialogProvider as DialogProviderList } from "./component/dialog-provider"
import { DialogConfirm } from "./ui/dialog-confirm"
import { DialogAlert } from "./ui/dialog-alert"
import * as Model from "./util/model"
import { useRoute } from "./context/route"
import { useSync } from "./context/sync"
import { useLocal } from "./context/local"
import { useKV } from "./context/kv"
import { useSDK } from "./context/sdk"
import { useToast } from "./ui/toast"
import { useDialog } from "./ui/dialog"
import { useEvent } from "./context/event"
import { useProject } from "./context/project"
import { useRenderer } from "@opentui/solid"
import { useClipboard } from "./context/clipboard"
import { useExit } from "./context/exit"
import { useOpencodeKeymap } from "./keymap"
import { useArgs } from "./context/args"


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

/** Accessor type for toggle signals that App passes to buildAppCommands. */
export type AppToggles = {
  terminalTitleEnabled: () => boolean
  setTerminalTitleEnabled: (v: boolean | ((prev: boolean) => boolean)) => void
  pasteSummaryEnabled: () => boolean
  setPasteSummaryEnabled: (v: boolean | ((prev: boolean) => boolean)) => void
  mlRuntimeEnabled: () => boolean
  setMlRuntimeEnabled: (v: boolean | ((prev: boolean) => boolean)) => void
}

/**
 * Wire up all App-level side effects: terminal title, stall watchdog,
 * session continuation/fork, empty-provider dialog, event subscriptions,
 * selection copy intercept, and console copy callback.
 *
 * Must be called inside the provider tree (uses context hooks).
 */
export function useAppEffects(props: {
  attention: { dispose: () => void }
}): AppToggles {
  const route = useRoute()
  const sync = useSync()
  const local = useLocal()
  const kv = useKV()
  const sdk = useSDK()
  const toast = useToast()
  const dialog = useDialog()
  const event = useEvent()
  const project = useProject()
  const renderer = useRenderer()
  const clipboard = useClipboard()
  const exit = useExit()
  const keymap = useOpencodeKeymap()
  const args = useArgs()

  // ── Selection copy intercept ──
  const offSelectionKeys = keymap.intercept(
    "key",
    ({ event: evt }) => {
      if (!Flag.ARCANA_EXPERIMENTAL_DISABLE_COPY_ON_SELECT) return
      Selection.handleSelectionKey(renderer, toast, evt, clipboard)
    },
    { priority: 1 },
  )

  // ── Console copy-to-clipboard ──
  renderer.console.onCopySelection = async (text: string) => {
    if (!text || text.length === 0) return
    await clipboard.write?.(text)
      .then(() => toast.show({ message: COPY.inscribedToClipboard, variant: "info" }))
      .catch(toast.error)
    renderer.clearSelection()
  }

  // ── Local signals for toggles ──
  const [terminalTitleEnabled, setTerminalTitleEnabled] = createSignal(kv.get("terminal_title_enabled", true))
  const [pasteSummaryEnabled, setPasteSummaryEnabled] = createSignal(
    kv.get("paste_summary_enabled", !sync.data.config.experimental?.disable_paste_summary),
  )
  const [mlRuntimeEnabled, setMlRuntimeEnabled] = createSignal(kv.get("ml_runtime_enabled", Flag.ARCANA_ML_RUNTIME))

  // ── Terminal title effect ──
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

  // ── Stall watchdog + args batch ──
  onMount(() => {
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

  // ── Continue effect (--continue flag) ──
  let continued = false
  createEffect(() => {
    // Session discovery is independent from provider/catalog bootstrap. Route
    // as soon as the list is available so the cached shell can paint while the
    // remaining startup projections settle in the background.
    if (continued || !sync.session.listReady || !args.continue) return
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

  // ── Fork effect (--session --fork) ──
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

  // ── Empty provider dialog ──
  createEffect(
    on(
      () => sync.status === "complete" && sync.data.provider.length === 0,
      (isEmpty, wasEmpty) => {
        if (!isEmpty || wasEmpty) return
        dialog.replace(() => <DialogProviderList />)
      },
    ),
  )

  // ── Event subscriptions ──
  const eventUnsubs: (() => void)[] = []

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

  // ── Cleanup ──
  onCleanup(() => {
    offSelectionKeys()
    props.attention.dispose()
    for (const fn of eventUnsubs) {
      try {
        fn()
      } catch {}
    }
  })

  return {
    terminalTitleEnabled,
    setTerminalTitleEnabled,
    pasteSummaryEnabled,
    setPasteSummaryEnabled,
    mlRuntimeEnabled,
    setMlRuntimeEnabled,
  }
}
