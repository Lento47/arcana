/**
 * Dialog body sizing across content changes.
 *
 * `ui/dialog.tsx` used to track its body height with a mounted measurement pass
 * (`setTimeout 0`, `setTimeout 60ms`, then `setInterval(measureContent, 250)`).
 * That poll existed for one case: content that changes size *after* first paint.
 * `ui-dialog-shrink.test.tsx` covers the static case; this file covers the
 * dynamic one, so deleting the poll is provably not a regression.
 *
 * Sizing now falls out of layout: `contentOptions={{ minHeight: 0 }}` removes the
 * scrollbox's forced `minHeight: "100%"` floor, so the box tracks its children on
 * every layout pass with no JS. These assertions fail if that override is ever
 * dropped (the scrollbox would pin to `maxHeight` and stop tracking).
 */
/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { Show, createSignal } from "solid-js"
import { type Renderable, ScrollBoxRenderable } from "@opentui/core"
import { testRender } from "@opentui/solid"
import { ThemeProvider } from "../src/context/theme"
import { ToastProvider } from "../src/ui/toast"
import { TuiConfigProvider } from "../src/config"
import { KVProvider } from "../src/context/kv"
import { Dialog } from "../src/ui/dialog"
import { TestTuiContexts } from "./fixture/tui-environment"
import { createTuiResolvedConfig } from "./fixture/tui-runtime"

// 2 children + 1 gap + 1 bottom pad = 4 rows collapsed.
// 4 children + 3 gaps + 1 bottom pad = 8 rows expanded.
const HUG_COLLAPSED = 4
const HUG_EXPANDED = 8

function findScrollBox(root: Renderable): ScrollBoxRenderable | undefined {
  if (root instanceof ScrollBoxRenderable) return root
  for (const child of root.getChildren()) {
    const found = findScrollBox(child)
    if (found) return found
  }
  return undefined
}

async function settle(app: Awaited<ReturnType<typeof testRender>>, frames = 5) {
  for (let attempt = 0; attempt < frames; attempt++) {
    await Bun.sleep(30)
    await app.renderOnce()
  }
}

async function renderDynamicDialog() {
  const [extra, setExtra] = createSignal(false)
  const app = await testRender(
    () => (
      <TestTuiContexts>
        <TuiConfigProvider config={createTuiResolvedConfig()}>
          <KVProvider>
            <ToastProvider>
              <ThemeProvider mode="dark">
                <Dialog size="medium" onClose={() => {}}>
                  <box paddingLeft={2} paddingRight={2} gap={1} paddingBottom={1}>
                    <box flexDirection="row" justifyContent="space-between">
                      <text>Permissions status</text>
                      <text>esc</text>
                    </box>
                    <text>Nothing waiting for approval.</text>
                    {/* Two independent gates rather than one list: `Show` with an
                        array child is a renderer-shape risk, and the point here is
                        a body that changes size, not how it enumerates. */}
                    <Show when={extra()}>
                      <text>Extra row one.</text>
                    </Show>
                    <Show when={extra()}>
                      <text>Extra row two.</text>
                    </Show>
                  </box>
                </Dialog>
              </ThemeProvider>
            </ToastProvider>
          </KVProvider>
        </TuiConfigProvider>
      </TestTuiContexts>
    ),
    { width: 120, height: 40, useMouse: true, enableMouseMovement: true },
  )
  for (let attempt = 0; attempt < 50 && app.renderer.root.getChildren().length === 0; attempt++) {
    await Bun.sleep(10)
    await app.renderOnce()
  }
  await app.waitForFrame((frame) => frame.includes("Permissions status"))
  await settle(app)
  return { app, setExtra }
}

test("dialog body grows when content is added after mount", async () => {
  const { app, setExtra } = await renderDynamicDialog()
  try {
    const scroll = findScrollBox(app.renderer.root)
    expect(scroll).toBeDefined()
    expect(scroll!.height).toBe(HUG_COLLAPSED)

    setExtra(true)
    await settle(app)

    expect(app.captureCharFrame()).toContain("Extra row two.")
    // Grew to fit the new rows — not clipped, not pinned to the viewport cap.
    expect(scroll!.height).toBe(HUG_EXPANDED)
    expect(scroll!.scrollHeight).toBe(HUG_EXPANDED)
  } finally {
    app.renderer.destroy()
  }
})

test("dialog body shrinks back when content is removed after mount", async () => {
  const { app, setExtra } = await renderDynamicDialog()
  try {
    const scroll = findScrollBox(app.renderer.root)
    expect(scroll).toBeDefined()

    setExtra(true)
    await settle(app)
    expect(scroll!.height).toBe(HUG_EXPANDED)

    // The case the deleted 250ms interval was written for: content removed
    // after paint must release the rows it claimed.
    setExtra(false)
    await settle(app)

    expect(app.captureCharFrame()).not.toContain("Extra row two.")
    expect(scroll!.height).toBe(HUG_COLLAPSED)
    expect(scroll!.scrollHeight).toBe(HUG_COLLAPSED)
  } finally {
    app.renderer.destroy()
  }
})

test("ui/dialog.tsx sizes its body without a measurement poll", () => {
  const source = readFileSync(join(import.meta.dir, "../src/ui/dialog.tsx"), "utf8")
  // Strip comments first: the file documents what it replaced, and a prose
  // mention of `setInterval` is not a timer.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")
  // Reintroducing either is the defect this replaced: a layout read on a timer
  // reflows every tick and lives as long as the dialog does.
  expect(code).not.toContain("setInterval")
  expect(code).not.toContain("measureContent")
  expect(source).toContain("contentOptions={{ minHeight: 0 }}")
})
