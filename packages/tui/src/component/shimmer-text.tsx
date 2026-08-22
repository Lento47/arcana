import { For, createEffect, createSignal, onCleanup } from "solid-js"
import { useKV } from "../context/kv"
import type { ColorInput, RGBA } from "@opentui/core"

type Stop = readonly [position: number, color: readonly [number, number, number]]

interface ShimmerTextProps {
  text: string
  active?: boolean
  /** Terminal bg color — RGBA from the theme resolves to a valid ColorInput. */
  background?: ColorInput
  /** Hex string or OpenTUI RGBA. Theme tokens are RGBA objects. */
  accent?: string | RGBA
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

function makeStops(base: readonly [number, number, number], highlight: readonly [number, number, number]): readonly Stop[] {
  const mid: [number, number, number] = [
    base[0] + (highlight[0] - base[0]) * 0.55,
    base[1] + (highlight[1] - base[1]) * 0.55,
    base[2] + (highlight[2] - base[2]) * 0.55,
  ]
  const fade1: [number, number, number] = [
    base[0] + (highlight[0] - base[0]) * 0.29,
    base[1] + (highlight[1] - base[1]) * 0.29,
    base[2] + (highlight[2] - base[2]) * 0.29,
  ]
  const fade2: [number, number, number] = [
    base[0] + (highlight[0] - base[0]) * 0.18,
    base[1] + (highlight[1] - base[1]) * 0.18,
    base[2] + (highlight[2] - base[2]) * 0.18,
  ]
  return [
    [-4.0, base],
    [-2.6, fade2],
    [-1.3, fade1],
    [0.0, highlight],
    [1.3, mid],
    [2.6, fade2],
    [4.0, base],
  ]
}

export function ShimmerText(props: ShimmerTextProps) {
  const kv = useKV()
  const animationsEnabled = () => kv.get("animations_enabled", true)
  const accent = colorToRgb(props.accent)
  // Base = dimmed accent (~40% brightness)
  const base: [number, number, number] = [
    Math.round(accent[0] * 0.4),
    Math.round(accent[1] * 0.4),
    Math.round(accent[2] * 0.4),
  ]
  const stops = makeStops(base, accent)
  const characters = () => Array.from(props.text)
  const [head, setHead] = createSignal(-4)

  createEffect(() => {
    if (props.active === false || !animationsEnabled()) {
      setHead(-4)
      return
    }
    const timer = setInterval(() => {
      setHead((current) => (current > characters().length + 4 ? -4 : current + 0.35))
    }, 70)
    onCleanup(() => clearInterval(timer))
  })

  function shimmerColor(index: number): string {
    const position = index - head()
    if (position <= stops[0]![0] || position >= stops[stops.length - 1]![0]) return toHex(base)
    for (let i = 0; i < stops.length - 1; i++) {
      const [startPos, startColor] = stops[i]!
      const [endPos, endColor] = stops[i + 1]!
      if (position >= startPos && position <= endPos) {
        return toHex(interpolate(startColor, endColor, (position - startPos) / (endPos - startPos)))
      }
    }
    return toHex(base)
  }

  return (
    <text bg={props.background}>
      <For each={characters()}>
        {(char, index) => <span style={{ fg: shimmerColor(index()) }}>{char}</span>}
      </For>
    </text>
  )
}
