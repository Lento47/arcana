/** @jsxImportSource @opentui/solid */
/**
 * The retry card's two buttons are whole or absent, never decoded.
 *
 * The row is `Don't Show Again` and the action verb, `space-between`, with two
 * columns of padding per button — about 29 columns for the pair as this card
 * spells them. Left flexible, a row narrower than that had the deficit shared
 * between the two and both decoded at once (`Don't show agai`/`n`, `Retr`/`y`),
 * which is the fatal screen's `Reset`/`TUI` shape: the button you are about to
 * press no longer says what it does.
 *
 * In practice the dialog's own floor protects this row — `dialogWidth` never
 * returns less than 40 for a medium card, and 40 minus the card's padding and
 * border leaves more than 29 — so the reachable case is a terminal narrow
 * enough to squeeze the whole card. The row is reserved anyway: the floor is
 * another module's constant, and a button that only reads correctly because a
 * number three files away happens to be large enough is one refactor from
 * being wrong.
 *
 * The title is the half that yields, and it clips rather than wraps: a title
 * that wrapped made the card taller than the layout it was measured for.
 */
import { expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { TestTuiProviders } from "./fixture/tui-providers"
import { DialogRetryAction } from "../src/component/dialog-retry-action"

const DISMISS = "Don't Show Again"
const ACTION = "Retry"

async function mountCard(width: number) {
  const app = await testRender(
    () => (
      <TestTuiProviders>
        <box width={width} flexDirection="column">
          <DialogRetryAction
            title="Request failed"
            message="The provider returned an error. Retrying usually works."
            label={ACTION}
          />
        </box>
      </TestTuiProviders>
    ),
    { width, height: 14 },
  )
  for (let attempt = 0; attempt < 30; attempt++) {
    await Bun.sleep(15)
    await app.renderOnce()
  }
  return app
}

function rows(frame: string): string[] {
  return frame.split("\n").map((line) => line.trimEnd())
}

test("both buttons share one row when the card is wide enough for them", async () => {
  const app = await mountCard(60)
  try {
    const lines = rows(app.captureCharFrame())
    const both = lines.find((line) => line.includes(DISMISS) && line.includes(ACTION))
    expect(both, "the two buttons are not on one row").toBeDefined()
  } finally {
    app.renderer.destroy()
  }
})

test("a squeezed card stacks the buttons instead of dropping the action", async () => {
  // At 24 columns the card cannot hold both buttons side by side. Before this,
  // the row was `space-between` with both buttons flexible and *both* were lost:
  // the dismissal came back clipped (`Don't Show A`) and the action — the button
  // the card exists for — was gone from the frame entirely.
  const app = await mountCard(24)
  try {
    const frame = app.captureCharFrame()
    const lines = rows(frame)
    const dismissRow = lines.findIndex((line) => line.includes(DISMISS))
    const actionRow = lines.findIndex((line) => line.trim() === ACTION)
    expect(dismissRow, "the dismissal is not whole").toBeGreaterThanOrEqual(0)
    expect(actionRow, "the action button is missing").toBeGreaterThanOrEqual(0)
    // Two rows, not one: stacked rather than sharing a row they do not fit in.
    expect(actionRow).not.toBe(dismissRow)
    for (const fragment of ["Show Agai\n", "Don't Show Agai ", "Retr\n", "etry\n"]) {
      expect(frame.includes(fragment), `decoded fragment ${JSON.stringify(fragment)}`).toBe(false)
    }
  } finally {
    app.renderer.destroy()
  }
})

test("a long title stays one row instead of growing the card", async () => {
  const width = 40
  const app = await testRender(
    () => (
      <TestTuiProviders>
        <box width={width} flexDirection="column">
          <DialogRetryAction
            title="Request failed and the provider is not answering right now"
            message="Retrying usually works."
            label={ACTION}
          />
        </box>
      </TestTuiProviders>
    ),
    { width, height: 14 },
  )
  try {
    for (let attempt = 0; attempt < 30; attempt++) {
      await Bun.sleep(15)
      await app.renderOnce()
    }
    const lines = rows(app.captureCharFrame())
    // The title's tail is gone rather than moved to a row of its own.
    expect(lines.some((line) => line.includes("answering"))).toBe(false)
    for (const orphan of ["right now", "not answering", "and the provider"]) {
      expect(lines.some((line) => line.trim() === orphan)).toBe(false)
    }
  } finally {
    app.renderer.destroy()
  }
})
