/** @jsxImportSource @opentui/solid */
/**
 * The transcript's disclosure row, and the count it is built from.
 *
 * Both expandable tool blocks drew `Click to expand` / `Click to collapse` —
 * the same two strings, duplicated verbatim — and neither said how much output
 * was hidden: a one-line overrun and a five-hundred-line one asked for the same
 * click on identical information. The row now carries the amount, and the mark
 * is the app's own disclosure pair (`Glyph.chevronClosed` / `chevronOpen`, the
 * one the spine draws) rather than wording invented per block.
 *
 * `hiddenLines` is the fact the row needs, so it is pinned here too: whole lines
 * the preview never showed, zero when only the character budget cut it — which
 * is why the row has to fall back to the bare label instead of printing
 * `0 more lines`.
 */
import { testRender } from "@opentui/solid"
import { expect, test } from "bun:test"
import { Glyph } from "../src/branding"
import { ToolOutputDisclosure } from "../src/routes/session/tool-parts"
import { collapseToolOutput } from "../src/util/collapse-tool-output"
import { TestTuiProviders } from "./fixture/tui-providers"

test("collapseToolOutput counts the lines the preview never showed", () => {
  // Line budget: ten shown, fifteen not.
  const many = Array.from({ length: 25 }, (_, index) => `line ${index}`).join("\n")
  expect(collapseToolOutput(many, 10, 10_000).hiddenLines).toBe(15)
  // A single line over the line budget is one hidden line, not zero.
  expect(collapseToolOutput("a\nb\nc", 2, 10_000).hiddenLines).toBe(1)
  // Nothing hidden at all.
  expect(collapseToolOutput("a\nb", 2, 10_000)).toEqual({ output: "a\nb", overflow: false, hiddenLines: 0 })

  // Character budget, many lines: the preview was cut inside one line, but the
  // lines beyond it are wholly unshown, so the count is still a count.
  const wide = Array.from({ length: 8 }, () => "x".repeat(50)).join("\n")
  const cut = collapseToolOutput(wide, 3, 60)
  expect(cut.overflow).toBe(true)
  expect(cut.hiddenLines).toBe(5)
  expect(cut.output.endsWith("…")).toBe(true)

  // Character budget, one line: nothing was dropped whole, so the row must not
  // claim a count at all.
  const single = collapseToolOutput("y".repeat(200), 10, 40)
  expect(single.overflow).toBe(true)
  expect(single.hiddenLines).toBe(0)
})

async function shot(node: () => unknown) {
  const app = await testRender(() => <TestTuiProviders>{node() as never}</TestTuiProviders>, {
    width: 60,
    height: 4,
  })
  let frame = ""
  for (let attempt = 0; attempt < 12; attempt++) {
    await app.renderOnce()
    await app.flush()
    const next = app.captureCharFrame()
    if (next.trim().length > 0 && next === frame) break
    frame = next
    await Bun.sleep(30)
  }
  app.renderer.destroy()
  return frame
}

test("a collapsed block says how many lines it is hiding", async () => {
  const frame = await shot(() => <ToolOutputDisclosure expanded={false} hiddenLines={15} />)
  expect(frame).toContain(`${Glyph.chevronClosed} 15 more lines · click to expand`)

  // The count is a sentence, not a number: one line is not `1 more lines`.
  const one = await shot(() => <ToolOutputDisclosure expanded={false} hiddenLines={1} />)
  expect(one).toContain(`${Glyph.chevronClosed} 1 more line · click to expand`)

  // Only the character budget cut it — the label stands alone rather than
  // reporting a count of zero.
  const none = await shot(() => <ToolOutputDisclosure expanded={false} hiddenLines={0} />)
  expect(none).toContain(`${Glyph.chevronClosed} click to expand`)
  expect(none).not.toContain("0 more")

  // Expanded, the mark turns and the row only offers the way back.
  const open = await shot(() => <ToolOutputDisclosure expanded={true} hiddenLines={15} />)
  expect(open).toContain(`${Glyph.chevronOpen} click to collapse`)
  expect(open).not.toContain("15 more")
})
