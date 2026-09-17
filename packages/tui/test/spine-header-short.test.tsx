/** @jsxImportSource @opentui/solid */
/**
 * Short terminals collapse the header chrome: the navigation/meta row and the
 * separator give way so the transcript keeps its rows (spacing audit batch 3).
 * The threshold is Size.shortRows (20).
 */
import { expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { SpineHeader } from "../src/shell/command-spine/spine-header"
import { TestTuiProviders } from "./fixture/tui-providers"

function header() {
  return (
    <SpineHeader
      layout="wide"
      contentWidth={100}
      segments={[]}
      session={() => ({ id: "ses-short", title: "Short terminal session" })}
      sessions={[]}
    />
  )
}

async function capture(height: number) {
  const app = await testRender(
    () => <TestTuiProviders>{header()}</TestTuiProviders>,
    { width: 100, height },
  )
  try {
    for (let i = 0; i < 6; i++) {
      await app.renderOnce()
      await new Promise((resolve) => setTimeout(resolve, 30))
      await app.flush()
    }
    return app.captureCharFrame()
  } finally {
    app.renderer.destroy()
  }
}

test("tall terminals keep the nav row and separator", async () => {
  const frame = await capture(30)
  expect(frame).toContain("──")
})

test("short terminals drop the nav row and separator", async () => {
  const frame = await capture(12)
  expect(frame).not.toContain("──")
  // The title row survives the collapse.
  expect(frame).toContain("Short terminal session")
})
