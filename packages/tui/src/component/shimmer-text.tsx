import { Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js"
import { useKV } from "../context/kv"
import type { ColorInput, RGBA } from "@opentui/core"
import { useSpineMotion } from "../shell/command-spine/spine-motion"

interface ShimmerTextProps {
  text: string
  active?: boolean
  /** Terminal bg color — RGBA from the theme resolves to a valid ColorInput. */
  background?: ColorInput
  /** Hex string or OpenTUI RGBA. Theme tokens are RGBA objects. */
  accent?: string | RGBA
  /** Command-spine cue id. Only the shell-selected cue animates. */
  cue?: string
  /** Animation style: "sweep" (light glides across) or "pulse" (whole text breathes). */
  animation?: "sweep" | "pulse"
}

const FALLBACK_ACCENT: [number, number, number] = [224, 166, 75]

/** Convert a hex string or OpenTUI RGBA (0–1 channels) to 0–255 RGB. */
export function colorToRgb(color: string | RGBA | undefined): [number, number, number] {
  if (color == null) return FALLBACK_ACCENT
  if (typeof color === "object" && typeof (color as RGBA).r === "number") {
    const { r, g, b } = color as RGBA
    const scale = r <= 1 && g <= 1 && b <= 1 ? 255 : 1
    return [Math.round(r * scale), Math.round(g * scale), Math.round(b * scale)]
  }
  if (typeof color !== "string") return FALLBACK_ACCENT
  const hex = color.trim().replace("#", "")
  if (hex.length < 6) return FALLBACK_ACCENT
  const r = Number.parseInt(hex.slice(0, 2), 16)
  const g = Number.parseInt(hex.slice(2, 4), 16)
  const b = Number.parseInt(hex.slice(4, 6), 16)
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return FALLBACK_ACCENT
  return [r, g, b]
}

function interpolate(a: readonly [number, number, number], b: readonly [number, number, number], amount: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * amount, a[1] + (b[1] - a[1]) * amount, a[2] + (b[2] - a[2]) * amount]
}

function toHex(rgb: readonly [number, number, number]): string {
  return "#" + rgb.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")
}

export function ShimmerText(props: ShimmerTextProps) {
  const kv = useKV()
  const motion = useSpineMotion()
  const animationsEnabled = () => kv.get("animations_enabled", true)
  const accent = createMemo(() => colorToRgb(props.accent))
  const base = createMemo<[number, number, number]>(() => [
    Math.round(accent()[0] * 0.4),
    Math.round(accent()[1] * 0.4),
    Math.round(accent()[2] * 0.4),
  ])
  const characters = createMemo(() => Array.from(props.text))
  const [localPhase, setLocalPhase] = createSignal(0)
  const active = () =>
    props.active !== false
    && animationsEnabled()
    && (motion ? (props.cue ? motion.isCueActive(props.cue) : true) : true)

  // Smooth sweep: a continuous float center (in char units) ping-pongs across
  // the text. Advanced by delta-time so speed is identical at any frame rate.
  // SPEED = chars/sec, RADIUS = glow half-width (chars).
  const SPEED = 6
  const RADIUS = 2.4
  const SIGMA = RADIUS / 2

  // Hoist the sweep start time so it survives effect re-runs triggered by
  // activeCue re-evaluation. Without this, every SSE tick would capture a
  // fresh performance.now(), resetting the sweep to the left edge.
  let sweepStartTime = 0
  let animationFrame: number | undefined
  let animationTimer: ReturnType<typeof setInterval> | undefined
  let animationRetryTimer: ReturnType<typeof setTimeout> | undefined

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
    if (!active()) {
      sweepStartTime = 0
      return
    }
    // OpenTUI's renderer passes frame delta (rather than the browser's
    // absolute DOMHighResTimeStamp) to RAF callbacks. Read the monotonic clock
    // here so the sweep remains correct in both OpenTUI and browser-like test
    // renderers.
    const now = performance.now()
    if (sweepStartTime === 0) sweepStartTime = now
    setLocalPhase(Math.max(0, now - sweepStartTime))
  }

  // Timers only wake the animation at its target cadence. The mutation itself
  // is committed through one renderer RAF, so OpenTUI can settle between
  // frames instead of being kept in a perpetual live loop.
  const queueFrame = () => {
    if (!active() || animationFrame !== undefined) return
    animationFrame = requestAnimationFrame(() => {
      animationFrame = undefined
      if (animationRetryTimer !== undefined) {
        clearTimeout(animationRetryTimer)
        animationRetryTimer = undefined
      }
      tick()
    })
    // If a stream update arrives during an OpenTUI render, the renderer can
    // strand a one-shot RAF. Retry after the pass so motion remains smooth
    // without pinning the whole TUI to a continuous live loop.
    animationRetryTimer = setTimeout(() => {
      animationRetryTimer = undefined
      if (animationFrame === undefined || !active()) return
      cancelAnimationFrame(animationFrame)
      animationFrame = undefined
      queueFrame()
    }, 8)
  }

  createEffect(() => {
    // Run the timer/renderer cadence regardless of `motion`: the cue only
    // gates visibility (active()); it must not dictate a stepped position.
    // Each wake publishes through one requestAnimationFrame so the phase stays
    // in the same frame as the rest of OpenTUI instead of racing stream timers.
    const running = active()
    stopAnimation()
    if (!running) {
      sweepStartTime = 0
      return
    }
    // Only capture the origin on the inactive → active transition so the
    // sweep continues uninterrupted across re-evaluations that return the
    // same value.
    if (sweepStartTime === 0) sweepStartTime = performance.now()
    queueFrame()
    animationTimer = setInterval(queueFrame, 16)
    onCleanup(stopAnimation)
  })

  onCleanup(stopAnimation)

  // One-directional sweep (left → right, wrapping). The gaussian falloff
  // already drives intensity → 0 at both edges, so the wrap is invisible —
  // no bounce, no teleport.
  const span = () => characters().length + 2 * RADIUS

  const center = createMemo(() => {
    if (!active()) return -RADIUS - 1
    const e = localPhase() / 1000
    return (e * SPEED) % span() - RADIUS
  })

  // Whole-text breathing for the "pulse" variant: smooth 0→1→0 sine over a
  // fixed period. No travelling band.
  const pulseIntensity = createMemo(() => {
    if (!active()) return 0
    const e = localPhase() / 1000
    const period = 1.8
    return 0.5 - 0.5 * Math.cos((2 * Math.PI * e) / period)
  })

  const pulse = () => props.animation === "pulse"

  // Per-character gaussian glow for "sweep" (a continuous gradient comet, not
  // a stepped crawl); uniform breathing intensity for "pulse".
  const shade = (i: number) => {
    const intensity = pulse()
      ? pulseIntensity()
      : (() => {
          const c = center()
          const s = span()
          // Circular distance over the loop period so the band wraps seamlessly:
          // it exits the right edge exactly as its twin enters the left — no dark
          // gap / blink at the loop boundary.
          const d = ((c - i + s / 2) % s + s) % s - s / 2
          return Math.exp(-(d * d) / (2 * SIGMA * SIGMA))
        })()
    return toHex(interpolate(base(), accent(), intensity))
  }

  return (
    <text bg={props.background}>
      <Show when={active()} fallback={<span style={{ fg: toHex(base()) }}>{props.text}</span>}>
        {characters().map((c, i) => (
          <span style={{ fg: shade(i) }}>{c}</span>
        ))}
      </Show>
    </text>
  )
}
