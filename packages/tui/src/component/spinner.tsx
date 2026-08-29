import { createEffect, createSignal, onCleanup, Show } from "solid-js"
import { getComponentCatalogue } from "@opentui/solid"
import { useTheme } from "../context/theme"
import { useKV } from "../context/kv"
import type { JSX } from "@opentui/solid"
import type { RGBA } from "@opentui/core"

import { isSpinnerStyle, spinnerFrames } from "../util/spinner-style"

export const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]

/**
 * Gate-freeze defense (spinner-crash fix A): the intrinsic <spinner> element
 * exists only if "opentui-spinner/solid" registered against the SAME
 * @opentui/solid module instance the reconciler uses. Under Bun compile with
 * chunk splitting that registration has historically been lost
 * ("[Reconciler] Unknown component type: spinner" — a fatal TUI crash), so we
 * feature-detect and degrade to a plain-text frame cycler instead of crashing.
 */
const HAS_NATIVE_SPINNER = "spinner" in getComponentCatalogue()

export function Spinner(props: { children?: JSX.Element; color?: RGBA }) {
  const { theme } = useTheme()
  const kv = useKV()
  const color = () => props.color ?? theme.textMuted
  // Explicit spinner_style wins; otherwise braille (the classic default).
  const style = () => {
    const stored = kv.get("spinner_style")
    return isSpinnerStyle(stored) ? stored : "braille"
  }
  const frames = () => spinnerFrames(style())
  const shouldAnimate = () => kv.get("animations_enabled", true) && style() !== "none"
  // Missing native registration forces the text path regardless of style, so
  // busy indicators survive with only an animation-quality downgrade.
  const useTextFallback = () => !HAS_NATIVE_SPINNER || !shouldAnimate()
  return (
    <Show
      when={useTextFallback()}
      fallback={
        <box flexDirection="row" gap={1}>
          <spinner frames={frames()} interval={80} color={color()} />
          <Show when={props.children}>
            <text fg={color()}>{props.children}</text>
          </Show>
        </box>
      }
    >
      <TextSpinner frames={shouldAnimate() ? frames() : []} color={color()}>
        {props.children}
      </TextSpinner>
    </Show>
  )
}

export function TextSpinner(props: { frames: string[]; color?: RGBA; children?: JSX.Element }) {
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
    if (props.frames.length === 0) {
      lastTick = 0
      return
    }
    // OpenTUI supplies RAF callbacks with frame delta, not an absolute
    // timestamp. Use the monotonic clock for interval accounting.
    const now = performance.now()
    // Match the previous interval semantics: render the first glyph, then
    // advance only after one full cadence has elapsed.
    if (lastTick === 0) {
      lastTick = now
      return
    }
    if (now - lastTick >= 80) {
      setI((value) => (value + 1) % props.frames.length)
      lastTick = now
    }
  }

  // Wake on the target cadence and use a single renderer RAF for the actual
  // mutation. This avoids a perpetual OpenTUI live loop on static screens.
  const queueFrame = () => {
    if (props.frames.length === 0 || animationFrame !== undefined) return
    animationFrame = requestAnimationFrame(() => {
      animationFrame = undefined
      if (animationRetryTimer !== undefined) {
        clearTimeout(animationRetryTimer)
        animationRetryTimer = undefined
      }
      tick()
    })
    // A frame can be requested while OpenTUI is already rendering. In that
    // case the renderer may leave the one-shot request queued after it drops
    // back to idle; retrying releases the request without starting a loop.
    animationRetryTimer = setTimeout(() => {
      animationRetryTimer = undefined
      if (animationFrame === undefined || props.frames.length === 0) return
      cancelAnimationFrame(animationFrame)
      animationFrame = undefined
      queueFrame()
    }, 8)
  }

  createEffect(() => {
    const running = props.frames.length > 0
    stopAnimation()
    if (!running) {
      lastTick = 0
      return
    }
    queueFrame()
    animationTimer = setInterval(queueFrame, 80)
    onCleanup(stopAnimation)
  })
  onCleanup(stopAnimation)
  const glyph = () => (props.frames.length === 0 ? "⋯" : props.frames[i()])
  return (
    <box flexDirection="row" gap={1}>
      <text fg={props.color}>{glyph()}</text>
      <Show when={props.children}>
        <text fg={props.color}>{props.children}</text>
      </Show>
    </box>
  )
}
