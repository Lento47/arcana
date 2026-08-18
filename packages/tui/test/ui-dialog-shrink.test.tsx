/**
 * Dialog shrink-to-fit — short content must hug its rows, not claim the
 * full terminal-bounded viewport.
 *
 * The scrollbox's internal content node forces minHeight "100%", so a bare
 * maxHeight scrollbox renders at the cap (≈75% of the terminal) even for a
 * few rows. Dialog measures the real content through a wrapper ref and drives
 * the scrollbox height from it; long content still caps at the viewport bound
 * and scrolls (covered by o3-clip-repro.test.tsx).
 */
/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import { type Renderable, ScrollBoxRenderable } from "@opentui/core"
import { testRender } from "@opentui/solid"
import { ThemeProvider } from "../src/context/theme"
import { ToastProvider } from "../src/ui/toast"
import { TuiConfigProvider } from "../src/config"
import { KVProvider } from "../src/context/kv"
import { Dialog } from "../src/ui/dialog"
import { TestTuiContexts } from "./fixture/tui-environment"
import { createTuiResolvedConfig } from "./fixture/tui-runtime"

function findScrollBox(root: Renderable): ScrollBoxRenderable | undefined {
  if (root instanceof ScrollBoxRenderable) return root
  for (const child of root.getChildren()) {
    const found = findScrollBox(child)
    if (found) return found
  }
  return undefined
}

async function renderShortDialog() {
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
                  <text>No approval gates waiting.</text>
                  <text>No permission requests waiting.</text>
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
  // Let the dialog's post-mount measurements (setTimeout 0/60ms + poll) land.
  for (let attempt = 0; attempt < 5; attempt++) {
    await Bun.sleep(30)
    await app.renderOnce()
  }
  return app
}

test("short dialog content hugs its rows instead of filling the viewport", async () => {
  const app = await renderShortDialog()
  try {
    const scroll = findScrollBox(app.renderer.root)
    expect(scroll).toBeDefined()
    // 8 rows of real content (header + 3 lines + gaps + bottom padding), not
    // the 30-row cap a bare maxHeight scrollbox would claim at 40 rows.
    expect(scroll!.height).toBe(8)
    expect(scroll!.scrollHeight).toBe(8)

    const rows = app.captureCharFrame().split("\n")
    const nonEmpty = rows
      .map((row, i) => ({ i, text: row.replace(/\s+$/, "") }))
      .filter((row) => row.text.length > 0)
    expect(nonEmpty.some((row) => row.text.includes("Permissions status"))).toBe(true)
    expect(nonEmpty.some((row) => row.text.includes("No permission requests waiting."))).toBe(true)
    // Card bottom lands right below the content (~row 20), far above the
    // 30-row bottom the pre-fix dialog reached.
    const lastRow = nonEmpty.at(-1)!.i
    expect(lastRow).toBeLessThan(25)
  } finally {
    app.renderer.destroy()
  }
})
