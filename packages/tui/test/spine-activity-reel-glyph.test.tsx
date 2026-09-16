/** @jsxImportSource @opentui/solid */
import { afterEach, expect, test } from "bun:test"
import { testRender, type JSX } from "@opentui/solid"
import { KVProvider } from "../src/context/kv"
import { ThemeProvider } from "../src/context/theme"
import { TuiConfigProvider } from "../src/config"
import { ToastProvider } from "../src/ui/toast"
import { ActivityReel } from "../src/shell/command-spine/spine-activity-reel"
import type { ActivityEntry } from "../src/shell/command-spine/spine-entry-view"
import { TestTuiContexts } from "./fixture/tui-environment"
import { createTuiResolvedConfig } from "./fixture/tui-runtime"

let app: Awaited<ReturnType<typeof testRender>> | undefined
afterEach(() => {
  app?.renderer.destroy()
  app = undefined
})

function withProviders(component: () => JSX.Element) {
  return (
    <TestTuiContexts>
      <TuiConfigProvider config={createTuiResolvedConfig()}>
        <KVProvider>
          <ToastProvider>
            <ThemeProvider mode="dark">{component()}</ThemeProvider>
          </ToastProvider>
        </KVProvider>
      </TuiConfigProvider>
    </TestTuiContexts>
  )
}

function reelEntry(streaming: boolean, glyph: string): ActivityEntry {
  return {
    id: "activity:turn-1",
    index: 1,
    type: "activity",
    layout: "wide",
    kind: "think",
    glyph,
    summary: "3 steps · 2 tools · 1 thought",
    elapsed: "+1.2s",
    streaming,
    contentWidth: 90,
    expanded: false,
    onToggle: () => {},
    children: [],
    activity: { type: "work", turnID: "turn-1", childCount: 3 },
  }
}

async function renderReel(view: ActivityEntry) {
  app = await testRender(
    () =>
      withProviders(() => (
        <box flexDirection="column" width="100%" height="100%">
          <ActivityReel view={view} layout="wide" expanded={false} contentWidth={90} onToggle={() => {}} />
        </box>
      )),
    { width: 100, height: 6 },
  )
  let last = ""
  for (let attempt = 0; attempt < 20; attempt++) {
    await app.renderOnce()
    await app.flush()
    const frame = app.captureCharFrame()
    if (frame.trim().length > 0 && frame === last) return frame
    last = frame
    await Bun.sleep(10)
  }
  return last
}

// The fixture glyphs are deliberately NOT the model's own "●"/"✓": if the reel
// re-derives the rail mark from `streaming` instead of painting the row's own
// mark, the old literal shows up and these assertions fail.
test("a live reel paints the rail mark carried by the row", async () => {
  const frame = await renderReel(reelEntry(true, "✦"))
  expect(frame).toContain("✦")
  expect(frame).not.toContain("●")
})

test("a settled reel paints the rail mark carried by the row", async () => {
  const frame = await renderReel(reelEntry(false, "◆"))
  expect(frame).toContain("◆")
  expect(frame).not.toContain("✓")
})

// The row paints one status word and measures that same word to budget the
// summary beside it; a longer literal would eat into the summary here.
test("a live reel paints its status word and keeps its summary whole", async () => {
  const frame = await renderReel(reelEntry(true, "✦"))
  expect(frame).toContain("working")
  expect(frame).toContain("3 steps · 2 tools · 1 thought")
})
