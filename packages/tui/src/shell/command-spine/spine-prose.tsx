import { For, Match, Show, Switch, createEffect, createMemo, createSignal, onCleanup } from "solid-js"
import { useRenderer } from "@opentui/solid"
import { useTheme } from "../../context/theme"
import { createWidgetRenderNode } from "./widgets/registry"
import { filetype } from "../../util/filetype"
import type { SpineKind } from "./spine-types"
import { looksLikeMarkdown, normalizeChatProse, stripMarkdownEmphasis } from "./chat-prose"
import { codeBlockChrome, streamTextCue } from "./spine-chrome"
import { RoundBorder } from "../../ui/chrome"

export type SpineProseMode = "markdown" | "code" | "plain"

export { looksLikeMarkdown, normalizeChatProse, stripMarkdownEmphasis } from "./chat-prose"

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

/**
 * Strip horizontal rules — OpenTUI renders them as full-width dashes — but only
 * OUTSIDE fenced code blocks: a `---` line inside a triple-backtick fence is real
 * content (tables, YAML, etc.) and must be preserved. Mirrors the fence-splitting
 * pattern of `escapeMarkdownUnderscoreEmphasis`.
 *
 * Whole lines are filtered out (not blanked), so no empty row is left behind where
 * the rule was. Note: a `---` directly under a heading is a setext H2 underline,
 * not an HR — out of scope here (pre-existing behavior), flagged in the audit.
 */
export function stripMarkdownHorizontalRules(text: string): string {
  const parts = text.split(/(```[\s\S]*?```)/)
  return parts
    .map((part, i) => {
      if (i % 2 === 1) return part
      return part
        .split("\n")
        .filter((line) => !/^[-─━═]{3,}\s*$/.test(line))
        .join("\n")
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
 * Single streaming <markdown streaming={...}>: streaming=true while tokens are
 * still arriving (trailing block stays unstable), false once idle to finalize.
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
  const renderer = useRenderer()
  const widgetRenderNode = createMemo(() =>
    createWidgetRenderNode({ renderer, theme: theme as any }),
  )
  const kind = () => props.kind
  const bodyLabel = () => props.bodyLabel
  const hint = () => props.hint
  const chatVoice = () => props.chatVoice === true
  const focused = () => props.focused === true

  /** Always a real column count so Code leaves under <markdown> wrap correctly. */
  const wrapCols = createMemo(() => {
    const w = props.contentWidth
    // Clamp to >= 1 — never the bare 80 fallback: a present-but-narrow width is
    // a real budget. Missing width (first paint) degrades to 1, cannot overflow.
    if (typeof w === "number" && Number.isFinite(w)) return Math.max(1, Math.floor(w))
    return 1
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
    // Strip emphasis/strikethrough markers (`**`, `~~`) so raw syntax never
    // leaks into chat text (OpenTUI inline conceal depends on tree-sitter
    // markdown_inline injection; strip guarantees clean text regardless).
    const noEmphasis = mode() === "markdown" ? stripMarkdownEmphasis(raw) : raw
    // Strip horizontal rules (full-width dash rows) only outside fenced code blocks
    return stripMarkdownHorizontalRules(noEmphasis)
  })
  /**
   * Debounce content updates during streaming to reduce Tree-sitter
   * re-highlight work on completed code blocks. Every token changes the
   * overall markdownContent string (prose grows), which triggers a full
   * MarkdownRenderable re-parse → Tree-sitter re-highlights ALL blocks,
   * including stable completed code fences. The OpenTUI patch keeps the last
   * styled frame visible during that async work; batching at 50ms (~20
   * updates/sec) is only a throughput optimization. When streaming ends,
   * apply immediately to finalize.
   */
  const [debouncedContent, setDebouncedContent] = createSignal(markdownContent())
  let contentTimer: ReturnType<typeof setTimeout> | undefined
  createEffect(() => {
    const content = markdownContent()
    if (liveStreaming()) {
      if (contentTimer) clearTimeout(contentTimer)
      contentTimer = setTimeout(() => setDebouncedContent(content), 50)
    } else {
      if (contentTimer) { clearTimeout(contentTimer); contentTimer = undefined }
      setDebouncedContent(content)
    }
  })
  onCleanup(() => { if (contentTimer) clearTimeout(contentTimer) })
  const ft = createMemo(() => resolveFiletype(bodyLabel(), hint(), text(), hint()))
  const fg = createMemo(() => {
    if (kind() === "think") return theme.textMuted
    if (kind() === "fail" || bodyLabel() === "error") return theme.error
    return theme.markdownText ?? theme.text
  })
  const mdBg = createMemo(() => {
    if (chatVoice() && kind() === "ask") {
      return theme.backgroundElement as any
    }
    return theme.background as any
  })
  const style = () => (kind() === "think" || kind() === "fail" ? subtleSyntax() : syntax())
  const codePad = () => 1
  const codePadY = () => (bodyLabel() === "file" ? 0 : 1)

  /**
   * Turn still producing. Streaming keeps the trailing markdown block unstable
   * (no per-token layout flip); set false once idle to finalize trailing parsing.
   */
  const liveStreaming = createMemo(() => props.streaming === true)
  const streamCue = createMemo(() => streamTextCue(liveStreaming()))
  const codeChrome = createMemo(() =>
    codeBlockChrome({ bodyLabel: bodyLabel(), filetype: ft(), streaming: liveStreaming() }),
  )
  const criticalCode = createMemo(() => kind() === "fail" || bodyLabel()?.toLowerCase() === "error")

  const bodyNote = () => (
    <Show when={props.note?.trim()}>
      <text fg={(theme.spineDiffMuted ?? theme.textMuted) as any} wrapMode="word">
        {props.note!.trim()}
      </text>
    </Show>
  )

  /**
   * Single always-mounted MarkdownRenderable (marked, GFM tables), used for both
   * live and idle prose — one component, no text↔markdown swap and no
   * remount-by-key hack (an `id` change does not remount a renderable anyway;
   * the reconciler just assigns it). `streaming` toggles trailing-block
   * stability: true while tokens arrive, false once idle to finalize.
   *
   * Width: MarkdownRenderable is a column flex host; paragraph/table leaves use
   * width:"100%" of *this* node. Setting numeric width here (not only on an
   * outer box) is what gives those leaves a definite parent at construct so
   * Code's setWrapWidth isn't stuck at 0. Outer box also keeps spine host width.
   *
   * Tables: "columns" (not TextPart's "grid") — spine already has card chrome;
   * boxed grid tables double-border in a narrow pane.
   */
  const MarkdownBody = () => (
    <box flexShrink={0} minWidth={0} width={wrapCols()}>
      <markdown
        width={wrapCols()}
        content={debouncedContent()}
        syntaxStyle={style()}
        streaming={liveStreaming()}
        internalBlockMode="top-level"
        tableOptions={{
          style: "columns",
          wrapMode: "word",
          widthMode: "full",
        }}
        conceal={true}
        fg={fg() as any}
        bg={mdBg() as any}
        renderNode={widgetRenderNode()}
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

  return (
    <box flexDirection="column" flexShrink={0} minWidth={0} width={wrapCols()}>
      {reminderCallouts()}
      <Switch>
        {/*
          Single streaming markdown (audit M2/M8): one <markdown streaming={...}>
          for both live and idle. While streaming=true the trailing block stays
          unstable (no incomplete ** / list thrash); flip to false once idle to
          finalize trailing token parsing. No dual-mode swap, no remount-by-key.
        */}
        <Match when={mode() === "markdown"}>
          <Show when={streamCue().badge}>
            <box flexShrink={0} paddingBottom={0} flexDirection="row">
              <box paddingLeft={1} paddingRight={1} backgroundColor={theme.backgroundElement} flexShrink={0}>
                <text fg={theme.accent} wrapMode="none">
                  {streamCue().badge}
                </text>
              </box>
            </box>
          </Show>
          <MarkdownBody />
          {bodyNote()}
        </Match>

        <Match when={mode() === "code"}>
          {/* Tool code blocks render flat — no background panel, no left
              border, no language header. The row's outer rail (from
              SpineRail) and the user's mental model of "this is shell/file
              output" provide enough containment. Critical bodies (fail /
              error) keep their bordered box so failures stand out. */}
          <Show
            when={criticalCode()}
            fallback={
              <code
                width={wrapCols()}
                filetype={ft()}
                drawUnstyledText={true}
                streaming={false}
                syntaxStyle={style()}
                content={text()}
                conceal={false}
                wrapMode="word"
                fg={fg() as any}
              />
            }
          >
            <box
              flexShrink={0}
              minWidth={0}
              width={wrapCols()}
              backgroundColor={focused() ? (theme.backgroundElement as any) : theme.backgroundPanel}
              paddingLeft={codePad()}
              paddingRight={codePad()}
              paddingTop={codePadY()}
              paddingBottom={codePadY()}
              border={true}
              customBorderChars={RoundBorder}
              borderColor={(bodyLabel() === "file" ? (theme.spineInspect ?? fg()) : (theme.borderSubtle ?? theme.textMuted)) as any}
            >
              <box flexDirection="row" flexShrink={0} gap={1} paddingBottom={1}>
                <text fg={theme.spineContext} wrapMode="none">
                  {codeChrome().header}
                </text>
                <Show when={codeChrome().badge}>
                  <text fg={theme.accent} wrapMode="none">
                    {codeChrome().badge}
                  </text>
                </Show>
              </box>
              <code
                width={wrapCols()}
                filetype={ft()}
                drawUnstyledText={true}
                streaming={false}
                syntaxStyle={style()}
                content={text()}
                conceal={false}
                wrapMode="word"
                fg={fg() as any}
              />
            </box>
          </Show>
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
