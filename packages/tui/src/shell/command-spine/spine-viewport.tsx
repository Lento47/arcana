import { ErrorBoundary, For, Show, createSignal } from "solid-js"
import type { Accessor } from "solid-js"
import type { MouseEvent, ScrollAcceleration, ScrollBoxRenderable } from "@opentui/core"
import { useTheme } from "../../context/theme"
import { type SpineLayout, type SpineEntry, type SpineEntryAction } from "./spine-types"
import { SpineEntryBinding } from "./spine-entry-binding"
import { SpineRowError } from "./spine-row-error"
import type { StreamFrameGate } from "../../util/stream-frame"

/**
 * Scroll/visible-region rendering container for the spine.
 *
 * Renders the <scrollbox> plus two independent scroll cues: a `↑` when
 * content is hidden above the viewport (click to scroll to top) and a `↓`
 * when content is hidden below (click to scroll to bottom). The cues live in
 * a permanently reserved 1-cell right gutter so they can never sit on row
 * text, and they yield to the scrollbar thumb when the scrollbar is on.
 * Rows are a keyed <For> over stable ids; the binding resolves the current
 * entry object per render (streaming updates swap content without remounting).
 */
export function SpineViewport(props: {
  visibleEntryIDs: Accessor<readonly string[]>
  visibleEntryByID: Accessor<Map<string, SpineEntry>>
  layout: SpineLayout
  gutterWidth: number
  proseWidth: number
  thinkContentWidth: number
  streamFrame?: StreamFrameGate
  entryExpanded: (entry: SpineEntry) => boolean
  entryFocused: (entry: SpineEntry) => boolean
  onToggleEntry: (entry: SpineEntry) => void
  onFocusEntry: (entry: SpineEntry) => void
  onContextMenu: (entry: SpineEntry) => void
  onAction?: (entry: SpineEntry, action: SpineEntryAction["id"]) => void
  /** Operator dismissal ("×") for approval banners. */
  onDismissEntry?: (entry: SpineEntry) => void
  actionIndex?: number
  onNavigate: (sessionID: string) => void
  onResolveChild?: (entry: SpineEntry) => void
  sessionID?: string
  fallbackChildSessionID?: string
  showScrollbar: boolean
  scrollAcceleration: ScrollAcceleration
  setScrollRef: (r: ScrollBoxRenderable) => void
  handleMouseScroll: (event: MouseEvent) => void
  showScrollUpButton: boolean
  showScrollDownButton: boolean
  onScrollToTop: () => void
  onScrollToBottom: () => void
}) {
  const { theme } = useTheme()
  const [upHover, setUpHover] = createSignal(false)
  const [downHover, setDownHover] = createSignal(false)

  return (
    <box position="relative" flexDirection="column" flexGrow={1}>
      <scrollbox
        ref={(r) => props.setScrollRef(r as unknown as ScrollBoxRenderable)}
        viewportOptions={{
          // The right gutter is always reserved: scroll cues render in it, so
          // they never land on row text (right={4} used to glue "↑" to the
          // row's chevron/elapsed meta).
          paddingRight: 1,
        }}
        verticalScrollbarOptions={{
          paddingLeft: 1,
          visible: props.showScrollbar,
          trackOptions: {
            backgroundColor: theme.backgroundElement,
            foregroundColor: theme.border,
          },
        }}
        viewportCulling={true}
        stickyScroll={true}
        stickyStart="bottom"
        flexGrow={1}
        scrollAcceleration={props.scrollAcceleration}
        onMouseScroll={props.handleMouseScroll}
      >
        <For each={props.visibleEntryIDs()}>
          {(id) => {
            // A keyed Solid <For> runs this child once per id. Never capture
            // the entry object here; resolve the current object via the map so
            // streamed content refreshes without remounting the row.
            const getEntry = () => props.visibleEntryByID().get(id)
            return (
              <ErrorBoundary
                fallback={(error) => (
                  <SpineRowError file="spine-entry.tsx" error={error as Error} />
                )}
              >
                <SpineEntryBinding
                  getEntry={getEntry}
                  layout={props.layout}
                  gutterWidth={props.gutterWidth}
                  contentWidth={props.proseWidth}
                  thinkContentWidth={props.thinkContentWidth}
                  streamFrame={props.streamFrame}
                  expanded={props.entryExpanded(getEntry()!)}
                  focused={props.entryFocused(getEntry()!)}
                  onToggle={() => {
                    const entry = getEntry()
                    if (entry) props.onToggleEntry(entry)
                  }}
                  onFocus={() => {
                    const entry = getEntry()
                    if (entry) props.onFocusEntry(entry)
                  }}
                  onNavigate={props.onNavigate}
                  onContextMenu={(entry) => props.onContextMenu(entry)}
                  onAction={(entry, action) => props.onAction?.(entry, action)}
                  onDismiss={() => {
                    const entry = getEntry()
                    if (entry) props.onDismissEntry?.(entry)
                  }}
                  selectedAction={props.actionIndex}
                  onResolveChild={() => {
                    const entry = getEntry()
                    if (entry) props.onResolveChild?.(entry)
                  }}
                  sessionID={props.sessionID}
                  fallbackChildSessionID={props.fallbackChildSessionID}
                />
              </ErrorBoundary>
            )
          }}
        </For>
      </scrollbox>
      {/* Cues are contextual: they appear only when that direction has hidden
          content and the scrollbar is off (the thumb already maps position,
          and overlaying it would replace thumb cells). */}
      <Show when={!props.showScrollbar && props.showScrollUpButton}>
        <box
          position="absolute"
          top={0}
          right={0}
          zIndex={50}
          width={1}
          height={1}
          onMouseUp={props.onScrollToTop}
          onMouseOver={() => setUpHover(true)}
          onMouseOut={() => setUpHover(false)}
          backgroundColor={upHover() ? theme.backgroundElement : undefined}
        >
          <text fg={theme.accent}>↑</text>
        </box>
      </Show>
      <Show when={!props.showScrollbar && props.showScrollDownButton}>
        <box
          position="absolute"
          bottom={0}
          right={0}
          zIndex={50}
          width={1}
          height={1}
          onMouseUp={props.onScrollToBottom}
          onMouseOver={() => setDownHover(true)}
          onMouseOut={() => setDownHover(false)}
          backgroundColor={downHover() ? theme.backgroundElement : undefined}
        >
          <text fg={theme.accent}>↓</text>
        </box>
      </Show>
    </box>
  )
}
