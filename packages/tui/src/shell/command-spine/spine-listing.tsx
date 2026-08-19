import { For, Show } from "solid-js"
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

  return (
    <box flexDirection="column" flexShrink={0} minWidth={0} paddingLeft={1} gap={0}>
      <For each={props.entries}>
        {(name) => {
          const entry = listingEntryChrome(name)
          return (
            <box flexDirection="row" flexShrink={0} gap={1} minWidth={0}>
              <box paddingLeft={1} paddingRight={1} backgroundColor={theme.backgroundElement} flexShrink={0}>
                <text fg={entry.kind === "dir" ? theme.spineContext : theme.spineDiffMuted} wrapMode="none">
                  {entry.kind}
                </text>
              </box>
              <text fg={nameColor()} wrapMode="none">
                {entry.name}
                <Show when={entry.mark}>
                  <span style={{ fg: muted() }}>{entry.mark}</span>
                </Show>
              </text>
            </box>
          )
        }}
      </For>
      <Show when={props.note?.trim()}>
        <text fg={muted()} wrapMode="word">
          {props.note!.trim()}
        </text>
      </Show>
    </box>
  )
}
