import { Show, createMemo } from "solid-js"
import { useTheme } from "../../context/theme"
import { useTuiConfig } from "../../config"
import { filetype } from "../../util/filetype"
import type { SpineDiffExcerpt, SpineLayout } from "./spine-types"

function diffSummary(diff: SpineDiffExcerpt) {
  if (diff.stats) return `${diff.files} (${diff.stats})`
  return diff.files || "patch"
}

/** Infer language from the first path in a multi-file summary string. */
function filetypeFromSummary(files: string | undefined): string | undefined {
  if (!files?.trim()) return undefined
  const first = files.split(/[,\s]/).map((s) => s.trim()).find(Boolean)
  if (!first) return undefined
  return filetype(first)
}

/**
 * Cap extremely long patches so the transcript stays scannable.
 * Full patch remains available via entry details (o / open).
 */
function truncateDiff(body: string, maxLines: number): { text: string; truncated: boolean } {
  const lines = body.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")
  if (lines.length <= maxLines) return { text: body, truncated: false }
  return {
    text: lines.slice(0, maxLines).join("\n") + `\n… (${lines.length - maxLines} more lines)`,
    truncated: true,
  }
}

/**
 * OpenTUI's DiffRenderable is strict about hunk headers (old/new counts must
 * match the following lines). Streaming patches and sample excerpts often lie.
 * Rewrite each `@@ -l,s +l,s @@` from the actual +/-/context lines that follow.
 */
export function normalizeUnifiedDiff(body: string): string {
  const lines = body.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")
  const out: string[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]!
    const hunk = line.match(/^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s*@@(.*)$/)
    if (!hunk) {
      out.push(line)
      i += 1
      continue
    }

    const oldStart = Number(hunk[1])
    const newStart = Number(hunk[2])
    const trailer = hunk[3] ?? ""
    i += 1

    const chunk: string[] = []
    let oldCount = 0
    let newCount = 0

    while (i < lines.length) {
      const cur = lines[i]!
      if (cur.startsWith("@@ ") || cur.startsWith("diff --git")) break
      // File headers belonging to the next file
      if (
        (cur.startsWith("--- ") || cur.startsWith("+++ "))
        && chunk.length > 0
      ) break

      chunk.push(cur)
      if (cur.startsWith("-") && !cur.startsWith("---")) {
        oldCount += 1
      } else if (cur.startsWith("+") && !cur.startsWith("+++")) {
        newCount += 1
      } else if (!cur.startsWith("\\")) {
        // context (leading space or bare)
        oldCount += 1
        newCount += 1
      }
      i += 1
    }

    const oldSpec = oldCount === 1 ? `${oldStart}` : `${oldStart},${oldCount}`
    const newSpec = newCount === 1 ? `${newStart}` : `${newStart},${newCount}`
    out.push(`@@ -${oldSpec} +${newSpec} @@${trailer}`)
    out.push(...chunk)
  }

  return out.join("\n")
}

/**
 * Ensure a minimal unified-diff envelope so OpenTUI can parse bare hunks.
 */
function ensureDiffEnvelope(body: string, files: string | undefined): string {
  const text = body.trim()
  if (!text) return text
  if (text.startsWith("diff --git") || text.startsWith("--- ") || text.startsWith("+++ ")) {
    return text
  }
  // Bare hunk or raw +/- lines from edit tools
  const name = files?.split(/[,\s]/)[0]?.trim() || "file"
  const hasHunk = /^@@ /m.test(text)
  const bodyLines = hasHunk
    ? text
    : [
        `@@ -1,${Math.max(1, text.split("\n").filter((l) => l.startsWith("-") || l.startsWith(" ")).length)} +1,${Math.max(1, text.split("\n").filter((l) => l.startsWith("+") || l.startsWith(" ")).length)} @@`,
        ...text.split("\n").map((l) => (l.startsWith("+") || l.startsWith("-") || l.startsWith(" ") ? l : ` ${l}`)),
      ].join("\n")

  return [`--- a/${name}`, `+++ b/${name}`, bodyLines].join("\n")
}

/**
 * Command-spine patch body using OpenTUI's native `<diff>` (Tree-sitter +
 * split/unified views). Per opentui skill docs/components/diff.mdx.
 */
export function SpineDiff(props: {
  diff: SpineDiffExcerpt
  layout: SpineLayout
  expanded?: boolean
}) {
  const { theme, syntax } = useTheme()
  const tui = useTuiConfig()
  const showExpanded = () => props.expanded ?? true
  const summary = createMemo(() => diffSummary(props.diff))
  const body = createMemo(() => props.diff.body?.trim() ?? "")

  const maxLines = createMemo(() => {
    if (props.layout === "wide") return 48
    if (props.layout === "compact") return 32
    if (props.layout === "narrow") return 20
    return 0
  })

  const prepared = createMemo(() => {
    const raw = body()
    if (!raw) return { text: "", truncated: false }
    const enveloped = ensureDiffEnvelope(raw, props.diff.files)
    const normalized = normalizeUnifiedDiff(enveloped)
    return truncateDiff(normalized, maxLines())
  })

  const view = createMemo<"unified" | "split">(() => {
    if (tui.diff_style === "stacked") return "unified"
    // Split only when there is real horizontal room (OpenTUI split needs ~120).
    if (props.layout === "wide") return "split"
    return "unified"
  })

  const ft = createMemo(() => filetypeFromSummary(props.diff.files))

  if (props.layout === "minimal") {
    return (
      <text fg={theme.spineDiffMuted as any} wrapMode="word">
        {summary()}
      </text>
    )
  }

  if (!showExpanded() || !body()) {
    return (
      <text fg={theme.spineDiffMuted as any} wrapMode="word">
        {body() ? summary() : summary()}
      </text>
    )
  }

  return (
    <box flexDirection="column" minWidth={0} flexGrow={1} flexShrink={1} width="100%">
      <text fg={theme.spineDiffMuted as any} wrapMode="word">
        {summary()}
      </text>
      <box minWidth={0} flexGrow={1} flexShrink={1} width="100%" marginTop={0}>
        <diff
          diff={prepared().text}
          view={view()}
          filetype={ft()}
          syntaxStyle={syntax()}
          showLineNumbers={props.layout !== "narrow"}
          width="100%"
          wrapMode="word"
          syncScroll={view() === "split"}
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
      <Show when={prepared().truncated}>
        <text fg={theme.spineDiffMuted as any}>o · open full diff</text>
      </Show>
    </box>
  )
}
