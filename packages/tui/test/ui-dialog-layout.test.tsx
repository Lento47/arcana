/**
 * Dialog layout contracts. The provider host must own the viewport, the card
 * must be centered and responsively bounded, and picker content must keep its
 * own scroll owner when mounted through the real dialog provider.
 */
/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui"
import { ScrollBoxRenderable, type Renderable } from "@opentui/core"
import { testRender, useRenderer } from "@opentui/solid"
import { For, onCleanup, onMount } from "solid-js"
import { ThemeProvider } from "../src/context/theme"
import { ToastProvider } from "../src/ui/toast"
import { TuiConfigProvider } from "../src/config"
import { KVProvider } from "../src/context/kv"
import { Dialog, DialogProvider, useDialog } from "../src/ui/dialog"
import { DialogSelect } from "../src/ui/dialog-select"
import { OpencodeKeymapProvider, registerOpencodeKeymap } from "../src/keymap"
import { TestTuiContexts } from "./fixture/tui-environment"
import { createTuiResolvedConfig } from "./fixture/tui-runtime"

function findById(root: Renderable, id: string): Renderable | undefined {
  if (root.id === id) return root
  for (const child of root.getChildren()) {
    const found = findById(child, id)
    if (found) return found
  }
}

function findScrollBoxes(root: Renderable): ScrollBoxRenderable[] {
  const result: ScrollBoxRenderable[] = []
  if (root instanceof ScrollBoxRenderable) result.push(root)
  for (const child of root.getChildren()) result.push(...findScrollBoxes(child))
  return result
}

async function settle(app: Awaited<ReturnType<typeof testRender>>, marker: string) {
  for (let attempt = 0; attempt < 50; attempt++) {
    await app.renderOnce()
    if (app.captureCharFrame().includes(marker)) break
    await Bun.sleep(10)
  }
  expect(app.captureCharFrame()).toContain(marker)
  // Dialog content measurement runs after layout; allow the first stable card
  // dimensions to land before asserting geometry.
  await Bun.sleep(70)
  await app.renderOnce()
}

test("dialog cards are centered and bounded by the viewport", async () => {
  const app = await testRender(
    () => (
      <TestTuiContexts>
        <TuiConfigProvider config={createTuiResolvedConfig()}>
          <KVProvider>
            <ToastProvider>
              <ThemeProvider mode="dark">
                <Dialog size="medium" onClose={() => {}}>
                  <box width="100%" minWidth={0} paddingLeft={2} paddingRight={2} paddingBottom={1}>
                    <text>Dialog geometry probe</text>
                  </box>
                </Dialog>
              </ThemeProvider>
            </ToastProvider>
          </KVProvider>
        </TuiConfigProvider>
      </TestTuiContexts>
    ),
    { width: 120, height: 40 },
  )

  try {
    await settle(app, "Dialog geometry probe")
    const overlay = findById(app.renderer.root, "arcana-dialog-overlay")
    const card = findById(app.renderer.root, "arcana-dialog-card")
    expect(overlay).toBeDefined()
    expect(card).toBeDefined()
    expect(overlay).toMatchObject({ x: 0, y: 0, width: 120, height: 40 })
    expect(card!.width).toBe(60)
    expect(Math.abs(card!.x - (120 - card!.width) / 2)).toBeLessThanOrEqual(1)
    expect(Math.abs(card!.y - (40 - card!.height) / 2)).toBeLessThanOrEqual(1)
  } finally {
    app.renderer.destroy()
  }
})

test("provider-mounted picker keeps wheel scrolling inside its list", async () => {
  let selectedValue: number | undefined
  const options = Array.from({ length: 60 }, (_, index) => ({ title: `layout-row-${index}`, value: index, onSelect: () => { selectedValue = index } }))

  function Launcher() {
    const dialog = useDialog()
    onMount(() => dialog.replace(() => <DialogSelect title="Rows" options={options} />))
    return null
  }

  function Harness() {
    const renderer = useRenderer()
    const keymap = createDefaultOpenTuiKeymap(renderer)
    const config = createTuiResolvedConfig()
    const off = registerOpencodeKeymap(keymap, renderer, config)
    onCleanup(off)
    return (
      <TestTuiContexts>
        <OpencodeKeymapProvider keymap={keymap}>
          <TuiConfigProvider config={config}>
            <KVProvider>
              <ToastProvider>
                <ThemeProvider mode="dark">
                  <DialogProvider>
                    <Launcher />
                  </DialogProvider>
                </ThemeProvider>
              </ToastProvider>
            </KVProvider>
          </TuiConfigProvider>
        </OpencodeKeymapProvider>
      </TestTuiContexts>
    )
  }

  const app = await testRender(() => <Harness />, {
    width: 120,
    height: 40,
    useMouse: true,
    enableMouseMovement: true,
  })

  try {
    await settle(app, "layout-row-0")
    const scroll = findScrollBoxes(app.renderer.root).at(-1)
    expect(scroll).toBeDefined()
    expect(scroll!.scrollHeight).toBeGreaterThan(scroll!.height)
    const firstOption = findById(app.renderer.root, "ds-opt-0")
    expect(firstOption).toBeDefined()
    const firstTextX = firstOption!.x + Math.min(5, Math.max(0, firstOption!.width - 1))
    const firstTextY = firstOption!.y
    await app.mockMouse.click(firstTextX, firstTextY)
    await app.renderOnce()
    expect(selectedValue).toBe(0)
    const thirdOption = findById(app.renderer.root, "ds-opt-3")
    expect(thirdOption).toBeDefined()
    await app.mockMouse.drag(firstTextX, firstTextY, thirdOption!.x + 12, thirdOption!.y, 0)
    await app.renderOnce()
    expect(app.renderer.getSelection()?.getSelectedText()).toContain("layout-row-1")
    const before = scroll!.scrollTop
    await app.mockMouse.scroll(scroll!.x + 2, scroll!.y + 2, "down")
    await app.renderOnce()
    expect(scroll!.scrollTop).toBeGreaterThan(before)
  } finally {
    app.renderer.destroy()
  }
})

test("provider host does not capture mouse input when no dialog is open", async () => {
  function Harness() {
    const renderer = useRenderer()
    const keymap = createDefaultOpenTuiKeymap(renderer)
    const config = createTuiResolvedConfig()
    const off = registerOpencodeKeymap(keymap, renderer, config)
    onCleanup(off)
    return (
      <TestTuiContexts>
        <OpencodeKeymapProvider keymap={keymap}>
          <TuiConfigProvider config={config}>
            <KVProvider>
              <ToastProvider>
                <ThemeProvider mode="dark">
                  <DialogProvider>
                    <scrollbox id="background-scroll" width="100%" height={20}>
                      <For each={Array.from({ length: 80 }, (_, index) => index)}>
                        {(index) => <text>{`background-row-${index}`}</text>}
                      </For>
                    </scrollbox>
                  </DialogProvider>
                </ThemeProvider>
              </ToastProvider>
            </KVProvider>
          </TuiConfigProvider>
        </OpencodeKeymapProvider>
      </TestTuiContexts>
    )
  }

  const app = await testRender(() => <Harness />, {
    width: 120,
    height: 40,
    useMouse: true,
  })

  try {
    await settle(app, "background-row-0")
    const scroll = findById(app.renderer.root, "background-scroll") as ScrollBoxRenderable | undefined
    expect(scroll).toBeDefined()
    expect(scroll!.scrollHeight).toBeGreaterThan(scroll!.height)
    const before = scroll!.scrollTop
    await app.mockMouse.scroll(scroll!.x + 2, scroll!.y + 2, "down")
    await app.renderOnce()
    expect(scroll!.scrollTop).toBeGreaterThan(before)
  } finally {
    app.renderer.destroy()
  }
})
