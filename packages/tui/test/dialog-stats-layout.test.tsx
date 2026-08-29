/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui"
import { testRender, useRenderer } from "@opentui/solid"
import { onCleanup, onMount } from "solid-js"
import { DialogAlert } from "../src/ui/dialog-alert"
import { DialogProvider, useDialog } from "../src/ui/dialog"
import { OpencodeKeymapProvider, registerOpencodeKeymap } from "../src/keymap"
import { ThemeProvider } from "../src/context/theme"
import { ToastProvider } from "../src/ui/toast"
import { KVProvider } from "../src/context/kv"
import { TuiConfigProvider } from "../src/config"
import { TestTuiContexts } from "./fixture/tui-environment"
import { createTuiResolvedConfig } from "./fixture/tui-runtime"

const frame = [
  "┌────────────────────────────────────────────────────────┐",
  "│                        OVERVIEW                        │",
  "├────────────────────────────────────────────────────────┤",
  "│Sessions                                              12│",
  "└────────────────────────────────────────────────────────┘",
].join("\n")

function Launcher() {
  const dialog = useDialog()
  onMount(() => {
    dialog.replace(() => <DialogAlert title="arcana stats — exit 0" message={frame} preformatted />)
    dialog.setSize("large")
  })
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

test("stats output stays preformatted inside the wide dialog", async () => {
  const app = await testRender(() => <Harness />, { width: 120, height: 40 })
  try {
    for (let attempt = 0; attempt < 50; attempt++) {
      await app.renderOnce()
      if (app.captureCharFrame().includes("arcana stats — exit 0")) break
      await Bun.sleep(10)
    }
    await Bun.sleep(80)
    await app.renderOnce()
    const output = app.captureCharFrame()
    expect(output).toContain("arcana stats — exit 0")
    const compact = output
      .split("\n")
      .map((line) => line.trimStart())
      .join("\n")
    const rows = compact.split("\n")
    for (const line of frame.split("\n")) {
      expect(rows.some((row) => row.trimEnd().includes(`│  ${line}`))).toBe(true)
    }
  } finally {
    app.renderer.destroy()
  }
})
