/** @jsxImportSource @opentui/solid */
import { MouseButton } from "@opentui/core"
import { testRender } from "@opentui/solid"
import { afterEach, expect, test } from "bun:test"
import { KVContext } from "../src/context/kv"
import { ThemeProvider } from "../src/context/theme"
import { ToastProvider } from "../src/ui/toast"
import { TuiConfigProvider } from "../src/config"
import { Logo } from "../src/component/logo"
import { TestTuiContexts } from "./fixture/tui-environment"
import { createTuiResolvedConfig } from "./fixture/tui-runtime"

const kv = {
  ready: true,
  store: {},
  get(key: string, fallback?: unknown) {
    return key === "animations_enabled" ? true : fallback
  },
  set() {},
  signal<T>(_name: string, fallback: T) {
    return [() => fallback, () => {}] as const
  },
}

let app: Awaited<ReturnType<typeof testRender>> | undefined

afterEach(() => {
  app?.renderer.destroy()
  app = undefined
})

function Harness() {
  return (
    <TestTuiContexts>
      <TuiConfigProvider config={createTuiResolvedConfig()}>
        <KVContext.Provider value={kv as any}>
          <ToastProvider>
            <ThemeProvider mode="dark">
              <box>
                <Logo />
              </box>
            </ThemeProvider>
          </ToastProvider>
        </KVContext.Provider>
      </TuiConfigProvider>
    </TestTuiContexts>
  )
}

test("home logo remains renderable during rapid repeated clicks", async () => {
  app = await testRender(() => <Harness />, { width: 80, height: 12 })
  await app.renderOnce()

  for (let i = 0; i < 120; i++) {
    await app.mockMouse.click(15, 1, MouseButton.LEFT, { delayMs: 0 })
    if (i % 12 === 0) {
      await Bun.sleep(8)
      await app.renderOnce()
    }
  }

  await app.renderOnce()
  const frame = app.captureCharFrame()
  expect(frame.trim().length).toBeGreaterThan(0)
  expect(frame).toContain("▄▀▀▄")
  expect(frame).not.toContain("[object Object]")
})
