/** @jsxImportSource @opentui/solid */
import { batch, For, Show, Switch, Match, createContext, createMemo, createSignal, createEffect, onMount, useContext, type JSX } from "solid-js"
import { Dynamic } from "solid-js/web"
import { BoxRenderable, RGBA } from "@opentui/core"
import type { AssistantMessage, Part, ToolPart, TextPart, UserMessage, Provider } from "@arcana/sdk/v2"
import type { ReasoningPart as ReasoningPartType } from "@arcana/sdk/v2"
import { Lexicon, Glyph, AgentSigil, VerbPool } from "../../branding"
import { arcanaDitherPattern, arcanaDitherTick } from "../../ui/arcana"
import { arcanaTaskFromPart, promptTextFromPart } from "../../arcana/task"
import * as Model from "../../util/model"
import { collapseToolOutput } from "../../util/collapse-tool-output"
import { filetype } from "../../util/filetype"
import { Locale } from "../../util/locale"
import { pickVerb } from "../../util/verb"
import { createSyntaxStyleMemo, generateSubtleSyntax, selectedForeground, useTheme } from "../../context/theme"
import { reasoningSummary, type ThinkingMode } from "../../context/thinking"
import { useSync } from "../../context/sync"
import { useLocal } from "../../context/local"
import { useCommandShortcut } from "../../keymap"
import { setPreLayoutSiblingMargin } from "../../util/layout"
import { Scramble } from "../../component/scramble"
import { SigilSpinner } from "../../component/sigil-spinner"
import { SplitBorder } from "../../ui/border"
import { DialogAlert } from "../../ui/dialog-alert"
import { TodoItem } from "../../component/todo-item"
import { webSearchProviderLabel } from "../../util/tool-display"
import { useRenderer } from "@opentui/solid"
import { usePathFormatter } from "../../context/path-format"
import { useDialog } from "../../ui/dialog"
import { normalizePath } from "../../util/path"
import { useTuiTerminalEnvironment } from "../../context/runtime"
import { createWidgetRenderNode } from "../../shell/command-spine/widgets/registry"
import { SpineToolChip } from "../../shell/command-spine/spine-tool-chip"
import { toolCategoryLabel, type ToolChipLifecycle } from "../../shell/command-spine/spine-chrome"
import stripAnsi from "strip-ansi"

export const context = createContext<{
  width: number
  sessionID: string
  conceal: () => boolean
  thinkingMode: () => ThinkingMode
  showThinking: () => boolean
  showTimestamps: () => boolean
  showDetails: () => boolean
  showGenericToolOutput: () => boolean
  showGutter: () => boolean
  userMessageIDs: () => ReadonlySet<string>
  diffWrapMode: () => "word" | "none"
  providers: () => ReadonlyMap<string, Provider>
  sync: any
  tui: any
  enterChild: (sessionID: string) => Promise<void>
}>()

function use() {
  const ctx = useContext(context)
  if (!ctx) throw new Error("useContext must be used within a Session component")
  return ctx
}

/* Tool-part and message renderers extracted from routes/session/index.tsx.
   Presentational only: contexts (useSync/useTheme/useRenderer) are consumed
   internally; everything else arrives via props/ctx. */

const MIME_BADGE: Record<string, string> = {
  "text/plain": "txt",
  "image/png": "img",
  "image/jpeg": "img",
  "image/gif": "img",
  "image/webp": "img",
  "application/pdf": "pdf",
  "application/x-directory": "dir",
}

export function UserMessage(props: {
  message: UserMessage
  parts: Part[]
  onMouseUp: () => void
  index: number
  pending?: string
}) {
  const ctx = use()
  const local = useLocal()
  const text = createMemo(() => {
    const texts: string[] = []
    for (const part of props.parts) {
      if (part.type === "text" && !part.synthetic) texts.push(part.text)
    }
    return texts.join("\n\n")
  })
  const files = createMemo(() => {
    const result: Extract<Part, { type: "file" }>[] = []
    for (const part of props.parts) if (part.type === "file") result.push(part)
    return result
  })
  const arcanaTask = createMemo(() => {
    for (const part of props.parts) {
      const task = arcanaTaskFromPart(part)
      if (task) return task
    }
    return undefined
  })
  const { theme } = useTheme()
  const [hover, setHover] = createSignal(false)
  const queued = createMemo(() => props.pending && props.message.id > props.pending)
  const metadataVisible = createMemo(() => queued() || ctx.showTimestamps())

  const compaction = createMemo(() => {
    for (const part of props.parts) if (part.type === "compaction") return part
    return undefined
  })

  return (
    <>
      <Show when={text()}>
        <box
          id={props.message.id}
          paddingLeft={3}
          marginTop={props.index === 0 ? 0 : 1}
          minWidth={0}
        >
          <box flexDirection="row" minWidth={0}>
            <box width={8} flexDirection="column">
              <text>
                <span style={{ fg: theme.textMuted }}>{arcanaDitherTick(props.message.id)}</span>
                <span style={{ fg: theme.text, bold: true }}> USER</span>
                <Show when={queued()}>
                  <span style={{ fg: theme.textMuted }}> · queued</span>
                </Show>
              </text>
            </box>
            <box
              flexGrow={1}
              onMouseOver={() => {
              setHover(true)
            }}
            onMouseOut={() => {
              setHover(false)
            }}
            onMouseUp={props.onMouseUp}
            paddingTop={1}
            paddingBottom={1}
            paddingLeft={2}
            backgroundColor={hover() ? theme.backgroundElement : theme.backgroundPanel}
            flexShrink={0}
          >
            <Show when={arcanaTask()}>
              {(task) => (
                <box flexDirection="row" paddingBottom={1}>
                  <text fg={theme.textMuted}>
                    <span style={{ bg: theme.backgroundElement, fg: theme.accent, bold: true }}>
                      /{task().command}
                    </span>
                    <span> {arcanaDitherPattern(task().command, 6)} Arcana task</span>
                    <Show when={task().objective_label}>
                      {(objective) => <span> {Glyph.sep} objective:{objective()}</span>}
                    </Show>
                    <Show when={task().risk}>
                      {(risk) => <span> {Glyph.sep} risk:{risk()}</span>}
                    </Show>
                    <Show when={task().approval_required}>
                      <span> {Glyph.sep} {task().approval_status === "approved" ? "approval:approved" : "approval required"}</span>
                    </Show>
                  </text>
                </box>
              )}
            </Show>
            <text fg={theme.text}>{text()}</text>
            <Show when={files().length}>
              <box flexDirection="row" paddingBottom={metadataVisible() ? 1 : 0} paddingTop={1} gap={1} flexWrap="wrap">
                <For each={files()}>
                  {(file) => {
                    const bg = createMemo(() => {
                      if (file.mime.startsWith("image/")) return theme.accent
                      if (file.mime === "application/pdf") return theme.primary
                      return theme.secondary
                    })
                    return (
                      <text fg={theme.text}>
                        <span style={{ bg: bg(), fg: selectedForeground(theme, bg()) }}> {MIME_BADGE[file.mime] ?? file.mime} </span>
                        <span style={{ bg: theme.backgroundElement, fg: theme.textMuted }}> {file.filename} </span>
                      </text>
                    )
                  }}
                </For>
              </box>
            </Show>
            <Show when={!queued() && ctx.showTimestamps()}>
              <text fg={theme.textMuted}>
                <span style={{ fg: theme.textMuted }}>
                  {Locale.todayTimeOrDateTime(props.message.time.created)}
                </span>
              </text>
            </Show>
          </box>
        </box>
        </box>
      </Show>
      <Show when={compaction()}>
        <box
          marginTop={1}
          border={["top"]}
          title=" Compaction "
          titleAlignment="center"
          borderColor={theme.borderActive}
        />
      </Show>
    </>
  )
}

export function AssistantMessage(props: {
  message: AssistantMessage
  parts: Part[]
  last: boolean
  duration: number
}) {
  const ctx = use()
  const _local = useLocal()
  const { theme } = useTheme()
  const model = createMemo(() => Model.name(ctx.providers(), props.message.providerID, props.message.modelID))

  const final = createMemo(() => {
    return props.message.finish && !["tool-calls", "unknown"].includes(props.message.finish)
  })

  const duration = createMemo(() => (final() ? props.duration : 0))

  const childShortcut = useCommandShortcut("session.child.first")
  const backgroundShortcut = useCommandShortcut("session.background")

  const taskTools = createMemo(() => {
    const result: ToolPart[] = []
    for (const part of props.parts) {
      if (part.type === "tool" && part.tool === "task") result.push(part as ToolPart)
    }
    return result
  })
  const hasTaskTool = createMemo(() => taskTools().length > 0)
  const hasRunningForegroundTaskTool = createMemo(() => {
    for (const tool of taskTools()) {
      if (tool.state.status === "running" && tool.state.metadata?.background !== true) return true
    }
    return false
  })

  return (
    <>
      <box paddingLeft={3} marginTop={props.last ? 0 : 1} minWidth={0}>
        <text fg={theme.textMuted}>
          {arcanaDitherPattern(props.message.id, 10)} ASSISTANT {model()}
          {duration() ? ` ${Locale.duration(duration())}` : ""}
        </text>
      </box>
      <For each={props.parts}>
        {(part, index) => {
          const Component = PART_MAPPING[part.type as keyof typeof PART_MAPPING]
          return (
            <Show when={Component}>
              <Dynamic
                last={index() === props.parts.length - 1}
                component={Component}
                // Dynamic's generic prop types can't narrow union part types — cast needed.
                part={part as any}
                message={props.message}
              />
            </Show>
          )
        }}
      </For>
      <Show when={hasTaskTool()}>
        <box paddingTop={1} paddingLeft={3}>
          <text fg={theme.text}>
            {childShortcut()}
            <span style={{ fg: theme.textMuted }}> view subagents</span>
            <Show when={hasRunningForegroundTaskTool()}>
              <span style={{ fg: theme.textMuted }}> {Glyph.sep} </span>
              {backgroundShortcut()}
              <span style={{ fg: theme.textMuted }}> background</span>
            </Show>
          </text>
        </box>
      </Show>
      <Show when={props.message.error && props.message.error.name !== "MessageAbortedError"}>
        <box
          id={`assistant-error-${props.message.id}`}
          paddingTop={1}
          paddingBottom={1}
          paddingLeft={3}
          marginTop={1}
          backgroundColor={theme.backgroundPanel}
          gap={0}
        >
          <text fg={theme.error}>
            {arcanaDitherPattern(`error-${props.message.id}`, 10)} ERROR
          </text>
          <Scramble error text={(props.message.error?.data as { message?: string } | undefined)?.message ?? "Unknown error"} fg={theme.error} />
        </box>
      </Show>
      <Switch>
        <Match when={props.last || final() || props.message.error?.name === "MessageAbortedError"}>
          <box id={`assistant-summary-${props.message.id}`} paddingLeft={3}>
            <text marginTop={1}>
              <span
                style={{
                  fg: props.message.error?.name === "MessageAbortedError"
                    ? theme.textMuted
                    : theme.accent,
                }}
              >
                {Glyph.diamond}{" "}
              </span>{" "}
              <span style={{ fg: theme.accent }}>{Lexicon.Agent[props.message.mode as keyof typeof Lexicon.Agent] ?? Locale.titlecase(props.message.mode)}</span>
              <span style={{ fg: theme.textMuted }}> {Glyph.sep} {model()}</span>
              <Show when={duration()}>
                <span style={{ fg: theme.textMuted }}> {Glyph.sep} {Locale.duration(duration())}</span>
              </Show>
              <Show when={props.message.error?.name === "MessageAbortedError"}>
                <span style={{ fg: theme.textMuted }}> {Glyph.sep} interrupted</span>
              </Show>
            </text>
          </box>
        </Match>
      </Switch>
    </>
  )
}

const PART_MAPPING = {
  text: TextPart,
  tool: ToolPart,
  reasoning: ReasoningPart,
}

export function ReasoningPart(props: { last: boolean; part: ReasoningPartType; message: AssistantMessage }) {
  const { theme } = useTheme()
  const ctx = use()
  // Show mode = expanded by default. Hide mode = collapsed by default.
  // Click always toggles regardless of mode.
  const inMinimal = createMemo(() => ctx.thinkingMode() === "hide")
  const [expanded, setExpanded] = createSignal(!inMinimal())

  const content = createMemo(() => {
    // OpenRouter encrypts some reasoning blocks; drop the placeholder.
    return props.part.text.replace("[REDACTED]", "").trim()
  })
  // Reasoning is finalized when the server sets `time.end` (see processor.ts).
  // Flips independently of the parent message completing.
  const isDone = createMemo(() => props.part.time.end !== undefined)
  const duration = createMemo(() => {
    const end = props.part.time.end
    return end === undefined ? 0 : Math.max(0, end - props.part.time.start)
  })
  const summary = createMemo(() => reasoningSummary(content()))
  // Available width for the reasoning body: message column minus the
  // container indent (3), the minimal-mode extra indent (2), and the left
  // border (1). Clamped so degenerate widths never produce a zero/negative
  // render target (same defensive pattern as spine-prose wrapCols).
  const reasoningBodyWidth = createMemo(() =>
    Math.max(1, ctx.width - 3 - (inMinimal() ? 2 : 0) - 1),
  )
  const syntax = createSyntaxStyleMemo(() => generateSubtleSyntax(theme))

  const toggle = () => {
    setExpanded((prev) => !prev)
  }

  return (
    <Show when={content()}>
      <box
        id={`text-${props.part.messageID}-${props.part.id}`}
        paddingLeft={3}
        marginTop={1}
        flexDirection="column"
        flexShrink={0}
      >
        <box onMouseUp={toggle}>
          <ReasoningHeader
            toggleable={true}
            open={expanded()}
            done={isDone()}
            title={summary().title}
            duration={isDone() ? Locale.duration(duration()) : undefined}
            verbSeed={props.message.sessionID}
          />
        </box>
        <Show when={(!inMinimal() || expanded()) && summary().body}>
          <box
            paddingLeft={inMinimal() ? 2 : 0}
            marginTop={1}
            border={["left"]}
            borderColor={theme.borderThinking}
            width={reasoningBodyWidth()}
          >
            <code
              filetype="markdown"
              // Keep the first frame visible; the Arcana OpenTUI patch retains
              // the last styled frame while a final highlight is pending.
              drawUnstyledText={true}
              streaming={!isDone()}
              syntaxStyle={syntax()}
              content={summary().body}
              conceal={ctx.conceal()}
              fg={theme.textMuted}
              wrapMode="word"
              width={reasoningBodyWidth()}
            />
          </box>
        </Show>
      </box>
    </Show>
  )
}

function ReasoningHeader(props: {
  toggleable: boolean
  open: boolean
  done: boolean
  title: string | null
  duration?: string
  verbSeed: string
}) {
  const { theme } = useTheme()
  const fg = () => theme.accent
  const verb = createMemo(() => pickVerb(VerbPool.thought, props.verbSeed))
  const verbIng = createMemo(() => pickVerb(VerbPool.thinking, props.verbSeed))

  return (
    <Switch>
      <Match when={!props.done}>
        <box flexDirection="row">
          <SigilSpinner color={fg()}>{props.title ? verbIng() + ": " + props.title : verbIng()}</SigilSpinner>
        </box>
      </Match>
      <Match when={true}>
        <text fg={fg()} wrapMode="none">
          <Show when={props.toggleable}>
            <span>{props.open ? Glyph.sigil + " " : AgentSigil.subagent + " "}</span>
          </Show>
          <span>{verb()}</span>
          <Show when={props.title || props.duration}>
            <span> </span>
          </Show>
          <Show when={props.title}>
            <span>{props.title}</span>
          </Show>
          <Show when={props.duration}>
            <span>
              {props.title ? ` ${Glyph.sep} ` : ""}
              {props.duration}
            </span>
          </Show>
        </text>
      </Match>
    </Switch>
  )
}

function TextPart(props: { last: boolean; part: TextPart; message: AssistantMessage }) {
  const ctx = use()
  const { theme, syntax } = useTheme()
  const renderer = useRenderer()
  const widgetRenderNode = createMemo(() =>
    createWidgetRenderNode({ renderer, theme: theme as any }),
  )
  // Keep streaming true only while the assistant message is open. OpenTUI
  // finalizes trailing markdown tokens (bold, fences, lists) when this flips false.
  const streaming = createMemo(() => !props.message.time.completed)
  // Don't trim the live stream — trailing whitespace/newlines matter for layout
  // and incomplete markdown structures. Empty check still uses trim.
  const content = createMemo(() => props.part.text.replace(/\r\n/g, "\n").replace(/\r/g, "\n"))
  return (
    <Show when={content().trim()}>
      <box id={`text-${props.part.messageID}-${props.part.id}`} paddingLeft={3} marginTop={1} flexShrink={0} minWidth={0}>
        <markdown
          syntaxStyle={syntax()}
          streaming={streaming()}
          internalBlockMode="top-level"
          content={content()}
          tableOptions={{ style: "grid" }}
          conceal={ctx.conceal()}
          fg={theme.markdownText}
          bg={theme.background}
          renderNode={widgetRenderNode()}
        />
      </box>
    </Show>
  )
}

// Pending messages moved to individual tool pending functions

function ToolPart(props: { last: boolean; part: ToolPart; message: AssistantMessage }) {
  const ctx = use()
  const display = createMemo(() => toolDisplay(props.part.tool))

  // Hide tool if showDetails is false and tool completed successfully
  const shouldHide = createMemo(() => {
    if (ctx.showDetails()) return false
    if (props.part.state.status !== "completed") return false
    return true
  })

  const toolprops = {
    get metadata() {
      return props.part.state.status === "pending" ? {} : (props.part.state.metadata ?? {})
    },
    get input() {
      return props.part.state.input ?? {}
    },
    get output() {
      return props.part.state.status === "completed" ? props.part.state.output : undefined
    },
    get tool() {
      return props.part.tool
    },
    get part() {
      return props.part
    },
  }

  return (
    <Show when={!shouldHide()}>
      <Switch>
        <Match when={display() === "bash"}>
          <Shell {...toolprops} />
        </Match>
        <Match when={display() === "glob"}>
          <Glob {...toolprops} />
        </Match>
        <Match when={display() === "read"}>
          <Read {...toolprops} />
        </Match>
        <Match when={display() === "grep"}>
          <Grep {...toolprops} />
        </Match>
        <Match when={display() === "webfetch"}>
          <WebFetch {...toolprops} />
        </Match>
        <Match when={display() === "websearch"}>
          <WebSearch {...toolprops} />
        </Match>
        <Match when={display() === "write"}>
          <Write {...toolprops} />
        </Match>
        <Match when={display() === "edit"}>
          <Edit {...toolprops} />
        </Match>
        <Match when={display() === "task"}>
          <Task {...toolprops} />
        </Match>
        <Match when={display() === "apply_patch"}>
          <ApplyPatch {...toolprops} />
        </Match>
        <Match when={display() === "todowrite"}>
          <TodoWrite {...toolprops} />
        </Match>
        <Match when={display() === "question"}>
          <Question {...toolprops} />
        </Match>
        <Match when={display() === "skill"}>
          <Skill {...toolprops} />
        </Match>
        <Match when={true}>
          <GenericTool {...toolprops} />
        </Match>
      </Switch>
    </Show>
  )
}

type ToolProps = {
  input: Record<string, unknown>
  metadata: Record<string, unknown>
  tool: string
  output?: string
  part: ToolPart
}
function GenericTool(props: ToolProps) {
  /** Strip MCP browser tool prefix for display. Matches any server name,
   *  so renaming the MCP server in arcana.json won't break the display. */
  const BROWSER_TOOL_RE = /^mcp_[a-zA-Z][a-zA-Z0-9-]*_agent_browser_/
  function browserToolDisplay(tool: string): string {
    const m = tool.match(BROWSER_TOOL_RE)
    return m ? tool.slice(m[0].length) : tool
  }

  /** Sanitize browser tool output for terminal display.
   *  Screenshots are model-only — the user can't view them. */
  const SCREENSHOT_PATH_RE = /\/tmp\/screenshot-[a-zA-Z0-9-]+\.(png|jpg|jpeg|webp)/
  function browserToolOutput(tool: string, output: string): string {
    if (!BROWSER_TOOL_RE.test(tool)) return output
    if (tool.includes("agent_browser_screenshot") || SCREENSHOT_PATH_RE.test(output)) {
      return "[screenshot taken — describe what you see textually]"
    }
    return output
  }

  const { theme } = useTheme()
  const renderer = useRenderer()
  const widgetRenderNode = createMemo(() =>
    createWidgetRenderNode({ renderer, theme: theme as any }),
  )
  const style = createSyntaxStyleMemo(() => generateSubtleSyntax(theme))
  const ctx = use()
  const output = createMemo(() => {
    const raw = props.output?.trim() ?? ""
    return browserToolOutput(props.tool, raw)
  })
  const [expanded, setExpanded] = createSignal(false)
  const maxLines = 3
  const maxChars = createMemo(() => maxLines * Math.max(20, ctx.width - 6))
  const collapsed = createMemo(() => collapseToolOutput(output(), maxLines, maxChars()))
  const limited = createMemo(() => {
    if (expanded() || !collapsed().overflow) return output()
    return collapsed().output
  })

  // Detect todo-like JSON arrays in generic tool output and render them nicely
  type FormattedOutput = 
    | { type: "todos"; items: Array<{ status: string; content: string }> }
    | { type: "table"; columns: string[]; rows: Array<Record<string, string>> }
    | { type: "kv"; entries: Array<[string, string]> }
    | { type: "xml" }
    | { type: "raw" }

  const formattedOutput = createMemo((): FormattedOutput => {
    const raw = output()

    // XML / structured markup: raw text starting with <
    if (raw.trim().startsWith("<")) return { type: "xml" }

    try {
      const parsed = JSON.parse(raw)

      // Todos: array of objects with content + status
      if (Array.isArray(parsed) && parsed.length > 0 && parsed.every(
        (item: unknown) => typeof item === "object" && item !== null &&
        "content" in (item as Record<string, unknown>) && "status" in (item as Record<string, unknown>)
      )) {
        return { type: "todos", items: parseTodos(parsed) }
      }

      // Table: array of objects with consistent string keys
      if (Array.isArray(parsed) && parsed.length > 0 && parsed.every(
        (item: unknown) => typeof item === "object" && item !== null
      )) {
        const keys = Object.keys(parsed[0] as object)
        if (keys.length >= 2 && keys.length <= 5) {
          const rows = parsed.map((item: any) => {
            const row: Record<string, string> = {}
            for (const k of keys) row[k] = String(item[k] ?? "")
            return row
          })
          return { type: "table", columns: keys, rows }
        }
      }

      // Key-value: flat object with string/number/boolean values
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        const entries = Object.entries(parsed as Record<string, unknown>)
          .filter(([, v]) => typeof v === "string" || typeof v === "number" || typeof v === "boolean")
          .map(([k, v]) => [k, String(v)] as [string, string])
        if (entries.length > 0) return { type: "kv", entries }
      }
    } catch {}
    return { type: "raw" }
  })

  const badge = createMemo(() => {
    const fmt = formattedOutput()
    if (fmt.type === "todos") return `${fmt.items.length} todos`
    if (fmt.type === "table") return `${fmt.rows.length} rows`
    if (fmt.type === "kv") return `${fmt.entries.length} fields`
    return ""
  })

  return (
    <Show
      when={props.output && ctx.showGenericToolOutput()}
      fallback={
        <InlineTool icon="⚙" pending={pickVerb(VerbPool.pending.generic, props.part.sessionID) + "…"} complete={true} part={props.part}>
          {browserToolDisplay(props.tool)} {input(props.input)} {badge()}
        </InlineTool>
      }
    >
      <BlockTool
        title={`# ${browserToolDisplay(props.tool)} ${input(props.input)}`}
        part={props.part}
        onClick={collapsed().overflow ? () => setExpanded((prev) => !prev) : undefined}
      >
        <box gap={1} paddingLeft={3} flexGrow={1} minWidth={0}>
          <Switch>
            <Match when={formattedOutput().type === "todos"}>
              <For each={(formattedOutput() as { type: "todos"; items: any[] }).items}>
                {(todo) => <TodoItem status={todo.status} content={todo.content} />}
              </For>
            </Match>
            <Match when={formattedOutput().type === "table"}>
              {((): any => {
                const tbl = formattedOutput() as { type: "table"; columns: string[]; rows: Record<string,string>[] }
                return (
                  <box flexDirection="column" gap={0}>
                    <box flexDirection="row" gap={2}>
                      <For each={tbl.columns}>{(col) => 
                        <text fg={theme.textMuted} width={Math.max(8, Math.floor(ctx.width / tbl.columns.length))}><span style={{ bold: true }}>{col}</span></text>
                      }</For>
                    </box>
                    <For each={tbl.rows.slice(0, 20)}>{(row) =>
                      <box flexDirection="row" gap={2}>
                        <For each={tbl.columns}>{(col) =>
                          <text fg={theme.text} width={Math.max(8, Math.floor(ctx.width / tbl.columns.length))}>{row[col]}</text>
                        }</For>
                      </box>
                    }</For>
                  </box>
                )
              })()}
            </Match>
            <Match when={formattedOutput().type === "kv"}>
              <For each={(formattedOutput() as { type: "kv"; entries: [string,string][] }).entries}>
                {([k, v]) => (
                  <box flexDirection="row" gap={1}>
                    <text fg={theme.textMuted}>{k}:</text>
                    <text fg={theme.text}>{v}</text>
                  </box>
                )}
              </For>
            </Match>
            <Match when={formattedOutput().type === "xml"}>
              {((): any => {
                const raw = limited()
                const taskResult = raw.match(/<task_result>([\s\S]*?)<\/task_result>/)
                const activeGoal = raw.match(/<active-goal>([\s\S]*?)<\/active-goal>/)
                const taskState = raw.match(/<task\s[^>]*state="(\w+)"/)
                return <box flexDirection="column" gap={0}>
                  <Show when={taskState}>
                    <text fg={theme.textMuted}>
                      {(taskState![1] === "completed" ? "◎" : "◇") + " Task " + taskState![1]}
                    </text>
                  </Show>
                  <Show when={activeGoal}>
                    <text fg={theme.text} wrapMode="word">{(activeGoal![1] ?? "").trim()}</text>
                  </Show>
                  <Show when={taskResult && !activeGoal}>
                    <text fg={theme.text} wrapMode="word">{(taskResult![1] ?? "").trim()}</text>
                  </Show>
                  <Show when={!taskState && !activeGoal && !taskResult}>
                    <text fg={theme.textMuted} wrapMode="word">{limited()}</text>
                  </Show>
                </box>
              })()}
            </Match>
            <Match when={true}>
              <box flexGrow={1} minWidth={0}>
                <markdown
                  syntaxStyle={style()}
                  streaming={false}
                  internalBlockMode="top-level"
                  content={output()}
                  tableOptions={{ style: "columns", wrapMode: "word", widthMode: "full" }}
                  conceal={true}
                  fg={theme.markdownText}
                  bg={theme.background}
                  renderNode={widgetRenderNode()}
                />
              </box>
            </Match>
          </Switch>
          <Show when={collapsed().overflow}>
            <text fg={theme.textMuted}>{expanded() ? "Click to collapse" : "Click to expand"}</text>
          </Show>
        </box>
      </BlockTool>
    </Show>
  )
}

function formatPermissionDenial(error: string): string {
  // Extract rules JSON from the error message and format as readable list
  try {
    const match = error.match(/\[.*\]/s)
    if (!match) return "Permission denied by user rules."
    const rules = JSON.parse(match[0]) as Array<{ permission: string; pattern: string; action: string }>
    if (!Array.isArray(rules)) return "Permission denied by user rules."
    const denyRules = rules.filter(r => r.action === "deny")
    if (!denyRules.length) return "Permission denied by user rules."
    return "Permission denied:\n" + denyRules.map(r =>
      `  deny ${r.permission || "?"} → ${r.pattern || "*"}`
    ).join("\n")
  } catch {
    return "Permission denied by user rules."
  }
}

function InlineTool(props: {
  icon: string
  iconColor?: RGBA
  color?: RGBA
  complete: unknown
  pending: string
  failure?: string
  spinner?: boolean
  subagent?: boolean
  children: JSX.Element
  part: ToolPart
  onClick?: () => void
}) {
  const { theme } = useTheme()
  const ctx = use()
  const sync = useSync()
  const renderer = useRenderer()
  const [hover, setHover] = createSignal(false)
  const [errorExpanded, setErrorExpanded] = createSignal(false)
  // Glow flash when tool transitions from running → complete
  const [glowing, setGlowing] = createSignal(false)
  createEffect(() => {
    if (props.complete && props.pending) {
      setGlowing(true)
      const timer = setTimeout(() => setGlowing(false), 600)
      return () => clearTimeout(timer)
    }
  })

  const permission = createMemo(() => {
    const callID = sync.data.permission[ctx.sessionID]?.at(0)?.tool?.callID
    if (!callID) return false
    return callID === props.part.callID
  })

  const error = createMemo(() => (props.part.state.status === "error" ? props.part.state.error : undefined))

  const denied = createMemo(
    () =>
      error()?.includes("QuestionRejectedError") ||
      error()?.includes("rejected permission") ||
      error()?.includes("specified a rule") ||
      error()?.includes("user dismissed"),
  )

  const failed = createMemo(() => Boolean(error() && !denied()))
  const clickable = createMemo(() => Boolean(props.onClick || failed()))
  const chipLifecycle = createMemo<ToolChipLifecycle>(() => {
    if (failed() || denied()) return "failure"
    if (props.part.state.status === "cancelled") return "interrupted"
    if (props.spinner || props.part.state.status === "running") return "running"
    if (props.part.state.status === "pending") return "queued"
    return props.complete ? "success" : "running"
  })
  const fg = createMemo(() => {
    if (props.color) return props.color
    if (permission()) return theme.warning
    if (failed()) return theme.error
    if (hover() && props.onClick) return theme.text
    if (props.complete) return theme.textMuted
    return theme.text
  })

  return (
    <InlineToolRow
      id={`tool-inline-${props.subagent ? "subagent-" : ""}${props.part.messageID}-${props.part.id}`}
      icon={props.icon}
      tool={props.part.tool}
      label={toolCategoryLabel(props.part.tool)}
      iconColor={props.iconColor}
      color={fg()}
      errorColor={theme.error}
      failed={failed()}
      denied={Boolean(denied())}
      error={denied() ? formatPermissionDenial(error() ?? "") : error()}
      errorExpanded={errorExpanded()}
      glowing={glowing()}
      glowColor={theme.accent}
      complete={props.complete}
      pending={props.pending}
      failure={props.failure}
      spinner={props.spinner}
      lifecycle={chipLifecycle()}
      subagent={props.subagent}
      contentWidth={Math.max(1, ctx.width - 4)}
      separateAfter={(id) => id !== undefined && ctx.userMessageIDs().has(id)}
      onMouseOver={() => clickable() && setHover(true)}
      onMouseOut={() => setHover(false)}
      onMouseUp={() => {
        if (renderer.getSelection()?.getSelectedText()) return
        if (failed() || denied()) {
          setErrorExpanded((value) => !value)
          return
        }
        props.onClick?.()
      }}
    >
      {props.children}
    </InlineToolRow>
  )
}

export function InlineToolRow(props: {
  id?: string
  icon: string
  /** Canonical tool name used for the shared semantic category pill. */
  tool?: string
  label?: string
  iconColor?: RGBA
  color?: RGBA
  errorColor?: RGBA
  failed?: boolean
  denied?: boolean
  error?: string
  errorExpanded?: boolean
  glowing?: boolean
  glowColor?: RGBA
  complete: unknown
  pending: string
  failure?: string
  spinner?: boolean
  lifecycle?: ToolChipLifecycle
  subagent?: boolean
  /** Available row width after the legacy left border/indent. */
  contentWidth?: number
  children: JSX.Element
  separateAfter?: (id: string | undefined) => boolean
  onMouseOver?: () => void
  onMouseOut?: () => void
  onMouseUp?: () => void
}) {
  const lifecycle = createMemo<ToolChipLifecycle>(() => {
    if (props.lifecycle) return props.lifecycle
    if (props.failed || props.denied) return "failure"
    if (props.spinner || !props.complete) return "running"
    return "success"
  })
  const category = createMemo(() => toolCategoryLabel(props.tool ?? props.label ?? "tool"))
  const statusSummary = createMemo(() => {
    if (props.failed && !props.complete && props.failure) return props.failure
    return undefined
  })
  return (
    <box
      id={props.id}
      paddingLeft={3}
      border={["left"]}
      borderColor={props.glowing ? props.glowColor : "transparent"}
      onMouseOver={props.onMouseOver}
      onMouseOut={props.onMouseOut}
      onMouseUp={props.onMouseUp}
      ref={(el: BoxRenderable) => {
        setPreLayoutSiblingMargin(el, (previous) => {
          const previousInline = previous?.id.startsWith("tool-inline-") ?? false
          const previousSubagent = previous?.id.startsWith("tool-inline-subagent-") ?? false
          return previous?.id.startsWith("text-") ||
            previous?.id.startsWith("tool-block-") ||
            previous?.id.startsWith("assistant-error-") ||
            previous?.id.startsWith("assistant-summary-") ||
            (previousInline && previousSubagent !== Boolean(props.subagent)) ||
            props.separateAfter?.(previous?.id)
            ? 1
            : 0
        })
      }}
    >
      <Show
        when={statusSummary()}
        fallback={
          <SpineToolChip
            kind={category()}
            label={props.label ?? category()}
            lifecycle={lifecycle()}
            layout="wide"
            contentWidth={props.contentWidth}
          >
            {props.children}
          </SpineToolChip>
        }
      >
        {(failure) => (
          <SpineToolChip
            kind={category()}
            label={props.label ?? category()}
            summary={failure()}
            lifecycle={lifecycle()}
            layout="wide"
            contentWidth={props.contentWidth}
          />
        )}
      </Show>
      <Show when={(props.failed || props.denied) && props.errorExpanded}>
        <box paddingLeft={4}>
          <Scramble error text={props.error ?? ""} fg={props.errorColor} />
        </box>
      </Show>
    </box>
  )
}

function BlockTool(props: {
  title: string
  children: JSX.Element
  onClick?: () => void
  part?: ToolPart
  spinner?: boolean
}) {
  const { theme } = useTheme()
  const ctx = use()
  const renderer = useRenderer()
  const [hover, setHover] = createSignal(false)
  const error = createMemo(() => (props.part?.state.status === "error" ? props.part.state.error : undefined))
  const lifecycle = createMemo<ToolChipLifecycle>(() => {
    if (error()) return "failure"
    if (props.part?.state.status === "cancelled") return "interrupted"
    if (props.spinner || props.part?.state.status === "running") return "running"
    if (props.part?.state.status === "completed") return "success"
    return "queued"
  })
  return (
    <box
      id={props.part ? `tool-block-${props.part.messageID}-${props.part.id}` : undefined}
      border={["left"]}
      paddingTop={1}
      paddingBottom={1}
      paddingLeft={2}
      marginTop={1}
      gap={1}
      backgroundColor={hover() ? theme.backgroundMenu : theme.backgroundPanel}
      customBorderChars={SplitBorder.customBorderChars}
      borderColor={theme.borderActive}
      onMouseOver={() => props.onClick && setHover(true)}
      onMouseOut={() => setHover(false)}
      onMouseUp={() => {
        const sel = renderer.getSelection()
        if (sel && sel.getSelectedText()) return
        props.onClick?.()
      }}
    >
      <SpineToolChip
        kind={toolCategoryLabel(props.part?.tool ?? props.title)}
        label={toolCategoryLabel(props.part?.tool ?? props.title)}
        summary={props.title.replace(/^# /, "")}
        lifecycle={lifecycle()}
        layout="wide"
        contentWidth={ctx.width}
      />
      {props.children}
      <Show when={error()}>
        <Scramble error text={error() ?? ""} fg={theme.error} />
      </Show>
    </box>
  )
}

function Shell(props: ToolProps) {
  const { theme } = useTheme()
  const pathFormatter = usePathFormatter()
  const ctx = use()
  const isRunning = createMemo(() => props.part.state.status === "running")
  // Explicit reactive tracking — force re-render when tool status changes
  const status = createMemo(() => props.part.state.status)
  const isCompleted = createMemo(() => status() === "completed")
  const output = createMemo(() => stripAnsi(stringValue(props.metadata.output)?.trim() ?? ""))
  const [expanded, setExpanded] = createSignal(false)
  const maxLines = 10
  const maxChars = createMemo(() => maxLines * Math.max(20, ctx.width - 6))
  const collapsed = createMemo(() => collapseToolOutput(output(), maxLines, maxChars()))
  const limited = createMemo(() => {
    if (expanded() || !collapsed().overflow) return output()
    return collapsed().output
  })

  const workdirDisplay = createMemo(() => {
    const workdir = stringValue(props.input.workdir)
    if (!workdir || workdir === ".") return undefined
    return pathFormatter.format(workdir)
  })

  const title = createMemo(() => {
    const desc = stringValue(props.input.description) ?? "Shell"
    const wd = workdirDisplay()
    if (!wd) return `# ${desc}`
    if (desc.includes(wd)) return `# ${desc}`
    return `# ${desc} in ${wd}`
  })

  return (
    <Switch>
      <Match when={status() !== "pending"}>
        <BlockTool
          title={title()}
          part={props.part}
          spinner={isRunning()}
          onClick={collapsed().overflow ? () => setExpanded((prev) => !prev) : undefined}
        >
          <box gap={1}>
            <text fg={theme.text}>$ {stringValue(props.input.command)}</text>
            <Show
              when={output()}
              fallback={
                <Show when={isCompleted()}>
                  <text fg={theme.textMuted}>(no output)</text>
                </Show>
              }
            >
              <text fg={theme.text}>{limited()}</text>
            </Show>
            <Show when={collapsed().overflow}>
              <text fg={theme.textMuted}>{expanded() ? "Click to collapse" : "Click to expand"}</text>
            </Show>
          </box>
        </BlockTool>
      </Match>
      <Match when={true}>
        <InlineTool icon="$" pending={pickVerb(VerbPool.pending.shell, props.part.sessionID) + "…"} complete={stringValue(props.input.command)} part={props.part}>
          {stringValue(props.input.command)}
        </InlineTool>
      </Match>
    </Switch>
  )
}

function Write(props: ToolProps) {
  const { theme, syntax } = useTheme()
  const pathFormatter = usePathFormatter()
  const code = createMemo(() => {
    return stringValue(props.input.content) ?? ""
  })

  return (
    <Switch>
      <Match when={code().length > 0}>
        <BlockTool title={"# Write " + pathFormatter.format(stringValue(props.input.filePath))} part={props.part}>
          <line_number fg={theme.textMuted} minWidth={3} paddingRight={1}>
            <code
              conceal={false}
              fg={theme.text}
              filetype={filetype(stringValue(props.input.filePath))}
              syntaxStyle={syntax()}
              content={code()}
            />
          </line_number>
          <Diagnostics diagnostics={props.metadata.diagnostics} filePath={stringValue(props.input.filePath) ?? ""} />
        </BlockTool>
      </Match>
      <Match when={true}>
        <InlineTool
          icon="←"
          pending={pickVerb(VerbPool.pending.write, props.part.sessionID) + "…"}
          complete={stringValue(props.input.filePath)}
          part={props.part}
        >
          Write {pathFormatter.format(stringValue(props.input.filePath))}
        </InlineTool>
      </Match>
    </Switch>
  )
}

function Glob(props: ToolProps) {
  const pathFormatter = usePathFormatter()
  return (
    <InlineTool icon="✱" pending={pickVerb(VerbPool.pending.search, props.part.sessionID) + "…"} complete={stringValue(props.input.pattern)} part={props.part}>
      Glob "{stringValue(props.input.pattern)}"{" "}
      <Show when={stringValue(props.input.path)}>in {pathFormatter.format(stringValue(props.input.path))} </Show>
      <Show when={numberValue(props.metadata.count)}>
        ({numberValue(props.metadata.count)} {numberValue(props.metadata.count) === 1 ? "match" : "matches"})
      </Show>
    </InlineTool>
  )
}

function Read(props: ToolProps) {
  const { theme } = useTheme()
  const pathFormatter = usePathFormatter()
  const isRunning = createMemo(() => props.part.state.status === "running")
  const loaded = createMemo(() => {
    if (props.part.state.status !== "completed") return []
    if (props.part.state.time.compacted) return []
    const value = props.metadata.loaded
    if (!value || !Array.isArray(value)) return []
    return value.filter((p): p is string => typeof p === "string")
  })
  return (
    <>
      <InlineTool
        icon="→"
        pending={pickVerb(VerbPool.pending.read, props.part.sessionID) + "…"}
        complete={stringValue(props.input.filePath)}
        spinner={isRunning()}
        part={props.part}
      >
        Read {pathFormatter.format(stringValue(props.input.filePath))} {input(props.input, ["filePath"])}
      </InlineTool>
      <For each={loaded()}>
        {(filepath, index) => (
          <box id={`tool-inline-loaded-${props.part.messageID}-${props.part.id}-${index()}`} paddingLeft={3}>
            <text paddingLeft={3} fg={theme.textMuted}>
              ↳ Loaded {pathFormatter.format(filepath)}
            </text>
          </box>
        )}
      </For>
    </>
  )
}

function Grep(props: ToolProps) {
  const pathFormatter = usePathFormatter()
  return (
    <InlineTool icon="✱" pending={pickVerb(VerbPool.pending.search, props.part.sessionID) + "…"} complete={stringValue(props.input.pattern)} part={props.part}>
      Grep "{stringValue(props.input.pattern)}"{" "}
      <Show when={stringValue(props.input.path)}>in {pathFormatter.format(stringValue(props.input.path))} </Show>
      <Show when={numberValue(props.metadata.matches)}>
        ({numberValue(props.metadata.matches)} {numberValue(props.metadata.matches) === 1 ? "match" : "matches"})
      </Show>
    </InlineTool>
  )
}

function WebFetch(props: ToolProps) {
  return (
    <InlineTool icon="%" pending={pickVerb(VerbPool.pending.fetch, props.part.sessionID) + "…"} complete={stringValue(props.input.url)} part={props.part}>
      WebFetch {stringValue(props.input.url)}
    </InlineTool>
  )
}

function WebSearch(props: ToolProps) {
  return (
    <InlineTool icon="◈" pending={pickVerb(VerbPool.pending.search, props.part.sessionID) + "…"} complete={stringValue(props.input.query)} part={props.part}>
      {webSearchProviderLabel(props.metadata.provider)} "{stringValue(props.input.query)}"{" "}
      <Show when={numberValue(props.metadata.numResults)}>({numberValue(props.metadata.numResults)} results)</Show>
    </InlineTool>
  )
}

function Task(props: ToolProps) {
  const ctx = use()
  const { theme } = useTheme()
  const sync = useSync()
  const dialog = useDialog()

  onMount(() => {
    const sessionID = stringValue(props.metadata.sessionId)
    if (sessionID && !sync.data.message[sessionID]?.length) void sync.session.sync(sessionID)
  })

  const sessionID = createMemo(() => stringValue(props.metadata.sessionId))
  const messages = createMemo(() => sync.data.message[sessionID() ?? ""] ?? [])

  const tools = createMemo(() => {
    return messages().flatMap((msg) =>
      (sync.data.part[msg.id] ?? [])
        .filter((part): part is ToolPart => part.type === "tool")
        .map((part) => ({ tool: part.tool, state: part.state })),
    )
  })

  const current = createMemo(() =>
    tools().findLast((x) => (x.state.status === "running" || x.state.status === "completed") && x.state.title),
  )

  const status = createMemo(() => sync.data.session_status[sessionID() ?? ""])
  const isRunning = createMemo(() => {
    const value = status()
    return (
      props.part.state.status === "running" ||
      (props.metadata.background === true && value !== undefined && value.type !== "idle")
    )
  })
  const retry = createMemo(() => {
    const value = status()
    if (value?.type !== "retry") return
    return value
  })

  const duration = createMemo(() => {
    const first = messages().find((x) => x.role === "user")?.time.created
    const assistant = messages().findLast((x) => x.role === "assistant")?.time.completed
    if (!first || !assistant) return 0
    return assistant - first
  })

  const content = createMemo(() => {
    const description = stringValue(props.input.description)
    if (!description) return ""
    let content = [
      formatSubagentTitle(
        Locale.titlecase(stringValue(props.input.subagent_type) ?? "General"),
        description,
        props.metadata.background === true,
      ),
    ]

    const retrying = retry()
    if (isRunning() && retrying) {
      content.push(`↳ ${formatSubagentRetry(retrying.attempt, Locale.truncate(retrying.message, 80))}`)
    } else if (isRunning()) {
      // Handover cue: work is delegated to the subagent; show its current step.
      const active = current()
      const activeTitle =
        active && "title" in active.state && typeof active.state.title === "string" ? active.state.title : undefined
      const step =
        active
          ? `${Locale.titlecase(active.tool)}${activeTitle ? ` ${activeTitle}` : ""}`
          : tools().length > 0
            ? formatSubagentToolcalls(tools().length)
            : "working…"
      content.push(`↳ ${step}`)
    }

    if (!isRunning() && props.part.state.status === "completed") {
      const dur = Locale.duration(duration())
      const detail = formatCompletedSubagentDetail(tools().length, dur)
      const peek = taskResultPeek(props.part)
      content.push(`↳ ${detail}${peek ? ` ${Glyph.sep} ${peek}` : ""}`)
    }

    return content.join("\n")
  })

  return (
    <InlineTool
      icon={props.part.state.status === "completed" ? "✓" : "│"}
      subagent={true}
      color={retry() ? theme.error : undefined}
      spinner={isRunning()}
      complete={stringValue(props.input.description)}
      pending={pickVerb(VerbPool.pending.task, props.part.sessionID) + "…"}
      part={props.part}
      onClick={() => {
        if (sessionID()) {
          void ctx.enterChild(sessionID()!)
        }
        const status = retry()
        if (status) void DialogAlert.show(dialog, "Retry Error", status.message)
      }}
    >
      {content()}
    </InlineTool>
  )
}

/**
 * One-line result peek for a completed subagent inline row: the first
 * meaningful output line, so the parent view shows what came back.
 */
function taskResultPeek(part: ToolPart): string | undefined {
  if (part.state.status !== "completed") return undefined
  const raw =
    "output" in part.state && typeof (part.state as { output?: string }).output === "string"
      ? (part.state as { output: string }).output
      : ""
  const line = raw.split("\n").map((l) => l.trim()).find(Boolean)
  return line ? Locale.truncate(line, 80) : undefined
}

export function formatSubagentToolcalls(count: number) {
  return `${count} toolcall${count === 1 ? "" : "s"}`
}

export function formatSubagentTitle(agent: string, description: string, background: boolean) {
  return `${agent} Task${background ? " (background)" : ""} — ${description}`
}

export function formatSubagentRetry(attempt: number, message: string) {
  return `Retrying (attempt ${attempt}) ${Glyph.sep} ${message}`
}

export function formatCompletedSubagentDetail(toolcalls: number, duration: string) {
  if (toolcalls === 0) return duration
  const tools = formatSubagentToolcalls(toolcalls)
  // duration is "" when timestamps are missing (consolidated Locale.duration) —
  // don't leave a dangling separator.
  return duration ? `${tools} ${Glyph.sep} ${duration}` : tools
}

function Edit(props: ToolProps) {
  const ctx = use()
  const { theme, syntax } = useTheme()
  const pathFormatter = usePathFormatter()

  const view = createMemo(() => {
    const diffStyle = ctx.tui.diff_style
    if (diffStyle === "stacked") return "unified"
    // Default to "auto" behavior
    return ctx.width > 120 ? "split" : "unified"
  })

  const ft = createMemo(() => filetype(stringValue(props.input.filePath)))

  const diffContent = createMemo(() => stringValue(props.metadata.diff) ?? "")

  return (
    <Switch>
      <Match when={stringValue(props.metadata.diff) !== undefined}>
        <BlockTool title={"← Edit " + pathFormatter.format(stringValue(props.input.filePath))} part={props.part}>
          <box paddingLeft={1}>
            <diff
              diff={diffContent()}
              view={view()}
              filetype={ft()}
              syntaxStyle={syntax()}
              showLineNumbers={true}
              width="100%"
              wrapMode={ctx.diffWrapMode()}
              fg={theme.text}
              addedBg={theme.diffAddedBg}
              removedBg={theme.diffRemovedBg}
              contextBg={theme.diffContextBg}
              addedSignColor={theme.diffHighlightAdded}
              removedSignColor={theme.diffHighlightRemoved}
              lineNumberFg={theme.diffLineNumber}
              lineNumberBg={theme.diffContextBg}
              addedLineNumberBg={theme.diffAddedLineNumberBg}
              removedLineNumberBg={theme.diffRemovedLineNumberBg}
            />
          </box>
          <Diagnostics diagnostics={props.metadata.diagnostics} filePath={stringValue(props.input.filePath) ?? ""} />
        </BlockTool>
      </Match>
      <Match when={true}>
        <InlineTool icon="←" pending={pickVerb(VerbPool.pending.edit, props.part.sessionID) + "…"} complete={stringValue(props.input.filePath)} part={props.part}>
          Edit {pathFormatter.format(stringValue(props.input.filePath))} {input({ replaceAll: props.input.replaceAll })}
        </InlineTool>
      </Match>
    </Switch>
  )
}

function ApplyPatch(props: ToolProps) {
  const ctx = use()
  const { theme, syntax } = useTheme()
  const pathFormatter = usePathFormatter()

  const files = createMemo(() => parseApplyPatchFiles(props.metadata.files))

  const view = createMemo(() => {
    const diffStyle = ctx.tui.diff_style
    if (diffStyle === "stacked") return "unified"
    return ctx.width > 120 ? "split" : "unified"
  })

  function Diff(p: { diff: string; filePath: string }) {
    return (
      <box paddingLeft={1}>
        <diff
          diff={p.diff}
          view={view()}
          filetype={filetype(p.filePath)}
          syntaxStyle={syntax()}
          showLineNumbers={true}
          width="100%"
          wrapMode={ctx.diffWrapMode()}
          fg={theme.text}
          addedBg={theme.diffAddedBg}
          removedBg={theme.diffRemovedBg}
          contextBg={theme.diffContextBg}
          addedSignColor={theme.diffHighlightAdded}
          removedSignColor={theme.diffHighlightRemoved}
          lineNumberFg={theme.diffLineNumber}
          lineNumberBg={theme.diffContextBg}
          addedLineNumberBg={theme.diffAddedLineNumberBg}
          removedLineNumberBg={theme.diffRemovedLineNumberBg}
        />
      </box>
    )
  }

  function title(file: { type: string; relativePath: string; filePath: string; deletions: number }) {
    if (file.type === "delete") return "# Deleted " + file.relativePath
    if (file.type === "add") return "# Created " + file.relativePath
    if (file.type === "move") return "# Moved " + pathFormatter.format(file.filePath) + " → " + file.relativePath
    return "← Patched " + file.relativePath
  }

  return (
    <Switch>
      <Match when={files().length > 0}>
        <For each={files()}>
          {(file) => (
            <BlockTool title={title(file)} part={props.part}>
              <Show
                when={file.type !== "delete"}
                fallback={
                  <text fg={theme.diffRemoved}>
                    -{file.deletions} line{file.deletions !== 1 ? "s" : ""}
                  </text>
                }
              >
                <Diff diff={file.patch} filePath={file.filePath} />
                <Diagnostics diagnostics={props.metadata.diagnostics} filePath={file.movePath ?? file.filePath} />
              </Show>
            </BlockTool>
          )}
        </For>
      </Match>
      <Match when={true}>
        <InlineTool icon="%" pending={pickVerb(VerbPool.pending.edit, props.part.sessionID) + "…"} failure="Patch failed" complete={false} part={props.part}>
          Patch
        </InlineTool>
      </Match>
    </Switch>
  )
}

function TodoWrite(props: ToolProps) {
  const todos = createMemo(() => parseTodos(props.input.todos))
  return (
    <Switch>
      <Match when={parseTodos(props.metadata.todos).length}>
        <BlockTool title={`# Todos (${todos().length})`} part={props.part}>
          <box>
            <For each={todos()}>{(todo) => <TodoItem status={todo.status} content={todo.content} />}</For>
          </box>
        </BlockTool>
      </Match>
      <Match when={true}>
        <InlineTool
          icon="⚙"
          pending={pickVerb(VerbPool.pending.todo, props.part.sessionID) + "…"}
          failure="Todo update failed"
          complete={false}
          spinner={true}
          part={props.part}
        >
          {pickVerb(VerbPool.pending.todo, props.part.sessionID)}…
        </InlineTool>
      </Match>
    </Switch>
  )
}

function Question(props: ToolProps) {
  const { theme } = useTheme()
  const questions = createMemo(() => parseQuestions(props.input.questions))
  const answers = createMemo(() => parseQuestionAnswers(props.metadata.answers))
  const count = createMemo(() => questions().length)

  function format(answer?: ReadonlyArray<string>) {
    if (!answer?.length) return "(no answer)"
    return answer.join(", ")
  }

  return (
    <Switch>
      <Match when={answers()}>
        <BlockTool title="# Questions" part={props.part}>
          <box gap={1}>
            <For each={questions()}>
              {(q, i) => (
                <box flexDirection="column">
                  <text fg={theme.textMuted}>{q.question}</text>
                  <text fg={theme.text}>{format(answers()?.[i()])}</text>
                </box>
              )}
            </For>
          </box>
        </BlockTool>
      </Match>
      <Match when={true}>
        <InlineTool icon="→" pending={pickVerb(VerbPool.pending.question, props.part.sessionID) + "…"} complete={count()} part={props.part}>
          Asked {count()} question{count() !== 1 ? "s" : ""}
        </InlineTool>
      </Match>
    </Switch>
  )
}

function Skill(props: ToolProps) {
  return (
    <InlineTool icon="→" pending={pickVerb(VerbPool.pending.skill, props.part.sessionID) + "…"} complete={stringValue(props.input.name)} part={props.part}>
      Skill "{stringValue(props.input.name)}"
    </InlineTool>
  )
}

function Diagnostics(props: { diagnostics: unknown; filePath: string }) {
  const { theme } = useTheme()
  const terminalEnvironment = useTuiTerminalEnvironment()
  const errors = createMemo(() => {
    const normalized = normalizePath(
      typeof props.filePath === "string" ? props.filePath : "",
      terminalEnvironment.platform,
    )
    return parseDiagnostics(props.diagnostics, normalized)
  })

  return (
    <Show when={errors().length}>
      <box>
        <For each={errors()}>
          {(diagnostic) => (
            <Scramble
              error
              text={`Error [${diagnostic.range.start.line + 1}:${diagnostic.range.start.character + 1}] ${diagnostic.message}`}
              fg={theme.error}
            />
          )}
        </For>
      </box>
    </Show>
  )
}

function formatInputKey(key: string): string {
  return key.replace(/[_-]+/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase()
}

function formatPrimitiveInput(key: string, value: string | number | boolean): string {
  const label = formatInputKey(key)
  if (typeof value === "boolean") return `${label} ${value ? "enabled" : "disabled"}`
  return `${label}=${value}`
}
function input(input: Record<string, unknown>, omit?: string[]): string {
  const primitives = Object.entries(input).filter(([key, value]) => {
    if (omit?.includes(key)) return false
    return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
  })
  if (primitives.length === 0) return ""
  return `[${primitives.map(([key, value]) => formatPrimitiveInput(key, value as string | number | boolean)).join(", ")}]`
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : undefined
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

const toolDisplays = new Set([
  "bash",
  "glob",
  "read",
  "grep",
  "webfetch",
  "websearch",
  "write",
  "edit",
  "task",
  "apply_patch",
  "todowrite",
  "question",
  "skill",
])

export function toolDisplay(tool: string) {
  return toolDisplays.has(tool) ? tool : "generic"
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return
  return value as Record<string, unknown>
}

export function parseApplyPatchFiles(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const file = recordValue(item)
    if (!file) return []
    const type = stringValue(file.type)
    const relativePath = stringValue(file.relativePath)
    const filePath = stringValue(file.filePath)
    const patch = stringValue(file.patch)
    const deletions = numberValue(file.deletions)
    if (!type || !relativePath || !filePath || patch === undefined || deletions === undefined) return []
    return [{ type, relativePath, filePath, patch, deletions, movePath: stringValue(file.movePath) }]
  })
}

export function parseTodos(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const todo = recordValue(item)
    const status = stringValue(todo?.status)
    const content = stringValue(todo?.content)
    return status && content ? [{ status, content }] : []
  })
}

export function parseQuestions(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const question = stringValue(recordValue(item)?.question)
    return question ? [{ question }] : []
  })
}

export function parseQuestionAnswers(value: unknown) {
  if (!Array.isArray(value)) return
  return value.map((answer) =>
    Array.isArray(answer) ? answer.filter((item): item is string => typeof item === "string") : [],
  )
}

export function parseDiagnostics(value: unknown, filePath: string) {
  const diagnostics = recordValue(value)?.[filePath]
  if (!Array.isArray(diagnostics)) return []
  return diagnostics
    .flatMap((item) => {
      const diagnostic = recordValue(item)
      const start = recordValue(recordValue(diagnostic?.range)?.start)
      const line = numberValue(start?.line)
      const character = numberValue(start?.character)
      const message = stringValue(diagnostic?.message)
      if (diagnostic?.severity !== 1 || line === undefined || character === undefined || !message) return []
      return [{ range: { start: { line, character } }, message }]
    })
    .slice(0, 3)
}
