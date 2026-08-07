import { createSignal, onMount } from "solid-js"
import type { Accessor, Setter } from "solid-js"
import type { MouseEvent, ScrollBoxRenderable } from "@opentui/core"
import { shouldShowScrollButton } from "../../util/geometry"

/**
 * Scrolling state and actions for the spine viewport.
 *
 * Owns the ScrollBox ref, the scroll-to-bottom button signal, and the
 * scroll-triggering actions (wheel observe, keyboard H/G, entry-into-view).
 * The shell binds the ref into its <scrollbox> and forwards the button signal
 * to the viewport; every scroll-triggering action re-evaluates the button via
 * refreshScrollButton (event-driven, audit D10).
 */
export function useSpineScroll(input: {
  /** Forwarded to the ScrollBox ref so callers can also read the renderable. */
  onRef: (r: ScrollBoxRenderable) => void
}) {
  const [showScrollButton, setShowScrollButton] = createSignal(false)
  let scroll: ScrollBoxRenderable | undefined

  const setScrollRef = (r: ScrollBoxRenderable) => {
    scroll = r
    input.onRef(r)
  }

  const refreshScrollButton = () => {
    const s = scroll
    if (!s || s.isDestroyed) return
    setShowScrollButton(shouldShowScrollButton(s.scrollHeight, s.y, s.height))
  }

  const handleMouseScroll = (event: MouseEvent) => {
    const direction = event.scroll?.direction
    if (direction !== "up" && direction !== "down") return
    queueMicrotask(refreshScrollButton)
  }

  const scrollToTop = () => {
    const s = scroll
    if (!s || s.isDestroyed) return
    s.scrollTo(0)
    refreshScrollButton()
  }

  const scrollToBottom = () => {
    const s = scroll
    if (!s || s.isDestroyed) return
    s.scrollTo(s.scrollHeight)
    refreshScrollButton()
  }

  /** D10: native DOM-style "nearest" scroll via the entry's id root box. */
  const scrollEntryIntoView = (entryID: string) => {
    queueMicrotask(() => {
      const s = scroll
      if (!s || s.isDestroyed) return
      s.scrollChildIntoView(entryID)
      refreshScrollButton()
    })
  }

  onMount(refreshScrollButton)

  return {
    showScrollButton: showScrollButton as Accessor<boolean>,
    setShowScrollButton: setShowScrollButton as Setter<boolean>,
    setScrollRef,
    refreshScrollButton,
    handleMouseScroll,
    scrollToTop,
    scrollToBottom,
    scrollEntryIntoView,
  }
}
