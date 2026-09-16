/** @jsxImportSource @opentui/solid */
/**
 * The header of the full-bleed panels, rendered.
 *
 * Three panels — the approval inspector, the permission inspector, the acts
 * timeline — each hand-rolled this row with `border={["bottom"]}` on a box that
 * also declared `height={1}`. A box one row tall has no row of its own to put a
 * bottom border on, so the hairline was painted along the row the title sat in:
 * every gap between words, both cells of padding and every leftover column came
 * out as `─`, and the header read as a strikethrough with the title punched
 * through it. The height is gone; the border now lands on the row under the
 * title, which is what a separator is.
 *
 * The three copies also let the row wrap. It is a single-row readout — a label
 * and a dismissal — so at a narrow card the title and the detail stacked into a
 * second row taller than the box (clipped) and the `[esc]` hint was pushed off
 * the card altogether. Every segment is `wrapMode="none"` with a truncation mark
 * now, and the shrink order is pinned here: the dismissal is never the thing
 * that gives way.
 */
import { expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { Glyph } from "../src/branding"
import { useTheme } from "../src/context/theme"
import { fallbackTheme } from "../src/theme"
import { DialogPanelHeader } from "../src/ui/dialog-chrome"
import { TestTuiProviders } from "./fixture/tui-providers"

const TITLE = "PERMISSION INSPECTOR"
/** Mark, title and detail as one contiguous run — the spaces are the assertion. */
const FLAT_HEADER = `${Glyph.attention} ${TITLE} contract.accept`
const HAIRLINE = /^─+$/
/**
 * What the renderer actually draws when a row is cut. OpenTUI's `truncate` prop
 * emits three ASCII periods, not the U+2026 the app's own `Locale.truncate`
 * uses — so this counts periods, and the difference is a separate finding.
 */
const ELLIPSIS = "..."

function Harness() {
  const { theme } = useTheme()
  return (
    <DialogPanelHeader
      title={TITLE}
      titleColor={theme.warning}
      mark={Glyph.attention}
      detail="contract.accept"
      onClose={() => {}}
    />
  )
}

type Span = { text: string; fg: unknown }

/** RGBA spans arrive as an indexed 4-byte buffer, not as floats. */
function ints(color: unknown): number[] | undefined {
  const buffer = (color as { buffer?: Record<number, number> } | undefined)?.buffer
  if (!buffer) return undefined
  return [buffer[0]!, buffer[1]!, buffer[2]!, buffer[3]!]
}

async function shot(width: number) {
  const app = await testRender(
    () => (
      <TestTuiProviders>
        <Harness />
      </TestTuiProviders>
    ),
    { width, height: 6 },
  )
  let frame = ""
  for (let attempt = 0; attempt < 12; attempt++) {
    await app.renderOnce()
    await app.flush()
    const next = app.captureCharFrame()
    if (next.trim().length > 0 && next === frame) break
    frame = next
    await Bun.sleep(20)
  }
  const spans: Span[] = app
    .captureSpans()
    .lines.flatMap((line: { spans: Span[] }) => line.spans)
  app.renderer.destroy()
  return { rows: frame.split("\n"), spans }
}

const WIDTHS = [100, 60, 44, 34, 26]

test("the divider is drawn under the header, not through it", async () => {
  for (const width of WIDTHS) {
    const { rows, spans } = await shot(width)
    const titleRow = rows.findIndex((row) => row.includes(Glyph.attention))
    expect(titleRow).toBeGreaterThan(-1)

    // The row the title sits in carries no rule: the old `height={1}` header
    // drew `△─PERMISSION─INSPECTOR─contract.accept` here.
    expect(rows[titleRow]!).not.toContain("─")
    // And the very next row is the rule itself, full width, with no text in it.
    expect(HAIRLINE.test(rows[titleRow + 1]!)).toBe(true)
    expect(rows[titleRow + 1]!.length).toBe(width)

    // Weight no longer separates the two labels — they share one text node, so
    // the detail inherits the title's bold — which leaves the ink doing it. A
    // detail that came out in the title's own colour would read as one label.
    if (width >= 60) {
      const detail = spans.find((span) => span.text.includes("contract.accept"))
      expect(ints(detail?.fg)).toEqual(fallbackTheme("dark").textMuted.toInts())
      const title = spans.find((span) => span.text.includes(TITLE))
      expect(ints(title?.fg)).toEqual(fallbackTheme("dark").warning.toInts())
    }
  }
})

test("the header is one row, whatever the width", async () => {
  for (const width of WIDTHS) {
    const { rows } = await shot(width)
    const titleRow = rows.findIndex((row) => row.includes(Glyph.attention))
    // Nothing from the header is drawn below the rule: the row after it is the
    // blank the panel's body starts from, not a wrapped half of the title.
    const below = rows.slice(titleRow + 2).join("\n")
    expect(below).not.toContain("INSPECTOR")
    expect(below).not.toContain("contract")
    // The dismissal is never the segment that gives way — not at any width.
    for (const row of rows) {
      if (row.includes("[esc]")) expect(row).toContain("Close")
    }
    expect(rows.some((row) => row.includes("[esc] Close"))).toBe(true)
  }
})

test("a squeezed header elides once, and never fuses its two labels", async () => {
  // Wide enough for both segments: they are separate words, exactly as before.
  for (const width of [100, 60]) {
    const { rows } = await shot(width)
    expect(rows.join("\n")).toContain(FLAT_HEADER)
    expect(rows.join("\n")).not.toContain("…")
  }

  // Too narrow for both: the row is cut, so it says so — once. Two independently
  // truncated labels gave two ellipses and printed `△ PERMIS...INSPECTORco...pt`,
  // two words closed over the column that separated them.
  for (const width of [44, 34, 26]) {
    const { rows } = await shot(width)
    const row = rows[rows.findIndex((line) => line.includes(Glyph.attention))]!
    expect(row.split(ELLIPSIS).length - 1).toBe(1)
    expect(row).toContain("[esc] Close")
  }
})
