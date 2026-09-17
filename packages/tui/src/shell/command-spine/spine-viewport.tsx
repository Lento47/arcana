import { ErrorBoundary, For, Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js"
import type { Accessor } from "solid-js"
import type { MouseEvent, ScrollAcceleration, ScrollBoxRenderable } from "@opentui/core"
import { useTheme } from "../../context/theme"
import { Minimap } from "../../ui/kit/minimap-view"
import { jumpScrollTop, minimapRows, viewportBracket } from "../../ui/kit/minimap"
import { Layer } from "../../ui/chrome"
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
  /**
   * Blank rows between top-level entries; density-aware (Space.blockGap).
   * Defaults to 1 when omitted.
   */
  blockGap?: number
  /**
   * Entry-kinds for the minimap strip (one cell per slice of entries, marks
   * survive compression). When present the map replaces the corner cues: the
   * map already shows where hidden content is.
   */
  mapEntries?: readonly { kind: string; mark?: string }[]
}) {
  const { theme } = useTheme()
  const [upHover, setUpHover] = createSignal(false)
  const [downHover, setDownHover] = createSignal(false)

  // ── Minimap strip ─────────────────────────────────────────────────────
  // The map is entry-granular; its height and the viewport bracket are read
  // from the scrollbox on a short interval (the scrollbox has no scroll event),
  // and only while a map is actually shown.
  let mapScrollBox: ScrollBoxRenderable | undefined
  const [mapRows, setMapRows] = createSignal(0)
  const [mapBracket, setMapBracket] = createSignal<{ from: number; to: number } | undefined>(undefined)
  const mapCells = createMemo(() => minimapRows(props.mapEntries ?? [], mapRows()))
  const showMap = () => !props.showScrollbar && mapCells().length > 0
  let measure: ReturnType<typeof setInterval> | undefined
  createEffect(() => {
    const entries = props.mapEntries
    if (!entries || entries.length === 0 || props.showScrollbar) {
      if (measure) {
        clearInterval(measure)
        measure = undefined
      }
      return
    }
    if (measure) return
    measure = setInterval(() => {
      const handle = mapScrollBox
      const viewportHeight = Math.max(8, Math.floor(handle?.viewport?.height ?? handle?.height ?? 24))
      setMapRows(viewportHeight)
      if (handle) {
        setMapBracket(
          viewportBracket({
            rows: viewportHeight,
            scrollTop: handle.scrollTop ?? 0,
            scrollHeight: handle.scrollHeight ?? 0,
            viewportHeight: handle.viewport?.height ?? viewportHeight,
          }),
        )
      }
    }, 150)
    ;(measure as { unref?: () => void }).unref?.()
  })
  onCleanup(() => {
    if (measure) clearInterval(measure)
  })

  return (
    <box position="relative" flexDirection="column" flexGrow={1}>
      <scrollbox
        ref={(r) => {
          mapScrollBox = r as unknown as ScrollBoxRenderable
          props.setScrollRef(r as unknown as ScrollBoxRenderable)
        }}
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
        contentOptions={{ gap: props.blockGap ?? 1 }}
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
      <Show when={!props.showScrollbar && !showMap() && props.showScrollUpButton}>
        <box
          position="absolute"
          top={0}
          right={0}
          zIndex={Layer.cue}
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
      <Show when={!props.showScrollbar && !showMap() && props.showScrollDownButton}>
        <box
          position="absolute"
          bottom={0}
          right={0}
          zIndex={Layer.cue}
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
      {/* The map strip: one narrow column at the right edge, entry-granular.
          Click a row to jump; the bracket shows the visible slice. */}
      <Show when={showMap()}>
        <box position="absolute" top={0} bottom={0} right={0} zIndex={Layer.cue} width={1} flexDirection="column">
          <Minimap
            cells={mapCells()}
            bracket={mapBracket()}
            onJump={(row) => {
              const handle = mapScrollBox
              if (!handle) return
              handle.scrollTop = jumpScrollTop({
                row,
                rows: mapRows(),
                scrollHeight: handle.scrollHeight ?? 0,
                viewportHeight: handle.viewport?.height ?? mapRows(),
              })
            }}
          />
        </box>
      </Show>
    </box>
  )
}
