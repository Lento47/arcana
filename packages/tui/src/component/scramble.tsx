import { createEffect, createSignal, onCleanup } from "solid-js"
import type { RGBA } from "@opentui/core"
import { useKV } from "../context/kv"
import { CORRUPT_GLYPHS } from "../branding"

// Cryptic glyph pool for the "decrypt" reveal — abstract, monochrome, no color.
const GLYPHS = "▚▞▌▐░▒╳┃═╱╲+=*<>/|·:."

/**
 * Decrypt-style text reveal: characters resolve left-to-right while the
 * not-yet-resolved tail flickers through cryptic glyphs. Width stays constant
 * (spaces preserved, one glyph per cell) so there is no layout shift.
 *
 * Re-runs whenever `text` changes. Honors the global animations_enabled KV;
 * when off, renders the final text immediately.
 *
 * Streaming text (tokens appended to existing) renders immediately with no
 * animation, eliminating the flicker that occurred when the decrypt restart
 * from index 0 on every streaming chunk.
 *
 * When `error` is true, uses a heavier corrupt glyph pool for an
 * "unencrypt" glitch effect — the arcane facade cracking to reveal red.
 */
export function Scramble(props: {
  text: string
  fg?: RGBA
  bold?: boolean
  /** ms between each resolved character (default 26, 18 in error mode) */
  speed?: number
  /** Error "unencrypt" mode: corrupt glyphs, faster, red-tinted */
  error?: boolean
}) {
  const kv = useKV()
  const [out, setOut] = createSignal(props.text)
  let timer: ReturnType<typeof setInterval> | undefined
  let prevText = ""

  const glyphs = props.error ? CORRUPT_GLYPHS : GLYPHS

  const stop = () => {
    if (timer) clearInterval(timer)
    timer = undefined
  }

  createEffect(() => {
    const target = props.text
    stop()

    // Streaming detection: if the new text is an extension of what we
    // already showed (tokens being appended), render immediately with no
    // animation.  This eliminates the flicker that happened when the old
    // effect restarted the decrypt from index 0 on every streaming chunk.
    const isStreaming = target.startsWith(prevText) && prevText.length > 0
    prevText = target

    if (
      !kv.get("animations_enabled", true) ||
      !target ||
      isStreaming
    ) {
      setOut(target)
      return
    }

    const speed = props.speed ?? (props.error ? 40 : 50)
    const rand = () => glyphs[Math.floor(Math.random() * glyphs.length)]
    let revealed = 0
    timer = setInterval(() => {
      revealed += 1
      if (revealed > target.length) {
        stop()
        setOut(target)
        return
      }
      let next = ""
      for (let i = 0; i < target.length; i++) {
        const ch = target[i]
        next += i < revealed || ch === " " ? ch : rand()
      }
      setOut(next)
    }, speed)
  })

  onCleanup(stop)

  return (
    <text fg={props.fg} attributes={undefined}>
      {props.bold ? <b>{out()}</b> : out()}
    </text>
  )
}