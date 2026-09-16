/** @jsxImportSource @opentui/solid */
/**
 * A toast card is the same height at every terminal width.
 *
 * The card's budget was `min(60, dimensions().width - 6)`, unclamped, and
 * `useTerminalSize` reports an unmeasured renderer as `{ width: 0, height: 0 }`
 * — its own documented convention, not a zero-width terminal — so that
 * expression is `-6` on every frame before the first measurement.
 *
 * A negative `maxWidth` is a malformed card rather than a narrow one. At four
 * and five columns the card lost its bottom border row (two rows drawn where the
 * card is three: padding, message, padding), and at six columns it kept only the
 * top padding row, so the dismiss glyph was drawn outside its own frame — the
 * one control the card carries, no longer inside the thing it closes.
 *
 * These tests pin the property where it is visible: the card's frame always
 * spans the same three rows, and the glyph sits between them. They also pin the
 * budget itself, which is now `paneWidth` plus the `Size.toastMaxWidth` /
 * `Size.toastInset` tokens rather than two bare literals in the component.
 */
import { testRender } from "@opentui/solid"
import { expect, test } from "bun:test"
import { onMount } from "solid-js"
import { Glyph } from "../src/branding"
import { SplitBorder } from "../src/ui/border"
import { Size } from "../src/ui/chrome"
import { Toast, useToast } from "../src/ui/toast"
import { paneWidth } from "../src/util/geometry"
import { TestTuiProviders } from "./fixture/tui-providers"

/** One row of message at every width, so the card is always three rows tall. */
const SHORT = "connection lost"
/** Long enough to need the whole cap, so the wrap point is the budget's. */
const LONG =
  "connection lost — retrying with backoff, the last attempt timed out after thirty seconds"

/** Terminals narrower than the card's own chrome: 2 borders, 3 padding, glyph. */
const CRAMPED = [4, 5, 6]
const ROOMY = [8, 24, 100]

const VERTICAL = SplitBorder.customBorderChars.vertical

async function shot(width: number, message: string) {
  function Harness() {
    const toast = useToast()
    onMount(() => {
      toast.show({ message, variant: "info", duration: 60_000 })
    })
    return (
      <box flexDirection="column" width="100%" height="100%">
        <Toast />
      </box>
    )
  }
  const app = await testRender(
    () => (
      <TestTuiProviders>
        <Harness />
      </TestTuiProviders>
    ),
    { width, height: 10 },
  )
  let frame = ""
  for (let attempt = 0; attempt < 12; attempt++) {
    await app.renderOnce()
    await app.flush()
    frame = app.captureCharFrame()
    if (frame.includes("connection")) break
    await Bun.sleep(30)
  }
  app.renderer.destroy()
  return frame.split("\n")
}

/** The rows the card's own side borders are drawn on. */
function frameRows(lines: string[]): number[] {
  return lines.flatMap((line, row) => (line.includes(VERTICAL) ? [row] : []))
}

for (const width of [...CRAMPED, ...ROOMY]) {
  test(`a toast card keeps its three rows at ${width} columns`, async () => {
    const lines = await shot(width, SHORT)

    // No line is wider than the terminal it was drawn in.
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(width)

    // Padding, message, padding — whatever the terminal width. The unclamped
    // budget drew two of these three rows, and at six columns only one.
    const rows = frameRows(lines)
    expect(rows.at(-1)! - rows[0]! + 1).toBe(3)

    // And the dismiss glyph is still inside that frame, on the message row.
    const glyph = lines.findIndex((line) => line.includes(Glyph.dismiss))
    expect(glyph).toBeGreaterThan(rows[0]!)
    expect(glyph).toBeLessThan(rows.at(-1)!)
  })
}

test("a toast card hangs off the top-right corner and wraps inside its cap", async () => {
  // A long message at a width where the cap is the binding constraint: the card
  // is exactly `paneWidth(term, Size.toastInset)` wide, so the message wraps at
  // the budget instead of stretching the card across the screen.
  const width = 40
  const lines = await shot(width, LONG)
  const bordered = lines.filter((line) => line.includes(VERTICAL))
  const first = bordered[0]!
  const cardWidth = first.lastIndexOf(VERTICAL) - first.indexOf(VERTICAL) + 1
  expect(cardWidth).toBe(paneWidth(width, Size.toastInset))
  expect(cardWidth).toBeLessThanOrEqual(Size.toastMaxWidth)

  // The corner inset is 2 columns, so the card's right border is the third
  // column from the edge at every width — the card never touches the edge.
  expect(first.lastIndexOf(VERTICAL)).toBe(width - 3)

  // Wide enough that the cap is what limits it, not the terminal.
  const wide = await shot(100, LONG)
  const wideBordered = wide.filter((line) => line.includes(VERTICAL))
  expect(wideBordered).toHaveLength(bordered.length)
  expect(wideBordered[0]!.lastIndexOf(VERTICAL)).toBe(100 - 3)

  // A narrow-but-usable terminal: the same card, the same wrap, everything
  // inside the screen. This is the case an operator reaches by shrinking a pane,
  // not the 4-column one that only a test renderer can produce.
  const narrow = await shot(20, LONG)
  for (const line of narrow) expect(line.length).toBeLessThanOrEqual(20)
  const narrowBordered = narrow.filter((line) => line.includes(VERTICAL))
  expect(narrowBordered[0]!.lastIndexOf(VERTICAL)).toBe(20 - 3)
  expect(narrowBordered[0]!.lastIndexOf(VERTICAL) - narrowBordered[0]!.indexOf(VERTICAL) + 1)
    .toBe(paneWidth(20, Size.toastInset))
})
