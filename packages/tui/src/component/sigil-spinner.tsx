import { createEffect, createSignal, onCleanup, Show } from "solid-js"
import type { JSX } from "@opentui/solid"
import type { RGBA } from "@opentui/core"
import { useKV } from "../context/kv"
import { isSpinnerStyle, SIGIL_FRAMES, spinnerFrames } from "../util/spinner-style"

// A single rotating arcane sigil — the pentagram cycling through its
// orientations (point-up → interlaced → inverted → interlaced). Reads as one
// turning glyph, not a bar. Ties to the brand sigil ⛧.
const SIGIL = ["⛤", "⛥", "⛧", "⛦"]

/**
 * Drop-in replacement for the braille <Spinner> in "thinking" contexts.
 * Renders one animated arcane glyph + optional label. Honors animations_enabled
 * (falls back to a static sigil).
 */
export function SigilSpinner(props: {
  children?: JSX.Element
  color?: RGBA
  frames?: string[]
  /** ms per frame (default 150) */
  interval?: number
}) {
  const kv = useKV()
  // An explicit spinner_style overrides the sigil default (braille, dots, …);
  // unset keeps the arcane sigil this component is named for.
  const style = () => {
    const stored = kv.get("spinner_style")
    return isSpinnerStyle(stored) ? stored : undefined
  }
  const frames = () => props.frames ?? (style() === undefined ? SIGIL : spinnerFrames(style()!))
  const animate = () => kv.get("animations_enabled", true) && style() !== "none"
  const [i, setI] = createSignal(0)
  let animationFrame: number | undefined
  let animationTimer: ReturnType<typeof setInterval> | undefined
  let animationRetryTimer: ReturnType<typeof setTimeout> | undefined
  let lastTick = 0

  const stopAnimation = () => {
    if (animationFrame !== undefined) {
      cancelAnimationFrame(animationFrame)
      animationFrame = undefined
    }
    if (animationTimer !== undefined) {
      clearInterval(animationTimer)
      animationTimer = undefined
    }
    if (animationRetryTimer !== undefined) {
      clearTimeout(animationRetryTimer)
      animationRetryTimer = undefined
    }
  }

  const tick = () => {
    if (!animate()) {
      lastTick = 0
      return
    }
    const interval = props.interval ?? 80
    // OpenTUI supplies RAF callbacks with frame delta, not an absolute
    // timestamp. Use the monotonic clock for interval accounting.
    const now = performance.now()
    const frameSet = frames()
    if (frameSet.length === 0) return
    // Render the initial glyph before advancing, matching the prior interval
    // behaviour while keeping the mutation inside the renderer frame.
    if (lastTick === 0) {
      lastTick = now
      return
    }
    if (now - lastTick >= interval) {
      setI((value) => (value + 1) % frameSet.length)
      lastTick = now
    }
  }

  // Wake on a timer, then commit one frame through OpenTUI's renderer RAF.
  // This keeps motion smooth without pinning static screens to a live loop.
  const queueFrame = () => {
    if (!animate() || animationFrame !== undefined) return
    animationFrame = requestAnimationFrame(() => {
      animationFrame = undefined
      if (animationRetryTimer !== undefined) {
        clearTimeout(animationRetryTimer)
        animationRetryTimer = undefined
      }
      tick()
    })
    // Retry a stranded one-shot request if it was queued during a renderer
    // pass. This preserves renderer-backed commits without a perpetual loop.
    animationRetryTimer = setTimeout(() => {
      animationRetryTimer = undefined
      if (animationFrame === undefined || !animate()) return
      cancelAnimationFrame(animationFrame)
      animationFrame = undefined
      queueFrame()
    }, 8)
  }

  createEffect(() => {
    const running = animate()
    stopAnimation()
    if (!running) {
      lastTick = 0
      return
    }
    queueFrame()
    animationTimer = setInterval(queueFrame, Math.max(16, props.interval ?? 80))
    onCleanup(stopAnimation)
  })

  onCleanup(stopAnimation)

  const glyph = () => (animate() ? (frames()[i()] ?? "⛧") : "⛧")

  return (
    <box flexDirection="row" gap={1}>
      <text fg={props.color}>{glyph()}</text>
      <Show when={props.children}>
        <text fg={props.color}>{props.children}</text>
      </Show>
    </box>
  )
}
