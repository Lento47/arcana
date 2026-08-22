/** @jsxImportSource @opentui/solid */
/**
 * Session command palette builder (extracted from routes/session/index.tsx).
 *
 * Receives every reactive dependency through `deps`; command bodies read them
 * late-bound so behavior is identical to the original inline definitions.
 * `deps.view` is a live container for the let-bound scroll/prompt renderer
 * refs (upstream supplies property getters, so late binding survives the
 * module boundary).
 */
import type { ScrollBoxRenderable } from "@opentui/core"
import { batch } from "solid-js"
import { recordTuiFeedback } from "../../feedback"
import { openEditor } from "../../editor"
import type { PromptInfo } from "../../component/prompt/history"
import { DialogExportOptions } from "../../ui/dialog-export-options"
import { nextThinkingMode } from "../../context/thinking"
import { promptTextFromPart } from "../../arcana/task"
import { formatTranscript } from "../../util/transcript"
import { getSessionGoal } from "@arcana/core/session/goal"
import path from "node:path"
import { DialogSessionRename } from "../../component/dialog-session-rename"
import { DialogConfirm } from "../../ui/dialog-confirm"
import { DialogTimeline } from "./dialog-timeline"
import { DialogForkFromTimeline } from "./dialog-fork-from-timeline"

/* eslint-disable @typescript-eslint/no-explicit-any */

export type SessionCommandSpec = {
  title: string
  value: string
  category: string
  description?: string
  slash?: { name: string; aliases?: string[] }
  enabled?: boolean
  suggested?: boolean
  hidden?: boolean
  run: (event?: unknown) => unknown
}

export type SessionCommandsDeps = {
  route: { sessionID: string; type: string }
  sdk: any
  sync: any
  dialog: any
  toast: { show: (t: any) => void }
  kv: { get: (k: string, d?: any) => any; set: (k: string, v: any) => void }
  clipboard: { write?: (text: string) => Promise<any> }
  messages: () => any[]
  session: () => any
  lastAssistant: () => any
  shareTitle: () => string
  shareEnabled: () => boolean
  shareUrl: () => string | undefined
  hasRevert: () => boolean
  sidebarTitle: () => string
  sidebarVisible: () => boolean
  setSidebar: any
  setSidebarOpen: (v: boolean) => void
  concealTitle: () => string
  setConceal: any
  timestampsTitle: () => string
  setTimestamps: any
  thinkingTitle: () => string
  thinkingMode: () => any
  thinking: { set: (m: any) => void }
  showThinking: () => boolean
  showDetails: () => boolean
  showAssistantMetadata: () => boolean
  detailsTitle: () => string
  setShowDetails: any
  genericToolTitle: () => string
  setShowGenericToolOutput: any
  gutterTitle: () => string
  setShowGutter: any
  setShowScrollbar: any
  scrollToMessage: (dir: "next" | "prev", dialog: any) => void
  toBottom: () => void
  local: any
  project: any
  renderer: any
  paths: { cwd: string }
  openEditor: (o: any) => Promise<any>
  writeExport: (f: string, c: string) => Promise<void>
  hasForegroundTasks: () => boolean
  hasParent: () => boolean
  navigate: (r: any) => void
  moveChild: (delta: number) => void
  moveFirstChild: () => void
  childSessionHandler: (fn: () => void) => () => void
  view: {
    scroll: ScrollBoxRenderable
    prompt: any
  }
}

export function buildSessionCommands(deps: SessionCommandsDeps): SessionCommandSpec[] {
  const {
    route, sdk, sync, dialog, toast, kv, clipboard,
    messages, session, lastAssistant,
    shareTitle, shareEnabled, shareUrl, hasRevert,
    sidebarTitle, sidebarVisible, setSidebar, setSidebarOpen,
    concealTitle, setConceal, timestampsTitle, setTimestamps,
    thinkingTitle, thinkingMode, thinking, showThinking,
    showDetails, showAssistantMetadata,
    detailsTitle, setShowDetails,
    genericToolTitle, setShowGenericToolOutput,
    gutterTitle, setShowGutter, setShowScrollbar,
    scrollToMessage, toBottom,
    local, project, renderer, paths,
    openEditor, writeExport,
    hasForegroundTasks, hasParent, navigate,
    moveChild, moveFirstChild, childSessionHandler,
    view,
  } = deps
  const { scroll, prompt } = view

  return [
    {
      title: "Rate last response 👍",
      value: "session.feedback_good",
      category: "Session",
      slash: { name: "good" },
      run: async () => {
        const msg = lastAssistant()
        if (!msg) {
          toast.show({ message: "No response to rate yet", variant: "warning" })
          return
        }
        await recordTuiFeedback({ sessionID: route.sessionID, messageID: msg.id, rating: "up" })
          .then(() => toast.show({ message: "Thanks — feedback recorded 👍", variant: "success" }))
          .catch(() => toast.show({ message: "Failed to record feedback", variant: "error" }))
        dialog.clear()
      },
    },
    {
      title: "Rate last response 👎",
      value: "session.feedback_bad",
      category: "Session",
      slash: { name: "bad" },
      run: async () => {
        const msg = lastAssistant()
        if (!msg) {
          toast.show({ message: "No response to rate yet", variant: "warning" })
          return
        }
        await recordTuiFeedback({ sessionID: route.sessionID, messageID: msg.id, rating: "down" })
          .then(() => toast.show({ message: "Thanks — feedback recorded 👎", variant: "success" }))
          .catch(() => toast.show({ message: "Failed to record feedback", variant: "error" }))
        dialog.clear()
      },
    },
    {
      title: shareTitle(),
      value: "session.share",
      suggested: route.type === "session",
      category: "Session",
      enabled: shareEnabled(),
      slash: {
        name: "share",
      },
      run: async () => {
        const copy = (url: string) =>
          clipboard
            .write?.(url)
            .then(() => toast.show({ message: "Share URL copied to clipboard!", variant: "success" }))
            .catch(() => toast.show({ message: "Failed to copy URL to clipboard", variant: "error" }))
        const url = session()?.share?.url
        if (url) {
          await copy(url)
          dialog.clear()
          return
        }
        if (!kv.get("share_consent", false)) {
          const ok = await DialogConfirm.show(dialog, "Share Session", "Are you sure you want to share it?")
          if (ok !== true) return
          kv.set("share_consent", true)
        }
        await sdk.client.session
          .share({
            sessionID: route.sessionID,
          })
          .then((res: any) => copy(res.data!.share!.url))
          .catch((error: any) => {
            toast.show({
              message: error instanceof Error ? error.message : "Failed to share session",
              variant: "error",
            })
          })
        dialog.clear()
      },
    },
    {
      title: "Rename session",
      value: "session.rename",
      category: "Session",
      slash: {
        name: "rename",
      },
      run: () => {
        dialog.replace(() => <DialogSessionRename session={route.sessionID} />)
      },
    },
    {
      title: "Jump to message",
      value: "session.timeline",
      category: "Session",
      slash: {
        name: "timeline",
      },
      run: () => {
        dialog.replace(() => (
          <DialogTimeline
            onMove={(messageID) => {
              const child = view.scroll.getChildren().find((child) => {
                return child.id === messageID
              })
              if (child) view.scroll.scrollBy(child.y - view.scroll.y - 1)
            }}
            sessionID={route.sessionID}
            setPrompt={(promptInfo) => view.prompt?.set(promptInfo)}
          />
        ))
      },
    },
    {
      title: "Fork session",
      value: "session.fork",
      category: "Session",
      slash: {
        name: "fork",
      },
      run: () => {
        dialog.replace(() => (
          <DialogForkFromTimeline
            onMove={(messageID) => {
              if (!messageID) return
              const child = view.scroll.getChildren().find((child) => {
                return child.id === messageID
              })
              if (child) view.scroll.scrollBy(child.y - view.scroll.y - 1)
            }}
            sessionID={route.sessionID}
          />
        ))
      },
    },
    {
      title: "Compact session",
      value: "session.compact",
      category: "Session",
      slash: {
        name: "compact",
        aliases: ["summarize"],
      },
      run: () => {
        const selectedModel = local.model.current()
        if (!selectedModel) {
          toast.show({
            variant: "warning",
            message: "Connect a provider to summarize this session",
            duration: 3000,
          })
          return
        }
        sdk.client.session
          .summarize({
            sessionID: route.sessionID,
            modelID: selectedModel.modelID,
            providerID: selectedModel.providerID,
          })
          .then((response: any) => {
            if (response.error) {
              toast.show({
                variant: "error",
                message: `Compaction failed: ${String(response.error)}`,
                duration: 5000,
              })
            }
          })
          .catch((error: any) => {
            toast.show({
              variant: "error",
              message: `Compaction failed: ${error instanceof Error ? error.message : String(error)}`,
              duration: 5000,
            })
          })
        dialog.clear()
      },
    },
    {
      title: "Unshare session",
      value: "session.unshare",
      category: "Session",
      enabled: !!shareUrl(),
      slash: {
        name: "unshare",
      },
      run: async () => {
        await sdk.client.session
          .unshare({
            sessionID: route.sessionID,
          })
          .then(() => toast.show({ message: "Session unshared successfully", variant: "success" }))
          .catch((error: any) => {
            toast.show({
              message: error instanceof Error ? error.message : "Failed to unshare session",
              variant: "error",
            })
          })
        dialog.clear()
      },
    },
    {
      title: "Undo previous message",
      value: "session.undo",
      category: "Session",
      slash: {
        name: "undo",
      },
      run: async () => {
        const status = sync.data.session_status?.[route.sessionID]
        if (status?.type !== "idle") await sdk.client.session.abort({ sessionID: route.sessionID }).catch(() => {})
        const revert = session()?.revert?.messageID
        const message = messages().findLast((x) => (!revert || x.id < revert) && x.role === "user")
        if (!message) return
        void sdk.client.session
          .revert({
            sessionID: route.sessionID,
            messageID: message.id,
          })
          .then(() => {
            toBottom()
          })
        const parts = sync.data.part[message.id]
        view.prompt?.set(
          parts.reduce(
            (agg: any, part: any) => {
              if (part.type === "text") {
                agg.input += promptTextFromPart(part)
              }
              if (part.type === "file") agg.parts.push(part)
              return agg
            },
            { input: "", parts: [] as PromptInfo["parts"] },
          ),
        )
        dialog.clear()
      },
    },
    {
      title: "Redo",
      value: "session.redo",
      category: "Session",
      enabled: hasRevert(),
      slash: {
        name: "redo",
      },
      run: () => {
        dialog.clear()
        const messageID = session()?.revert?.messageID
        if (!messageID) return
        const message = messages().find((x) => x.role === "user" && x.id > messageID)
        if (!message) {
          void sdk.client.session.unrevert({
            sessionID: route.sessionID,
          })
          view.prompt?.set({ input: "", parts: [] })
          return
        }
        void sdk.client.session.revert({
          sessionID: route.sessionID,
          messageID: message.id,
        })
      },
    },
    {
      title: sidebarTitle(),
      value: "session.sidebar.toggle",
      category: "Session",
      run: () => {
        batch(() => {
          const isVisible = sidebarVisible()
          setSidebar(() => (isVisible ? "hide" : "auto"))
          setSidebarOpen(!isVisible)
        })
        dialog.clear()
      },
    },
    {
      title: concealTitle(),
      value: "session.toggle.conceal",
      category: "Session",
      run: () => {
        setConceal((prev: any) => !prev)
        dialog.clear()
      },
    },
    {
      title: timestampsTitle(),
      value: "session.toggle.timestamps",
      category: "Session",
      slash: {
        name: "timestamps",
        aliases: ["toggle-timestamps"],
      },
      run: () => {
        setTimestamps((prev: any) => (prev === "show" ? "hide" : "show"))
        dialog.clear()
      },
    },
    {
      title: thinkingTitle(),
      value: "session.toggle.thinking",
      category: "Session",
      slash: {
        name: "thinking",
        aliases: ["toggle-thinking"],
      },
      run: () => {
        thinking.set(nextThinkingMode(thinkingMode()))
        dialog.clear()
      },
    },
    {
      title: detailsTitle(),
      value: "session.toggle.actions",
      category: "Session",
      run: () => {
        setShowDetails((prev: any) => !prev)
        dialog.clear()
      },
    },
    {
      title: "Toggle session scrollbar",
      value: "session.toggle.scrollbar",
      category: "Session",
      run: () => {
        setShowScrollbar((prev: any) => !prev)
        dialog.clear()
      },
    },
    {
      title: genericToolTitle(),
      value: "session.toggle.generic_tool_output",
      category: "Session",
      run: () => {
        setShowGenericToolOutput((prev: any) => !prev)
        dialog.clear()
      },
    },
    {
      title: gutterTitle(),
      value: "session.toggle.gutter",
      category: "Session",
      slash: {
        name: "gutter",
        aliases: ["toggle-gutter"],
      },
      run: () => {
        setShowGutter((prev: any) => !prev)
        dialog.clear()
      },
    },
    {
      title: "Page up",
      value: "session.page.up",
      category: "Session",
      hidden: true,
      run: () => {
        view.scroll.scrollBy(-view.scroll.height / 2)
        dialog.clear()
      },
    },
    {
      title: "Page down",
      value: "session.page.down",
      category: "Session",
      hidden: true,
      run: () => {
        view.scroll.scrollBy(view.scroll.height / 2)
        dialog.clear()
      },
    },
    {
      title: "Line up",
      value: "session.line.up",
      category: "Session",
      hidden: true,
      run: () => {
        view.scroll.scrollBy(-1)
        dialog.clear()
      },
    },
    {
      title: "Line down",
      value: "session.line.down",
      category: "Session",
      hidden: true,
      run: () => {
        view.scroll.scrollBy(1)
        dialog.clear()
      },
    },
    {
      title: "Half page up",
      value: "session.half.page.up",
      category: "Session",
      hidden: true,
      run: () => {
        view.scroll.scrollBy(-view.scroll.height / 4)
        dialog.clear()
      },
    },
    {
      title: "Half page down",
      value: "session.half.page.down",
      category: "Session",
      hidden: true,
      run: () => {
        view.scroll.scrollBy(view.scroll.height / 4)
        dialog.clear()
      },
    },
    {
      title: "First message",
      value: "session.first",
      category: "Session",
      hidden: true,
      run: () => {
        view.scroll.scrollTo(0)
        dialog.clear()
      },
    },
    {
      title: "Last message",
      value: "session.last",
      category: "Session",
      hidden: true,
      run: () => {
        view.scroll.scrollTo(view.scroll.scrollHeight)
        dialog.clear()
      },
    },
    {
      title: "Jump to last user message",
      value: "session.messages_last_user",
      category: "Session",
      hidden: true,
      run: () => {
        const messages = sync.data.message[route.sessionID]
        if (!messages || !messages.length) return

        // Find the most recent user message with non-ignored, non-synthetic text parts
        for (let i = messages.length - 1; i >= 0; i--) {
          const message = messages[i]
          if (!message || message.role !== "user") continue

          const parts = sync.data.part[message.id]
          if (!parts || !Array.isArray(parts)) continue

          const hasValidTextPart = parts.some(
            (part: any) => part && part.type === "text" && !part.synthetic && !part.ignored,
          )

          if (hasValidTextPart) {
            const child = view.scroll.getChildren().find((child) => {
              return child.id === message.id
            })
            if (child) view.scroll.scrollBy(child.y - view.scroll.y - 1)
            break
          }
        }
      },
    },
    {
      title: "Next message",
      value: "session.message.next",
      category: "Session",
      hidden: true,
      run: () => scrollToMessage("next", dialog),
    },
    {
      title: "Previous message",
      value: "session.message.previous",
      category: "Session",
      hidden: true,
      run: () => scrollToMessage("prev", dialog),
    },
    {
      title: "Copy last assistant message",
      value: "messages.copy",
      category: "Session",
      run: () => {
        const revertID = session()?.revert?.messageID
        const lastAssistantMessage = messages().findLast(
          (msg) => msg.role === "assistant" && (!revertID || msg.id < revertID),
        )
        if (!lastAssistantMessage) {
          toast.show({ message: "No assistant messages found", variant: "error" })
          dialog.clear()
          return
        }

        const parts = sync.data.part[lastAssistantMessage.id] ?? []
        const textParts = parts.filter((part: any) => part.type === "text")
        if (textParts.length === 0) {
          toast.show({ message: "No text parts found in last assistant message", variant: "error" })
          dialog.clear()
          return
        }

        const text = textParts
          .map((part: any) => part.text)
          .join("\n")
          .trim()
        if (!text) {
          toast.show({
            message: "No text content found in last assistant message",
            variant: "error",
          })
          dialog.clear()
          return
        }

        clipboard
          .write?.(text)
          .then(() => toast.show({ message: "Message copied to clipboard!", variant: "success" }))
          .catch(() => toast.show({ message: "Failed to copy to clipboard", variant: "error" }))
        dialog.clear()
      },
    },
    {
      title: "Copy session transcript",
      value: "session.copy",
      category: "Session",
      slash: {
        name: "copy",
      },
      run: async () => {
        try {
          const sessionData = session()
          if (!sessionData) return
          const sessionMessages = messages()
          const transcript = formatTranscript(
            sessionData,
            sessionMessages.map((msg) => ({ info: msg, parts: sync.data.part[msg.id] ?? [] })),
            {
              thinking: showThinking(),
              toolDetails: showDetails(),
              assistantMetadata: showAssistantMetadata(),
              providers: sync.data.provider,
            },
          )
          await clipboard.write?.(transcript)
          toast.show({ message: "Session transcript copied to clipboard!", variant: "success" })
        } catch {
          toast.show({ message: "Failed to copy session transcript", variant: "error" })
        }
        dialog.clear()
      },
    },
    {
      title: "Export session transcript",
      value: "session.export",
      category: "Session",
      slash: {
        name: "export",
      },
      run: async () => {
        try {
          const sessionData = session()
          if (!sessionData) return
          const sessionMessages = messages()

          const defaultFilename = `session-${sessionData.id.slice(0, 8)}.md`

          const options = await DialogExportOptions.show(
            dialog,
            defaultFilename,
            showThinking(),
            showDetails(),
            showAssistantMetadata(),
            false,
          )

          if (options === null) return

          const transcript = formatTranscript(
            sessionData,
            sessionMessages.map((msg) => ({ info: msg, parts: sync.data.part[msg.id] ?? [] })),
            {
              thinking: options.thinking,
              toolDetails: options.toolDetails,
              assistantMetadata: options.assistantMetadata,
              providers: sync.data.provider,
            },
          )

          if (options.openWithoutSaving) {
            // Just open in editor without saving
            await openEditor({
              renderer,
              value: transcript,
              cwd:
                (project.instance.path().worktree === "/" ? undefined : project.instance.path().worktree) ||
                project.instance.directory() ||
                paths.cwd,
            })
          } else {
            const exportDir = paths.cwd
            const filename = options.filename.trim()
            const filepath = path.join(exportDir, filename)

            await writeExport(filepath, transcript)

            // Open with EDITOR if available
            const result = await openEditor({
              renderer,
              value: transcript,
              cwd:
                (project.instance.path().worktree === "/" ? undefined : project.instance.path().worktree) ||
                project.instance.directory() ||
                paths.cwd,
            })
            if (result !== undefined) {
              await writeExport(filepath, result)
            }

            toast.show({ message: `Session exported to ${filename}`, variant: "success" })
          }
        } catch {
          toast.show({ message: "Failed to export session", variant: "error" })
        }
        dialog.clear()
      },
    },
    {
      title: "Background subagents",
      value: "session.background",
      category: "Session",
      hidden: true,
      enabled: hasForegroundTasks(),
      run: () => {
        void sdk.client.experimental.session.background({
          sessionID: route.sessionID,
          workspace: project.workspace.current(),
        })
        dialog.clear()
      },
    },
    {
      title: "Go to child session",
      value: "session.child.first",
      category: "Session",
      hidden: true,
      run: () => {
        dialog.clear()
        moveFirstChild()
      },
    },
    {
      title: "Go to parent session",
      value: "session.parent",
      category: "Session",
      hidden: true,
      enabled: hasParent(),
      run: childSessionHandler(() => {
        const parentID = session()?.parentID
        if (parentID) {
          navigate({
            type: "session",
            sessionID: parentID,
          })
        }
        dialog.clear()
      }),
    },
    {
      title: "Next child session",
      value: "session.child.next",
      category: "Session",
      hidden: true,
      enabled: hasParent(),
      run: childSessionHandler(() => {
        dialog.clear()
        moveChild(1)
      }),
    },
    {
      title: "Previous child session",
      value: "session.child.previous",
      category: "Session",
      hidden: true,
      enabled: hasParent(),
      run: childSessionHandler(() => {
        dialog.clear()
        moveChild(-1)
      }),
    },
    {
      title: "View contract",
      value: "session.contract",
      category: "Session",
      slash: { name: "contract" },
      run: () => {
        dialog.clear()
        const snap = getSessionGoal(route.sessionID)
        if (snap.status === "unset") {
          toast.show({
            title: "Session contract",
            message: "No active goal. Send a work prompt — Arcana records it as the goal and keeps working until it is satisfied.",
            variant: "info",
            duration: 8000,
          })
          return
        }
        toast.show({
          title: "Session contract",
          message: `Goal: ${snap.goal}\nStatus: ${snap.status}\nScope: ${"scope" in snap ? snap.scope : "—"}\nPriority: ${"priority" in snap ? snap.priority : "—"}`,
          variant: "info",
          duration: 8000,
        })
      },
    },
    {
      title: "Drive / goal status",
      value: "session.loop",
      category: "Session",
      slash: { name: "loop" },
      run: () => {
        dialog.clear()
        const snap = getSessionGoal(route.sessionID)
        if (snap.status === "unset") {
          toast.show({
            title: "Drive",
            message:
              "No active goal. On a work prompt Arcana sets the goal and continues (up to 6 extra loops) until it is satisfied, a question is asked, or you abort.",
            variant: "info",
            duration: 8000,
          })
          return
        }
        toast.show({
          title: "Drive",
          message: `Goal: ${snap.goal}\nStatus: ${snap.status}\nDrive agents (build/general) keep going while this is in_progress.`,
          variant: "info",
          duration: 8000,
        })
      },
    },
    {
      title: "Show verifier status",
      value: "session.verifier",
      category: "Session",
      slash: { name: "verifier" },
      run: () => {
        dialog.clear()
        const status = sync.data.session_status?.[route.sessionID]
        // verifier is not in the sync store type yet — injected by the engine at runtime.
        const verifier = (sync.data as Record<string, any>)?.verifier?.[route.sessionID] as Record<string, any> | undefined
        if (!verifier) {
          toast.show({ message: "No verifier active for this session", variant: "info" })
          return
        }
        toast.show({
          title: "Verifier Status",
          message: `${verifier.checks?.map((c: any) => `${c.check}: ${c.status ?? "pending"}`).join("\n") ?? "no checks"}`,
          variant: "info",
          duration: 8000,
        })
      },
    },
    {
      title: "Show governance actions",
      value: "session.governance",
      category: "Session",
      slash: { name: "governance" },
      run: () => {
        dialog.clear()
        const snapshot = sync.data.governance[route.sessionID]
        const events = snapshot?.events ?? []
        if (!events.length) {
          toast.show({ message: `Governance trace: ${snapshot?.trace.status ?? "UNAVAILABLE"}`, variant: "info" })
          return
        }
        toast.show({
          title: `Governance · ${snapshot.trace.status}`,
          message: events.slice(-8).map((event: any) => `#${event.sequence} ${event.type}`).join("\n"),
          variant: "info",
          duration: 8000,
        })
      },
    },
    {
      title: "View file-edit guard thresholds",
      value: "session.guard",
      category: "Session",
      slash: { name: "guard" },
      run: () => {
        dialog.clear()
        const large = process.env.ARCANA_FILE_EDIT_LARGE_CHANGE_LINES || "30 (default)"
        const wholesale = process.env.ARCANA_FILE_EDIT_WHOLESALE_THRESHOLD || "0.3 (default)"
        const backup = process.env.ARCANA_FILE_EDIT_BACKUP_THRESHOLD || "50 (default)"
        toast.show({
          title: "File Edit Guard Thresholds",
          message: [
            `Large change: >${large} lines changed`,
            `Wholesale: >${wholesale} of file (30%)`,
            `Backup: >${backup} lines changed`,
            "",
            "Override via environment variables:",
            "ARCANA_FILE_EDIT_LARGE_CHANGE_LINES",
            "ARCANA_FILE_EDIT_WHOLESALE_THRESHOLD",
            "ARCANA_FILE_EDIT_BACKUP_THRESHOLD",
          ].join("\n"),
          variant: "info",
          duration: 10000,
        })
      },
    },
  ]
}
