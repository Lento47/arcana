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

  // The tick is a liveness clock, not decoration, and the animation preference
  // gates decoration DOWNSTREAM rather than here: every decorative consumer
  // asks `enabled()` / `isCueActive()` first (the node chip's two-tone cue, the
  // settle flare, shimmer text), so the clock can run whenever work is in
  // flight. Two readouts depend on it staying true — the composer's working
  // star, and a live row's elapsed duration. Gating the clock itself on the
  // preference froze a streaming row's elapsed at whatever value it held when
  // the preference was turned off, while the row kept working.
  //
  // The cue is derived from `streaming` / `runState`, so an idle screen has no
  // cue and the clock stops: nothing ticks on a view that no longer changes.
  createEffect(() => {
    const running = props.activeCue() !== undefined
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
  entries: readonly { id: string; kind: string; streaming?: boolean; activity?: { type?: string } }[],
  runState: "idle" | "working" | "retrying" | "waiting" | "stop",
): string | undefined {
  const activity = entries.findLast((entry) => entry.streaming === true && entry.activity?.type === "work")
  if (activity) return `entry:${activity.id}`
  const thinking = entries.filter((entry) => entry.streaming === true && entry.kind === "think").at(-1)
  if (thinking) return `entry:${thinking.id}`
  // Assistant prose streaming (plan/ok): the growing text + stream caret are
  // the liveness signal, so the composer "Working…" pulse stays quiet — two
  // cues for one state is noise, not signal.
  const chat = entries.findLast(
    (entry) => entry.streaming === true && (entry.kind === "plan" || entry.kind === "ok"),
  )
  if (chat) return `entry:${chat.id}`
  return runState === "working" || runState === "retrying" ? "composer" : undefined
}
