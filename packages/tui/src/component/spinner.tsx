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
  createEffect(() => {
    if (props.frames.length === 0) return
    const timer = setInterval(() => setI((v) => (v + 1) % props.frames.length), 80)
    onCleanup(() => clearInterval(timer))
  })
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
