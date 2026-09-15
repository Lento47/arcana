import { For, Show, createMemo } from "solid-js"
import { useTheme } from "../../context/theme"
import { listingEntryChrome } from "./spine-chrome"

/**
 * Compact directory / glob listing — plain names, no XML, no code fence, no markdown.
 */
export function SpineListing(props: {
  entries: string[]
  note?: string
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
            <text fg={nameColor()} wrapMode="none">
              {entry.name}
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
