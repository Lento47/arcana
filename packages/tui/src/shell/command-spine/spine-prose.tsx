import { For, Match, Show, Switch, createMemo } from "solid-js"
import { useTheme } from "../../context/theme"
import { filetype } from "../../util/filetype"
import type { SpineKind } from "./spine-types"
import { looksLikeMarkdown, normalizeChatProse } from "./chat-prose"

export type SpineProseMode = "markdown" | "code" | "plain"

export { looksLikeMarkdown, normalizeChatProse } from "./chat-prose"

/**
 * Disable underscore emphasis in markdown so `_text_`, snake_case, and
 * `_private` do not render as italics. Asterisk emphasis (`*italic*`) still works.
 * Leaves fenced blocks and inline `code` alone.
 */
export function escapeMarkdownUnderscoreEmphasis(text: string): string {
  const parts = text.split(/(```[\s\S]*?```)/)
  return parts
    .map((part, i) => {
      if (i % 2 === 1) return part
      return part
        .split(/(`[^`\n]+`)/)
        .map((seg, j) => {
          if (j % 2 === 1) return seg
          return seg.replace(/_/g, "\\_")
        })
        .join("")
    })
    .join("")
}

function looksLikeDiff(text: string): boolean {
  return (
    text.includes("@@ ")
    || text.startsWith("diff --git")
    || /^---\s/m.test(text)
    || /^\+\+\+\s/m.test(text)
  )
}

export function resolveProseMode(input: {
  kind: SpineKind
  bodyLabel?: string
  text: string
  chatVoice?: boolean
}): SpineProseMode {
  const label = input.bodyLabel?.toLowerCase() ?? ""
  if (input.kind === "plan" || input.kind === "ok") return "markdown"
  if (input.kind === "ask") {
    return looksLikeMarkdown(input.text) ? "markdown" : "plain"
  }
  if (input.kind === "think" || input.kind === "agent") return "markdown"
  if (label === "diff" || looksLikeDiff(input.text)) return "code"
  if (label === "error" || input.kind === "fail") return "code"
  if (label === "written content" || label === "output" || label === "file") return "code"
  if (label === "matches" || label === "listing") return "plain"
  if (input.kind === "inspect" || input.kind === "run" || input.kind === "patch") return "code"
  if (looksLikeMarkdown(input.text)) return "markdown"
  return "code"
}

function resolveFiletype(
  bodyLabel: string | undefined,
  summary: string | undefined,
  text: string,
  hint?: string,
): string | undefined {
  const label = bodyLabel?.toLowerCase() ?? ""
  if (label === "diff" || looksLikeDiff(text)) return "diff"
  if (label === "error") return undefined
  for (const candidate of [hint, summary]) {
    if (!candidate) continue
    const pathOnly = candidate.split(/\s·\s/)[0]?.trim() || candidate
    const ft = filetype(pathOnly)
    if (ft) return ft
  }
  const fence = text.match(/^```([a-zA-Z0-9_+.-]+)/)
  if (fence?.[1]) {
    const lang = fence[1].toLowerCase()
    if (lang === "ts" || lang === "tsx") return lang === "tsx" ? "typescriptreact" : "typescript"
    if (lang === "js" || lang === "jsx") return lang === "jsx" ? "javascriptreact" : "javascript"
    if (lang === "py") return "python"
    if (lang === "sh" || lang === "shell" || lang === "bash" || lang === "zsh") return "bash"
    return lang
  }
  return undefined
}

/**
 * OpenTUI wrap root cause (TextBufferRenderable / Code leaves):
 *   setWrapWidth(this.width) runs only in the constructor when width > 0,
 *   and when wrapMode changes. onResize updates viewport but NOT wrap width.
 *
 * Structural chat markdown must use <markdown> (marked + GFM tables), not
 * <code filetype="markdown"> (Tree-sitter highlight only — pipes/$$ stay raw).
 * <markdown> still creates Code leaves with width:"100%", so a **numeric**
 * host width at construct time is still required for wrap.
 *
 * Dual-mode: plain <text> while streaming; <markdown streaming={false}> once idle.
 */
export function SpineProse(props: {
  kind: SpineKind
  text: string
  bodyLabel?: string
  hint?: string
  note?: string
  streaming?: boolean
  focused?: boolean
  reminders?: string[]
  chatVoice?: boolean
  contentWidth?: number
}) {
  const { theme, syntax, subtleSyntax } = useTheme()
  const kind = () => props.kind
  const bodyLabel = () => props.bodyLabel
  const hint = () => props.hint
  const chatVoice = () => props.chatVoice === true
  const focused = () => props.focused === true

  /** Always a real column count so Code leaves under <markdown> wrap correctly. */
  const wrapCols = createMemo(() => {
    const w = props.contentWidth
    if (typeof w === "number" && Number.isFinite(w) && w >= 40) return Math.floor(w)
    return 80
  })

  const text = createMemo(() => {
    const raw = (props.text ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n")
    if (kind() === "plan" || kind() === "ok" || kind() === "ask" || kind() === "think") {
      return normalizeChatProse(raw)
    }
    return raw
  })

  const mode = createMemo(() =>
    resolveProseMode({
      kind: kind(),
      bodyLabel: bodyLabel(),
      text: text(),
      chatVoice: chatVoice(),
    }),
  )

  const markdownContent = createMemo(() => {
    const raw = mode() === "markdown" ? escapeMarkdownUnderscoreEmphasis(text()) : text()
    // Strip horizontal rules — OpenTUI renders them as full-width dashes
    return raw.replace(/^[-─━═]{3,}\s*$/gm, "")
  })
  const ft = createMemo(() => resolveFiletype(bodyLabel(), hint(), text(), hint()))
  const fg = createMemo(() => {
    if (kind() === "think") return theme.textMuted
    if (kind() === "fail" || bodyLabel() === "error") return theme.error
    return theme.markdownText ?? theme.text
  })
  const mdBg = createMemo(() => {
    if (chatVoice() && (kind() === "plan" || kind() === "ok")) {
      return (theme.backgroundPanel ?? theme.background) as any
    }
    return theme.background as any
  })
  const style = () => (kind() === "think" || kind() === "fail" ? subtleSyntax() : syntax())
  const codePad = () => (bodyLabel() === "file" ? 1 : 1)
  const codePadY = () => (bodyLabel() === "file" ? 0 : 1)

  const isChatMd = createMemo(
    () => mode() === "markdown" && (kind() === "plan" || kind() === "ok" || kind() === "ask" || kind() === "think"),
  )
  /** Turn still producing — avoid re-parsing incomplete markdown every token. */
  const liveStreaming = createMemo(() => props.streaming === true)

  const bodyNote = () => (
    <Show when={props.note?.trim()}>
      <text fg={(theme.spineDiffMuted ?? theme.textMuted) as any} wrapMode="word">
        {props.note!.trim()}
      </text>
    </Show>
  )

  /**
   * Idle chat/think body: real MarkdownRenderable (marked, GFM tables).
   *
   * Width: MarkdownRenderable is a column flex host; paragraph/table leaves use
   * width:"100%" of *this* node. Setting numeric width here (not only on an
   * outer box) is what gives those leaves a definite parent at construct so
   * Code's setWrapWidth isn't stuck at 0. Outer box also keeps spine host width.
   *
   * Tables: "columns" (not TextPart's "grid") — spine already has card chrome;
   * boxed grid tables double-border in a narrow pane.
   */
  const IdleMarkdown = () => (
    <box flexShrink={0} minWidth={0} width={wrapCols()}>
      <markdown
        id={proseId()}
        width={wrapCols()}
        content={markdownContent()}
        syntaxStyle={style()}
        streaming={false}
        internalBlockMode="top-level"
        tableOptions={{
          style: "columns",
          wrapMode: "word",
          widthMode: "full",
        }}
        conceal={true}
        fg={fg() as any}
        bg={mdBg() as any}
      />
    </box>
  )

  const reminderCallouts = () => (
    <Show when={props.reminders && props.reminders.length > 0}>
      <For each={props.reminders!}>
        {(reminder) => (
          <box
            flexShrink={0}
            minWidth={0}
            border={["left"]}
            borderColor={theme.warning as any}
            paddingLeft={2}
            paddingRight={1}
            marginBottom={1}
          >
            <text fg={theme.warning as any}>system reminder</text>
            {/* Numeric width so wrap is correct at construct */}
            <code
              width={wrapCols()}
              content={escapeMarkdownUnderscoreEmphasis(reminder)}
              filetype="markdown"
              syntaxStyle={subtleSyntax()}
              streaming={false}
              conceal={true}
              drawUnstyledText={true}
              wrapMode="word"
              fg={theme.textMuted as any}
              bg={theme.background as any}
            />
          </box>
        )}
      </For>
    </Show>
  )

  // Remount host when columns change so nested Code leaves re-run setWrapWidth
  // (Markdown onResize does not fix leaf wrap the way a remount does).
  const proseId = createMemo(() => `spine-prose-${kind()}-${wrapCols()}`)

  return (
    <box flexDirection="column" flexShrink={0} minWidth={0} width={wrapCols()}>
      {reminderCallouts()}
      <Switch>
        {/*
          Dual-mode (Grok-class):
          - streaming: plain text — stable growth, no incomplete ** / list thrash
          - idle: <markdown> once — marked GFM (tables, lists, headings)
          Do NOT use keyed <Show> with a callback that calls the when-value —
          Solid passes the raw number (e.g. 143), so cols() crashes.
        */}
        <Match when={isChatMd()}>
          <Show
            when={!liveStreaming()}
            fallback={
              <text fg={fg() as any} wrapMode="word" width={wrapCols()}>
                {text()}
              </text>
            }
          >
            <IdleMarkdown />
          </Show>
          {bodyNote()}
        </Match>

        <Match when={mode() === "markdown"}>
          <Show
            when={!liveStreaming()}
            fallback={
              <text fg={fg() as any} wrapMode="word" width={wrapCols()}>
                {text()}
              </text>
            }
          >
            <IdleMarkdown />
          </Show>
          {bodyNote()}
        </Match>

        <Match when={mode() === "code"}>
          <box
            flexShrink={0}
            minWidth={0}
            width={wrapCols()}
            backgroundColor={focused() ? (theme.backgroundElement as any) : undefined}
            paddingLeft={codePad()}
            paddingRight={codePad()}
            paddingTop={codePadY()}
            paddingBottom={codePadY()}
            border={["left"]}
            borderColor={(bodyLabel() === "file" ? (theme.spineInspect ?? fg()) : (theme.borderSubtle ?? theme.textMuted)) as any}
          >
            <code
              id={proseId()}
              width={wrapCols()}
              filetype={ft()}
              drawUnstyledText={false}
              streaming={false}
              syntaxStyle={style()}
              content={text()}
              conceal={false}
              wrapMode="word"
              fg={fg() as any}
            />
          </box>
          {bodyNote()}
        </Match>

        <Match when={true}>
          <text fg={fg() as any} wrapMode="word" width={wrapCols()}>
            {text()}
          </text>
          {bodyNote()}
        </Match>
      </Switch>
    </box>
  )
}

export function joinSpineProse(summary: string | undefined, body: string | undefined): string {
  const s = (summary ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n")
  const b = (body ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n")
  if (!b.trim()) return s
  if (!s.trim()) return b
  if (b.startsWith(s)) return b
  if (/^(\s*[-*+]|\s*\d+\.|#{1,6}\s)/.test(b.trimStart())) {
    return `${s}\n\n${b}`
  }
  return `${s}\n${b}`
}
