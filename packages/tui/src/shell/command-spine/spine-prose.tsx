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
  if (/\*\*[^*]+\*\*|__[^_]+__|`[^`]+`/.test(text)) return true
  if (/^\s*>\s+\S/m.test(text)) return true
  if (/\[.+\]\(.+\)/.test(text)) return true
  return false
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
  if (input.kind === "ask" || input.kind === "plan" || input.kind === "ok") {
    return looksLikeMarkdown(input.text) || input.text.includes("\n") ? "markdown" : "markdown"
  }
  if (input.kind === "think") return "markdown"
  if (label === "diff" || looksLikeDiff(input.text)) return "code"
  if (label === "error" || input.kind === "fail") return "code"
  if (label === "written content" || label === "output") return "code"
  if (looksLikeMarkdown(input.text)) return "markdown"
  return "code"
}

function resolveFiletype(bodyLabel: string | undefined, summary: string | undefined, text: string): string | undefined {
  const label = bodyLabel?.toLowerCase() ?? ""
  if (label === "diff" || looksLikeDiff(text)) return "diff"
  if (label === "error") return undefined
  if (summary) {
    const ft = filetype(summary)
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
  streaming?: boolean
  focused?: boolean
  /** System-reminder blocks extracted from read tool output. */
  reminders?: string[]
}) {
  const { theme, syntax, subtleSyntax } = useTheme()
  const text = createMemo(() => props.text.replace(/\r\n/g, "\n").replace(/\r/g, "\n"))
  const mode = createMemo(() => resolveProseMode({ kind: props.kind, bodyLabel: props.bodyLabel, text: text() }))
  const ft = createMemo(() => resolveFiletype(props.bodyLabel, props.hint, text()))
  const fg = createMemo(() => {
    if (props.kind === "think") return theme.textMuted
    if (props.kind === "fail" || props.bodyLabel === "error") return theme.error
    return theme.markdownText ?? theme.text
  })
  const style = () => (props.kind === "think" || props.kind === "fail" ? subtleSyntax() : syntax())

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
              content={reminder}
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

  return (
    <box flexGrow={1} minWidth={0} flexShrink={1} flexDirection="column">
      {reminderCallouts()}
      <Switch>
        <Match when={mode() === "markdown"}>
          <markdown
            syntaxStyle={style()}
            streaming={props.streaming ?? true}
            internalBlockMode="top-level"
            content={text()}
            tableOptions={{ style: "grid" }}
            conceal={true}
            fg={fg() as any}
            bg={theme.background as any}
          />
        </Match>
        <Match when={mode() === "code"}>
          <box
            flexShrink={0}
            minWidth={0}
            backgroundColor={props.focused ? (theme.backgroundElement as any) : (theme.backgroundPanel as any)}
            paddingLeft={2}
            paddingRight={2}
            paddingTop={1}
            paddingBottom={1}
            border={["left"]}
            borderColor={fg() as any}
          >
            <code
              filetype={ft()}
              drawUnstyledText={props.streaming ?? false}
              streaming={props.streaming ?? false}
              syntaxStyle={style()}
              content={text()}
              conceal={false}
              fg={fg() as any}
            />
          </box>
        </Match>
        <Match when={true}>
          <text fg={fg() as any} wrapMode="word">
            {text()}
          </text>
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
