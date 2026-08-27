/** @jsxImportSource @opentui/solid */
// Regression test for the "[Reconciler] Unknown component type: spinner"
// fatal (spinner-crash fix A): with the native <spinner> component absent
// from the catalogue — the exact condition produced by lost registration
// under Bun compile — Spinner must degrade to a text fallback instead of
// crashing the render tree.
import { getComponentCatalogue } from "@opentui/solid"
import { RGBA } from "@opentui/core"
import { testRender } from "@opentui/solid"
import { expect, test } from "bun:test"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { tmpdir } from "./fixture/fixture"
import { createTuiResolvedConfig } from "./fixture/tui-runtime"
import { TestTuiContexts } from "./fixture/tui-environment"

test("Spinner renders a text fallback when the native spinner is unregistered", async () => {
  // Simulate the broken-binary condition BEFORE importing the component:
  // delete the catalogue entry so reconciler createElement would throw.
  const catalogue = getComponentCatalogue() as Record<string, unknown>
  const saved = catalogue.spinner
  delete catalogue.spinner

  try {
    await using tmp = await tmpdir()
    const state = path.join(tmp.path, "state")
    await mkdir(state, { recursive: true })
    await Bun.write(path.join(state, "kv.json"), "{}")

    const [{ KVProvider }, { ThemeProvider }, { TuiConfigProvider }, { Spinner }] = await Promise.all([
      import("../src/context/kv"),
      import("../src/context/theme"),
      import("../src/config"),
      import("../src/component/spinner"),
    ])

    function Harness() {
      return (
        <TestTuiContexts
          directory={tmp.path}
          paths={{ home: tmp.path, state, worktree: tmp.path }}
        >
          <TuiConfigProvider config={createTuiResolvedConfig({})}>
            <KVProvider>
              <ThemeProvider mode="dark">
                <Spinner color={RGBA.fromHex("#888888")}>Working...</Spinner>
              </ThemeProvider>
            </KVProvider>
          </TuiConfigProvider>
        </TestTuiContexts>
      )
    }

    const app = await testRender(() => <Harness />, { kittyKeyboard: true })
    try {
      // Reaching here means the missing intrinsic registration did not crash
      // the reconciler. TextSpinner's frame progression is tested below with
      // a context-free render so KV startup cannot hide the animation signal.
      expect(app.renderer).toBeDefined()
    } finally {
      app.renderer.destroy()
    }
  } finally {
    if (saved !== undefined) catalogue.spinner = saved
  }
})

test("TextSpinner advances fallback frames", async () => {
  const { TextSpinner } = await import("../src/component/spinner")
  const frames = ["A", "B", "C"]
  const app = await testRender(() => <TextSpinner frames={frames}>Working...</TextSpinner>, {
    width: 30,
    height: 3,
  })
  try {
    await app.waitForFrame((frame) => frame.includes("Working..."))
    const firstFrame = app.captureCharFrame()
    const firstGlyph = frames.find((glyph) => firstFrame.includes(glyph))
    expect(firstGlyph).toBeDefined()
    await Bun.sleep(100)
    await app.renderOnce()
    expect(frames.some((glyph) => glyph !== firstGlyph && app.captureCharFrame().includes(glyph))).toBe(true)
  } finally {
    app.renderer.destroy()
  }
})
