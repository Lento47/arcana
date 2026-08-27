import { createContext, createEffect, createSignal, onCleanup, useContext, type Accessor, type ParentProps } from "solid-js"
import { useKV } from "../../context/kv"

/**
 * Terminal motion is a liveness cue, not a frame-rate effect. Four updates per
 * second are legible without making the viewport shimmer while text streams.
 */
export const SPINE_MOTION_INTERVAL_MS = 250

export type SpineMotion = {
  phase: Accessor<number>
  activeCue: Accessor<string | undefined>
  enabled: Accessor<boolean>
  isCueActive: (cue: string | undefined) => boolean
}

const SpineMotionContext = createContext<SpineMotion>()

export function SpineMotionProvider(props: ParentProps<{ activeCue: Accessor<string | undefined> }>) {
  const kv = useKV()
  const [animationsEnabled] = kv.signal("animations_enabled", true)
  const [phase, setPhase] = createSignal(0)
  let timer: ReturnType<typeof setInterval> | undefined

  // Composer star is a liveness indicator, not decorative motion — it ticks
  // while working even when animations are disabled.
  const composerActive = () => props.activeCue() === "composer"
  createEffect(() => {
    const running = (animationsEnabled() && props.activeCue() !== undefined) || composerActive()
    if (running && !timer) {
      timer = setInterval(() => setPhase((value) => value + 1), SPINE_MOTION_INTERVAL_MS)
    } else if (!running && timer) {
      clearInterval(timer)
      timer = undefined
    }
  })
  onCleanup(() => {
    if (timer) clearInterval(timer)
  })

  const value: SpineMotion = {
    phase,
    activeCue: props.activeCue,
    enabled: animationsEnabled,
    isCueActive: (cue) => animationsEnabled() && cue !== undefined && props.activeCue() === cue,
  }
  return <SpineMotionContext.Provider value={value}>{props.children}</SpineMotionContext.Provider>
}

export function useSpineMotion(): SpineMotion | undefined {
  return useContext(SpineMotionContext)
}

export function dominantMotionCue(
  entries: readonly { id: string; kind: string; streaming?: boolean }[],
  runState: "idle" | "working" | "retrying" | "waiting" | "stop",
): string | undefined {
  const thinking = entries.filter((entry) => entry.streaming === true && entry.kind === "think").at(-1)
  if (thinking) return `entry:${thinking.id}`
  return runState === "working" || runState === "retrying" ? "composer" : undefined
}
