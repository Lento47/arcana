import { For, Show, createMemo } from "solid-js"
import { useTheme } from "../../context/theme"
import { truncate } from "../../util/locale"
import { listingEntryChrome } from "./spine-chrome"

/**
 * Compact directory / glob listing — plain names, no XML, no code fence, no markdown.
 */
export function SpineListing(props: {
  entries: string[]
  note?: string
  /** Measured row width; long paths truncate with "…" instead of overflowing. */
  contentWidth?: number
}) {
  const { theme } = useTheme()
  const muted = () => theme.spineDiffMuted
  const nameColor = () => theme.text
  const rows = createMemo(() => props.entries.map((name) => listingEntryChrome(name)))
  // A pill per row is noise when every entry shares a kind (e.g. a 500-row
  // pure-file glob). It only earns its cells when the listing mixes dirs and
  // files — that is when the disambiguation matters.
  const uniformKind = createMemo(() => {
    const kinds = new Set(rows().map((row) => row.kind))
    return kinds.size <= 1
  })
  // Long paths must truncate with "…" (never overflow the row): budget =
  // measured width minus the row indent and, when mixed, the kind pill.
  const nameBudget = createMemo(() => {
    const width = props.contentWidth
    if (typeof width !== "number" || !Number.isFinite(width)) return undefined
    return Math.max(8, Math.floor(width) - 2 - (uniformKind() ? 0 : 7))
  })
  const name = (entry: { name: string }) => {
    const budget = nameBudget()
    return budget === undefined ? entry.name : truncate(entry.name, budget)
  }

  return (
    <box flexDirection="column" flexShrink={0} minWidth={0} paddingLeft={1} gap={0}>
      {/* Note first, so a capped listing's "N more — refine the query" footer
          is visible without scrolling past hundreds of rows. */}
      <Show when={props.note?.trim()}>
        <text fg={muted()} wrapMode="word" paddingBottom={1}>
          {props.note!.trim()}
        </text>
      </Show>
      <For each={rows()}>
        {(entry) => (
          <box flexDirection="row" flexShrink={0} gap={1} minWidth={0}>
            <Show when={!uniformKind()}>
              <box paddingLeft={1} paddingRight={1} backgroundColor={theme.backgroundElement} flexShrink={0}>
                <text fg={entry.kind === "dir" ? theme.spineContext : theme.spineDiffMuted} wrapMode="none">
                  {entry.kind}
                </text>
              </box>
            </Show>
            <text fg={nameColor()} wrapMode="none" overflow="hidden">
              {name(entry)}
              <Show when={entry.mark}>
                <span style={{ fg: muted() }}>{entry.mark}</span>
              </Show>
            </text>
          </box>
        )}
      </For>
    </box>
  )
}
