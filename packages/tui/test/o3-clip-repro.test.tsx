/**
 * O3 — render-based regression for bounded generic dialog content.
 *
 * Mounts the real `Dialog` container (ui/dialog.tsx) with 60 content rows
 * at a 12-row terminal and proves there is a real scroll owner, trailing rows
 * are reachable, and mouse-wheel input changes the viewport.
 */
/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import { type Renderable, ScrollBoxRenderable } from "@opentui/core"
import { testRender } from "@opentui/solid"
import { ThemeProvider } from "../src/context/theme"
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

const CONTENT_ROWS = 60
const rowText = (i: number) => `o3-clip-row-${String(i).padStart(2, "0")} marker`

async function renderDialogWithLongContent() {
  const rows = Array.from({ length: CONTENT_ROWS }, (_, i) => i)
  const app = await testRender(
    () => (
      <TestTuiContexts>
        <TuiConfigProvider config={createTuiResolvedConfig()}>
          <KVProvider>
            <ThemeProvider mode="dark">
              <Dialog size="xlarge" onClose={() => {}}>
                <box flexDirection="column" paddingLeft={1} paddingRight={1}>
                  {rows.map((i) => (
                    <text fg="#888888">{rowText(i)}</text>
                  ))}
                </box>
              </Dialog>
            </ThemeProvider>
          </KVProvider>
        </TuiConfigProvider>
      </TestTuiContexts>
    ),
    { width: 120, height: 12, useMouse: true, enableMouseMovement: true },
  )
  for (let attempt = 0; attempt < 50 && app.renderer.root.getChildren().length === 0; attempt++) {
    await Bun.sleep(10)
    await app.renderOnce()
  }
  return app
}

test("O3: dialog with 60 content rows has a bounded scroll owner and reachable tail", async () => {
  const app = await renderDialogWithLongContent()
  try {
    await app.waitForFrame((frame) => frame.includes(rowText(0)))
    await app.renderOnce()

    const scroll = findScrollBox(app.renderer.root)
    expect(scroll).toBeDefined()
    expect(app.captureCharFrame()).toContain(rowText(0))
    expect(app.captureCharFrame()).not.toContain(rowText(CONTENT_ROWS - 1))

    scroll!.scrollTo(scroll!.scrollHeight)
    await app.renderOnce()
    expect(app.captureCharFrame()).toContain(rowText(CONTENT_ROWS - 1))
  } finally {
    app.renderer.destroy()
  }
})

test("O3: mouse wheel scrolls overflowing dialog content", async () => {
  const app = await renderDialogWithLongContent()
  try {
    await app.waitForFrame((frame) => frame.includes(rowText(0)))
    const scroll = findScrollBox(app.renderer.root)
    expect(scroll).toBeDefined()
    const before = scroll!.scrollTop
    // Signature confirmed: scroll(x, y, direction) — mock-mouse.d.ts:34.
    // y=8 lands clearly inside the dialog body (verticalPad(12)=3 + 1 pad
    // + border ≈ content starts at y=5).
    await app.mockMouse.scroll(60, 8, "down")
    await app.renderOnce()
    expect(scroll!.scrollTop).toBeGreaterThan(before)
  } finally {
    app.renderer.destroy()
  }
})
