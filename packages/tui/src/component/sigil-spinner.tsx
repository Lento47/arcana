import { createEffect, createSignal, onCleanup, Show } from "solid-js"
import type { JSX } from "@opentui/solid"
import type { RGBA } from "@opentui/core"
import { useKV } from "../context/kv"

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
  const frames = () => props.frames ?? SIGIL
  const animate = () => kv.get("animations_enabled", true)
  const [i, setI] = createSignal(0)

  createEffect(() => {
    if (!animate()) return
    const timer = setInterval(() => setI((v) => (v + 1) % frames().length), props.interval ?? 150)
    onCleanup(() => clearInterval(timer))
  })

  const glyph = () => (animate() ? frames()[i()] : "⛧")

  return (
    <box flexDirection="row" gap={1}>
      <text fg={props.color}>{glyph()}</text>
      <Show when={props.children}>
        <text fg={props.color}>{props.children}</text>
      </Show>
    </box>
  )
}
