import { createMemo, For } from "solid-js"
import type { RGBA } from "@opentui/core"
import { useTheme } from "../../context/theme"
import { radarGrid, type RadarAgent, type RadarTone } from "./radar"

/**
 * The radar scope as a cached character grid.
 *
 * The grid is recomputed only when its inputs change; the sweep is just one of
 * them, so the animation budget stays one pass over the cells per frame. Tones
 * resolve through the theme once per render, never per cell.
 */
export function RadarView(props: {
  agents: readonly RadarAgent[]
  width: number
  height: number
  sweep: number
  /** Per-tone overrides for callers outside the main palette. */
  colors?: Partial<Record<RadarTone, RGBA>>
}) {
  const { theme } = useTheme()

  const palette = (): Record<RadarTone, RGBA> => {
    const base: Record<RadarTone, RGBA> = {
      ring: theme.borderSubtle as RGBA,
      sweep: (theme.spineBrand ?? theme.accent) as RGBA,
      core: theme.accent,
      running: theme.accent,
      waiting: theme.warning,
      done: theme.spineOk,
      failed: theme.spineFail,
      label: (theme.spineContext ?? theme.textMuted) as RGBA,
    }
    return { ...base, ...props.colors }
  }

  const grid = createMemo(() =>
    radarGrid({
      width: props.width,
      height: props.height,
      sweep: props.sweep,
      agents: props.agents,
    }),
  )

  // One text run per tone change, so a row paints as few spans as possible.
  const rows = createMemo(() =>
    grid().rows.map((row) => {
      const runs: Array<{ text: string; tone: RadarTone | null }> = []
      for (const cell of row) {
        const tone = cell?.tone ?? null
        const last = runs[runs.length - 1]
        if (last && last.tone === tone) last.text += cell?.char ?? " "
        else runs.push({ text: cell?.char ?? " ", tone })
      }
      return runs
    }),
  )

  return (
    <box flexDirection="column" flexShrink={0}>
      <For each={rows()}>
        {(runs) => (
          <text wrapMode="none">
            <For each={runs}>
              {(run) =>
                run.tone === null ? (
                  <span>{run.text}</span>
                ) : (
                  <span style={{ fg: palette()[run.tone] }}>{run.text}</span>
                )
              }
            </For>
          </text>
        )}
      </For>
    </box>
  )
}
