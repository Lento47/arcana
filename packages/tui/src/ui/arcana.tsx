import { Show, type JSX } from "solid-js"
import { useTheme } from "../context/theme"
import { useDialog } from "./dialog"

const ARCANA_DITHER_CELLS = ["·", "–", "·", "·", "–", "·"] as const

export function arcanaDitherPattern(seed: string, length: number): string {
  const offset = [...seed].reduce((sum, char) => sum + char.charCodeAt(0), 0) % ARCANA_DITHER_CELLS.length
  return Array.from({ length }, (_, index) => ARCANA_DITHER_CELLS[(index + offset) % ARCANA_DITHER_CELLS.length]).join("")
}

export function arcanaDitherTick(seed: string): string {
  return ARCANA_DITHER_CELLS[[...seed].reduce((sum, char) => sum + char.charCodeAt(0), 0) % ARCANA_DITHER_CELLS.length]
}

export function ArcanaDitherBand(props: { seed: string; label?: string; length?: number }) {
  const { theme } = useTheme()
  const pattern = () => arcanaDitherPattern(props.seed, props.length ?? 42)
  return (
    <text fg={theme.textMuted}>
      {pattern()}
      {props.label ? ` ${props.label}` : ""}
    </text>
  )
}

export function ArcanaSurface(props: { title: string; path?: string; meta?: string; children: JSX.Element }) {
  const { theme } = useTheme()
  const dialog = useDialog()
  return (
    <box paddingLeft={1} paddingRight={1} gap={1} paddingBottom={1}>
      <box gap={0}>
        <box flexDirection="row" justifyContent="space-between">
          <text fg={theme.text}>
            <b>ARCANA / {props.title}</b>
          </text>
          <text fg={theme.textMuted} onMouseUp={() => dialog.clear()}>
            esc
          </text>
        </box>
        <Show when={props.meta}>{(meta) => <text fg={theme.textMuted}>{meta()}</text>}</Show>
        <Show when={props.path}>{(path) => <text fg={theme.textMuted}>proof {path()}</text>}</Show>
        <ArcanaDitherBand seed={props.title} label="proof tape" />
      </box>
      {props.children}
    </box>
  )
}

export function ArcanaSection(props: { title: string; detail?: string | number; children: JSX.Element }) {
  const { theme } = useTheme()
  return (
    <box gap={0}>
      <text fg={theme.text}>
        <text fg={theme.textMuted}>{arcanaDitherPattern(props.title, 8)} </text>
        <b>{props.title}</b>
        {props.detail === undefined ? "" : ` ${props.detail}`}
      </text>
      {props.children}
    </box>
  )
}

export function ArcanaMetricLine(props: { items: Array<string | undefined | false> }) {
  const { theme } = useTheme()
  const value = () => props.items.filter((item): item is string => typeof item === "string" && item.length > 0).join("  ")
  return <Show when={value()}>{(line) => <text fg={theme.text}>{line()}</text>}</Show>
}

export function ArcanaTapeItem(props: {
  time?: string
  kind: string
  summary: string
  detail?: string
  tone?: "normal" | "muted" | "warning" | "error"
}) {
  const { theme } = useTheme()
  const color = () =>
    props.tone === "warning"
      ? theme.warning
      : props.tone === "error"
        ? theme.error
        : props.tone === "muted"
          ? theme.textMuted
          : theme.text
  return (
    <box gap={0}>
      <text fg={color()}>
        {arcanaDitherTick(props.kind)} {props.time ? `${props.time} ` : ""}
        {props.kind.padEnd(10)} {props.summary}
      </text>
      <Show when={props.detail}>{(detail) => <text fg={theme.textMuted}>  {detail()}</text>}</Show>
    </box>
  )
}
