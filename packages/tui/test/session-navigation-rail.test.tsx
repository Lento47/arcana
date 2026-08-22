/** @jsxImportSource @opentui/solid */
import { MouseButton } from "@opentui/core"
import { testRender, type JSX } from "@opentui/solid"
import { expect, test } from "bun:test"
import { ThemeProvider } from "../src/context/theme"
import { KVProvider } from "../src/context/kv"
import { ToastProvider } from "../src/ui/toast"
import { TuiConfigProvider } from "../src/config"
import { TestTuiContexts } from "./fixture/tui-environment"
import { createTuiResolvedConfig } from "./fixture/tui-runtime"
import { SpineNavigationRail } from "../src/shell/command-spine/session-navigation-rail"

function withTheme(component: () => JSX.Element) {
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

async function settle(app: Awaited<ReturnType<typeof testRender>>) {
  let previous = ""
  for (let attempt = 0; attempt < 40; attempt++) {
    await app.renderOnce()
    const frame = app.captureCharFrame()
    if (frame.trim() && frame === previous) return frame
    previous = frame
    await Bun.sleep(20)
  }
  return app.captureCharFrame()
}

function findText(frame: string, text: string) {
  const lines = frame.split("\n")
  const y = lines.findIndex((line) => line.includes(text))
  expect(y).toBeGreaterThanOrEqual(0)
  return { x: Math.max(0, lines[y]!.indexOf(text)), y }
}

const sessions = [
  { id: "root", title: "Fix stuck agent", time: { created: 1 } },
  { id: "research", parentID: "root", title: "Research (@research subagent)", time: { created: 2 } },
  { id: "review", parentID: "root", title: "Review (@review subagent)", time: { created: 3 } },
]

test("renders the repository and actionable session trail as one rail", async () => {
  const app = await testRender(
    () => withTheme(() => (
      <SpineNavigationRail
        layout="wide"
        width={112}
        path="L:/PROJECTS/arcana/packages/tui"
        session={sessions[2]!}
        sessions={sessions}
      />
    )),
    { width: 120, height: 4 },
  )
  try {
    const frame = await settle(app)
    expect(frame).toContain("⌂ arcana ▸ … ▸ tui │ ◇ Fix stuck agent ▸ @review ‹ 2/2 › ↑")
  } finally {
    app.renderer.destroy()
  }
})

test("routes mouse actions to ancestor, sibling, and parent callbacks", async () => {
  const calls: string[] = []
  const app = await testRender(
    () => withTheme(() => (
      <SpineNavigationRail
        layout="wide"
        width={112}
        session={sessions[2]!}
        sessions={sessions}
        onNavigate={(id) => calls.push(`navigate:${id}`)}
        onPrevious={() => calls.push("previous")}
        onNext={() => calls.push("next")}
        onParent={() => calls.push("parent")}
      />
    )),
    { width: 120, height: 4, useMouse: true, enableMouseMovement: true },
  )
  try {
    const frame = await settle(app)
    for (const [label, offset] of [["Fix stuck agent", 2], ["‹", 0], ["›", 0], ["↑", 0]] as const) {
      const point = findText(frame, label)
      await app.mockMouse.click(point.x + offset, point.y, MouseButton.LEFT)
    }
    expect(calls).toEqual(["navigate:root", "previous", "next", "parent"])
  } finally {
    app.renderer.destroy()
  }
})
