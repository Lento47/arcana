/** @jsxImportSource @opentui/solid */
/**
 * Scroll cues must render in the reserved right gutter, never on row text.
 *
 * Live sessions showed "▸↑· +5m": the old floating cue sat at right={4},
 * directly on the row's chevron/elapsed meta. The gutter is now always
 * reserved (viewport paddingRight 1) and the cue occupies the last column.
 * Cues also yield to the scrollbar thumb when the scrollbar is on.
 */
import { expect, test } from "bun:test"
import { testRender, type JSX } from "@opentui/solid"
import { LinearScrollAccel } from "@opentui/core"
import { ThemeProvider } from "../src/context/theme"
import { ToastProvider } from "../src/ui/toast"
import { TuiConfigProvider } from "../src/config"
import { KVProvider } from "../src/context/kv"
import { ArgsProvider } from "../src/context/args"
import { ExitProvider } from "../src/context/exit"
import { SDKProvider } from "../src/context/sdk"
import { ProjectProvider } from "../src/context/project"
import { SyncProvider } from "../src/context/sync"
import { SpineViewport } from "../src/shell/command-spine/spine-viewport"
import type { SpineEntry } from "../src/shell/command-spine/spine-types"
import { TestTuiContexts } from "./fixture/tui-environment"
import { createTuiResolvedConfig } from "./fixture/tui-runtime"
import { createEventSource, createFetch, directory } from "./fixture/tui-sdk"

function withProviders(component: () => JSX.Element) {
  const calls = createFetch()
  const events = createEventSource()
  return (
    <TestTuiContexts>
      <ExitProvider exit={() => {}}>
        <ArgsProvider>
          <TuiConfigProvider config={createTuiResolvedConfig()}>
            <KVProvider>
              <SDKProvider url="http://test" directory={directory} fetch={calls.fetch} events={events.source}>
                <ProjectProvider>
                  <SyncProvider>
                    <ToastProvider>
                      <ThemeProvider mode="dark">{component()}</ThemeProvider>
                    </ToastProvider>
                  </SyncProvider>
                </ProjectProvider>
              </SDKProvider>
            </KVProvider>
          </TuiConfigProvider>
        </ArgsProvider>
      </ExitProvider>
    </TestTuiContexts>
  )
}

const WIDTH = 72
const LONG_ROW =
  "A long assistant reply that fills the full row width so the right edge is reachable by text and the old cue placement would have collided with this line."

const ENTRY: SpineEntry = {
  id: "e-long",
  index: 1,
  elapsed: "",
  kind: "plan",
  label: "arcana",
  glyph: "✦",
  summary: LONG_ROW,
  streaming: false,
}

async function capture(opts: { showScrollbar: boolean; up: boolean; down: boolean }) {
  const app = await testRender(
    () =>
      withProviders(() => (
        <box width="100%" height="100%" flexDirection="column">
          <SpineViewport
          visibleEntryIDs={() => ["e-long"]}
          visibleEntryByID={() => new Map([["e-long", ENTRY]])}
          layout="wide"
          gutterWidth={2}
          proseWidth={WIDTH}
          thinkContentWidth={WIDTH}
          entryExpanded={() => false}
          entryFocused={() => false}
          onToggleEntry={() => {}}
          onFocusEntry={() => {}}
          onContextMenu={() => {}}
          onNavigate={() => {}}
          showScrollbar={opts.showScrollbar}
          scrollAcceleration={new LinearScrollAccel()}
          setScrollRef={() => {}}
          handleMouseScroll={() => {}}
          showScrollUpButton={opts.up}
          showScrollDownButton={opts.down}
          onScrollToTop={() => {}}
          onScrollToBottom={() => {}}
        />
        </box>
      )),
    { width: WIDTH, height: 8 },
  )
  try {
    for (let i = 0; i < 4; i++) {
      await app.renderOnce()
      await new Promise((resolve) => setTimeout(resolve, 50))
      await app.flush()
      await app.renderOnce()
    }
    return app.captureCharFrame()
  } finally {
    app.renderer.destroy()
  }
}

function cols(line: string): string[] {
  return [...line]
}

test("down cue renders in the last column gutter, not on row text", async () => {
  const frame = await capture({ showScrollbar: false, up: false, down: true })
  const lines = frame.split("\n").filter((line) => line.length > 0)
  const bottom = cols(lines[lines.length - 1]!)

  expect(bottom[WIDTH - 1]).toBe("↓")
  // Every other cell on the cue row is not row text spilling under the cue.
  expect(bottom[WIDTH - 2]).toBe(" ")
  // No row line may render content in the gutter column.
  for (const line of lines.slice(0, -1)) {
    const c = cols(line)
    if (c.length < WIDTH) continue
    expect(c[WIDTH - 1]).toBe(" ")
  }
})

test("up cue renders in the first row gutter", async () => {
  const frame = await capture({ showScrollbar: false, up: true, down: false })
  const lines = frame.split("\n").filter((line) => line.length > 0)
  const top = cols(lines[0]!)

  expect(top[WIDTH - 1]).toBe("↑")
})

test("cues yield to the scrollbar when it is on", async () => {
  const frame = await capture({ showScrollbar: true, up: true, down: true })
  expect(frame).not.toContain("↑")
  expect(frame).not.toContain("↓")
})
