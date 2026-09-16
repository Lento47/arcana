/** @jsxImportSource @opentui/solid */
/**
 * Approving a request approves it. It does not also expand the banner.
 *
 * The inline gate is the one part of an approval row that renders while the row
 * is collapsed, and a collapsed row reads a left click as "toggle me" — the
 * row's own `onMouseUp` calls `handleToggle` only when `!expanded()`, which is
 * precisely the state the chips are clickable in. OpenTUI mouse events bubble
 * (`Renderable.processMouseEvent` walks to `this.parent` unless a handler stops
 * propagation), and the chip handler took no event, so one click on `a approve`
 * ran the approval *and* then reached the row handler, opening the body.
 *
 * The assertion is on the toggle counter rather than the frame: the row's own
 * handler is the unit under test, and a counter cannot be satisfied by a
 * coincidence of layout.
 */
import { testRender, type JSX } from "@opentui/solid"
import { MouseButton } from "@opentui/core"
import { expect, test } from "bun:test"
import { createSignal } from "solid-js"
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
import { ApprovalGateActionsContext } from "../src/shell/command-spine/spine-approval-gate"
import { SpineEntry } from "../src/shell/command-spine/spine-entry"
import type { SpineEntry as SpineEntryModel } from "../src/shell/command-spine/spine-types"

/** The `a` chip's rendered text, from `approvalGateFacts`. */
const APPROVE_CHIP = "a approve once"

const BODY = "the release check wants network access"

/**
 * PENDING is what mounts the gate on a collapsed row: the row is `pending` only
 * for a durable approval whose label is still "approval required" (see
 * `spine-entry-view.ts`), which is also the state no operator has acted on yet.
 */
const pendingApproval = {
  id: "approval:test",
  index: 1,
  elapsed: "",
  kind: "approve",
  glyph: "△",
  label: "approval required",
  summary: "Run release verification",
  actor: "agent/planner",
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

test("clicking the approve chip does not also toggle the row", async () => {
  let approveCount = 0
  let toggleCount = 0

  const app = await testRender(
    () =>
      withProviders(() => {
        const [expanded, setExpanded] = createSignal(false)
        return (
          <ApprovalGateActionsContext.Provider
            value={{
              approve: () => {
                approveCount++
              },
              deny: () => {},
              inspect: () => {},
            }}
          >
            <box flexDirection="column" width="100%" height="100%">
              <SpineEntry
                entry={pendingApproval}
                layout="wide"
                contentWidth={90}
                expanded={expanded()}
                onToggle={() => {
                  toggleCount++
                  setExpanded((value) => !value)
                }}
              />
            </box>
          </ApprovalGateActionsContext.Provider>
        )
      }),
    { width: 100, height: 20, useMouse: true, enableMouseMovement: true },
  )

  try {
    const initial = await capture(app)
    expect(initial).not.toContain(BODY)
    const chip = cellOf(initial, APPROVE_CHIP)

    await app.mockMouse.moveTo(chip.x, chip.y)
    await app.mockMouse.click(chip.x, chip.y, MouseButton.LEFT)
    const after = await capture(app)

    expect(approveCount).toBe(1)
    expect(toggleCount).toBe(0)
    expect(after).not.toContain(BODY)
  } finally {
    app.renderer.destroy()
  }
})
