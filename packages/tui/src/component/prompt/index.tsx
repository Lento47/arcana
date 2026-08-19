import {
  BoxRenderable,
  RGBA,
  TextareaRenderable,
  MouseEvent,
  PasteEvent,
  decodePasteBytes,
  type KeyEvent,
  type Renderable,
} from "@opentui/core"
import type { CommandContext } from "@opentui/keymap"
import { createEffect, createMemo, onMount, createSignal, onCleanup, on, Show, Switch, Match } from "solid-js"
import "opentui-spinner/solid"
import path from "path"
import { fileURLToPath } from "url"
import { useLocal } from "../../context/local"
import { PROMPT_FRAME, Glyph, AgentSigil, Lexicon } from "../../branding"
import { Flag } from "@arcana/core/flag/flag"
import { toolsOverrideKey, toolsPayload } from "../../util/tools-override"
import { tint, useTheme } from "../../context/theme"
import { RoundBorder } from "../../ui/chrome"
import { useTuiPaths, useTuiTerminalEnvironment } from "../../context/runtime"
import { useClipboard } from "../../context/clipboard"
import { Spinner } from "../spinner"
import { SigilSpinner } from "../sigil-spinner"
import { useSDK } from "../../context/sdk"
import { useRoute } from "../../context/route"
import { useProject } from "../../context/project"
import { useSync } from "../../context/sync"
import { type QueuedPromptPayload, usePromptQueue } from "../../context/prompt-queue"
import { useEvent } from "../../context/event"
import { editorSelectionKey, useEditorContext, type EditorSelection } from "../../context/editor"
import { normalizePromptContent, openEditor } from "../../editor"
import { useExit } from "../../context/exit"
import { promptOffsetWidth } from "../../prompt/display"
import { createStore, produce, unwrap } from "solid-js/store"
import { usePromptHistory, type PromptInfo } from "../../prompt/history"
import { computePromptTraits } from "../../prompt/traits"
import { expandPastedTextPlaceholders, expandTrackedPastedText } from "../../prompt/part"
import { usePromptStash } from "../../prompt/stash"
import { DialogStash } from "../dialog-stash"
import { type AutocompleteRef, Autocomplete, ARCANA_PROMPT_SLASHES } from "./autocomplete"
import { useRenderer, useTerminalDimensions, type JSX } from "@opentui/solid"
import type { FilePart, Session, UserMessage } from "@arcana/sdk/v2"
import { Locale } from "../../util/locale"
import { errorMessage } from "../../util/error"
import { formatDuration } from "../../util/format"
import { createPendingSessionID, titleFromUserText } from "../../util/session"
import { promptMaxHeight } from "../../util/geometry"
import { useDialog } from "../../ui/dialog"
import { DialogProvider as DialogProviderConnect } from "../dialog-provider"
import { DialogAlert } from "../../ui/dialog-alert"
import { DialogConfirm } from "../../ui/dialog-confirm"
import { useToast } from "../../ui/toast"
import { useKV } from "../../context/kv"
import { createFadeIn } from "../../util/signal"
import { DialogSkill } from "../dialog-skill"
import { DialogWorkspaceUnavailable } from "../dialog-workspace-unavailable"
import { SessionMetricsBar } from "./metrics-bar"
import { useArgs } from "../../context/args"
import {
  ARCANA_BASE_MODE,
  useBindings,
  useCommandSlashes,
  useLeaderActive,
  useOpencodeKeymap,
  resolvePaletteSlashCommand,
} from "../../keymap"
import { useTuiConfig } from "../../config"
import { usePromptWorkspace } from "./workspace"
import { usePromptMove } from "./move"
import { readLocalAttachment } from "./local-attachment"
import { addOptimisticMessage, clearOptimisticMessages, remapOptimisticSession } from "./optimistic"
import { arcanaTaskInstruction, assessArcanaTaskRisk, parseArcanaPromptCommand } from "../../arcana/task"
import { useSessionPrewarm } from "../../routes/home/prewarm-session"

export type PromptProps = {
  sessionID?: string
  visible?: boolean
  disabled?: boolean
  onSubmit?: () => void
  ref?: (ref: PromptRef | undefined) => void
  hint?: JSX.Element
  right?: JSX.Element
  showPlaceholder?: boolean
  variant?: "default" | "command-spine"
  placeholders?: {
    normal?: string[]
    shell?: string[]
  }
}

function sanitizeInput(text: string): string {
  return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "")
    .replace(/\x1b\][0-9;]*\x07/g, "")
    .replace(/\x1b[\]^_][^\x1b]*\x1b\\/g, "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
}

function pastedFilepath(value: string, platform: string) {
  const raw = value.replace(/^['"]+|['"]+$/g, "")
  if (raw.startsWith("file://")) {
    try {
      return fileURLToPath(raw)
    } catch {}
  }
  if (platform === "win32") return raw
  return raw.replace(/\\(.)/g, "$1")
}

export type PromptRef = {
  focused: boolean
  current: PromptInfo
  set(prompt: PromptInfo): void
  reset(): void
  blur(): void
  focus(): void
  submit(): void
}


const DRAFT_RETENTION_MIN_CHARS = 20

function randomIndex(count: number) {
  if (count <= 0) return 0
  return Math.floor(Math.random() * count)
}

function fadeColor(color: RGBA, alpha: number) {
  return RGBA.fromValues(color.r, color.g, color.b, color.a * alpha)
}

function hasEditorRangeSelection(selection: EditorSelection["ranges"][number]) {
  return (
    selection.selection.start.line !== selection.selection.end.line ||
    selection.selection.start.character !== selection.selection.end.character
  )
}

function getEditorRangeLabel(selection: EditorSelection["ranges"][number]) {
  if (!hasEditorRangeSelection(selection)) return
  if (selection.selection.start.line === selection.selection.end.line) return `#${selection.selection.start.line}`
  return `#${selection.selection.start.line}-${selection.selection.end.line}`
}

function formatEditorContext(selection: EditorSelection) {
  const selected = selection.ranges.filter(hasEditorRangeSelection)
  if (selected.length === 0)
    return `<system-reminder>Note: The user opened the file "${selection.filePath}". This may or may not be relevant to the current task.</system-reminder>\n`

  const ranges = selected.map((range, index) => {
    const prefix = selected.length > 1 ? `Selection ${index + 1}: ` : ""
    return `Note: The user selected ${prefix}${getEditorRangeLabel(range)} from "${selection.filePath}". \`\`\`${range.text}\`\`\`\n\n`
  })

  return `<system-reminder>${ranges.join("\n")} This may or may not be relevant to the current task.</system-reminder>\n`
}

let stashed: { prompt: PromptInfo; cursor: number } | undefined

export function Prompt(props: PromptProps) {
  let input: TextareaRenderable
  let anchor: BoxRenderable
  const [inputTarget, setInputTarget] = createSignal<TextareaRenderable | undefined>()

  const leader = useLeaderActive()
  const local = useLocal()
  const args = useArgs()
  const paths = useTuiPaths()
  const terminalEnvironment = useTuiTerminalEnvironment()
  const clipboard = useClipboard()
  const sdk = useSDK()
  const editor = useEditorContext()
  const route = useRoute()
  const project = useProject()
  const sync = useSync()
  const promptQueue = usePromptQueue()
  const tuiConfig = useTuiConfig()
  const dialog = useDialog()
  const toast = useToast()
  const status = createMemo(() => sync.data.session_status?.[props.sessionID ?? ""] ?? { type: "idle" })
  const history = usePromptHistory()
  const stash = usePromptStash()
  const keymap = useOpencodeKeymap()
  const commandSlashes = useCommandSlashes()
  const renderer = useRenderer()
  const exit = useExit()
  const dimensions = useTerminalDimensions()
  const { theme, syntax } = useTheme()
  const kv = useKV()
  const animationsEnabled = createMemo(() => kv.get("animations_enabled", true))
  const list = createMemo(() => props.placeholders?.normal ?? [])
  const shell = createMemo(() => props.placeholders?.shell ?? [])
  const fileContextEnabled = createMemo(() => kv.get("file_context_enabled", true))
  const [dismissedEditorSelectionKey, setDismissedEditorSelectionKey] = createSignal<string>()
  const editorContext = createMemo(() => {
    const selection = fileContextEnabled() ? editor.selection() : undefined
    if (!selection) return
    return editorSelectionKey(selection) === dismissedEditorSelectionKey() ? undefined : selection
  })
  const editorPath = createMemo(() => editorContext()?.filePath)
  const editorSelectionLabel = createMemo(() => {
    const ranges = editorContext()?.ranges
    if (!ranges) return
    const first = ranges.find(hasEditorRangeSelection) ?? ranges[0]
    if (!first) return
    return [getEditorRangeLabel(first), ranges.length > 1 ? `+${ranges.length - 1}` : undefined]
      .filter(Boolean)
      .join(" ")
  })
  const editorFileLabel = createMemo(() => {
    const value = editorPath()
    if (!value) return
    const filename = path.basename(value)
    const file = /^index\.[^./]+$/.test(filename)
      ? [path.basename(path.dirname(value)), filename].filter(Boolean).join("/")
      : filename
    return `${file.split(path.sep).join("/")}${editorSelectionLabel() ?? ""}`
  })
  const editorFileLabelDisplay = createMemo(() => {
    const file = editorFileLabel()
    if (!file) return
    return Locale.truncateMiddle(file, Math.max(12, Math.min(48, Math.floor(dimensions().width / 3))))
  })
  const editorContextLabelState = createMemo(() => editor.labelState())
  const [auto, setAuto] = createSignal<AutocompleteRef>()
  const workspace = usePromptWorkspace(props.sessionID)
  const move = usePromptMove({ projectID: project.project, sessionID: () => props.sessionID })
  /** App-level prewarm (Grok NewAuto) — first Home send skips await session.create. */
  const sessionPrewarm = useSessionPrewarm()
  // First keystroke on Home: ensure prewarm has started (covers failed/slow boot).
  createEffect(() => {
    if (props.sessionID) return
    if (!store.prompt.input.trim()) return
    sessionPrewarm?.ensure()
  })
  const [cursorVersion, setCursorVersion] = createSignal(0)

  // Ghost text intent suggestion — draws inline at cursor position
  const intentGhost = createMemo(() => {
    cursorVersion()
    return auto()?.intentSuggestion?.() ?? null
  })
  const intentGhostCol = createMemo(() => {
    cursorVersion()
    const vc = input?.visualCursor
    return vc ? vc.visualCol : 0
  })
  const intentGhostRow = createMemo(() => {
    cursorVersion()
    const vc = input?.visualCursor
    return vc ? vc.visualRow : 0
  })

  const currentProviderLabel = createMemo(() => {
    const p = local.model.parsed()
    const pid = p.providerID.toLowerCase()
    // Host product provider is brand chrome, not a user choice — hide it.
    // Also hide when the model id already carries the provider (deepseek/kimi/qwen);
    // keep external brands (openai/anthropic/etc).
    if (!pid || pid === "arcana") return ""
    return p.modelID.toLowerCase().includes(pid) ? "" : pid
  })

  /** Clean up model ID for display — strip internal prefixes, truncate long names. */
  const displayModelId = createMemo(() => {
    let id = local.model.parsed().modelID.toLowerCase()
    // Strip internal routing prefixes
    id = id.replace(/^cloudflare-ai-gateway\//, "").replace(/^cloudflare\//, "")
    // Truncate if still very long (T9: display-width aware)
    if (Locale.displayWidth(id) > 36) id = Locale.truncate(id, 36)
    return id
  })
  /** True when the active primary agent is not the list default (usually build). */
  const isNonDefaultAgent = createMemo(() => {
    const agent = local.agent.current()
    if (!agent) return false
    const defaultName = local.agent.list().at(0)?.name
    return !!defaultName && agent.name !== defaultName
  })
  const hasRightContent = createMemo(() => Boolean(props.right))

  function promptModelWarning() {
    toast.show({
      variant: "warning",
      message: "Connect a provider to send prompts",
      duration: 3000,
    })
    if (sync.data.provider.length === 0) {
      dialog.replace(() => <DialogProviderConnect />)
    }
  }

  function dismissEditorContext() {
    setDismissedEditorSelectionKey(editorSelectionKey(editorContext()))
    editor.clearSelection()
  }
  const fileStyleId = syntax().getStyleId("extmark.file")!
  const agentStyleId = syntax().getStyleId("extmark.agent")!
  const pasteStyleId = syntax().getStyleId("extmark.paste")!
  let promptPartTypeId = 0
  const event = useEvent()

  event.on("tui.prompt.append", (evt, { workspace }) => {
    if (workspace !== project.workspace.current()) return
    if (!input || input.isDestroyed) return
    input.insertText(sanitizeInput(evt.properties.text))
    setTimeout(() => {
      // setTimeout is a workaround and needs to be addressed properly
      if (!input || input.isDestroyed) return
      input.getLayoutNode().markDirty()
      input.gotoBufferEnd()
      renderer.requestRender()
    }, 0)
  })

  const isCommandSpine = createMemo(() => props.variant === "command-spine")

  const lastUserMessage = createMemo(() => {
    if (!props.sessionID) return undefined
    const messages = sync.data.message[props.sessionID]
    if (!messages) return undefined
    return messages.findLast((m): m is UserMessage => m.role === "user")
  })


  const [store, setStore] = createStore<{
    prompt: PromptInfo
    mode: "normal" | "shell"
    extmarkToPartIndex: Map<number, number>
    interrupt: number
    placeholder: number
  }>({
    placeholder: randomIndex(list().length),
    prompt: {
      input: "",
      parts: [],
    },
    mode: "normal",
    extmarkToPartIndex: new Map(),
    interrupt: 0,
  })

  createEffect(() => {
    if (!input || input.isDestroyed) return
    if (props.disabled) {
      input.cursorColor = isCommandSpine() ? theme.spineDiffMuted : theme.backgroundElement
      return
    }
    if (isCommandSpine()) {
      input.cursorColor = store.mode === "shell" ? theme.primary : theme.spinePrompt
      return
    }
    input.cursorColor = theme.text
  })

  createEffect(
    on(
      () => props.sessionID,
      () => {
        setStore("placeholder", randomIndex(list().length))
      },
      { defer: true },
    ),
  )

  // Initialize agent/model/variant from last user message when session changes
  let syncedSessionID: string | undefined
  createEffect(() => {
    const sessionID = props.sessionID
    const msg = lastUserMessage()

    if (sessionID !== syncedSessionID) {
      if (!sessionID || !msg) return

      syncedSessionID = sessionID

      // Only set agent if it's a primary agent (not a subagent)
      const isPrimaryAgent = local.agent.list().some((x) => x.name === msg.agent)
      if (msg.agent && isPrimaryAgent) {
        // Keep command line --agent if specified.
        if (!args.agent) local.agent.set(msg.agent)
        if (msg.model) {
          local.model.set(msg.model)
          local.model.variant.set(msg.model.variant)
        }
      }
    }
  })

  const promptCommands = createMemo(() =>
    [
      {
        title: "Clear prompt",
        name: "prompt.clear",
        category: "Prompt",
        hidden: true,
        run: () => {
          clearPrompt()
          dialog.clear()
        },
      },
      {
        title: "Submit prompt",
        name: "prompt.submit",
        category: "Prompt",
        hidden: true,
        run: async () => {
          if (!input.focused) return
          const handled = await submit()
          if (!handled) return

          dialog.clear()
        },
      },
      {
        title: "Remove editor context",
        name: "prompt.editor_context.clear",
        category: "Prompt",
        enabled: Boolean(editorContext()),
        run: () => {
          dismissEditorContext()
          dialog.clear()
        },
      },
      {
        title: "Paste",
        name: "prompt.paste",
        category: "Prompt",
        hidden: true,
        run: async (ctx: CommandContext<Renderable, KeyEvent>) => {
          ctx.event.preventDefault()
          ctx.event.stopPropagation()
          const content = await clipboard.read?.()
          if (content?.mime.startsWith("image/")) {
            await pasteAttachment({
              filename: "clipboard",
              mime: content.mime,
              content: content.data,
            })
            return
          }
          if (content?.mime === "text/plain") {
            await pasteInputText(content.data)
          }
        },
      },
      {
        title: "Interrupt session",
        name: "session.interrupt",
        category: "Session",
        hidden: true,
        // Disabled while permission/question gates own the shell (composer disabled).
        enabled: status().type !== "idle" && !props.disabled,
        run: () => {
          // Return false so Escape can fall through to higher-priority layers
          // (e.g. TUI-2.1 close inspector) instead of being consumed as a no-op.
          if (auto()?.visible) return false
          if (!input.focused) return false
          // TODO: this should be its own command
          if (store.mode === "shell") {
            setStore("mode", "normal")
            return
          }
          if (!props.sessionID) return false

          setStore("interrupt", store.interrupt + 1)

          setTimeout(() => {
            setStore("interrupt", 0)
          }, 5000)

          if (store.interrupt >= 2) {
            void sdk.client.session.abort({
              sessionID: props.sessionID,
            })
            setStore("interrupt", 0)
          }
          dialog.clear()
        },
      },
      {
        title: "Open editor",
        category: "Session",
        name: "prompt.editor",
        slashName: "editor",
        run: async () => {
          dialog.clear()

          // replace summarized text parts with the actual text
          const text = store.prompt.parts
            .filter((p) => p.type === "text")
            .reduce((acc, p) => {
              if (!p.source) return acc
              return acc.replace(p.source.text.value, p.text)
            }, store.prompt.input)

          const nonTextParts = store.prompt.parts.filter((p) => p.type !== "text")

          const value = text
          const content = await openEditor({
            renderer,
            value,
            cwd:
              (project.instance.path().worktree === "/" ? undefined : project.instance.path().worktree) ||
              project.instance.directory() ||
              paths.cwd,
          })
          if (!content) return
          const normalized = normalizePromptContent(content)

          input.setText(normalized)

          // Update positions for nonTextParts based on their location in new content
          // Filter out parts whose virtual text was deleted
          // this handles a case where the user edits the text in the editor
          // such that the virtual text moves around or is deleted
          const updatedNonTextParts = nonTextParts
            .map((part) => {
              let virtualText = ""
              if (part.type === "file" && part.source?.text) {
                virtualText = part.source.text.value
              } else if (part.type === "agent" && part.source) {
                virtualText = part.source.value
              }

              if (!virtualText) return part

              const newStart = normalized.indexOf(virtualText)
              // if the virtual text is deleted, remove the part
              if (newStart === -1) return null

              const newEnd = newStart + virtualText.length

              if (part.type === "file" && part.source?.text) {
                return {
                  ...part,
                  source: {
                    ...part.source,
                    text: {
                      ...part.source.text,
                      start: newStart,
                      end: newEnd,
                    },
                  },
                }
              }

              if (part.type === "agent" && part.source) {
                return {
                  ...part,
                  source: {
                    ...part.source,
                    start: newStart,
                    end: newEnd,
                  },
                }
              }

              return part
            })
            .filter((part) => part !== null)

          setStore("prompt", {
            input: normalized,
            // keep only the non-text parts because the text parts were
            // already expanded inline
            parts: updatedNonTextParts,
          })
          restoreExtmarksFromParts(updatedNonTextParts)
          input.cursorOffset = Bun.stringWidth(normalized)
        },
      },
      {
        title: "Skills",
        name: "prompt.skills",
        category: "Prompt",
        slashName: "skills",
        run: () => {
          dialog.replace(() => (
            <DialogSkill
              onSelect={(skill) => {
                input.setText(`/${skill} `)
                setStore("prompt", {
                  input: `/${skill} `,
                  parts: [],
                })
                input.gotoBufferEnd()
              }}
            />
          ))
        },
      },
      {
        title: "Warp",
        desc: "Change the workspace for the session",
        name: "workspace.set",
        category: "Session",
        enabled: Flag.ARCANA_EXPERIMENTAL_WORKSPACES,
        slashName: "warp",
        run: () => {
          workspace.open()
        },
      },
      {
        title: "Move session",
        desc: "Move to another project dir",
        name: "session.move",
        category: "Session",
        slashName: "move",
        run: () => {
          move.open()
        },
      },
    ].map((entry) => ({
      namespace: "palette",
      ...entry,
    })),
  )

  useBindings(() => ({
    commands: promptCommands(),
  }))

  useBindings(() => ({
    mode: ARCANA_BASE_MODE,
    bindings: tuiConfig.keybinds.gather("prompt.palette", [
      "prompt.submit",
      "prompt.editor",
      "prompt.editor_context.clear",
      "prompt.stash",
      "prompt.stash.pop",
      "prompt.stash.list",
      "session.interrupt",
      "workspace.set",
      "session.move",
    ]),
  }))

  const ref: PromptRef = {
    get focused() {
      return input.focused
    },
    get current() {
      return store.prompt
    },
    focus() {
      input.focus()
    },
    blur() {
      input.blur()
    },
    set(prompt) {
      input.setText(prompt.input)
      setStore("prompt", prompt)
      restoreExtmarksFromParts(prompt.parts)
      input.gotoBufferEnd()
    },
    reset() {
      // Same guard as clearPrompt: keymap commands can outlive the composer.
      if (input && !input.isDestroyed) {
        input.clear()
        input.extmarks.clear()
      }
      setStore("prompt", {
        input: "",
        parts: [],
      })
      setStore("extmarkToPartIndex", new Map())
    },
    submit() {
      void submit()
    },
  }

  onMount(() => {
    const saved = stashed
    stashed = undefined
    if (store.prompt.input) return
    if (saved && saved.prompt.input) {
      input.setText(saved.prompt.input)
      setStore("prompt", saved.prompt)
      restoreExtmarksFromParts(saved.prompt.parts)
      input.cursorOffset = saved.cursor
    }
  })

  onCleanup(() => {
    if (store.prompt.input) {
      stashed = { prompt: unwrap(store.prompt), cursor: input.cursorOffset }
    }
    if (input && !input.isDestroyed && input.focused) input.blur()
    setInputTarget(undefined)
    props.ref?.(undefined)
  })

  createEffect(() => {
    if (!input || input.isDestroyed) return
    // Permission/question gates disable the composer but keep it mounted. If the
    // textarea stays focused, Enter is swallowed by the managed input.submit /
    // textarea onSubmit path and never reaches PermissionPrompt (e.g. Always
    // allow → Confirm). Blur while disabled so gate Decision bindings win.
    if (props.visible === false || props.disabled || dialog.stack.length > 0) {
      if (input.focused) input.blur()
      return
    }

    // Slot/plugin updates can remount the background prompt while a dialog is open.
    // Keep focus with the dialog and let the prompt reclaim it after the dialog closes.
    if (!input.focused) input.focus()
  })

  createEffect(() => {
    if (!input || input.isDestroyed) return
    input.traits = {
      ...input.traits,
      ...computePromptTraits({
        mode: store.mode,
        autocompleteVisible: !!auto()?.visible,
      }),
    }
  })

  function restoreExtmarksFromParts(parts: PromptInfo["parts"]) {
    input.extmarks.clear()
    setStore("extmarkToPartIndex", new Map())

    parts.forEach((part, partIndex) => {
      let start = 0
      let end = 0
      let virtualText = ""
      let styleId: number | undefined

      if (part.type === "file" && part.source?.text) {
        start = part.source.text.start
        end = part.source.text.end
        virtualText = part.source.text.value
        styleId = fileStyleId
      } else if (part.type === "agent" && part.source) {
        start = part.source.start
        end = part.source.end
        virtualText = part.source.value
        styleId = agentStyleId
      } else if (part.type === "text" && part.source?.text) {
        start = part.source.text.start
        end = part.source.text.end
        virtualText = part.source.text.value
        styleId = pasteStyleId
      }

      if (virtualText) {
        const extmarkId = input.extmarks.create({
          start,
          end,
          virtual: true,
          styleId,
          typeId: promptPartTypeId,
        })
        setStore("extmarkToPartIndex", (map: Map<number, number>) => {
          const newMap = new Map(map)
          newMap.set(extmarkId, partIndex)
          return newMap
        })
      }
    })
  }

  function syncExtmarksWithPromptParts() {
    const allExtmarks = input.extmarks.getAllForTypeId(promptPartTypeId)
    setStore(
      produce((draft) => {
        const newMap = new Map<number, number>()
        const newParts: typeof draft.prompt.parts = []

        for (const extmark of allExtmarks) {
          const partIndex = draft.extmarkToPartIndex.get(extmark.id)
          if (partIndex !== undefined) {
            const part = draft.prompt.parts[partIndex]
            if (part) {
              if (part.type === "agent" && part.source) {
                part.source.start = extmark.start
                part.source.end = extmark.end
              } else if (part.type === "file" && part.source?.text) {
                part.source.text.start = extmark.start
                part.source.text.end = extmark.end
              } else if (part.type === "text" && part.source?.text) {
                part.source.text.start = extmark.start
                part.source.text.end = extmark.end
              }
              newMap.set(extmark.id, newParts.length)
              newParts.push(part)
            }
          }
        }

        draft.extmarkToPartIndex = newMap
        draft.prompt.parts = newParts
      }),
    )
  }

  const stashCommands = createMemo(() =>
    [
      {
        title: "Stash prompt",
        name: "prompt.stash",
        category: "Prompt",
        enabled: !!store.prompt.input,
        run: () => {
          if (!store.prompt.input) return
          stash.push({
            input: store.prompt.input,
            parts: store.prompt.parts,
          })
          input.extmarks.clear()
          input.clear()
          setStore("prompt", { input: "", parts: [] })
          setStore("extmarkToPartIndex", new Map())
          dialog.clear()
        },
      },
      {
        title: "Stash pop",
        name: "prompt.stash.pop",
        category: "Prompt",
        enabled: stash.list().length > 0,
        run: () => {
          const entry = stash.pop()
          if (entry) {
            input.setText(entry.input)
            setStore("prompt", { input: entry.input, parts: entry.parts })
            restoreExtmarksFromParts(entry.parts)
            input.gotoBufferEnd()
          }
          dialog.clear()
        },
      },
      {
        title: "Stash list",
        name: "prompt.stash.list",
        category: "Prompt",
        enabled: stash.list().length > 0,
        run: () => {
          dialog.replace(() => (
            <DialogStash
              onSelect={(entry) => {
                input.setText(entry.input)
                setStore("prompt", { input: entry.input, parts: entry.parts })
                restoreExtmarksFromParts(entry.parts)
                input.gotoBufferEnd()
              }}
            />
          ))
        },
      },
    ].map((entry) => ({
      namespace: "palette",
      ...entry,
    })),
  )

  useBindings(() => ({
    commands: stashCommands(),
  }))

  useBindings(() => {
    return {
      target: inputTarget,
      enabled: inputTarget() !== undefined && !props.disabled,
      bindings: tuiConfig.keybinds.get("prompt.paste"),
    }
  })

  useBindings(() => {
    return {
      target: inputTarget,
      enabled: inputTarget() !== undefined && !props.disabled && store.prompt.input !== "",
      bindings: tuiConfig.keybinds.get("prompt.clear"),
    }
  })

  useBindings(() => {
    return {
      target: inputTarget,
      enabled: (() => {
        cursorVersion()
        return (
          inputTarget() !== undefined &&
          !props.disabled &&
          store.mode === "normal" &&
          !auto()?.visible &&
          input?.visualCursor.offset === 0
        )
      })(),
      bindings: [
        {
          key: "!",
          desc: "Shell mode",
          group: "Prompt",
          cmd: () => {
            setStore("placeholder", randomIndex(shell().length))
            setStore("mode", "shell")
          },
        },
      ],
    }
  })

  useBindings(() => {
    return {
      target: inputTarget,
      enabled: inputTarget() !== undefined && store.mode === "shell",
      bindings: [{ key: "escape", desc: "Exit shell mode", group: "Prompt", cmd: () => setStore("mode", "normal") }],
    }
  })

  useBindings(() => {
    return {
      target: inputTarget,
      enabled: (() => {
        cursorVersion()
        return inputTarget() !== undefined && store.mode === "shell" && input?.visualCursor.offset === 0
      })(),
      bindings: [{ key: "backspace", desc: "Exit shell mode", group: "Prompt", cmd: () => setStore("mode", "normal") }],
    }
  })

  useBindings(() => {
    return {
      target: inputTarget,
      enabled: (() => {
        cursorVersion()
        return inputTarget() !== undefined && !props.disabled && !auto()?.visible && input !== undefined
      })(),
      commands: [
        {
          name: "prompt.history.previous",
          title: "Previous prompt history",
          category: "Prompt",
          run() {
            if (input.cursorOffset !== 0) {
              if (input.scrollY + input.visualCursor.visualRow === 0) input.cursorOffset = 0
              return false
            }

            const item = history.move(-1, input.plainText)
            if (!item) return false
            input.setText(item.input)
            setStore("prompt", item)
            setStore("mode", item.mode ?? "normal")
            restoreExtmarksFromParts(item.parts)
            input.cursorOffset = 0
          },
        },
      ],
      bindings: tuiConfig.keybinds.get("prompt.history.previous"),
    }
  })

  useBindings(() => {
    return {
      target: inputTarget,
      enabled: (() => {
        cursorVersion()
        return inputTarget() !== undefined && !props.disabled && !auto()?.visible && input !== undefined
      })(),
      commands: [
        {
          name: "prompt.history.next",
          title: "Next prompt history",
          category: "Prompt",
          run() {
            if (input.cursorOffset !== input.plainText.length) {
              if (
                input.scrollY + input.visualCursor.visualRow ===
                Math.max(0, input.editorView.getTotalVirtualLineCount() - 1)
              )
                input.cursorOffset = input.plainText.length
              return false
            }

            const item = history.move(1, input.plainText)
            if (!item) return false
            input.setText(item.input)
            setStore("prompt", item)
            setStore("mode", item.mode ?? "normal")
            restoreExtmarksFromParts(item.parts)
            input.cursorOffset = input.plainText.length
          },
        },
      ],
      bindings: tuiConfig.keybinds.get("prompt.history.next"),
    }
  })

  let submitting = false
  async function submit() {
    // Prevent overlapping invocations (e.g. a double-pressed Enter, or the
    // input's native onSubmit racing another dispatch). Without this guard,
    // a second call slips past the empty-input check before the first call
    // clears `store.prompt.input`, then awaits its own `session.create` and
    // ultimately reads the now-empty store — sending a phantom empty prompt
    // to a freshly created session.
    if (submitting) return false
    submitting = true
    try {
      return await submitInner()
    } finally {
      submitting = false
    }
  }

  /** Debug: ARCANA_DEBUG_SUBMIT_TIMING=1 logs T0–T4 submit stages (Home latency). */
  function submitTimingEnabled() {
    return typeof process !== "undefined" && process.env?.ARCANA_DEBUG_SUBMIT_TIMING === "1"
  }
  function markSubmit(label: string, t0: number, extra?: Record<string, unknown>) {
    if (!submitTimingEnabled()) return
    const ms = Math.round(performance.now() - t0)
    console.log(`[submit-timing] ${label} +${ms}ms`, extra ?? "")
  }

  async function submitInner() {
    const t0 = performance.now()
    workspace.clearNotice()

    // Authoritative text: read the live editor buffer first. Store lags one
    // paint behind keystrokes; waiting on setStore-only caused "press Enter
    // twice" when the first submit saw an empty store.
    const liveText = input && !input.isDestroyed ? input.plainText : store.prompt.input
    if (liveText !== store.prompt.input) {
      setStore("prompt", "input", liveText)
      syncExtmarksWithPromptParts()
    }
    if (props.disabled) return false
    if (workspace.creating() || move.creating()) return false
    if (!liveText.trim()) return false
    const agent = local.agent.current()
    if (!agent) return false
    const trimmed = liveText.trim()
    if (trimmed === "exit" || trimmed === "quit" || trimmed === ":q") {
      void exit()
      return true
    }

    // ── TUI slash commands (before model/session gates) ─────────────────
    // /new, /sessions, /models, /help, /exit, etc. must never require a model
    // or create a session, and must never be sent as chat text.
    if (trimmed.startsWith("/")) {
      const firstLine = trimmed.split("\n")[0]!.trim()
      const firstToken = firstLine.split(/\s+/)[0]!.toLowerCase()
      const slashName = firstToken.slice(1)
      const isArcanaPrompt = ARCANA_PROMPT_SLASHES.has(firstToken)
      const isLocalGoal = slashName === "goal" || slashName === "loop"
      const isServerCommand = sync.data.command.some((x) => x.name === slashName)

      if (!isArcanaPrompt && !isLocalGoal && !isServerCommand) {
        const resolved = resolvePaletteSlashCommand(keymap, slashName)
        if (resolved) {
          clearPrompt()
          // Defer so prompt clear paints before dialogs/navigation
          queueMicrotask(() => {
            keymap.dispatchCommand(resolved)
          })
          return true
        }

        // Unknown /command — toast instead of sending garbage to the model
        toast.show({
          title: "Unknown command",
          message: `/${slashName} is not a registered command. Open the command palette for the full list.`,
          variant: "warning",
          duration: 5000,
        })
        clearPrompt()
        return true
      }
    }

    const selectedModel = local.model.current()
    if (!selectedModel) {
      void promptModelWarning()
      return false
    }
    // Defensive: model.current() returns { providerID, modelID } | undefined,
    // but stored model.json corruption can produce objects with null fields.
    // Guard so the SDK doesn't serialize null into the request body.
    if (!selectedModel.providerID || !selectedModel.modelID) {
      console.error("Model fields missing:", selectedModel)
      toast.show({
        message: "Select a model with /models to continue.",
        variant: "warning",
        duration: 5000,
      })
      return false
    }

    const workspaceSession = props.sessionID ? sync.session.get(props.sessionID) : undefined
    const workspaceIDCheck = workspaceSession?.workspaceID
    const workspaceStatus = workspaceIDCheck ? (project.workspace.status(workspaceIDCheck) ?? "error") : undefined
    if (props.sessionID && workspaceIDCheck && workspaceStatus !== "connected") {
      dialog.replace(() => (
        <DialogWorkspaceUnavailable
          onRestore={() => {
            workspace.open()
            return false
          }}
        />
      ))
      return false
    }

    // Snapshot everything that must not race session.create / clearPrompt.
    // Previously we awaited session.create while the composer still showed the
    // message — felt like Enter did nothing; a second Enter hit the submit guard.
    const variant = local.model.variant.current()
    const currentMode = store.mode
    const promptSnapshot = {
      input: liveText,
      parts: store.prompt.parts.slice(),
    }
    const inputText = expandTrackedPastedText(
      liveText,
      input.extmarks.getAllForTypeId(promptPartTypeId).flatMap((extmark) => {
        const partIndex = store.extmarkToPartIndex.get(extmark.id)
        const part = partIndex === undefined ? undefined : store.prompt.parts[partIndex]
        if (part?.type !== "text") return []
        return [{ start: extmark.start, end: extmark.end, text: part.text }]
      }),
    )
    const nonTextParts = promptSnapshot.parts.filter((part) => part.type !== "text")
    const editorSelection = editorContext()
    const editorParts =
      editorSelection && editor.labelState() === "pending"
        ? [
            {
              type: "text" as const,
              text: formatEditorContext(editorSelection),
              synthetic: true,
              metadata: {
                kind: "editor_context",
                source: editorSelection.source ?? "editor",
                filePath: editorSelection.filePath,
                ranges: editorSelection.ranges,
              },
            },
          ]
        : []
    const arcanaPromptCommand = parseArcanaPromptCommand(inputText)

    // Optimistic clear — composer empties on the first Enter, not after network.
    history.append({
      ...promptSnapshot,
      mode: currentMode,
    })
    input.extmarks.clear()
    setStore("prompt", { input: "", parts: [] })
    setStore("extmarkToPartIndex", new Map())
    input.clear()
    props.onSubmit?.()
    markSubmit("T1 clear", t0)

    let sessionID: string | undefined = props.sessionID
    let finishMoveProgress = false
    let pendingStubID: string | undefined
    const isHomeSend = !props.sessionID
    const selectedWorkspace = workspace.selection()
    const workspaceID = selectedWorkspace?.type === "existing" ? selectedWorkspace.workspaceID : undefined
    const needsDestination = Boolean(move.pending())

    if (sessionID == null) {
      // Prefer a ready prewarm so Enter is not blocked on create.
      if (!needsDestination && sessionPrewarm) {
        const ready = sessionPrewarm.consume()
        if (ready) {
          sessionID = ready
          markSubmit("T3 prewarm hit", t0, { sessionID })
        }
      }
    }

    // From Home: open the session view immediately — do not wait for create.
    if (isHomeSend) {
      if (!sessionID) {
        pendingStubID = createPendingSessionID()
        sessionID = pendingStubID
        const now = Date.now()
        const title = inputText.trim().split("\n")[0]?.slice(0, 80) || "New session"
        sync.session.upsert({
          id: pendingStubID,
          slug: pendingStubID,
          projectID: "",
          directory: "",
          title,
          version: "0",
          time: { created: now, updated: now },
        } as Session)
      }
      if (store.mode !== "shell" && !arcanaPromptCommand) {
        const isGoalCmd =
          inputText.startsWith("/")
          && (() => {
            const cmd = inputText.split("\n")[0].split(" ")[0].slice(1).toLowerCase()
            return cmd === "goal" || cmd === "loop"
          })()
        const isServerSlash =
          inputText.startsWith("/")
          && sync.data.command.some((x) => x.name === inputText.split("\n")[0].split(" ")[0].slice(1))
        if (!isGoalCmd && !isServerSlash) {
          addOptimisticMessage({
            id: `optimistic-${crypto.randomUUID()}`,
            sessionID,
            text: inputText,
            timestamp: Date.now(),
            agent: agent.name,
            model: {
              providerID: selectedModel.providerID,
              modelID: selectedModel.modelID,
              variant,
            },
          })
          markSubmit("T3.4 optimistic", t0)
        }
      }
      if (editorParts.length > 0) editor.preserveSelectionFromNewSession()
      route.navigate({
        type: "session",
        sessionID,
      })
      markSubmit("T3.5 early navigate", t0, { sessionID })
    }

    if (pendingStubID) {
      let createdID: string | undefined
      if (!needsDestination && sessionPrewarm) {
        createdID = await sessionPrewarm.waitAndConsume()
      }
      if (!createdID) {
        const directory = await move.getDirectory(inputText)
        markSubmit("T2 getDirectory", t0)
        if (move.pending() && !directory) {
          clearOptimisticMessages(pendingStubID)
          sync.session.forget(pendingStubID)
          setStore("prompt", { input: inputText, parts: nonTextParts })
          input.setText(inputText)
          route.navigate({ type: "home" })
          return false
        }
        finishMoveProgress = Boolean(move.progress())

        const res = await sdk.client.session.create({
          directory,
          workspace: workspaceID,
          agent: agent.name,
          model: {
            providerID: selectedModel.providerID,
            id: selectedModel.modelID,
            variant,
          },
          // Name the session from the first prompt line so the session list
          // never shows the engine default ("New session - <ISO>" → Untitled)
          // before the engine's own first-message title lands. undefined for
          // empty text keeps the backfill-friendly default title.
          title: titleFromUserText(inputText) ?? undefined,
        })
        markSubmit("T3 session.create", t0, { error: Boolean(res.error) })

        if (res.error || !res.data?.id) {
          if (finishMoveProgress) move.finishSubmit()
          clearOptimisticMessages(pendingStubID)
          sync.session.forget(pendingStubID)
          console.log("Creating a session failed:", res.error)
          setStore("prompt", { input: inputText, parts: nonTextParts })
          input.setText(inputText)
          toast.show({
            message: "Creating a session failed. Open console for more details.",
            variant: "error",
          })
          route.navigate({ type: "home" })
          return true
        }

        createdID = res.data.id
        sync.session.upsert(res.data! as Session)
      }

      remapOptimisticSession(pendingStubID, createdID)
      sessionID = createdID
      route.navigate({
        type: "session",
        sessionID,
      })
      sync.session.forget(pendingStubID)
    }

    if (!sessionID) {
      if (pendingStubID) {
        clearOptimisticMessages(pendingStubID)
        sync.session.forget(pendingStubID)
      }
      route.navigate({ type: "home" })
      return false
    }
    const targetSessionID = sessionID

    if (store.mode === "shell") {
      move.startSubmit()
      void sdk.client.session.shell({
        sessionID: targetSessionID,
        agent: agent.name,
        model: {
          providerID: selectedModel.providerID,
          modelID: selectedModel.modelID,
        },
        command: inputText,
      })
      setStore("mode", "normal")
    } else if (arcanaPromptCommand) {
      const task = arcanaPromptCommand.arguments.trim()
      if (!task) {
        // Composer already cleared optimistically — restore so user can finish the command
        setStore("prompt", { input: inputText, parts: [] })
        input.setText(inputText)
        toast.show({
          title: `/${arcanaPromptCommand.command}`,
          message: `Add a task after /${arcanaPromptCommand.command}.`,
          variant: "warning",
        })
        return true
      }

      const risk = assessArcanaTaskRisk(task)
      const approvalStatus = risk.approval_required ? "approved" : "not_required"
      if (risk.approval_required) {
        const approved = await DialogConfirm.show(
          dialog,
          `Approve /${arcanaPromptCommand.command}`,
          `${risk.level.toUpperCase()} risk Arcana task. ${risk.reasons.join(" ")}`,
          "keep editing",
        )
        if (!approved) return false
      }

      const instruction = arcanaTaskInstruction({
        command: arcanaPromptCommand.command,
        risk,
        approval_status: approvalStatus,
      })
      move.startSubmit()
      // promptAsync returns immediately; agent loop runs server-side (SSE updates).
      // Per-session tool overrides from /tools: only explicit user choices,
      // attached so the engine persists them as session permissions. The
      // LLM only sees the tools the operator kept.
      const toolsOverride = toolsPayload(kv.get(toolsOverrideKey(targetSessionID)) as Record<string, boolean> | undefined)
      const payload: QueuedPromptPayload = {
        sessionID: targetSessionID,
        agent: agent.name,
        model: {
          providerID: selectedModel.providerID,
          modelID: selectedModel.modelID,
        },
        variant,
        ...(toolsOverride ? { tools: toolsOverride } : {}),
        parts: [
          ...editorParts,
          ...(instruction
            ? [
                {
                  type: "text" as const,
                  text: instruction,
                  synthetic: true,
                  metadata: {
                    arcana: {
                      command: arcanaPromptCommand.command,
                      instruction: true,
                    },
                  },
                },
              ]
            : []),
          {
            type: "text",
            text: task,
            metadata: {
              arcana: {
                command: arcanaPromptCommand.command,
                risk: risk.level,
                approval_required: risk.approval_required,
                approval_status: approvalStatus,
                risk_reasons: risk.reasons,
              },
            },
          },
          ...nonTextParts,
        ],
      }
      void promptQueue.submit(payload, task)
      addOptimisticMessage({
        id: `optimistic-${crypto.randomUUID()}`,
        sessionID: targetSessionID,
        text: task,
        timestamp: Date.now(),
        agent: agent.name,
        model: {
          providerID: selectedModel.providerID,
          modelID: selectedModel.modelID,
          variant,
        },
      })
    // ── /goal — standalone goal setter (does NOT require /loop) ──
    } else if (inputText.startsWith("/goal ")) {
      move.startSubmit()
      // Strip trailing plain-text lines so they don't become part of the goal
      const firstNewline = inputText.indexOf("\n")
      const slashLine = firstNewline === -1 ? inputText : inputText.slice(0, firstNewline)
      const trailingText = firstNewline === -1 ? "" : inputText.slice(firstNewline + 1).trim()
      const args = slashLine.slice(6).trim()

      // Reject multi-slash: user must submit slash commands separately
      const otherSlashLines = trailingText.split("\n").filter(l => l.trimStart().startsWith("/"))
      if (otherSlashLines.length > 0) {
        toast.show({
          title: "Multiple commands",
          message: "Submit each /command separately, not in one message.",
          variant: "warning",
        })
        return true
      }
      if (!args) {
        toast.show({
          title: "Goal",
          message: "Usage: /goal <description of what you want done>",
          variant: "info",
        })
        return true
      }
      void import("@arcana/core/session/goal")
        .then(({ setSessionGoal }) => {
          setSessionGoal(targetSessionID, { goal: args, status: "in_progress" })
          toast.show({
            title: "Goal set",
            // T9: helper appends "…" only when it truncated.
            message: Locale.truncate(args, 120),
            variant: "success",
          })
        })
        .catch((error) => {
          toast.show({ title: "Goal command failed", message: errorMessage(error), variant: "error" })
        })

    // ── /loop — autonomous loop hub (independent of /goal, matches CLI behavior) ──
    } else if (inputText.startsWith("/loop")) {
      move.startSubmit()
      // Strip trailing plain-text lines so they don't become part of the goal/command
      const firstNewline = inputText.indexOf("\n")
      const slashLine = firstNewline === -1 ? inputText : inputText.slice(0, firstNewline)
      const trailingText = firstNewline === -1 ? "" : inputText.slice(firstNewline + 1).trim()
      const rest = slashLine.slice(5).trim()

      // Reject multi-slash: user must submit slash commands separately
      const otherSlashLines = trailingText.split("\n").filter(l => l.trimStart().startsWith("/"))
      if (otherSlashLines.length > 0) {
        toast.show({
          title: "Multiple commands",
          message: "Submit each /command separately, not in one message.",
          variant: "warning",
        })
        return true
      }
      // Trailing plain text is discarded — only the slash line is processed.
      // The user can send follow-up context in a separate message.

      const firstSpace = rest.indexOf(" ")
      const subcommand = firstSpace === -1 ? rest : rest.slice(0, firstSpace)

      if (rest === "" || subcommand === "status") {
        // /loop — show goal + kanban status
        void import("@arcana/core/session/goal")
          .then(({ getSessionGoal, formatActiveGoalBlock }) => {
            const snap = getSessionGoal(targetSessionID)
            if (snap.status === "unset") {
              toast.show({
                title: "No active goal",
                message: "Start one with /loop set <description> or just /loop <what to do>",
                variant: "warning",
              })
              return
            }
            toast.show({
              title: "Goal status",
              message: formatActiveGoalBlock({
                sessionID: targetSessionID,
                sessionAgent: agent.name,
                actorAgent: agent.name,
              }).replace(/<\/?active-goal>/g, "").trim(),
              variant: "info",
              duration: 8000,
            })
          })
          .catch((error) => {
            toast.show({ title: "Loop command failed", message: errorMessage(error), variant: "error" })
          })
      } else if (subcommand === "set") {
        // /loop set <description> — set goal + start loop
        const description = rest.slice(4).trim()
        if (!description) {
          toast.show({ title: "Loop", message: "Usage: /loop set <description>", variant: "warning" })
          return true
        }
        void import("@arcana/core/session/goal")
          .then(({ setSessionGoal }) => {
            setSessionGoal(targetSessionID, { goal: description, status: "in_progress" })
            toast.show({ title: "Goal set", message: description, variant: "success" })
          })
          .catch((error) => {
            toast.show({ title: "Loop command failed", message: errorMessage(error), variant: "error" })
          })
      } else if (subcommand === "done" || subcommand === "blocked" || subcommand === "stale") {
        // /loop done|blocked|stale — mark goal status
        void import("@arcana/core/session/goal")
          .then(({ getSessionGoal, setSessionGoal }) => {
            const snap = getSessionGoal(targetSessionID)
            if (snap.status === "unset") {
              toast.show({
                title: "No active goal",
                message: `No goal to mark ${subcommand}. Set one with /loop set <description>.`,
                variant: "warning",
              })
              return
            }
            const mapped: "complete_unverified" | "blocked" | "stale" =
              subcommand === "done" ? "complete_unverified"
              : subcommand === "blocked" ? "blocked"
              : "stale"
            setSessionGoal(targetSessionID, { goal: snap.goal, status: mapped })
            toast.show({ title: "Goal marked", message: mapped, variant: "success" })
          })
          .catch((error) => {
            toast.show({ title: "Loop command failed", message: errorMessage(error), variant: "error" })
          })
      } else {
        // /loop <text> — auto-set goal from text, start loop
        if (!rest) {
          toast.show({ title: "Loop", message: "Usage: /loop <what to do>", variant: "warning" })
          return true
        }
        void import("@arcana/core/session/goal")
          .then(({ getSessionGoal, setSessionGoal }) => {
            const snap = getSessionGoal(targetSessionID)
            if (snap.status === "unset") {
              const goal = rest.split(/[.,;]/)[0]?.trim() || rest.slice(0, 80)
              setSessionGoal(targetSessionID, { goal, status: "in_progress" })
              toast.show({ title: "Goal auto-set", message: goal, variant: "success" })
            }
          })
          .catch((error) => {
            toast.show({ title: "Loop command failed", message: errorMessage(error), variant: "error" })
          })
      }
    } else if (
      inputText.startsWith("/") &&
      sync.data.command.some((x) => x.name === inputText.split("\n")[0].split(" ")[0].slice(1))
    ) {
      move.startSubmit()
      // Parse command from first line, preserve multi-line content in arguments
      const firstLineEnd = inputText.indexOf("\n")
      const firstLine = firstLineEnd === -1 ? inputText : inputText.slice(0, firstLineEnd)
      const [command, ...firstLineArgs] = firstLine.split(" ")
      const restOfInput = firstLineEnd === -1 ? "" : inputText.slice(firstLineEnd + 1)
      const args = firstLineArgs.join(" ") + (restOfInput ? "\n" + restOfInput : "")

      void sdk.client.session.command({
        sessionID: targetSessionID,
        command: command.slice(1),
        arguments: args,
        agent: agent.name,
        model: `${selectedModel.providerID}/${selectedModel.modelID}`,
        variant,
        parts: nonTextParts.filter((x) => x.type === "file"),
      })
    } else {
      move.startSubmit()
      // Home path already added optimistic before navigate; in-session still needs it here.
      if (!isHomeSend) {
        addOptimisticMessage({
          id: `optimistic-${crypto.randomUUID()}`,
          sessionID: targetSessionID,
          text: inputText,
          timestamp: Date.now(),
          agent: agent.name,
          model: {
            providerID: selectedModel.providerID,
            modelID: selectedModel.modelID,
            variant,
          },
        })
      }
      // promptAsync: 204 + forked agent loop (same as workspace move path).
      // Avoids holding HTTP open for the full turn (session.prompt waits on loop).
      // Per-session tool overrides from /tools: only explicit user choices,
      // attached so the engine persists them as session permissions. The
      // LLM only sees the tools the operator kept.
      const toolsOverride = toolsPayload(kv.get(toolsOverrideKey(targetSessionID)) as Record<string, boolean> | undefined)
      const payload: QueuedPromptPayload = {
        sessionID: targetSessionID,
        agent: agent.name,
        model: {
          providerID: selectedModel.providerID,
          modelID: selectedModel.modelID,
        },
        variant,
        ...(toolsOverride ? { tools: toolsOverride } : {}),
        parts: [
          ...editorParts,
          {
            type: "text",
            text: inputText,
          },
          ...nonTextParts,
        ],
      }
      void promptQueue.submit(payload, inputText)
      if (editorParts.length > 0) editor.markSelectionSent()
      // Agent tip is non-blocking UX chrome — never delay the send path.
      void import("@arcana/core/session/goal")
        .then(({ suggestAgents }) => {
          const agents = sync.data.agent ?? []
          const suggestion = suggestAgents({
            prompt: inputText,
            currentSessionAgent: agent.name,
            sessionAgents: agents.map((a) => ({
              name: a.name,
              mode: a.mode,
              hidden: a.hidden,
              description: a.description,
              routing: (a as { routing?: { keywords?: string[]; priority?: number } }).routing,
            })),
          })
          const bits: string[] = []
          if (suggestion.sessionAgent && suggestion.sessionAgent.confidence >= 0.35) {
            bits.push(`Session: ${suggestion.sessionAgent.name} (${suggestion.sessionAgent.reason})`)
          }
          if (suggestion.delegation && suggestion.delegation.confidence >= 0.35) {
            bits.push(`Delegate: task → ${suggestion.delegation.name}`)
          }
          if (bits.length) {
            toast.show({
              title: "Agent suggestion",
              message: bits.join(" · ") + " · Tab to switch session agent",
              variant: "info",
              duration: 5000,
            })
          }
        })
        .catch(() => {})
    }

    markSubmit("T4 prompt+optimistic done", t0, {
      sessionID: targetSessionID,
      fromHome: isHomeSend,
      prewarm: Boolean(sessionPrewarm),
    })
    if (finishMoveProgress) move.finishSubmit()
    return true
  }

  function pasteText(text: string, virtualText: string) {
    const currentOffset = input.cursorOffset
    const extmarkStart = currentOffset
    const extmarkEnd = extmarkStart + promptOffsetWidth(virtualText)

    input.insertText(virtualText + " ")

    const extmarkId = input.extmarks.create({
      start: extmarkStart,
      end: extmarkEnd,
      virtual: true,
      styleId: pasteStyleId,
      typeId: promptPartTypeId,
    })

    setStore(
      produce((draft) => {
        const partIndex = draft.prompt.parts.length
        draft.prompt.parts.push({
          type: "text" as const,
          text,
          source: {
            text: {
              start: extmarkStart,
              end: extmarkEnd,
              value: virtualText,
            },
          },
        })
        draft.extmarkToPartIndex.set(extmarkId, partIndex)
      }),
    )
  }

  async function pasteInputText(text: string) {
    const normalizedText = sanitizeInput(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n")
    const pastedContent = normalizedText.trim()
    const filepath = pastedFilepath(pastedContent, terminalEnvironment.platform)
    const isUrl = /^(https?):\/\//.test(filepath)
    if (!isUrl) {
      const attachment = await readLocalAttachment(filepath)
      const filename = path.basename(filepath)
      if (attachment?.type === "text") {
        pasteText(attachment.content, `[SVG: ${filename ?? "image"}]`)
        return
      }
      if (attachment?.type === "binary") {
        await pasteAttachment({
          filename,
          filepath,
          mime: attachment.mime,
          content: Buffer.from(attachment.content).toString("base64"),
        })
        return
      }
    }

    const lineCount = (pastedContent.match(/\n/g)?.length ?? 0) + 1
    if (
      (lineCount >= 3 || pastedContent.length > 150) &&
      kv.get("paste_summary_enabled", !sync.data.config.experimental?.disable_paste_summary)
    ) {
      pasteText(pastedContent, `[Pasted ~${lineCount} lines]`)
      return
    }

    input.insertText(normalizedText)

    setTimeout(() => {
      if (!input || input.isDestroyed) return
      input.getLayoutNode().markDirty()
      renderer.requestRender()
    }, 0)
  }

  async function pasteAttachment(file: { filename?: string; filepath?: string; content: string; mime: string }) {
    const currentOffset = input.cursorOffset
    const extmarkStart = currentOffset
    const pdf = file.mime === "application/pdf"
    const count = store.prompt.parts.filter((x) => {
      if (x.type !== "file") return false
      if (pdf) return x.mime === "application/pdf"
      return x.mime.startsWith("image/")
    }).length
    const virtualText = pdf ? `[PDF ${count + 1}]` : `[Image ${count + 1}]`
    const extmarkEnd = extmarkStart + virtualText.length
    const textToInsert = virtualText + " "

    input.insertText(textToInsert)

    const extmarkId = input.extmarks.create({
      start: extmarkStart,
      end: extmarkEnd,
      virtual: true,
      styleId: pasteStyleId,
      typeId: promptPartTypeId,
    })

    const part: Omit<FilePart, "id" | "messageID" | "sessionID"> = {
      type: "file" as const,
      mime: file.mime,
      filename: file.filename,
      url: `data:${file.mime};base64,${file.content}`,
      source: {
        type: "file",
        path: file.filepath ?? file.filename ?? "",
        text: {
          start: extmarkStart,
          end: extmarkEnd,
          value: virtualText,
        },
      },
    }
    setStore(
      produce((draft) => {
        const partIndex = draft.prompt.parts.length
        draft.prompt.parts.push(part)
        draft.extmarkToPartIndex.set(extmarkId, partIndex)
      }),
    )
    return
  }

  function clearPrompt() {
    if (store.prompt.input.trim().length >= DRAFT_RETENTION_MIN_CHARS || store.prompt.parts.length > 0) {
      history.append({
        ...store.prompt,
        mode: store.mode,
      })
    }
    // Keymap commands can outlive the composer: autocomplete onSelect may
    // navigate first (unmounting the prompt), then call clearPrompt.
    // OpenTUI throws "EditBuffer is destroyed" on any call after destroy —
    // skip buffer ops on a dead renderable. Store reset stays (idempotent).
    if (input && !input.isDestroyed) {
      input.clear()
      input.extmarks.clear()
    }
    setStore("prompt", {
      input: "",
      parts: [],
    })
    setStore("extmarkToPartIndex", new Map())
    // Fresh invitation after each send / clear so the expanded pool is felt in-session.
    const pool = store.mode === "shell" ? shell() : list()
    if (pool.length > 0) setStore("placeholder", randomIndex(pool.length))
  }

  const highlight = createMemo(() => {
    if (leader()) return theme.border
    if (store.mode === "shell") return theme.primary
    const agent = local.agent.current()
    if (!agent) return theme.border
    return local.agent.color(agent.name)
  })

  const showVariant = createMemo(() => {
    const variants = local.model.variant.list()
    if (variants.length === 0) return false
    const current = local.model.variant.current()
    return !!current
  })

  const agentMetaAlpha = createFadeIn(() => !!local.agent.current(), animationsEnabled)
  const modelMetaAlpha = createFadeIn(() => !!local.agent.current() && store.mode === "normal", animationsEnabled)
  const variantMetaAlpha = createFadeIn(
    () => !!local.agent.current() && store.mode === "normal" && showVariant(),
    animationsEnabled,
  )
  const borderHighlight = createMemo(() => tint(theme.border, highlight(), agentMetaAlpha()))

  const placeholderText = createMemo(() => {
    if (props.showPlaceholder === false) return undefined
    if (isCommandSpine()) {
      // Invitation only — no mode/objective prefix (meta row owns mode when non-default).
      if (store.mode === "shell") {
        if (!shell().length) return PROMPT_FRAME.shell
        return shell()[store.placeholder % shell().length]
      }
      if (!list().length) return PROMPT_FRAME.normal
      return list()[store.placeholder % list().length]
    }
    if (store.mode === "shell") {
      if (!shell().length) return undefined
      const example = shell()[store.placeholder % shell().length]
      return `${PROMPT_FRAME.shell} "${example}"`
    }
    if (!list().length) return undefined
    return `${PROMPT_FRAME.normal} "${list()[store.placeholder % list().length]}"`
  })

  // D5: geometry routes through the centralized spine contract — the prompt
  // does not subtract its own padding (command-spine-shell.tsx:69-71). A dead
  // memo that derived a move-label width here (zero consumers) was deleted.
  const maxHeight = createMemo(() => tuiConfig.prompt?.max_height ?? promptMaxHeight(dimensions().height))

  // Grok-like composer: mode changes the lead glyph (❯ vs !), not a permanent "intent" label.
  const spineShell = createMemo(() => isCommandSpine() && store.mode === "shell")
  const spinePrefix = createMemo(() => (spineShell() ? "! " : `${Glyph.prompt} `))
  const spinePrefixColor = createMemo(() => {
    if (props.disabled) return theme.spineDiffMuted
    if (spineShell()) return theme.primary
    if (leader()) return theme.textMuted
    return theme.spinePrompt
  })
  const spineBorderColor = createMemo(() => {
    if (props.disabled) return theme.spineRail
    if (spineShell()) return theme.primary
    if (leader()) return theme.spineRail
    return theme.spinePrompt
  })

  function AutocompleteSlot(slotProps: { layout: "inline" | "overlay" }) {
    return (
      <Autocomplete
        sessionID={props.sessionID}
        ref={(r) => {
          setAuto(() => r)
        }}
        anchor={() => anchor}
        input={() => input}
        clearPrompt={clearPrompt}
        setPrompt={(cb) => {
          setStore("prompt", produce(cb))
        }}
        setExtmark={(partIndex, extmarkId) => {
          setStore("extmarkToPartIndex", (map: Map<number, number>) => {
            const newMap = new Map(map)
            newMap.set(extmarkId, partIndex)
            return newMap
          })
        }}
        value={store.prompt.input}
        fileStyleId={fileStyleId}
        agentStyleId={agentStyleId}
        promptPartTypeId={() => promptPartTypeId}
        variant={props.variant}
        layout={slotProps.layout}
      />
    )
  }

  return (
    <>
      {/* Command-spine: commands panel sits in-flow ABOVE the composer (no absolute clip). */}
      <Show when={isCommandSpine()}>
        <AutocompleteSlot layout="inline" />
      </Show>
      <box
        ref={(r: BoxRenderable) => (anchor = r)}
        visible={props.visible !== false}
        width="100%"
        border={isCommandSpine() ? ["top", "bottom", "left", "right"] : ["top", "bottom"]}
        customBorderChars={isCommandSpine() ? RoundBorder : undefined}
        borderColor={isCommandSpine() ? spineBorderColor() : borderHighlight()}
        backgroundColor={isCommandSpine() ? theme.background : undefined}
      >
        <box width="100%">
          <box
            paddingLeft={isCommandSpine() ? 1 : 2}
            paddingRight={isCommandSpine() ? 1 : 2}
            paddingTop={isCommandSpine() ? 0 : 1}
            paddingBottom={isCommandSpine() ? 0 : 0}
            flexShrink={0}
            backgroundColor={isCommandSpine() ? theme.background : theme.backgroundElement}
            flexGrow={1}
            width="100%"
          >
            {/* Input row: Grok-style prefix + textarea; Arcana colors / shell bang. */}
            <box flexDirection="row" width="100%" alignItems="flex-start">
              <Show when={isCommandSpine()}>
                <text fg={spinePrefixColor()}>{spinePrefix()}</text>
              </Show>
              <box flexGrow={1} minWidth={0} flexShrink={1}>
                <textarea
                  width="100%"
                  placeholder={placeholderText() || "Speak your intent…"}
                  placeholderColor={isCommandSpine() ? theme.spineDiffMuted : theme.textMuted}
                  textColor={leader() ? theme.textMuted : isCommandSpine() ? theme.spineBrand : theme.text}
                  focusedTextColor={leader() ? theme.textMuted : isCommandSpine() ? theme.spineBrand : theme.text}
                  minHeight={1}
                  maxHeight={maxHeight()}
                  onContentChange={() => {
                    const value = input.plainText
                    setStore("prompt", "input", value)
                    auto()?.onInput(value)
                    syncExtmarksWithPromptParts()
                    setCursorVersion((value) => value + 1)
                    // Force scroll-to-cursor after newline insert
                    // Workaround for opentui textarea not auto-scrolling on Shift+Enter
                    const co = input.cursorOffset
                    if (co > 0) {
                      // Toggle offset briefly to trigger re-render of scroll position
                      input.cursorOffset = co - 1
                      input.cursorOffset = co
                    }
                  }}
                  onCursorChange={() => setCursorVersion((value) => value + 1)}
                  onKeyDown={(e: { preventDefault(): void }) => {
                    if (props.disabled) {
                      e.preventDefault()
                      return
                    }
                  }}
                  onSubmit={() => {
                    // Gates (permission / question) disable the composer — never
                    // handle Enter here or Decision confirm never receives it.
                    if (props.disabled) return
                    // One microtask is enough for IME commit; nested setTimeouts
                    // made Enter feel laggy / like a double-press on Windows.
                    queueMicrotask(() => {
                      void submit()
                    })
                  }}
                  onPaste={async (event: PasteEvent) => {
                    if (props.disabled) {
                      event.preventDefault()
                      return
                    }

                    // Normalize line endings at the boundary
                    // Windows ConPTY/Terminal often sends CR-only newlines in bracketed paste
                    // Replace CRLF first, then any remaining CR
                    const normalizedText = sanitizeInput(decodePasteBytes(event.bytes)).replace(/\r\n/g, "\n").replace(/\r/g, "\n")
                    const pastedContent = normalizedText.trim()

                    // Windows Terminal <1.25 can surface image-only clipboard as an
                    // empty bracketed paste. Windows Terminal 1.25+ does not.
                    if (!pastedContent) {
                      keymap.dispatchCommand("prompt.paste")
                      return
                    }

                    // Once we cross an async boundary below, the terminal may perform its
                    // default paste unless we suppress it first and handle insertion ourselves.
                    event.preventDefault()

                    await pasteInputText(normalizedText)
                  }}
                  ref={(r: TextareaRenderable) => {
                    input = r
                    Object.assign(r, {
                      getClipboardText: (text: string) => expandPastedTextPlaceholders(text, store.prompt.parts),
                    })
                    setInputTarget(r)
                    if (promptPartTypeId === 0) {
                      promptPartTypeId = input.extmarks.registerType("prompt-part")
                    }
                    props.ref?.(ref)
                    setTimeout(() => {
                      // setTimeout is a workaround and needs to be addressed properly
                      if (!input || input.isDestroyed) return
                      input.cursorColor = isCommandSpine()
                        ? spineShell()
                          ? theme.primary
                          : theme.spinePrompt
                        : theme.text
                    }, 0)
                  }}
                  onMouseDown={(r: MouseEvent) => {
                    if (props.disabled) return
                    r.target?.focus()
                  }}
                  focusedBackgroundColor={isCommandSpine() ? theme.background : theme.backgroundElement}
                  cursorColor={
                    props.disabled
                      ? isCommandSpine()
                        ? theme.spineDiffMuted
                        : theme.backgroundElement
                      : isCommandSpine()
                        ? spineShell()
                          ? theme.primary
                          : theme.spinePrompt
                        : theme.text
                  }
                  syntaxStyle={syntax()}
                />
                <Show when={intentGhost()}>
                  {(ghost) => (
                    <text
                      position="absolute"
                      top={intentGhostRow()}
                      left={intentGhostCol()}
                      fg={theme.textMuted}
                    >
                      {ghost().name}
                    </text>
                  )}
                </Show>
              </box>
            </box>
            {/* Info line — Grok model · flags; Arcana: no brand, no default "intent". */}
            <box flexDirection="row" flexShrink={0} paddingTop={0} gap={1} justifyContent="space-between">
              <box flexDirection="row" gap={1}>
                <Show when={local.agent.current()} fallback={<box height={1} />}>
                  {(agent) => (
                    <>
                      <Show when={!isCommandSpine()}>
                        <text fg={fadeColor(theme.accent, agentMetaAlpha())}>
                          {`${Glyph.sigil} ${store.mode === "shell" ? "shell" : agent().name.toLowerCase()}`}
                        </text>
                      </Show>
                      {/* Command-spine shell: single mode caption (Grok "Run shell command"). */}
                      <Show when={isCommandSpine() && store.mode === "shell"}>
                        <text fg={fadeColor(theme.primary, agentMetaAlpha())}>shell</text>
                      </Show>
                      {/* Command-spine normal: model first; agent only when non-default. */}
                      <Show when={store.mode === "normal"}>
                        <box flexDirection="row" gap={1}>
                          <Show when={isCommandSpine() && isNonDefaultAgent()}>
                            <text fg={fadeColor(theme.spinePrompt, agentMetaAlpha())}>
                              {agent().name.toLowerCase()}
                            </text>
                            <text fg={fadeColor(theme.spineRailActive, modelMetaAlpha())}>·</text>
                          </Show>
                          <Show when={!isCommandSpine()}>
                            <text fg={fadeColor(theme.accent, modelMetaAlpha())}>◆</text>
                          </Show>
                          <text
                            flexShrink={0}
                            fg={fadeColor(
                              leader()
                                ? theme.textMuted
                                : isCommandSpine()
                                  ? theme.spineBrand
                                  : theme.text,
                              modelMetaAlpha(),
                            )}
                          >
                            {displayModelId()}
                          </text>
                          <Show when={currentProviderLabel()}>
                            <text fg={fadeColor(theme.textMuted, modelMetaAlpha())}>·</text>
                            <text fg={fadeColor(theme.textMuted, modelMetaAlpha())}>{currentProviderLabel()}</text>
                          </Show>
                          <Show when={showVariant()}>
                            <text fg={fadeColor(theme.textMuted, variantMetaAlpha())}>·</text>
                            <text>
                              <span style={{ fg: fadeColor(theme.warning, variantMetaAlpha()), bold: true }}>
                                {local.model.variant.current()}
                              </span>
                            </text>
                          </Show>
                        </box>
                      </Show>
                    </>
                  )}
                </Show>
              </box>
              <Show when={hasRightContent()}>
                <box flexDirection="row" gap={1} alignItems="center">
                  {props.right}
                </box>
              </Show>
            </box>
          </box>

        </box>
      </box>
        <box width="100%" flexDirection="row" justifyContent="space-between">
          <Switch>
            <Match when={!isCommandSpine() && status().type !== "idle"}>
              <box
                flexDirection="row"
                gap={1}
                flexGrow={1}
                justifyContent={status().type === "retry" ? "space-between" : "flex-start"}
              >
                <box flexShrink={0} flexDirection="row" gap={1}>
                  <box marginLeft={1}>
                    <SigilSpinner color={highlight()} interval={120} />
                  </box>
                  <box flexDirection="row" gap={1} flexShrink={0}>
                    {(() => {
                      const retry = createMemo(() => {
                        const s = status()
                        if (s.type !== "retry") return
                        return s
                      })
                      const message = createMemo(() => {
                        const r = retry()
                        if (!r) return
                        if (r.message.includes("exceeded your current quota") && r.message.includes("gemini"))
                          return "gemini is way too hot right now"
                        if (Locale.displayWidth(r.message) > 80) return Locale.truncate(r.message, 80)
                        return r.message
                      })
                      const isTruncated = createMemo(() => {
                        const r = retry()
                        if (!r) return false
                        return r.message.length > 120
                      })
                      const [seconds, setSeconds] = createSignal(0)
                      onMount(() => {
                        const timer = setInterval(() => {
                          const next = retry()?.next
                          if (next) setSeconds(Math.round((next - Date.now()) / 1000))
                        }, 1000)

                        onCleanup(() => {
                          clearInterval(timer)
                        })
                      })
                      const handleMessageClick = () => {
                        const r = retry()
                        if (!r) return
                        if (isTruncated()) {
                          void DialogAlert.show(dialog, "Retry Error", r.message)
                        }
                      }

                      const retryText = () => {
                        const r = retry()
                        if (!r) return ""
                        const baseMessage = message()
                        const truncatedHint = isTruncated() ? " (click to expand)" : ""
                        const duration = formatDuration(seconds())
                        const retryInfo = ` [retrying ${duration ? `in ${duration} ` : ""}attempt #${r.attempt}]`
                        return baseMessage + truncatedHint + retryInfo
                      }

                      return (
                        <Show when={retry()}>
                          <box onMouseUp={handleMessageClick}>
                            <text fg={theme.error}>{retryText()}</text>
                          </box>
                        </Show>
                      )
                    })()}
                  </box>
                </box>
                <text fg={store.interrupt > 0 ? theme.primary : theme.text}>
                  esc{" "}
                  <span style={{ fg: store.interrupt > 0 ? theme.primary : theme.textMuted }}>
                    {store.interrupt > 0 ? "again to interrupt" : "interrupt"}
                  </span>
                </text>
              </box>
            </Match>
            <Match when={workspace.notice()}>
              {(notice) => (
                <box paddingLeft={3}>
                  <text fg={theme.accent}>{notice()}</text>
                </box>
              )}
            </Match>
            <Match when={workspace.label()}>
              {(label) => (
                <box paddingLeft={3} flexDirection="row" gap={1}>
                  <Show when={workspace.creating()}>
                    <Spinner color={theme.accent} />
                  </Show>
                  <text fg={workspace.creating() ? theme.accent : theme.text}>
                    {(() => {
                      const item = label()
                      if (item.type === "new") {
                        if (workspace.creating())
                          return `Creating ${item.workspaceType}${".".repeat(workspace.creatingDots())}`
                        return (
                          <>
                            Workspace <span style={{ fg: theme.textMuted }}>(new {item.workspaceType})</span>
                          </>
                        )
                      }
                      return (
                        <>
                          Workspace <span style={{ fg: theme.textMuted }}>{item.workspaceName}</span>
                        </>
                      )
                    })()}
                  </text>
                </box>
              )}
            </Match>
            <Match when={move.progress()}>
              {(progress) => (
                <box paddingLeft={3}>
                  <Spinner color={theme.accent}>
                    {progress()}
                    <span style={{ fg: theme.textMuted }}>{".".repeat(move.creatingDots())}</span>
                  </Spinner>
                </box>
              )}
            </Match>
            <Match when={move.pendingNew()}>
              <box paddingLeft={3}>
                <text fg={theme.accent}>(new working copy)</text>
              </box>
            </Match>
            <Match when={true}>{props.hint ?? <text />}</Match>
          </Switch>
          {/* Keybind hint row removed for v0.3.18 — was "tab agents / ctrl+p commands" plus
              the file-context label. The footer is now just the SessionMetricsBar
              (elapsed · tokens · cost · context pressure · free-usage). The keybinds
              are still discoverable via `?` (help.show) and the command palette. */}
      </box>
      <Show when={!isCommandSpine()}>
        <SessionMetricsBar sessionID={props.sessionID} freeUsage={null} />
      </Show>
      {/* Default shell: absolute overlay relative to prompt parent. */}
      <Show when={!isCommandSpine()}>
        <AutocompleteSlot layout="overlay" />
      </Show>
    </>
  )
}
