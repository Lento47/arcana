/** @jsxImportSource @opentui/solid */
/**
 * One block-gap rule: every top-level spine entry is separated by exactly one
 * blank row (spacing audit batch 2). Chat cards used to carry their own
 * marginTop + paddingBottom (2 blank rows between messages) while tool rows
 * had none; the gap now comes from the scroll content once.
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
import { spineProseWidth, type SpineEntry } from "../src/shell/command-spine/spine-types"
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

const WIDTH = 60

function entry(id: string, summary: string, index: number): SpineEntry {
  return {
    id,
    index,
    elapsed: "",
    timestamp: "12:00",
    kind: "plan",
    label: "arcana",
    glyph: "✦",
    summary,
    streaming: false,
  }
}

const ENTRIES = [entry("e-one", "BLOCK-ONE", 1), entry("e-two", "BLOCK-TWO", 2)]

test("top-level entries are separated by exactly one blank row", async () => {
  const app = await testRender(
    () =>
      withProviders(() => (
        <SpineViewport
          visibleEntryIDs={() => ENTRIES.map((item) => item.id)}
          visibleEntryByID={() => new Map(ENTRIES.map((item) => [item.id, item]))}
          layout="wide"
          gutterWidth={2}
          proseWidth={spineProseWidth(WIDTH, "wide")}
          thinkContentWidth={spineProseWidth(WIDTH, "wide")}
          entryExpanded={() => false}
          entryFocused={() => false}
          onToggleEntry={() => {}}
          onFocusEntry={() => {}}
          onContextMenu={() => {}}
          onNavigate={() => {}}
          showScrollbar={false}
          scrollAcceleration={new LinearScrollAccel()}
          setScrollRef={() => {}}
          handleMouseScroll={() => {}}
          showScrollUpButton={false}
          showScrollDownButton={false}
          onScrollToTop={() => {}}
          onScrollToBottom={() => {}}
        />
      )),
    { width: WIDTH, height: 10 },
  )
  try {
    for (let i = 0; i < 6; i++) {
      await app.renderOnce()
      await new Promise((resolve) => setTimeout(resolve, 30))
      await app.flush()
    }
    const lines = app.captureCharFrame().split("\n")
    const one = lines.findIndex((line) => line.includes("BLOCK-ONE"))
    const two = lines.findIndex((line) => line.includes("BLOCK-TWO"))
    expect(one).toBeGreaterThanOrEqual(0)
    expect(two).toBeGreaterThan(one)
    // Exactly one blank row between the blocks.
    expect(two - one).toBe(2)
    expect(lines[one + 1]!.trim()).toBe("")
  } finally {
    app.renderer.destroy()
  }
})
