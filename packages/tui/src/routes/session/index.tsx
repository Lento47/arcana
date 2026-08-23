import {
  batch,
  createContext,
  createEffect,
  createMemo,
  createSignal,
  For,
  Match,
  on,
  onCleanup,
  onMount,
  Show,
  Switch,
  untrack,
  useContext,
} from "solid-js"
import { Dynamic } from "solid-js/web"
import path from "node:path"
import { mkdir, writeFile } from "node:fs/promises"
import { recordTuiFeedback } from "../../feedback"
import { Flag } from "@arcana/core/flag/flag"
import type { AuthorityAffordance } from "@arcana/core/crypto/authority-affordance"
import { isDefaultTitle, titleFromUserText } from "../../util/session"
import { framePadding, isDensity } from "../../shell/command-spine/spine-types"
import { useRoute, useRouteData } from "../../context/route"
import { Lexicon, Glyph, AgentSigil, VerbPool } from "../../branding"
import { useProject } from "../../context/project"
import { useSync } from "../../context/sync"
import { useEvent } from "../../context/event"
import { SplitBorder } from "../../ui/border"
import { Size, DashBorder } from "../../ui/chrome"
import { useTuiPaths, useTuiTerminalEnvironment } from "../../context/runtime"
import { Spinner } from "../../component/spinner"
import { SigilSpinner } from "../../component/sigil-spinner"
import { Scramble } from "../../component/scramble"
import { pickVerb } from "../../util/verb"
import { createSyntaxStyleMemo, generateSubtleSyntax, selectedForeground, useTheme } from "../../context/theme"
import { BoxRenderable, ScrollBoxRenderable, addDefaultParsers, TextAttributes, RGBA } from "@opentui/core"
import { Prompt, type PromptRef } from "../../component/prompt"
import type {
  AssistantMessage,
  Message,
  Part,
  Provider,
  ToolPart,
  UserMessage,
  TextPart,
  ReasoningPart as ReasoningPartType,
  SessionStatus,
} from "@arcana/sdk/v2"
import { useLocal } from "../../context/local"
import { Locale } from "../../util/locale"
import { webSearchProviderLabel } from "../../util/tool-display"
import { useRenderer, useTerminalDimensions, type JSX } from "@opentui/solid"
import { useSDK, getLastSseEventMeta, SSE_SILENT_DEATH_MS } from "../../context/sdk"
import { streamState } from "../../context/stream-state"
import { useEditorContext } from "../../context/editor"
import { openEditor } from "../../editor"
import { useDialog } from "../../ui/dialog"
import { DialogAlert } from "../../ui/dialog-alert"
import { TodoItem } from "../../component/todo-item"
import { DialogMessage } from "./dialog-message"
import type { PromptInfo } from "../../component/prompt/history"
import { DialogConfirm } from "../../ui/dialog-confirm"
import { DialogTimeline } from "./dialog-timeline"
import { DialogForkFromTimeline } from "./dialog-fork-from-timeline"
import { context } from "./tool-parts"
import { buildSessionCommands } from "./session-commands"
export {
  UserMessage, AssistantMessage, ReasoningPart, InlineToolRow, context,
  formatSubagentToolcalls, formatSubagentTitle, formatSubagentRetry, formatCompletedSubagentDetail,
  toolDisplay, parseApplyPatchFiles, parseTodos, parseQuestions, parseQuestionAnswers, parseDiagnostics,
} from "./tool-parts"
import { DialogSessionRename } from "../../component/dialog-session-rename"
import { SubagentFooter } from "./subagent-footer.tsx"
import { resolveChildSession } from "./subagent-resolve.ts"
import { filetype } from "../../util/filetype"
import parsers from "../../parsers-config"
import { errorMessage } from "../../util/error"
import { useToast } from "../../ui/toast"
import { useKV } from "../../context/kv.tsx"
import stripAnsi from "strip-ansi"
import { usePromptRef } from "../../context/prompt"
import {
  allOptimisticMessages,
  clearOptimisticMessages,
  filterCoveredOptimistics,
  mergeOptimisticMessages,
  realUserMessageHasText,
  refreshTranscriptOrder,
} from "../../component/prompt/optimistic"
import { useEpilogue } from "../../context/epilogue"
import { normalizePath } from "../../util/path"
import { PermissionPrompt } from "./permission"
import { QuestionPrompt } from "./question"
import { DialogExportOptions } from "../../ui/dialog-export-options"
import * as Model from "../../util/model"
import { computeAssistantDurations, formatTranscript } from "../../util/transcript"
import { getSessionGoal } from "@arcana/core/session/goal"
import { sessionEpilogue } from "../../util/presentation"
import { setPreLayoutSiblingMargin } from "../../util/layout"
import { useTuiConfig } from "../../config"
import { useClipboard } from "../../context/clipboard"
import { nextThinkingMode, reasoningSummary, useThinkingMode, type ThinkingMode } from "../../context/thinking"
import { getScrollAcceleration } from "../../util/scroll"
import { collapseToolOutput } from "../../util/collapse-tool-output"
import { usePluginRuntime } from "../../plugin/runtime"
import { resolveShell, type ShellProps } from "../../shell"
import {
  useApprovalIntegration,
  HttpApprovalOperatorService,
  type ApprovalShellController,
} from "../../shell/command-spine"
import { DialogRetryAction } from "../../component/dialog-retry-action"
import { getRevertDiffFiles } from "../../util/revert-diff"
import { ARCANA_BASE_MODE, useBindings, useCommandShortcut, useOpencodeKeymap } from "../../keymap"
import { PathFormatterProvider, usePathFormatter } from "../../context/path-format"
import { ArtifactViewer } from "./artifact-viewer"
import { getArtifact } from "../../util/artifacts"
import { arcanaTaskFromPart, promptTextFromPart } from "../../arcana/task"
import { arcanaDitherPattern, arcanaDitherTick } from "../../ui/arcana"

addDefaultParsers(parsers.parsers)

/** Shared empty parts array so spine mapper cache keys stay stable. */
const EMPTY_PARTS: Part[] = []

/** Once-per-session attempt to replace ISO default titles when messages load. */
const titleBackfillAttempted = new Set<string>()

const GO_UPSELL_FREE_TIER_LAST_SEEN_AT = "go_upsell_last_seen_at"
const GO_UPSELL_FREE_TIER_DONT_SHOW = "go_upsell_dont_show"
const GO_UPSELL_ACCOUNT_RATE_LIMIT_LAST_SEEN_AT = "go_upsell_account_rate_limit_last_seen_at"
const GO_UPSELL_ACCOUNT_RATE_LIMIT_DONT_SHOW = "go_upsell_account_rate_limit_dont_show"
const GO_UPSELL_WINDOW = 86_400_000 // 24 hrs
const GO_UPSELL_PROVIDERS = new Set(["arcana", "opencode-go"])

type RetryAction = Extract<SessionStatus, { type: "retry" }>["action"]

function goUpsellKeys(action: RetryAction) {
  if (!action) return
  if (!GO_UPSELL_PROVIDERS.has(action.provider)) return
  if (action.reason === "free_tier_limit") {
    return {
      lastSeenAt: GO_UPSELL_FREE_TIER_LAST_SEEN_AT,
      dontShow: GO_UPSELL_FREE_TIER_DONT_SHOW,
    }
  }
  if (action.reason === "account_rate_limit") {
    return {
      lastSeenAt: GO_UPSELL_ACCOUNT_RATE_LIMIT_LAST_SEEN_AT,
      dontShow: GO_UPSELL_ACCOUNT_RATE_LIMIT_DONT_SHOW,
    }
  }
}

const sessionBindingCommands = [
  "session.share",
  "session.rename",
  "session.timeline",
  "session.fork",
  "session.compact",
  "session.unshare",
  "session.undo",
  "session.redo",
  "session.sidebar.toggle",
  "session.toggle.conceal",
  "session.toggle.timestamps",
  "session.toggle.thinking",
  "session.toggle.actions",
  "session.toggle.scrollbar",
  "session.toggle.generic_tool_output",
  "session.toggle.gutter",
  "session.first",
  "session.last",
  "session.messages_last_user",
  "session.message.next",
  "session.message.previous",
  "messages.copy",
  "session.copy",
  "session.export",
  "session.child.first",
  "session.parent",
  "session.child.next",
  "session.child.previous",
] as const

const sessionGlobalBindingCommands = [
  "session.page.up",
  "session.page.down",
  "session.line.up",
  "session.line.down",
  "session.half.page.up",
  "session.half.page.down",
] as const

const sessionGlobalUnfocusedBindingCommands = ["session.first", "session.last"] as const

const EMPTY_MESSAGES: Message[] = []

export function Session() {
  const setEpilogue = useEpilogue()
  const clipboard = useClipboard()
  const writeExport = async (file: string, content: string) => {
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, content)
  }
  const pluginRuntime = usePluginRuntime()
  const route = useRouteData("session")
  const { navigate } = useRoute()
  const sync = useSync()
  const event = useEvent()
  const project = useProject()
  const paths = useTuiPaths()
  const tuiConfig = useTuiConfig()
  const kv = useKV()
  const { theme } = useTheme()
  const promptRef = usePromptRef()
  const session = createMemo(() => sync.session.get(route.sessionID))

  // Density (compact/cozy/spacious): the frame chrome must match what the
  // spine's viewport math subtracts (see frameChrome in spine-types).
  const density = createMemo(() => {
    const stored = kv.get("density")
    return isDensity(stored) ? stored : "cozy"
  })

  // Border pulse on session transition — flash accent, then fade to subtle.
  // Resting color is `borderSubtle`; pulse to `accent` on every sessionID change.
  const [transBorder, setTransBorder] = createSignal(theme.borderSubtle)
  createEffect(() => {
    // Trigger pulse when sessionID changes
    void route.sessionID
    setTransBorder(theme.accent)
    const timer = setTimeout(() => setTransBorder(theme.borderSubtle), 800)
    return () => clearTimeout(timer)
  })

  createEffect(() => {
    const title = Locale.truncate(session()?.title ?? "", 50)
    setEpilogue(sessionEpilogue({ title, sessionID: session()?.id }))
  })
  onCleanup(() => setEpilogue())
  const children = createMemo(() => {
    const parentID = session()?.parentID ?? session()?.id
    return sync.data.session
      .filter((x) => x.parentID === parentID || x.id === parentID)
      .toSorted((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  })
  let orderedTranscript: Message[] | undefined
  const messages = createMemo(() => {
    const stored = sync.data.message[route.sessionID] ?? EMPTY_MESSAGES
    const allOpt = allOptimisticMessages()
    const opt = allOpt.length === 0 ? allOpt : allOpt.filter((m) => m.sessionID === route.sessionID)
    if (opt.length === 0) {
      orderedTranscript = refreshTranscriptOrder(stored, orderedTranscript)
      return orderedTranscript
    }

    // Grok-style: keep local user echo until real TEXT parts exist.
    // SSE often creates the user Message before any TextPart — dropping on
    // bare role:user produces spine "you …" with empty body.
    const acknowledgedMessageIDs = new Set<string>()
    for (const m of stored) {
      if (m.role !== "user" || m.id.startsWith("optimistic-")) continue
      const parts = sync.data.part[m.id] ?? []
      if (!realUserMessageHasText(m, parts)) continue
      acknowledgedMessageIDs.add(m.id)
    }

    const remaining = filterCoveredOptimistics(opt, acknowledgedMessageIDs)
    if (remaining.length === 0) {
      orderedTranscript = refreshTranscriptOrder(stored, orderedTranscript)
      return orderedTranscript
    }
    // Always linearize. The store is id-sorted; walking it as a transcript
    // puts thoughts and later you-rows in the wrong turn after the echo drops.
    orderedTranscript = undefined
    return mergeOptimisticMessages(stored, remaining) as typeof stored
  })
  createEffect(() => {
    const stored = sync.data.message[route.sessionID] ?? []
    const opt = allOptimisticMessages().filter((m) => m.sessionID === route.sessionID)
    if (opt.length === 0) return
    const acknowledgedMessageIDs = new Set<string>()
    for (const m of stored) {
      if (m.role !== "user" || m.id.startsWith("optimistic-")) continue
      const parts = sync.data.part[m.id] ?? []
      if (!realUserMessageHasText(m, parts)) continue
      acknowledgedMessageIDs.add(m.id)
    }
    if (filterCoveredOptimistics(opt, acknowledgedMessageIDs).length === 0) {
      clearOptimisticMessages(route.sessionID)
    }
  })
  const foregroundTasks = createMemo(() =>
    messages().flatMap((message) =>
      (sync.data.part[message.id] ?? []).filter(
        (part): part is ToolPart =>
          part.type === "tool" &&
          part.tool === "task" &&
          part.state.status === "running" &&
          part.state.metadata?.background !== true,
      ),
    ),
  )

  // Single pass over messages to derive the three most commonly consulted
  // indices. This avoids repeated O(n) scans on every message update.
  const messageMeta = createMemo(() => {
    const list = messages()
    const userMessageIDs = new Set<string>()
    let lastAssistant: Message | undefined
    let pending: string | undefined
    // Reverse-scan: most recent assistant message that has NOT yet completed
    // is the one actively streaming. Anything older is either done or queued.
    for (let i = list.length - 1; i >= 0; i--) {
      const message = list[i]
      if (message.role === "user") {
        userMessageIDs.add(message.id)
        continue
      }
      if (message.role !== "assistant") continue
      if (!lastAssistant) lastAssistant = message
      if (!message.time.completed) {
        pending = message.id
        break
      }
    }
    return { userMessageIDs, lastAssistant, pending }
  })
  const userMessageIDs = createMemo(() => messageMeta().userMessageIDs)
  const pending = createMemo(() => messageMeta().pending)
  const lastAssistant = createMemo(() => messageMeta().lastAssistant)

  // Precompute assistant durations from the parent user message in one pass.
  // Each AssistantMessage used to rerun this scan individually.
  // Precompute assistant durations from the parent user message in one pass.
  // Each AssistantMessage used to rerun this scan individually.
  // Returned Map is content-stable — we mutate the same instance in place so
  // downstream consumers (spine mapper memo) keep a stable ref and don't
  // re-run on every re-render. The messages array ref check is the key:
  // when the store replaces the array, the key changes and we rebuild.
  // (The previous "produce() mutates in place" correctness concern was about
  // a stale cache for time.completed flips — those always come with a sync
  // that REPLACES the array, so the key change forces a rebuild here too.)
  let cachedDurationMap: Map<string, number> = new Map()
  let cachedDurationKey: unknown = undefined
  const assistantDuration = createMemo<Map<string, number>>(() => {
    const list = messages()
    const key = list
    if (key === cachedDurationKey) {
      return cachedDurationMap
    }
    cachedDurationKey = key
    cachedDurationMap = computeAssistantDurations(list)
    return cachedDurationMap
  })

  const permissions = createMemo(() => {
    if (session()?.parentID) return []
    return children().flatMap((x) => sync.data.permission[x.id] ?? [])
  })
  const questions = createMemo(() => {
    if (session()?.parentID) return []
    return children().flatMap((x) => sync.data.question[x.id] ?? [])
  })
  const visible = createMemo(() => permissions().length === 0 && questions().length === 0)
  const disabled = createMemo(() => permissions().length > 0 || questions().length > 0)

  const dimensions = useTerminalDimensions()
  const [sidebar, setSidebar] = kv.signal<"auto" | "hide">("sidebar", "auto")
  const [sidebarOpen, setSidebarOpen] = createSignal(false)
  const [conceal, setConceal] = createSignal(true)
  const thinking = useThinkingMode()
  const thinkingMode = thinking.mode
  const showThinking = createMemo(() => true)
  const [timestamps, setTimestamps] = kv.signal<"hide" | "show">("timestamps", "hide")
  const [showDetails, setShowDetails] = kv.signal("tool_details_visibility", true)
  const [showAssistantMetadata, _setShowAssistantMetadata] = kv.signal("assistant_metadata_visibility", true)
  const [showScrollbar, setShowScrollbar] = kv.signal("scrollbar_visible", false)
  const [diffWrapMode] = kv.signal<"word" | "none">("diff_wrap_mode", "word")
  const [_animationsEnabled, _setAnimationsEnabled] = kv.signal("animations_enabled", true)
  const [showGenericToolOutput, setShowGenericToolOutput] = kv.signal("generic_tool_output_visibility", false)
  const [showGutter, setShowGutter] = kv.signal("gutter_visible", true)
  const [viewingArtifact, setViewingArtifact] = createSignal<string | null>(null)

  const wide = createMemo(() => dimensions().width > Size.wideBreakpoint)
  const sidebarVisible = createMemo(() => {
    if (session()?.parentID) return false
    if (sidebarOpen()) return true
    if (sidebar() === "auto" && wide()) return true
    return false
  })
  const showTimestamps = createMemo(() => timestamps() === "show")
  const contentWidth = createMemo(() => dimensions().width - 4)
  const providers = createMemo(() => Model.index(sync.data.provider))

  const scrollAcceleration = createMemo(() => getScrollAcceleration(tuiConfig))
  const toast = useToast()
  const sdk = useSDK()
  const editor = useEditorContext()

  createEffect(() => {
    const sessionID = route.sessionID
    void (async () => {
      const previousWorkspace = untrack(() => project.workspace.current())
      const warm = sync.session.isSynced(sessionID)
      const profile = Flag.ARCANA_PROFILE_SESSION_SWITCH
      const t0 = profile ? performance.now() : 0
      if (profile) {
        performance.mark(`session-switch-start:${sessionID}`)
      }

      // Metadata, recent history, and supplemental projections start together.
      // The route only waits for metadata identity; the shell can render cached
      // data immediately and history/governance settle independently.
      const openTask = sync.session.open(sessionID)
      const syncTask = sync.session.sync(sessionID).catch(() => undefined)

      // Optimistic setup: use cached session data (from session list loaded
      // during bootstrap) to fire workspace/bootstrap and editor reconnect
      // in parallel with the sync, rather than waiting for it.
      const cachedSession = sync.session.get(sessionID)
      let workspaceChanged = false
      if (cachedSession) {
        workspaceChanged = cachedSession.workspaceID !== previousWorkspace
        if (workspaceChanged) {
          project.workspace.set(cachedSession.workspaceID)
          void sync.bootstrap({ fatal: false }).catch(() => {})
        }
        editor.reconnect(cachedSession.directory)
      }

      let session = cachedSession
      try {
        session = (await openTask) ?? session
      } catch {
        // A cached session remains usable during a transient metadata failure.
        // Unknown/new sessions use the bounded retry below.
      }
      const tMetadata = profile ? performance.now() : 0
      // The pending-stub handoff can navigate to the real session while this
      // effect is still suspended. A stale effect must never toast "Session
      // not found" for the old pending id or navigate away from the new one.
      if (route.sessionID !== sessionID) return

      // Resume pattern (AI SDK resume-streams): a cached assistant message
      // that never completed, combined with SSE silence beyond the heartbeat
      // window, means the previous stream died silently (half-open socket)
      // and its tail events never reached this store. Force one REST
      // re-hydration to heal text + verbs. Guarded: only when events
      // previously flowed (at > 0 — a fresh boot has no prior stream), only
      // when the route is still this session, and never while SSE is live
      // (recent heartbeat proves the connection is fine; the watchdog owns
      // the silent-death reconnect).
      if (route.sessionID === sessionID && untrack(() => messageMeta().pending)) {
        const lastSse = getLastSseEventMeta()
        if (lastSse.at > 0 && Date.now() - lastSse.at > SSE_SILENT_DEATH_MS) {
          void sync.session.resync(sessionID).catch(() => {})
        }
      }

      session = sync.session.get(sessionID) ?? session
      if (!session) {
        for (let attempt = 0; attempt < 3 && !session; attempt++) {
          await new Promise((resolve) => setTimeout(resolve, 120 * (attempt + 1)))
          try {
            session = await sync.session.open(sessionID)
          } catch {
            // keep retrying — create+navigate can race the first GET
          }
          session = sync.session.get(sessionID) ?? session
        }
      }
      if (!session) {
        const pendingEcho = allOptimisticMessages().some((item) => item.sessionID === sessionID)
        if (pendingEcho) return
        toast.show({
          message: `Session not found: ${sessionID}`,
          variant: "error",
          duration: 5000,
        })
        navigate({ type: "home" })
        return
      }

      // If no cached data was available (rare — session not in list), do
      // workspace/editor setup now that we have the fresh sync result.
      if (!cachedSession) {
        workspaceChanged = session.workspaceID !== previousWorkspace
        if (workspaceChanged) {
          project.workspace.set(session.workspaceID)
          void sync.bootstrap({ fatal: false }).catch(() => {})
        }
        editor.reconnect(session.directory)
      }

      await sync.session.hydrateHistory(sessionID)
      const tHistory = profile ? performance.now() : 0
      if (route.sessionID !== sessionID) return
      if (route.sessionID === sessionID && scroll) scroll.scrollBy(100_000)
      historySettled = true

      // Layer D: lazy backfill — old sessions stuck on "New session - <ISO>" get a
      // name from first user text once messages are in the store. Never clobbers
      // custom titles (isDefaultTitle gate). Fire-and-forget; one attempt per id.
      if (
        route.sessionID === sessionID &&
        isDefaultTitle(session.title) &&
        !titleBackfillAttempted.has(sessionID)
      ) {
        titleBackfillAttempted.add(sessionID)
        const messages = sync.data.message[sessionID] ?? []
        let raw: string | undefined
        for (const msg of messages) {
          if (msg.role !== "user") continue
          const parts = sync.data.part[msg.id] ?? []
          const chunks: string[] = []
          for (const part of parts) {
            if (part.type !== "text" || typeof part.text !== "string") continue
            if ("synthetic" in part && part.synthetic) continue
            chunks.push(part.text)
          }
          if (chunks.length) {
            raw = chunks.join("\n")
            break
          }
        }
        const next = raw ? titleFromUserText(raw) : undefined
        if (next) {
          void sdk.client.session
            .update({ sessionID, title: next })
            .then(() => {
              // Keep local list in sync even if the SSE update is delayed.
              const live = sync.session.get(sessionID)
              if (live && isDefaultTitle(live.title)) {
                sync.session.upsert({ ...live, title: next })
              }
            })
            .catch(() => {
              titleBackfillAttempted.delete(sessionID)
            })
        }
      }

      if (profile && route.sessionID === sessionID) {
        await syncTask
        if (route.sessionID !== sessionID) return
        const tEnd = performance.now()
        performance.mark(`session-switch-end:${sessionID}`)
        try {
          performance.measure(
            `session-switch:${sessionID}`,
            `session-switch-start:${sessionID}`,
            `session-switch-end:${sessionID}`,
          )
        } catch {
          // marks may collide on rapid re-entry; log still has wall times
        }
        // stderr so it never pollutes chat transcript
        const loadState = sync.session.loadState(sessionID)
        console.error("[session-switch]", {
          sessionID,
          warm,
          workspaceChanged,
          inputReadyMs: loadState.startedAt !== undefined && loadState.inputReadyAt !== undefined
            ? loadState.inputReadyAt - loadState.startedAt
            : undefined,
          metadataMs: Math.round(tMetadata - t0),
          historyMs: Math.round(tHistory - t0),
          fullHydrationMs: Math.round(tEnd - t0),
          totalMs: Math.round(tEnd - t0),
          loadState: {
            metadata: loadState.metadata,
            history: loadState.history,
            supplemental: loadState.supplemental,
          },
          msgCount: sync.data.message[sessionID]?.length ?? 0,
        })
      }
    })().catch((error) => {
      if (route.sessionID !== sessionID) return
      toast.show({
        message: errorMessage(error),
        variant: "error",
        duration: 5000,
      })
      navigate({ type: "home" })
    })
  })

  let lastSwitch: string | undefined = undefined
  let seeded = false
  let scroll: ScrollBoxRenderable
  let prompt: PromptRef | undefined
  let scrollInterval: ReturnType<typeof setInterval> | undefined
  let scrollExhausted = false
  /**
   * Open-sequence latch: older-page polling must not race the initial
   * hydration + snap-to-bottom. Before this flips true, scroll.y is ~0 on a
   * near-empty viewport, and each prepended page's height-compensation keeps
   * the viewport pinned at top — so an early tick would crawl page after page
   * through the entire history of large sessions.
   */
  let historySettled = false

  // Reset per-session state when the route changes — `lastSwitch`, `seeded`
  // and the scroll-loading poll must not leak across sessions.
  createEffect(
    on(
      () => route.sessionID,
      (id, prev) => {
        if (id === prev) return
        lastSwitch = undefined
        seeded = false
        scrollExhausted = false
        historySettled = false
        orderedTranscript = undefined
        if (prev) sync.session.pruneLoaded(prev)
        if (scrollInterval) {
          clearInterval(scrollInterval)
          scrollInterval = undefined
        }
      },
    ),
  )

  const unsubPart = event.on("message.part.updated", (evt) => {
    const part = evt.properties.part
    if (part.sessionID !== route.sessionID) return
    // Follow streaming text: keep the view pinned to the newest content
    // while the operator is already at the bottom (same behavior as the
    // Desktop chat). Never yank the viewport when the user scrolled up.
    if (part.type !== "tool") {
      followIfAtBottom()
      return
    }
    if (part.state.status !== "completed") return
    if (part.id === lastSwitch) return

    if (part.tool === "plan_exit") {
      local.agent.set("build")
      lastSwitch = part.id
    } else if (part.tool === "plan_enter") {
      local.agent.set("plan")
      lastSwitch = part.id
    }
  })
  onCleanup(unsubPart)

  // Periodically check if the user has scrolled to the top and load older messages
  onMount(() => {
    scrollInterval = setInterval(async () => {
      if (!scroll || scroll.isDestroyed) return
      if (scrollExhausted) return
      // Older-page latch: ignore ticks until the open sequence has hydrated
      // and snapped to bottom — see historySettled above.
      if (!historySettled) return
      // Trigger when within 3 rows of the top
      if (scroll.y > 3) return
      const prevHeight = scroll.scrollHeight
      const loaded = await sync.session.loadOlder(route.sessionID)
      if (!loaded) {
        scrollExhausted = true
        return
      }
      // Compensate scroll position by the added content height so the
      // user stays at the same viewport position.
      scroll.scrollBy(scroll.scrollHeight - prevHeight)
    }, 500)
  })
  onCleanup(() => clearInterval(scrollInterval))
  const bind = (r: PromptRef | undefined) => {
    prompt = r
    promptRef.set(r)
    if (seeded || !route.prompt || !r) return
    seeded = true
    r.set(route.prompt)
  }
  const keymap = useOpencodeKeymap()
  const dialog = useDialog()
  const renderer = useRenderer()

  const unsubStatus = event.on("session.status", (evt) => {
    if (evt.properties.sessionID !== route.sessionID) return
    if (evt.properties.status.type !== "retry") return
    if (!evt.properties.status.action) return
    if (dialog.stack.length > 0) return

    const keys = goUpsellKeys(evt.properties.status.action)
    if (!keys) return

    const seen = kv.get(keys.lastSeenAt)
    if (typeof seen === "number" && Date.now() - seen < GO_UPSELL_WINDOW) return

    if (kv.get(keys.dontShow)) return

    void DialogRetryAction.show(dialog, evt.properties.status.action).then((dontShowAgain) => {
      if (dontShowAgain) kv.set(keys.dontShow, true)
      kv.set(keys.lastSeenAt, Date.now())
    })
  })
  onCleanup(unsubStatus)

  // SSE gap-closer: the event stream can drop mid-exchange (daemon
  // re-registration, parser buffer discard at EOF). Events carry no id,
  // so replay is impossible — re-hydrate the active session from REST
  // after every reconnect. Idempotent; failure just leaves the sync
  // guard cleared for the next attempt.
  const unsubReconnect = event.subscribe((evt) => {
    if ((evt as { type: string }).type !== "sse.reconnected") return
    void sync.session.resync(route.sessionID).catch(() => {})
  })
  onCleanup(unsubReconnect)

  // Divergence detection + authoritative repair (P12). The engine numbers
  // every state-bearing event per stream (handlers/event.ts) and heartbeats
  // carry headSequence = the highest sequence enqueued before the tick.
  // If headSequence outruns what the sync store applied, events were
  // dropped or failed to apply: reconcile the active session from REST.
  // Grace of 4 covers transient in-flight lag during healthy streaming;
  // a real stall (frozen part) leaves applied behind and converges within
  // one heartbeat.
  const HEARTBEAT_GAP_GRACE = 4
  const unsubHeartbeat = event.subscribe((evt) => {
    if ((evt as { type: string }).type !== "server.heartbeat") return
    const transport = (evt as { transport?: { headSequence?: number } }).transport
    const head = transport?.headSequence
    if (typeof head !== "number") return
    if (head - streamState.lastApplied > HEARTBEAT_GAP_GRACE) {
      // Detection point: what diverged, and by how much. The repair itself
      // logs per-part before/after (reconcile applied ... changed=N).
      console.warn(
        `[arcana] stream gap session=${route.sessionID} head=${head} applied=${streamState.lastApplied} lag=${head - streamState.lastApplied} -> reconcile`,
      )
      void sync.session.reconcile(route.sessionID, "heartbeat-gap", head).catch(() => {})
    }
  })
  onCleanup(unsubHeartbeat)

  // Helper: Find next visible message boundary in direction.
  // Build a single Set of message IDs with valid text parts so we do not
  // perform an O(n) find + per-child parts scan for every renderable child.
  // Cache key includes message ids + part revisions so streaming text does
  // not reuse a stale set, while n/p in an unchanged scene still skips the scan.
  let visibleIDsCache: { key: string; ids: Set<string> } | undefined
  const computeVisibleIDs = (childrenCount: number): Set<string> => {
    const messagesList = messages()
    const revisions = sync.data.part_revision
    let key = `${messagesList.length}:${childrenCount}`
    for (const message of messagesList) {
      key += `|${message.id}:${revisions[message.id] ?? 0}`
    }
    if (visibleIDsCache && visibleIDsCache.key === key) return visibleIDsCache.ids
    const ids = new Set<string>()
    for (const message of messagesList) {
      const parts = sync.data.part[message.id]
      if (!parts || !Array.isArray(parts)) continue
      if (parts.some((part) => part && part.type === "text" && !part.synthetic && !part.ignored)) {
        ids.add(message.id)
      }
    }
    visibleIDsCache = { key, ids }
    return ids
  }

  const findNextVisibleMessage = (direction: "next" | "prev"): string | null => {
    const children = scroll.getChildren()
    const scrollTop = scroll.y
    const visibleIDs = computeVisibleIDs(children.length)

    const visibleMessages = children
      .filter((c) => c.id !== undefined && visibleIDs.has(c.id))
      .sort((a, b) => a.y - b.y)

    if (visibleMessages.length === 0) return null

    if (direction === "next") {
      // Find first message below current position
      return visibleMessages.find((c) => c.y > scrollTop + 10)?.id ?? null
    }
    // Find last message above current position
    return visibleMessages.findLast((c) => c.y < scrollTop - 10)?.id ?? null
  }

  // Helper: Scroll to message in direction or fallback to page scroll
  const scrollToMessage = (direction: "next" | "prev", dialog: ReturnType<typeof useDialog>) => {
    const targetID = findNextVisibleMessage(direction)

    if (!targetID) {
      scroll.scrollBy(direction === "next" ? scroll.height : -scroll.height)
      dialog.clear()
      return
    }

    const child = scroll.getChildren().find((c) => c.id === targetID)
    if (child) scroll.scrollBy(child.y - scroll.y - 1)
    dialog.clear()
  }

  function toBottom() {
    setTimeout(() => {
      if (!scroll || scroll.isDestroyed) return
      scroll.scrollTo(scroll.scrollHeight)
    }, 50)
  }

  function followIfAtBottom() {
    setTimeout(() => {
      if (!scroll || scroll.isDestroyed) return
      const s = scroll
      const remaining = s.scrollHeight - s.y - s.height
      if (remaining > 3) return
      s.scrollTo(s.scrollHeight)
    }, 50)
  }

  const local = useLocal()

  /**
   * Self-healing dive: a subagent card may lack its child link (engine stamped
   * it after the card rendered, or the child is not in the local list yet).
   * Refresh sessions, resolve the child by actor title (newest fallback), then
   * navigate. Keeps Enter/click on a delegated card working in every case.
   */
  async function resolveAndEnterChild(entry: { kind: string; actor?: string }) {
    if (entry.kind !== "agent") return
    // Authoritative: ask the engine for this parent's children directly. The
    // project session list may lag or omit subagent sessions, which is why
    // the previous list-refresh path kept reporting "not found".
    let children: Array<{ id: string; parentID?: string | null; title?: string | null; time?: { created?: number } }> = []
    try {
      const res = await sdk.client.session.children({ sessionID: route.sessionID })
      children = (res.data ?? []) as typeof children
    } catch (error) {
      console.warn("[subagent-dive] children endpoint failed", error)
      // Fall back to the local session store.
    }
    if (children.length === 0) {
      await sync.session.refresh().catch(() => undefined)
      children = sync.data.session.filter((s) => s.parentID === route.sessionID)
    }
    const childID = resolveChildSession({
      actor: entry.actor,
      parentID: route.sessionID,
      sessions: children,
    })
    if (childID) return enterChild(childID)
    toast.show({ message: "Subagent session not found yet — try again in a moment", variant: "info" })
  }

  async function enterChild(sessionID: string) {
    // Preflight only metadata identity. History and governance already start
    // concurrently and must not delay entering the child context.
    await sync.session.open(sessionID).catch(() => undefined)
    if (!sync.session.get(sessionID)) {
      toast.show({
        message: `Session not found: ${sessionID.slice(0, 8)}…`,
        variant: "error",
        duration: 5000,
      })
      return
    }
    navigate({
      type: "session",
      sessionID,
    })
    const status = sync.data.session_status[sessionID]
    if (status?.type === "retry") void DialogAlert.show(dialog, "Retry Error", status.message)
  }

  function moveFirstChild() {
    if (children().length === 1) return
    const next = children().find((x) => !!x.parentID)
    if (next) enterChild(next.id)
  }

  function moveChild(direction: number) {
    if (children().length === 1) return

    const sessions = children().filter((x) => !!x.parentID)
    let next = sessions.findIndex((x) => x.id === session()?.id) - direction

    if (next >= sessions.length) next = 0
    if (next < 0) next = sessions.length - 1
    if (sessions[next]) enterChild(sessions[next].id)
  }

  function childSessionHandler(func: () => void) {
    return () => {
      if (!session()?.parentID || dialog.stack.length > 0) return
      func()
    }
  }

  const shareUrl = createMemo(() => session()?.share?.url)
  const shareEnabled = createMemo(() => sync.data.config.share !== "disabled")
  const hasRevert = createMemo(() => !!session()?.revert?.messageID)
  const hasParent = createMemo(() => !!session()?.parentID)
  const hasForegroundTasks = createMemo(() => foregroundTasks().length > 0)
  const shareTitle = createMemo(() => (shareUrl() ? "Copy share link" : "Share session"))
  const sidebarTitle = createMemo(() => (sidebarVisible() ? "Hide sidebar" : "Show sidebar"))
  const concealTitle = createMemo(() => (conceal() ? "Disable code concealment" : "Enable code concealment"))
  const timestampsTitle = createMemo(() => (showTimestamps() ? "Hide timestamps" : "Show timestamps"))
  const thinkingTitle = createMemo(() =>
    nextThinkingMode(thinkingMode()) === "hide" ? "Collapse thinking" : "Expand thinking",
  )
  const detailsTitle = createMemo(() => (showDetails() ? "Hide tool details" : "Show tool details"))
  const genericToolTitle = createMemo(() =>
    showGenericToolOutput() ? "Hide generic tool output" : "Show generic tool output",
  )
  const gutterTitle = createMemo(() => (showGutter() ? "Hide step-index numbers" : "Show step-index numbers"))

  const sessionCommandList = createMemo(() =>
    buildSessionCommands({
      route,
      sdk,
      sync,
      dialog,
      toast,
      kv,
      clipboard,
      messages,
      session,
      lastAssistant,
      shareTitle,
      shareEnabled,
      shareUrl,
      hasRevert,
      sidebarTitle,
      sidebarVisible,
      setSidebar,
      setSidebarOpen,
      concealTitle,
      setConceal,
      timestampsTitle,
      setTimestamps,
      thinkingTitle,
      thinkingMode,
      thinking,
      showThinking,
      showDetails,
      showAssistantMetadata,
      detailsTitle,
      setShowDetails,
      genericToolTitle,
      setShowGenericToolOutput,
      gutterTitle,
      setShowGutter,
      setShowScrollbar,
      scrollToMessage,
      toBottom,
      local,
      project,
      renderer,
      paths,
      openEditor,
      writeExport,
      hasForegroundTasks,
      hasParent,
      navigate,
      moveChild,
      moveFirstChild,
      childSessionHandler,
      view: {
        get scroll() {
          return scroll
        },
        get prompt() {
          return prompt
        },
      },
    }),
  )

  const sessionCommands = createMemo(() =>
    sessionCommandList().map((command) => ({
      namespace: "palette",
      name: command.value,
      desc: "description" in command ? command.description : undefined,
      slashName: "slash" in command ? command.slash?.name : undefined,
      slashAliases: "slash" in command ? command.slash?.aliases : undefined,
      ...command,
    })),
  )

  useBindings(() => ({
    commands: sessionCommands(),
  }))

  useBindings(() => ({
    bindings: tuiConfig.keybinds.gather("session.global", sessionGlobalBindingCommands),
  }))

  useBindings(() => ({
    enabled: () => renderer.currentFocusedEditor === null,
    bindings: tuiConfig.keybinds.gather("session.global.unfocused", sessionGlobalUnfocusedBindingCommands),
  }))

  useBindings(() => ({
    mode: ARCANA_BASE_MODE,
    bindings: tuiConfig.keybinds.gather("session", sessionBindingCommands),
  }))

  useBindings(() => ({
    mode: ARCANA_BASE_MODE,
    enabled: hasForegroundTasks(),
    priority: 1,
    bindings: tuiConfig.keybinds.get("session.background"),
  }))

  const revertInfo = createMemo(() => session()?.revert)
  const revertMessageID = createMemo(() => revertInfo()?.messageID)

  const revertDiffFiles = createMemo(() => getRevertDiffFiles(revertInfo()?.diff ?? ""))

  const revertRevertedMessages = createMemo(() => {
    const messageID = revertMessageID()
    if (!messageID) return []
    return messages().filter((x) => x.id >= messageID && x.role === "user")
  })

  const revert = createMemo(() => {
    const info = revertInfo()
    if (!info) return
    if (!info.messageID) return
    return {
      messageID: info.messageID,
      reverted: revertRevertedMessages(),
      diff: info.diff,
      diffFiles: revertDiffFiles(),
    }
  })

  const ShellCmp = createMemo(() => resolveShell(tuiConfig.shell))

  // ─── TUI-2.1 (RB-01): durable approval integration ─────────────
  // Approvals arrive via the sync channel (sync.data.approvals); operator
  // commands go through the engine HTTP endpoint via the bridge. The engine
  // records workspace_id = session_id (session-scoped records), so the
  // isolation check compares against sessionID to stay consistent.
  // Durable approvals are session-scoped. Include subagent-owned approvals
  // (parentSessionId === this session) so a pending gate raised inside a
  // delegated child is visible while watching the parent — marked as
  // subagent work, decided through the child's own session path.
  const approvals = createMemo(() =>
    Object.values(sync.data.approvals).filter(
      (a) => a.sessionId === route.sessionID || a.parentSessionId === route.sessionID,
    ),
  )
  const [approvalAffordances, setApprovalAffordances] = createSignal<
    ReadonlyMap<string, readonly AuthorityAffordance[]>
  >(new Map())

  // Runtime-owned affordances: fetch the per-approval read model with the
  // exact-request fields this surface displayed. The runtime decides stale,
  // route, surface, workspace, and fallback eligibility; this component only
  // renders the result. Fail-closed: any fetch error yields no affordances,
  // so no action can be inferred locally.
  createEffect(() => {
    const list = approvals()
    if (list.length === 0) {
      setApprovalAffordances(new Map())
      return
    }
    let cancelled = false
    const tasks = list.map(async (approval) => {
      try {
        const response = await sdk.client.approval.affordances(
          {
            // The session path must be the approval's OWN session — the
            // engine's affordance handler refuses cross-session reads, so
            // subagent approvals resolve through their child session.
            sessionID: approval.sessionId,
            approvalID: approval.approvalId,
            viewedVersion: String(approval.version),
            viewedRequestHash: approval.requestHash,
            viewedContractRevision: String(approval.contractRevision),
          },
          { throwOnError: true } as never,
        )
        return { approvalId: approval.approvalId, affordances: response.data ?? [] } as const
      } catch {
        return { approvalId: approval.approvalId, affordances: [] } as const
      }
    })
    void Promise.all(tasks).then((entries) => {
      if (cancelled) return
      const next = new Map<string, readonly AuthorityAffordance[]>()
      for (const entry of entries) next.set(entry.approvalId, entry.affordances)
      setApprovalAffordances(next)
    })
    onCleanup(() => {
      cancelled = true
    })
  })

  const governanceSnapshot = createMemo(() => sync.data.governance[route.sessionID])
  const governance = createMemo(() => governanceSnapshot()?.events ?? [])
  const activeWorkspaceId = () => route.sessionID
  const approvalBridge = new HttpApprovalOperatorService({
    baseUrl: sdk.url,
    getSessionId: () => route.sessionID,
    getWorkspaceId: activeWorkspaceId,
    getApprovals: approvals,
    getAffordances: (approvalId) => approvalAffordances().get(approvalId),
  })
  const approvalIntegration = useApprovalIntegration({
    approvals,
    approvalAffordances,
    service: approvalBridge,
    session: { sessionId: route.sessionID, workspaceId: activeWorkspaceId(), operatorId: "operator" },
    onShellStateChange: () => {},
  })

  const shellProps = createMemo(
    () =>
      ({
        scrollRef: (r) => {
          scroll = r
        },
        showScrollbar,
        scrollAcceleration: scrollAcceleration(),

        messages,
        historyLoading: () => sync.session.loadState(route.sessionID).history === "loading",
        getParts: (messageId: string) => {
          const stored = sync.data.part[messageId]
          if (stored) return stored
          // Synthesize a TextPart for optimistic user messages so the
          // spine mapper can render the prompt text before the SSE
          // message.part.updated event arrives.
          if (messageId.startsWith("optimistic-")) {
            const opt = allOptimisticMessages().find((m) => m.id === messageId)
            if (opt) {
              return [
                {
                  id: `${messageId}:text`,
                  type: "text" as const,
                  text: opt.text,
                  sessionID: opt.sessionID,
                  messageID: messageId,
                },
              ] as TextPart[]
            }
          }
          // Stable empty array — a fresh `[]` every call busts the spine message cache.
          return EMPTY_PARTS
        },
        getPartRevision: (messageId: string) => sync.data.part_revision[messageId] ?? 0,
        revert,
        pending,
        lastAssistant,
        assistantDuration,

        permissions,
        questions,
        session,
        sessionList: () => sync.data.session,
        sessionStatus: () => sync.data.session_status[route.sessionID],
        visible,
        disabled,
        sessionID: route.sessionID,

        // TUI-2.1 (RB-01): durable approval shell props
        approvals,
        approvalAffordances,
        approvalController: approvalIntegration.controller,
        // Audit PR-2: verified immutable request snapshot for the inspector.
        approvalDetailLoader: (approvalId) => approvalBridge.fetchApprovalSnapshot(approvalId),
        activeSessionId: () => route.sessionID,
        activeWorkspaceId,
        governance,
        governanceTrace: () => governanceSnapshot()?.trace,
        governanceProof: () => governanceSnapshot()?.proof,

        toBottom,
        bind,
        setPrompt: (info) => prompt?.set(info),

        viewingArtifact,
        setViewingArtifact,

        showGutter,
        theme,
        transBorder,

        onNavigateToSession: enterChild,
        onResolveChild: resolveAndEnterChild,
      }) as ShellProps,
  )

  // snap to bottom when session changes
  createEffect(on(() => route.sessionID, toBottom))

  return (
    <PathFormatterProvider path={session()?.directory}>
      <context.Provider
        value={{
          get width() {
            return contentWidth()
          },
          sessionID: route.sessionID,
          conceal,
          thinkingMode,
          showThinking,
          showTimestamps,
          showDetails,
          showGenericToolOutput,
          showGutter,
          userMessageIDs,
          diffWrapMode,
          providers,
          sync,
          tui: tuiConfig,
          enterChild,
        }}
      >
        <box flexDirection="row" flexGrow={1} minHeight={0}>
          <box
            flexGrow={1}
            minHeight={0}
            paddingBottom={density() === "compact" ? 0 : 1}
            paddingLeft={framePadding(density())}
            paddingRight={framePadding(density())}
            gap={1}
            border={["left", "right"]}
            borderColor={transBorder()}
          >
            <Show when={session() || allOptimisticMessages().some((item) => item.sessionID === route.sessionID)}>
              <Dynamic component={ShellCmp()} {...shellProps()} />
            </Show>
          </box>
        </box>
        <Show when={viewingArtifact()}>
          {(id) => {
            const artifact = getArtifact(id())
            if (!artifact) return null
            return (
              <box position="absolute" width="100%" height="100%" zIndex={10}>
                <ArtifactViewer
                  artifact={artifact}
                  onClose={() => setViewingArtifact(null)}
                />
              </box>
            )
          }}
        </Show>
      </context.Provider>
    </PathFormatterProvider>
  )
}
