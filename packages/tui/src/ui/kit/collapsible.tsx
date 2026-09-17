import { createSignal, Show, type ParentProps } from "solid-js"
import { useTheme } from "../../context/theme"
import { Glyph } from "../../branding"
import { Space } from "../chrome"

/**
 * A foldable section: one header row with a disclosure glyph, the body shown
 * only when expanded. The header is the click target and carries hover fill;
 * the body is the caller's.
 */
export function Collapsible(props: ParentProps<{
  title: string
  expanded: boolean
  onToggle: () => void
  /** Right-aligned summary shown while collapsed (a count, a state). */
  hint?: string
  /** Unread/attention marker before the title. */
  mark?: string
}>) {
  const { theme } = useTheme()
  const [hovered, setHovered] = createSignal(false)
  return (
    <box flexDirection="column" minWidth={0}>
      <box
        flexDirection="row"
        flexShrink={0}
        alignItems="center"
        gap={Space.gap}
        backgroundColor={hovered() ? theme.backgroundElement : undefined}
        onMouseUp={(event) => {
          event.stopPropagation?.()
          props.onToggle()
        }}
        onMouseOver={() => setHovered(true)}
        onMouseOut={() => setHovered(false)}
      >
        <text fg={theme.spineContext} wrapMode="none" flexShrink={0}>
          {props.expanded ? Glyph.chevronOpen : Glyph.chevronClosed}
        </text>
        <Show when={props.mark}>
          <text fg={theme.warning} wrapMode="none" flexShrink={0}>
            {props.mark}
          </text>
        </Show>
        <text fg={theme.text} wrapMode="none" flexShrink={1} overflow="hidden">
          {props.title}
        </text>
        <box flexGrow={1} minWidth={1} />
        <Show when={props.hint}>
          <text fg={theme.spineContext} wrapMode="none" flexShrink={0}>
            {props.hint}
          </text>
        </Show>
      </box>
      <Show when={props.expanded}>
        <box flexDirection="column" paddingTop={Space.padY} minWidth={0}>
          {props.children}
        </box>
      </Show>
    </box>
  )
}
