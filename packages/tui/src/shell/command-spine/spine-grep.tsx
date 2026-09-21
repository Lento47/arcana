import { For, Show, createMemo } from "solid-js"
import { Space } from "../../ui/chrome"
import { useTheme } from "../../context/theme"
import { truncate } from "../../util/locale"
import type { GrepFile } from "./mapper/grep-output"

/**
 * Grep matches as a dev reads them: dense rows, dim line numbers, the query
 * hit highlighted — not engine prose with a blank row between every match and
 * full workspace paths.
 */
export function GrepMatches(props: {
  files: GrepFile[]
  /** The search pattern, for highlighting hits. Ripgrep syntax is close enough
   *  to JS RegExp for the common case; anything unconstructable renders plain. */
  pattern?: string
  /** Elided remainder, e.g. `… (15 more — refine the query)`. First, like listings. */
  note?: string
  /** Measured row width; long lines truncate with "…" instead of overflowing. */
  contentWidth?: number
}) {
  const { theme } = useTheme()

  const hitPattern = createMemo(() => {
    const source = props.pattern?.trim()
    if (!source) return undefined
    try {
      return new RegExp(source, "g")
    } catch {
      return undefined
    }
  })

  /** Split a match line into plain/hit spans. At most a handful of hits per
   *  line: a degenerate pattern (`.*`) must not mint a span per character. */
  const spansFor = (text: string): Array<{ text: string; hit: boolean }> => {
    const pattern = hitPattern()
    if (!pattern) return [{ text, hit: false }]
    pattern.lastIndex = 0
    const spans: Array<{ text: string; hit: boolean }> = []
    let last = 0
    let hits = 0
    for (let match = pattern.exec(text); match !== null && hits < 8; match = pattern.exec(text)) {
      if (match[0].length === 0) {
        pattern.lastIndex += 1
        continue
      }
      if (match.index > last) spans.push({ text: text.slice(last, match.index), hit: false })
      spans.push({ text: match[0], hit: true })
      last = match.index + match[0].length
      hits += 1
    }
    if (last < text.length) spans.push({ text: text.slice(last), hit: false })
    if (spans.length === 0) spans.push({ text, hit: false })
    return spans
  }

  const lineWidth = createMemo(() => {
    let digits = 1
    for (const file of props.files) {
      for (const match of file.matches) {
        digits = Math.max(digits, String(match.line).length)
      }
    }
    return digits
  })

  const rowBudget = createMemo(() => {
    const width = props.contentWidth
    if (typeof width !== "number" || !Number.isFinite(width)) return undefined
    // Indent + line-number column + gap: the code gets the rest.
    return Math.max(8, Math.floor(width) - 2 - lineWidth() - 1)
  })

  const lineText = (text: string): string => {
    const budget = rowBudget()
    const trimmed = text.trimStart()
    return budget === undefined ? trimmed : truncate(trimmed, budget)
  }

  const shortPath = (path: string): string => {
    const parts = path.replace(/\\/g, "/").split("/").filter(Boolean)
    if (parts.length <= 2) return path
    return `…/${parts.slice(-2).join("/")}`
  }

  return (
    <box flexDirection="column" flexShrink={0} minWidth={0} paddingLeft={Space.unit} gap={0}>
      <Show when={props.note?.trim()}>
        <text fg={theme.spineDiffMuted} wrapMode="word" paddingBottom={Space.padY}>
          {props.note!.trim()}
        </text>
      </Show>
      <For each={props.files}>
        {(file) => (
          <box flexDirection="column" flexShrink={0} minWidth={0}>
            <box flexDirection="row" flexShrink={0} gap={Space.gap} minWidth={0} overflow="hidden">
              <text fg={theme.text} wrapMode="none" overflow="hidden" flexShrink={0}>
                {(() => {
                  const budget = rowBudget()
                  const short = shortPath(file.path)
                  return budget === undefined ? short : truncate(short, budget)
                })()}
              </text>
              <text fg={theme.spineDiffMuted} wrapMode="none" flexShrink={0}>
                · {file.count} {file.count === 1 ? "match" : "matches"}
              </text>
            </box>
            <For each={file.matches}>
              {(match) => (
                <box flexDirection="row" flexShrink={0} minWidth={0} overflow="hidden">
                  <text fg={theme.spineDiffMuted} wrapMode="none" flexShrink={0} width={lineWidth()}>
                    {String(match.line).padStart(lineWidth())}
                  </text>
                  <text fg={theme.text} wrapMode="none" overflow="hidden" flexGrow={1} minWidth={0}>
                    {" "}
                    <For each={spansFor(lineText(match.text))}>
                      {(span) =>
                        span.hit ? (
                          <span style={{ fg: theme.accent, bold: true }}>{span.text}</span>
                        ) : (
                          <span>{span.text}</span>
                        )
                      }
                    </For>
                  </text>
                </box>
              )}
            </For>
          </box>
        )}
      </For>
    </box>
  )
}
