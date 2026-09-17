import { createEffect, createSignal, onCleanup, useContext, type Accessor } from "solid-js"
import { KVContext } from "../context/kv"

/**
 * Color-only motion primitives.
 *
 * Every effect here is a liveness cue, not a frame-rate effect: it mutates one
 * signal, never geometry, and clears its own interval the moment it reaches
 * rest. All of them honor `animations_enabled` by snapping to the static value
 * immediately — no timer is ever started for a disabled animation.
 *
 * Text effects (shimmer, spinners) keep their own 16ms + renderer-RAF clocks in
 * their components; these primitives are for tints, trails and gauges.
 */

/**
 * Named timings, in milliseconds.
 *
 * The app's motion clusters on four values; naming them keeps a "fast" move
 * fast wherever it appears. `step` is the tick every primitive steps on, not a
 * duration of its own. Per-cue cadences that are tuned to their cue rather than
 * to the scale (the focus glide's 16ms, the breath's 120ms) stay local.
 */
export const Motion = {
  /** The animation tick shared by every primitive. */
  step: 50,
  /** A quick approach: one move for a small state change (the metrics bar). */
  fast: 80,
  /** An entrance or exit (the composer's meta fade-in). */
  base: 160,
  /** A flare settling back to rest (the reel, the node, the tool chip). */
  slow: 280,
} as const

/** One decay step of a flare: fraction `stepMs / fallMs` of the way to rest. */
export function nextFlareValue(value: number, rest: number, stepMs: number, fallMs: number): number {
  return value - (stepMs / Math.max(stepMs, fallMs)) * (value - rest)
}

/** One exponential-approach step toward `target` (faster rising than falling). */
export function nextEaseValue(current: number, target: number, riseRate: number, fallRate: number): number {
  const rate = target > current ? riseRate : fallRate
  return current + (target - current) * rate
}

/** Sine breath over `periodMs`, 0..1..0. `elapsedMs` is time since the cycle began. */
export function breathValue(elapsedMs: number, periodMs: number): number {
  const period = Math.max(1, periodMs)
  const phase = (((elapsedMs % period) + period) % period) / period
  return 0.5 - 0.5 * Math.cos(phase * Math.PI * 2)
}

/**
 * Motion honors the global `animations_enabled` switch. The context is read
 * optionally: isolated render tests and plugin surfaces can mount before
 * `KVProvider` (same tolerance `SpineToolChip` gives `ThemeContext`), and then
 * motion behaves as if animations are enabled — the default.
 */
function useMotionEnabled(): Accessor<boolean> {
  const kv = useContext(KVContext)
  return () => kv?.get("animations_enabled", true) !== false
}

export type FlareOptions = Readonly<{
  /** Milliseconds for the flare to decay back to rest. */
  fallMs?: number
  /** Timer cadence while the flare is in flight. */
  stepMs?: number
  /** Value at rest (also the value returned when animations are disabled). */
  rest?: number
}>

/**
 * One-shot pulse on a rising edge observed while mounted. A row that mounts
 * already settled (scrollback, session restore) never flares: only a live
 * `false → true` transition does.
 */
export function createFlare(active: Accessor<boolean>, options: FlareOptions = {}): Accessor<number> {
  const animationsEnabled = useMotionEnabled()
  const rest = options.rest ?? 0
  const stepMs = Math.max(16, options.stepMs ?? Motion.step)
  const fallMs = Math.max(stepMs, options.fallMs ?? Motion.slow)
  const [value, setValue] = createSignal(rest)
  let timer: ReturnType<typeof setInterval> | undefined
  let previous = active()

  const stop = () => {
    if (!timer) return
    clearInterval(timer)
    timer = undefined
  }

  const advance = () => {
    if (!animationsEnabled()) {
      stop()
      setValue(rest)
      return
    }
    const next = nextFlareValue(value(), rest, stepMs, fallMs)
    if (Math.abs(next - rest) <= 0.01) {
      setValue(rest)
      stop()
      return
    }
    setValue(next)
  }

  createEffect(() => {
    const enabled = animationsEnabled()
    const on = enabled && active()
    if (!enabled) {
      stop()
      setValue(rest)
      previous = on
      return
    }
    if (on && !previous) {
      setValue(1)
      if (!timer) timer = setInterval(advance, stepMs)
    }
    previous = on
  })

  onCleanup(stop)
  return value
}

export type EaseOptions = Readonly<{
  stepMs?: number
  /** Fraction of the remaining distance covered per step while rising. */
  riseRate?: number
  /** Fraction of the remaining distance covered per step while falling. */
  fallRate?: number
  /** Distance at which the value snaps to the target and the timer stops. */
  epsilon?: number
  /** Starting value; defaults to the current target (no mount animation). */
  initial?: number
}>

/**
 * Animate a numeric value toward its source with an exponential approach.
 * Used for focus trails and gauges; geometry never moves.
 */
export function createEase(source: Accessor<number>, options: EaseOptions = {}): Accessor<number> {
  const animationsEnabled = useMotionEnabled()
  const stepMs = Math.max(16, options.stepMs ?? Motion.step)
  const riseRate = options.riseRate ?? 0.4
  const fallRate = options.fallRate ?? 0.28
  const epsilon = options.epsilon ?? 0.01
  const [value, setValue] = createSignal(options.initial ?? source())
  let timer: ReturnType<typeof setInterval> | undefined

  const stop = () => {
    if (!timer) return
    clearInterval(timer)
    timer = undefined
  }

  const advance = () => {
    if (!animationsEnabled()) {
      stop()
      setValue(source())
      return
    }
    const target = source()
    const next = nextEaseValue(value(), target, riseRate, fallRate)
    if (Math.abs(target - next) <= epsilon) {
      setValue(target)
      stop()
      return
    }
    setValue(next)
  }

  createEffect(() => {
    const enabled = animationsEnabled()
    const target = source()
    if (!enabled || Math.abs(target - value()) <= epsilon) {
      stop()
      if (value() !== target) setValue(target)
      return
    }
    if (!timer) timer = setInterval(advance, stepMs)
  })

  onCleanup(stop)
  return value
}

export type BreathOptions = Readonly<{
  periodMs?: number
  stepMs?: number
}>

/**
 * Slow sine 0..1..0 for idle breathing cues. Returns 0 (rest) whenever
 * animations are disabled or `active` is false, so callers can map it straight
 * onto a tint and no timer runs while the cue is dormant.
 */
export function createBreath(active: Accessor<boolean> = () => true, options: BreathOptions = {}): Accessor<number> {
  const animationsEnabled = useMotionEnabled()
  const periodMs = Math.max(400, options.periodMs ?? 2400)
  const stepMs = Math.max(16, options.stepMs ?? 120)
  const [value, setValue] = createSignal(0)
  let timer: ReturnType<typeof setInterval> | undefined
  let startedAt = 0

  const stop = () => {
    if (!timer) return
    clearInterval(timer)
    timer = undefined
  }

  const advance = () => {
    if (!animationsEnabled() || !active()) {
      stop()
      setValue(0)
      return
    }
    setValue(breathValue(Date.now() - startedAt, periodMs))
  }

  createEffect(() => {
    if (!animationsEnabled() || !active()) {
      stop()
      setValue(0)
      return
    }
    if (timer) return
    startedAt = Date.now()
    timer = setInterval(advance, stepMs)
  })

  onCleanup(stop)
  return value
}
