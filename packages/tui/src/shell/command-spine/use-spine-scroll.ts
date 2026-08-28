import { createEffect, createSignal, onCleanup, onMount } from "solid-js"
import type { Accessor, Setter } from "solid-js"
import type { MouseEvent, ScrollBoxRenderable } from "@opentui/core"
import { hasContentAbove, hasContentBelow } from "../../util/geometry"

/**
 * Scrolling state and actions for the spine viewport.
 *
 * Owns the ScrollBox ref, two independent scroll-indicator signals (↑ when
 * content is hidden above, ↓ when content is hidden below), and the
 * scroll-triggering actions (wheel observe, keyboard H/G, entry-into-view).
 * The shell binds the ref into its <scrollbox> and forwards the indicator
 * signals to the viewport; every scroll-triggering action re-evaluates the
 * indicators via refreshScrollIndicators (event-driven, audit D10).
 */
export function useSpineScroll(input: {
  /** Forwarded to the ScrollBox ref so callers can also read the renderable. */
  onRef: (r: ScrollBoxRenderable) => void
  /** Changes whenever mounted row content can change its rendered height. */
  contentRevision?: Accessor<unknown>
}) {
  const [showScrollUpButton, setShowScrollUpButton] = createSignal(false)
  const [showScrollDownButton, setShowScrollDownButton] = createSignal(false)
  let scroll: ScrollBoxRenderable | undefined
  let refreshFrame: number | undefined

  const setScrollRef = (r: ScrollBoxRenderable) => {
    scroll = r
    input.onRef(r)
  }

  const refreshScrollIndicators = () => {
    const s = scroll
    if (!s || s.isDestroyed) return
    setShowScrollUpButton(hasContentAbove(s.y))
    setShowScrollDownButton(hasContentBelow(s.scrollHeight, s.y, s.height))
  }

  const handleMouseScroll = (event: MouseEvent) => {
    const direction = event.scroll?.direction
    if (direction !== "up" && direction !== "down") return
    queueMicrotask(refreshScrollIndicators)
  }

  const scrollToTop = () => {
    const s = scroll
    if (!s || s.isDestroyed) return
    s.scrollTo(0)
    refreshScrollIndicators()
  }

  const scrollToBottom = () => {
    const s = scroll
    if (!s || s.isDestroyed) return
    s.scrollTo(s.scrollHeight)
    refreshScrollIndicators()
  }

  /** D10: native DOM-style "nearest" scroll via the entry's id root box. */
  const scrollEntryIntoView = (entryID: string) => {
    queueMicrotask(() => {
      const s = scroll
      if (!s || s.isDestroyed) return
      s.scrollChildIntoView(entryID)
      refreshScrollIndicators()
    })
  }

  onMount(refreshScrollIndicators)

  createEffect(() => {
    input.contentRevision?.()
    const s = scroll
    if (!s || s.isDestroyed) return
    const distance = s.scrollHeight - s.scrollTop - s.height
    const wasFollowing = distance <= 2
    if (refreshFrame !== undefined) cancelAnimationFrame(refreshFrame)
    refreshFrame = requestAnimationFrame(() => {
      refreshFrame = undefined
      const current = scroll
      if (!current || current.isDestroyed) return
      if (wasFollowing) current.scrollTo(current.scrollHeight)
      refreshScrollIndicators()
    })
  })

  onCleanup(() => {
    if (refreshFrame !== undefined) cancelAnimationFrame(refreshFrame)
  })

  return {
    showScrollUpButton: showScrollUpButton as Accessor<boolean>,
    setShowScrollUpButton: setShowScrollUpButton as Setter<boolean>,
    showScrollDownButton: showScrollDownButton as Accessor<boolean>,
    setShowScrollDownButton: setShowScrollDownButton as Setter<boolean>,
    setScrollRef,
    refreshScrollIndicators,
    handleMouseScroll,
    scrollToTop,
    scrollToBottom,
    scrollEntryIntoView,
  }
}
