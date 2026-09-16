/** @jsxImportSource @opentui/solid */
/**
 * `ArcanaSection` is the header of every panel on the proof surfaces, and it
 * used to nest a `<text>` inside a `<text>`.
 *
 * In @opentui/core 0.5.9 a `<text>` is a TextRenderable, whose `add()` accepts
 * only strings, TextNodeRenderable instances, or StyledText:
 *
 *   TextNodeRenderable only accepts strings, TextNodeRenderable instances, or
 *   StyledText instances
 *
 * so the nested form throws while the section mounts and takes down the whole
 * dialog hosting it. The muted dither run is an inline run, and `<span>` is the
 * idiom for one. This renders the real component rather than asserting on
 * source text, so a reintroduced nesting fails as the crash it is.
 */
import { expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { ArcanaSection, arcanaDitherPattern } from "../src/ui/arcana"
import { ThemeProvider } from "../src/context/theme"
import { ToastProvider } from "../src/ui/toast"
import { TuiConfigProvider } from "../src/config"
import { KVProvider } from "../src/context/kv"
import { TestTuiContexts } from "./fixture/tui-environment"
import { createTuiResolvedConfig } from "./fixture/tui-runtime"

const TITLE = "Execution Terms"

/** Render one section and return the settled frame, right-trimmed. */
async function capture(section: () => unknown): Promise<string[]> {
  const app = await testRender(
    () => (
      <TestTuiContexts>
        <TuiConfigProvider config={createTuiResolvedConfig()}>
          <KVProvider>
            <ToastProvider>
              <ThemeProvider mode="dark">
                <box width={72} height={6}>{section() as never}</box>
              </ThemeProvider>
            </ToastProvider>
          </KVProvider>
        </TuiConfigProvider>
      </TestTuiContexts>
    ),
    { width: 72, height: 6 },
  )
  try {
    let frame = ""
    for (let attempt = 0; attempt < 60; attempt++) {
      await Bun.sleep(10)
      await app.renderOnce()
      frame = app.captureCharFrame()
      if (frame.trim().length > 0) break
    }
    return frame.split("\n").map((line) => line.replace(/\s+$/, ""))
  } finally {
    app.renderer.destroy()
  }
}

test("the section header renders its dither run, title, and detail on one row", async () => {
  const lines = await capture(() => (
    <ArcanaSection title={TITLE} detail={3}>
      <text>body</text>
    </ArcanaSection>
  ))

  // The dither run and the title share a row: they are inline runs, not a
  // stacked pair, which is what the nested `<text>` had turned them into.
  expect(lines[0]).toContain(`${arcanaDitherPattern(TITLE, 8)} ${TITLE} 3`)
  // The section's children still mount below the header.
  expect(lines[1]).toBe("body")
})

test("a section without detail has no trailing filler", async () => {
  const lines = await capture(() => (
    <ArcanaSection title="Proof Tape">
      <text>body</text>
    </ArcanaSection>
  ))

  expect(lines[0]).toContain(`${arcanaDitherPattern("Proof Tape", 8)} Proof Tape`)
  expect(lines[0]).not.toContain("undefined")
})
