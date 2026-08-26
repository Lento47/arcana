import { BoxRenderable, TextRenderable, type CliRenderer } from "@opentui/core"
import { parseStatus, type StatusTone } from "./parse"
import type { WidgetPaletteInput } from "./palette"

function toneColor(palette: WidgetPaletteInput, tone: StatusTone) {
  if (tone === "ok") return palette.done
  if (tone === "warn") return palette.warn
  if (tone === "crit") return palette.sev1
  return undefined
}

export function statusWidget(
  renderer: CliRenderer,
  palette: WidgetPaletteInput,
  source: string,
): BoxRenderable {
  const items = parseStatus(source)

  const root = new BoxRenderable(renderer, {
    flexDirection: "column",
    width: "100%",
  })

  root.add(
    new TextRenderable(renderer, {
      content: `STATUS ${items.length}`,
      fg: palette.muted,
    }),
  )

  for (const item of items.slice(0, 12)) {
    const line = new BoxRenderable(renderer, {
      flexDirection: "row",
      width: "100%",
    })

    line.add(
      new TextRenderable(renderer, {
        content: `${item.key}: `,
        fg: palette.muted,
      }),
    )
    line.add(
      new TextRenderable(renderer, {
        content: item.value,
        fg: toneColor(palette, item.tone),
      }),
    )

    root.add(line)
  }

  return root
}
