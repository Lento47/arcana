/** @jsxImportSource @opentui/solid */
/**
 * The home footer is one row, and the directory it leads with is the only part
 * of it that can be long.
 *
 * Nothing rendered this surface before. The footer is the last line of the home
 * screen, so when its content overran the terminal it did not merely look
 * wrong — it grew, and the `flexGrow` spacers above it gave up rows to keep the
 * screen filled, pulling the logo and the prompt upward. A path is a single
 * unbreakable token, so an overrun did not even wrap tidily: at 40 columns a
 * 25-column working directory drew five rows, breaking mid-name (`/tmp/`,
 * `openco`, `de/`, `packag`, `es/tui`).
 *
 * The row is pinned here at both ends of the range: wide enough that nothing
 * needs to give, and narrow enough that the directory must elide. The version
 * is asserted at every width because it is the last thing on the row — the
 * segment a layout that grows instead of eliding takes down with it.
 */
import { describe, expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import type { TuiPluginApi, TuiPluginMeta } from "@arcana/plugin/tui"
import { ExitProvider } from "../src/context/exit"
import { ArgsProvider } from "../src/context/args"
import { TuiConfigProvider } from "../src/config"
import { KVProvider } from "../src/context/kv"
import { SDKProvider } from "../src/context/sdk"
import { ProjectProvider } from "../src/context/project"
import { SyncProvider } from "../src/context/sync"
import { ToastProvider } from "../src/ui/toast"
import { ThemeProvider } from "../src/context/theme"
import { HomeSessionDestinationProvider } from "../src/routes/home/session-destination"
import { TestTuiContexts } from "./fixture/tui-environment"
import { createTuiResolvedConfig } from "./fixture/tui-runtime"
import { createFetch, createEventSource } from "./fixture/tui-sdk"
import footerPlugin from "../src/feature-plugins/home/footer"

const pluginMeta = {
  id: "internal:home-footer",
  source: "internal",
  spec: "home-footer",
  target: "home-footer",
  first_time: 0,
  last_time: 0,
  time_changed: 0,
  load_count: 1,
  fingerprint: "test",
  state: "same",
} satisfies TuiPluginMeta

const VERSION = "0.3.67"
/** The working directory the fixture's sync reports: 25 columns of one token. */
const DIRECTORY = "/tmp/opencode/packages/tui"

/** Mounts the real `home_footer` slot through a stub slot host. */
async function mountFooter(width: number, mcp: ReadonlyArray<{ status: string }> = [{ status: "connected" }]) {
  let view: (() => unknown) | undefined
  const slots = {
    register(registration: { slots: { home_footer?: () => unknown } }) {
      view = registration.slots.home_footer
      return () => {}
    },
  }
  const api = {
    app: { version: VERSION },
    theme: { current: {} },
    // The plugin reads its width from the renderer it is handed; without one
    // the budget is unmeasured and the test would exercise only the fallback.
    renderer: { width, on() {}, off() {} },
    state: { path: { directory: DIRECTORY }, vcs: { branch: "arcanagov" }, mcp: () => mcp },
    slots,
  } as unknown as TuiPluginApi
  await footerPlugin.tui(api, undefined, pluginMeta)
  if (!view) throw new Error("home footer registered no home_footer slot")

  const calls = createFetch()
  const events = createEventSource()
  const app = await testRender(
    () => (
      <TestTuiContexts cwd={DIRECTORY}>
        <ExitProvider exit={() => {}}>
          <ArgsProvider>
            <TuiConfigProvider config={createTuiResolvedConfig()}>
              <KVProvider>
                <SDKProvider url="http://test" directory={DIRECTORY} fetch={calls.fetch} events={events.source}>
                  <ProjectProvider>
                    <SyncProvider>
                      <ToastProvider>
                        <ThemeProvider mode="dark">
                          <HomeSessionDestinationProvider>{view!() as never}</HomeSessionDestinationProvider>
                        </ThemeProvider>
                      </ToastProvider>
                    </SyncProvider>
                  </ProjectProvider>
                </SDKProvider>
              </KVProvider>
            </TuiConfigProvider>
          </ArgsProvider>
        </ExitProvider>
      </TestTuiContexts>
    ),
    { width, height: 12 },
  )
  for (let attempt = 0; attempt < 20; attempt++) {
    await Bun.sleep(15)
    await app.renderOnce()
  }
  return app
}

/** Non-empty frame lines: the footer's real height, ignoring blank padding. */
function rows(frame: string): string[] {
  return frame.split("\n").filter((line) => line.trim().length > 0)
}

describe("the home footer is one row", () => {
  test("holds one row from a wide terminal down to a very narrow one", async () => {
    // 40 is the regression: five rows, breaking the path mid-name. 22 is past
    // the point where the directory has no columns left at all.
    for (const width of [120, 100, 80, 60, 48, 40, 30, 22]) {
      const app = await mountFooter(width)
      try {
        const lines = rows(app.captureCharFrame())
        expect(lines.length).toBe(1)
      } finally {
        app.renderer.destroy()
      }
    }
  })

  test("the directory elides from the left and the version survives", async () => {
    const app = await mountFooter(40)
    try {
      const line = rows(app.captureCharFrame())[0]!
      // The leaf, not the head: where you are beats where you came from.
      expect(line).toContain("…/tui")
      expect(line).not.toContain("/tmp/")
      expect(line).toContain(VERSION)
      expect(line).toContain("MCP")
    } finally {
      app.renderer.destroy()
    }
  })

  test("a terminal with room shows the whole directory", async () => {
    const app = await mountFooter(120)
    try {
      const line = rows(app.captureCharFrame())[0]!
      expect(line).toContain(DIRECTORY)
      expect(line).not.toContain("…")
      expect(line).toContain(VERSION)
    } finally {
      app.renderer.destroy()
    }
  })

  test("no badge registered leaves the directory more room, not a broken row", async () => {
    const app = await mountFooter(40, [])
    try {
      const lines = rows(app.captureCharFrame())
      expect(lines.length).toBe(1)
      const line = lines[0]!
      expect(line).not.toContain("MCP")
      expect(line).toContain(VERSION)
      // The badge's columns come back to the directory, and enough of them come
      // back to carry the branch as well — which is the same 40-column row that
      // had to drop it a moment ago.
      expect(line).toContain("…/tui:arcanagov")
    } finally {
      app.renderer.destroy()
    }
  })
})
