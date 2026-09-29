/** @jsxImportSource @opentui/solid */
/**
 * Regression: markdown prose must not leak escape backslashes into the frame.
 *
 * An earlier fix escaped every `_` as `\_` to keep snake_case out of italics,
 * but OpenTUI prints backslash escapes verbatim — identifiers rendered as
 * `ma\_cross`. Underscore emphasis is now stripped in chat-prose instead, and
 * the operator must see `ma_cross`, never `ma\_cross`.
 */
import { expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { SpineProse } from "../src/shell/command-spine/spine-prose"
import { TestTuiProviders } from "./fixture/tui-providers"

const TEXT = [
  "- Root cause: risk.py:75 checked account.open_positions >= max_open_positions before classifying the order.",
  "- Fix: open_symbols guards so ma_cross(3,10) flips a position while max_open_positions is reached.",
].join("\n")

test("snake_case prose renders without escape backslashes", async () => {
  const app = await testRender(
    () => (
      <TestTuiProviders>
        <box width="100%" height="100%">
          <SpineProse
            kind="ok"
            text={TEXT}
            bodyLabel="arcana"
            contentWidth={110}
          />
        </box>
      </TestTuiProviders>
    ),
    { width: 120, height: 12 },
  )

  try {
    for (let attempt = 0; attempt < 40; attempt++) {
      await app.renderOnce()
      if (app.captureCharFrame().includes("ma_cross")) break
      await Bun.sleep(10)
    }
    const frame = app.captureCharFrame()
    expect(frame).toContain("ma_cross(3,10)")
    expect(frame).not.toContain("\\_")
    expect(frame).toContain("open_positions")
  } finally {
    app.renderer.destroy()
  }
})
