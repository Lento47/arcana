/** @jsxImportSource @opentui/solid */
/**
 * The dismiss glyph dismisses. It does not also expand the row.
 *
 * OpenTUI mouse events bubble (`Renderable.processMouseEvent` walks to
 * `this.parent` unless the handler stops propagation), and the ✕ sits inside
 * the row header, which sits inside the row. Its handler took no event and so
 * could not stop anything: one click on ✕ ran `onDismiss` *and* then reached
 * `handleHeaderMouseUp`, which toggles the row. The symptom is an approval
 * banner that opens its own body as it is dismissed.
 *
 * The assertion is on the frame as well as the counters — the expansion is the
 * part an operator sees.
 */
import { testRender, type JSX } from "@opentui/solid"
import { MouseButton } from "@opentui/core"
import { expect, test } from "bun:test"
import { createSignal } from "solid-js"
import { Glyph } from "../src/branding"
import { ThemeProvider } from "../src/context/theme"
import { ToastProvider } from "../src/ui/toast"
import { TuiConfigProvider } from "../src/config"
import { KVProvider } from "../src/context/kv"
import { ArgsProvider } from "../src/context/args"
import { ExitProvider } from "../src/context/exit"
import { SDKProvider } from "../src/context/sdk"
import { ProjectProvider } from "../src/context/project"
import { SyncProvider } from "../src/context/sync"
import { TestTuiContexts } from "./fixture/tui-environment"
import { createTuiResolvedConfig } from "./fixture/tui-runtime"
import { createFetch, createEventSource, directory } from "./fixture/tui-sdk"
import { SpineEntry } from "../src/shell/command-spine/spine-entry"
import type { SpineEntry as SpineEntryModel } from "../src/shell/command-spine/spine-types"

const BODY = "the release check wants network access"

const approveEntry = {
  id: "approval:test",
  index: 1,
  elapsed: "",
  kind: "approve",
  glyph: "△",
  // Not "approval required": that label makes the row pending, which mounts the
  // approval gate — this test is about the header's dismiss affordance.
  label: "approval granted",
  summary: "Run release verification",
  body: BODY,
  collapsible: true,
} as unknown as SpineEntryModel

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

/** Wait for a settled, non-empty frame. */
async function capture(app: Awaited<ReturnType<typeof testRender>>) {
  let last = ""
  for (let attempt = 0; attempt < 10; attempt++) {
    await app.renderOnce()
    await app.flush()
    const frame = app.captureCharFrame()
    if (frame.trim().length > 0 && frame === last) return frame
    last = frame
    await Bun.sleep(30)
  }
  return app.captureCharFrame()
}

function cellOf(frame: string, text: string) {
  const lines = frame.split("\n")
  const y = lines.findIndex((line) => line.includes(text))
  expect(y).toBeGreaterThanOrEqual(0)
  return { x: Math.max(0, lines[y]!.indexOf(text)), y }
}

test("clicking the dismiss glyph does not also toggle the row", async () => {
  let dismissCount = 0
  let toggleCount = 0

  const app = await testRender(
    () =>
      withProviders(() => {
        const [expanded, setExpanded] = createSignal(false)
        return (
          <box flexDirection="column" width="100%" height="100%">
            <SpineEntry
              entry={approveEntry}
              layout="wide"
              contentWidth={90}
              expanded={expanded()}
              onDismiss={() => {
                dismissCount++
              }}
              onToggle={() => {
                toggleCount++
                setExpanded((value) => !value)
              }}
            />
          </box>
        )
      }),
    { width: 100, height: 14, useMouse: true, enableMouseMovement: true },
  )

  try {
    const initial = await capture(app)
    const dismissCell = cellOf(initial, Glyph.dismiss)
    expect(initial).not.toContain(BODY)

    await app.mockMouse.moveTo(dismissCell.x, dismissCell.y)
    await app.mockMouse.click(dismissCell.x, dismissCell.y, MouseButton.LEFT)
    const after = await capture(app)

    expect(dismissCount).toBe(1)
    expect(toggleCount).toBe(0)
    expect(after).not.toContain(BODY)
  } finally {
    app.renderer.destroy()
  }
})
