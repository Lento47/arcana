import { For, Show } from "solid-js"
import { useTheme } from "../../context/theme"

/**
 * A path readout with optional crumb picking. The last crumb carries the
 * accent — "where am I" — and earlier crumbs are quiet links.
 */
export function Breadcrumbs(props: {
  items: readonly string[]
  onPick?: (index: number) => void
}) {
  const { theme } = useTheme()
  return (
    <box flexDirection="row" minWidth={0}>
      <For each={props.items}>
        {(item, index) => (
          <>
            <text
              fg={index() === props.items.length - 1 ? theme.accent : theme.textMuted}
              wrapMode="none"
              flexShrink={0}
              onMouseUp={props.onPick ? () => props.onPick!(index()) : undefined}
            >
              {item}
            </text>
            <Show when={index() < props.items.length - 1}>
              <text fg={theme.borderSubtle} wrapMode="none" flexShrink={0}>
                {" › "}
              </text>
            </Show>
          </>
        )}
      </For>
    </box>
  )
}
