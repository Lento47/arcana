import { For, Match, Show, Switch, createMemo } from "solid-js"
import { useTheme } from "../../context/theme"
import { filetype } from "../../util/filetype"
import type { SpineKind } from "./spine-types"

export type SpineProseMode = "markdown" | "code" | "plain"

function looksLikeMarkdown(text: string): boolean {
  if (/```/.test(text)) return true
  if (/^#{1,6}\s/m.test(text)) return true
  if (/^\s*[-*+]\s+\S/m.test(text)) return true
  if (/^\s*\d+\.\s+\S/m.test(text)) return true
  // Bold / code / links only — do NOT treat single _underscore_ as markdown signal
  // (snake_case and _private identifiers are common in agent + tool text).
  if (/\*\*[^*]+\*\*|__[^_]+__|`[^`]+`/.test(text)) return true
  if (/^\s*>\s+\S/m.test(text)) return true
  if (/\[.+\]\(.+\)/.test(text)) return true
  return false
}

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
}): SpineProseMode {
  const label = input.bodyLabel?.toLowerCase() ?? ""
  // Chat voice: only use <markdown> when the text actually has markdown.
  // Plain replies ("Hi, what would you…") use word-wrapped <text> so OpenTUI
  // never collapses width to ~1 cell (one-word-per-line artifact).
  if (input.kind === "ask" || input.kind === "plan" || input.kind === "ok") {
    return looksLikeMarkdown(input.text) ? "markdown" : "plain"
  }
  // Reasoning is usually prose; prefer plain wrap unless real markdown markers.
  if (input.kind === "think") {
    return looksLikeMarkdown(input.text) ? "markdown" : "plain"
  }
  if (label === "diff" || looksLikeDiff(input.text)) return "code"
  if (label === "error" || input.kind === "fail") return "code"
  if (label === "written content" || label === "output" || label === "file") return "code"
  if (label === "matches" || label === "listing") return "plain"
  // Tool / inspect bodies never auto-upgrade to markdown (avoids italic paths).
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
  // Prefer explicit path hint (summary may include " · L1–40").
  for (const candidate of [hint, summary]) {
    if (!candidate) continue
    const pathOnly = candidate.split(/\s·\s/)[0]?.trim() || candidate
    const ft = filetype(pathOnly)
    if (ft) return ft
  }
  // Fence language hint: ```ts
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
 * Rich chat/tool body using OpenTUI `<markdown>` / `<code>` with theme syntax styles.
 * Flex-safe: parent must provide minWidth={0} flexGrow so word-wrap can compute.
 */
export function SpineProse(props: {
  kind: SpineKind
  text: string
  bodyLabel?: string
  /** Optional path or title used for filetype detection (e.g. write/edit summary). */
  hint?: string
  /** Muted note under the body (EOF / truncation) — not part of source. */
  note?: string
  streaming?: boolean
  focused?: boolean
  /** System-reminder blocks extracted from read tool output. */
  reminders?: string[]
  /**
   * Chat voice (you / arcana): full-contrast markdown on card surface.
   * Tools omit this and stay secondary/code-chrome.
   */
  chatVoice?: boolean
}) {
  const { theme, syntax, subtleSyntax } = useTheme()
  // All prop reads are memoized so token deltas and turn-end flips re-render
  // without remounting the parent spine row.
  const kind = () => props.kind
  const bodyLabel = () => props.bodyLabel
  const hint = () => props.hint
  const chatVoice = () => props.chatVoice === true
  const focused = () => props.focused === true
  const text = createMemo(() => (props.text ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n"))
  const mode = createMemo(() => resolveProseMode({ kind: kind(), bodyLabel: bodyLabel(), text: text() }))
  const markdownContent = createMemo(() =>
    mode() === "markdown" ? escapeMarkdownUnderscoreEmphasis(text()) : text(),
  )
  const ft = createMemo(() => resolveFiletype(bodyLabel(), hint(), text(), hint()))
  const fg = createMemo(() => {
    if (kind() === "think") return theme.textMuted
    if (kind() === "fail" || bodyLabel() === "error") return theme.error
    // Chat voice reads as primary content (Grok-style agent message).
    if (chatVoice()) return theme.markdownText ?? theme.text
    return theme.markdownText ?? theme.text
  })
  const mdBg = createMemo(() => {
    // Match soft card panel so markdown doesn't flash the page background.
    if (chatVoice() && (kind() === "plan" || kind() === "ok")) {
      return (theme.backgroundPanel ?? theme.background) as any
    }
    return theme.background as any
  })
  const style = () => (kind() === "think" || kind() === "fail" ? subtleSyntax() : syntax())
  // File reads: slightly tighter chrome so tool panels don't dominate the timeline.
  const codePad = () => (bodyLabel() === "file" ? 1 : 2)
  const codePadY = () => (bodyLabel() === "file" ? 0 : 1)

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
            paddingTop={0}
            paddingBottom={0}
            marginBottom={1}
          >
            <text fg={theme.warning as any}>system reminder</text>
            <markdown
              content={escapeMarkdownUnderscoreEmphasis(reminder)}
              syntaxStyle={subtleSyntax()}
              streaming={false}
              conceal={true}
              fg={theme.textMuted as any}
              bg={theme.background as any}
            />
          </box>
        )}
      </For>
    </Show>
  )

  const bodyNote = () => (
    <Show when={props.note?.trim()}>
      <text fg={(theme.spineDiffMuted ?? theme.textMuted) as any} wrapMode="word">
        {props.note!.trim()}
      </text>
    </Show>
  )

  return (
    <box flexGrow={1} minWidth={0} flexShrink={1} flexDirection="column" width="100%">
      {reminderCallouts()}
      <Switch>
        <Match when={mode() === "markdown"}>
          <box width="100%" minWidth={0} flexShrink={1}>
            <markdown
              syntaxStyle={style()}
              // Force finalized render mode even during streaming. Default
              // streaming=true keeps trailing blocks unstable in OpenTUI's
              // MarkdownRenderable, causing visible text flicker/disappear
              // on every token. Finalized mode re-parses fully each render
              // but produces stable output — acceptable trade for short
              // streaming responses.
              streaming={false}
              internalBlockMode="top-level"
              content={markdownContent()}
              tableOptions={{ style: "grid" }}
              conceal={true}
              fg={fg() as any}
              bg={mdBg() as any}
            />
          </box>
          {bodyNote()}
        </Match>
        <Match when={mode() === "code"}>
          <box
            flexShrink={0}
            minWidth={0}
            width="100%"
            backgroundColor={focused() ? (theme.backgroundElement as any) : (theme.backgroundPanel as any)}
            paddingLeft={codePad()}
            paddingRight={codePad()}
            paddingTop={codePadY()}
            paddingBottom={codePadY()}
            border={["left"]}
            borderColor={(bodyLabel() === "file" ? (theme.spineInspect ?? fg()) : fg()) as any}
          >
            <code
              filetype={ft()}
              drawUnstyledText={false}
              streaming={false}
              syntaxStyle={style()}
              content={text()}
              conceal={false}
              fg={fg() as any}
            />
          </box>
          {bodyNote()}
        </Match>
        <Match when={true}>
          <text fg={fg() as any} wrapMode="word" width="100%">
            {text()}
          </text>
          {bodyNote()}
        </Match>
      </Switch>
    </box>
  )
}

/** Reconstruct full chat prose from spine summary + optional body remainder. */
export function joinSpineProse(summary: string | undefined, body: string | undefined): string {
  const s = (summary ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n")
  const b = (body ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n")
  if (!b.trim()) return s
  if (!s.trim()) return b
  // Body is usually the remainder after the first summary line.
  if (b.startsWith(s)) return b
  return `${s}\n${b}`
}
