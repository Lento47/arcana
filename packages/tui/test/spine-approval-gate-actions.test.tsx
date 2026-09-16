/** @jsxImportSource @opentui/solid */
import { afterEach, expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { createMockMouse } from "@opentui/core/testing"
import { KVProvider } from "../src/context/kv"
import { ThemeProvider } from "../src/context/theme"
import { TuiConfigProvider } from "../src/config"
import { ToastProvider } from "../src/ui/toast"
import { ApprovalGateActionsContext, SpineApprovalGate } from "../src/shell/command-spine/spine-approval-gate"
import { GateQueueLine } from "../src/routes/session/permission"
import type { SpineApprovalSnapshot, SpineEntry as SpineEntryModel } from "../src/shell/command-spine/spine-types"
import { TestTuiContexts } from "./fixture/tui-environment"
import { createTuiResolvedConfig } from "./fixture/tui-runtime"

let app: Awaited<ReturnType<typeof testRender>> | undefined

afterEach(() => {
  app?.renderer.destroy()
  app = undefined
})

const entry = {
  id: "approval:test",
  index: 1,
  elapsed: "",
  kind: "approve",
  glyph: "△",
  label: "approval required",
  summary: "Run release verification",
  source: { messageID: "approval", kind: "approve" },
} as unknown as SpineEntryModel

const snapshot: SpineApprovalSnapshot = {
  requestHash: "abc123",
  available: true,
  tool: "bash",
  action: "bun test packages/tui",
  risk: "HIGH",
}

function harness(actions: { approve: () => void; deny: () => void; inspect: () => void }) {
  return (
    <TestTuiContexts>
      <TuiConfigProvider config={createTuiResolvedConfig()}>
        <KVProvider>
          <ToastProvider>
            <ThemeProvider mode="dark">
              <ApprovalGateActionsContext.Provider value={actions}>
                <box width={100} flexDirection="column">
                  <SpineApprovalGate entry={entry} snapshot={snapshot} layout="wide" contentWidth={96} />
                </box>
              </ApprovalGateActionsContext.Provider>
            </ThemeProvider>
          </ToastProvider>
        </KVProvider>
      </TuiConfigProvider>
    </TestTuiContexts>
  )
}

async function settle() {
  for (let attempt = 0; attempt < 40; attempt++) {
    await app!.renderOnce()
    await app!.flush()
    if (app!.captureCharFrame().includes("approve once")) return
    await Bun.sleep(20)
  }
  throw new Error("approval gate never rendered its action chips")
}

function cellOf(frame: string, label: string): { x: number; y: number } | undefined {
  const lines = frame.split("\n")
  for (let y = 0; y < lines.length; y++) {
    const x = lines[y]!.indexOf(label)
    if (x >= 0) return { x, y }
  }
  return undefined
}

function bgOfLabel(label: string): string | undefined {
  for (const line of app!.captureSpans().lines) {
    for (const span of line.spans) {
      if (span.text.includes(label)) return span.bg?.toString()
    }
  }
  return undefined
}

test("approval gate action chips dispatch on click and show hover feedback", async () => {
  let approved = 0
  let denied = 0
  let inspected = 0
  app = await testRender(
    () => harness({ approve: () => approved++, deny: () => denied++, inspect: () => inspected++ }),
    { width: 100, height: 24 },
  )
  await settle()

  const chip = cellOf(app.captureCharFrame(), "approve once")
  expect(chip).toBeDefined()

  const mouse = createMockMouse(app!.renderer)
  const resting = bgOfLabel("approve once")
  await mouse.moveTo(chip!.x, chip!.y)
  await app!.renderOnce()
  await app!.flush()
  const hovered = bgOfLabel("approve once")
  expect(resting).not.toBe(hovered)

  // The key glyph sits two cells left of the label ("a approve once").
  await mouse.click(chip!.x - 2, chip!.y)
  await app!.renderOnce()
  expect(approved).toBe(1)
  expect(denied).toBe(0)
  expect(inspected).toBe(0)
})

test("gate queue line shows docket position and next-up preview", async () => {
  app = await testRender(
    () => (
      <TestTuiContexts>
        <TuiConfigProvider config={createTuiResolvedConfig()}>
          <KVProvider>
            <ToastProvider>
              <ThemeProvider mode="dark">
                <box width={80} flexDirection="column">
                  <GateQueueLine queue={{ index: 1, total: 3, next: "bash" }} />
                </box>
              </ThemeProvider>
            </ToastProvider>
          </KVProvider>
        </TuiConfigProvider>
      </TestTuiContexts>
    ),
    { width: 80, height: 6 },
  )
  for (let attempt = 0; attempt < 40; attempt++) {
    await app.renderOnce()
    await app.flush()
    if (app.captureCharFrame().includes("Request 1 of 3")) break
    await Bun.sleep(20)
  }
  const frame = app.captureCharFrame()
  expect(frame).toContain("Request 1 of 3")
  expect(frame).toContain("next: bash")
})

test("approval gate action chips stay inert without an action provider", async () => {
  app = await testRender(
    () => (
      <TestTuiContexts>
        <TuiConfigProvider config={createTuiResolvedConfig()}>
          <KVProvider>
            <ToastProvider>
              <ThemeProvider mode="dark">
                <box width={100} flexDirection="column">
                  <SpineApprovalGate entry={entry} snapshot={snapshot} layout="wide" contentWidth={96} />
                </box>
              </ThemeProvider>
            </ToastProvider>
          </KVProvider>
        </TuiConfigProvider>
      </TestTuiContexts>
    ),
    { width: 100, height: 24 },
  )
  await settle()

  const chip = cellOf(app.captureCharFrame(), "approve once")
  expect(chip).toBeDefined()
  const mouse = createMockMouse(app!.renderer)
  await mouse.click(chip!.x - 2, chip!.y)
  await app!.renderOnce()
  // No provider → chips remain key hints; nothing to dispatch, nothing crashes.
  expect(app!.captureCharFrame()).toContain("approve once")
})
