import { ErrorBoundary, For, Show } from "solid-js"
import type { Accessor } from "solid-js"
import type { MouseEvent, ScrollAcceleration, ScrollBoxRenderable } from "@opentui/core"
import { useTheme } from "../../context/theme"
import { type SpineLayout, type SpineEntry } from "./spine-types"
import { SpineEntryBinding } from "./spine-entry-binding"
import { SpineRowError } from "./spine-row-error"

/**
 * Scroll/visible-region rendering container for the spine.
 *
 * Renders the <scrollbox> plus the scroll-to-bottom button. Each row is a
 * keyed <For> over stable ids; the binding resolves the current entry object
 * per render (streaming updates swap content without remounting rows).
 */
export function SpineViewport(props: {
  visibleEntryIDs: Accessor<readonly string[]>
  visibleEntryByID: Accessor<Map<string, SpineEntry>>
  layout: SpineLayout
  gutterWidth: number
  proseWidth: number
  thinkContentWidth: number
  entryExpanded: (entry: SpineEntry) => boolean
  entryFocused: (entry: SpineEntry) => boolean
  onToggleEntry: (entry: SpineEntry) => void
  onFocusEntry: (entry: SpineEntry) => void
  onNavigate: (sessionID: string) => void
  onResolveChild?: (entry: SpineEntry) => void
  sessionID?: string
  fallbackChildSessionID?: string
  showScrollbar: boolean
  scrollAcceleration: ScrollAcceleration
  setScrollRef: (r: ScrollBoxRenderable) => void
  handleMouseScroll: (event: MouseEvent) => void
  showScrollButton: boolean
  onScrollButton: () => void
}) {
  const { theme } = useTheme()

  return (
    <box position="relative" flexDirection="column" flexGrow={1}>
      <scrollbox
        ref={(r) => props.setScrollRef(r as unknown as ScrollBoxRenderable)}
        viewportOptions={{
          paddingRight: props.showScrollbar ? 1 : 0,
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
      <Show when={props.showScrollButton}>
        <box
          position="absolute"
          bottom={2}
          right={4}
          zIndex={50}
          width={3}
          height={1}
          onMouseUp={props.onScrollButton}
        >
          <text fg={theme.accent}>↓</text>
        </box>
      </Show>
    </box>
  )
}
