/** @jsxImportSource @opentui/solid */
import { testRender, type JSX } from "@opentui/solid"
import { MouseButton } from "@opentui/core"
import { expect, test } from "bun:test"
import { createSignal } from "solid-js"
import { ThemeProvider } from "../src/context/theme"
import { TuiConfigProvider } from "../src/config"
import { KVProvider } from "../src/context/kv"
import { TestTuiContexts } from "./fixture/tui-environment"
import { createTuiResolvedConfig } from "./fixture/tui-runtime"
import { SpineEntry } from "../src/shell/command-spine/spine-entry"
import type { SpineEntry as SpineEntryModel } from "../src/shell/command-spine/spine-types"

function withTheme(component: () => JSX.Element) {
  return (
    <TestTuiContexts>
      <TuiConfigProvider config={createTuiResolvedConfig()}>
        <KVProvider>
          <ThemeProvider mode="dark">{component()}</ThemeProvider>
        </KVProvider>
      </TuiConfigProvider>
    </TestTuiContexts>
  )
}

async function renderSettled(app: Awaited<ReturnType<typeof testRender>>) {
  await app.renderOnce()
  await new Promise((resolve) => setTimeout(resolve, 50))
  await app.flush()
  await app.renderOnce()
}

async function capture(app: Awaited<ReturnType<typeof testRender>>) {
  await renderSettled(app)
  for (let attempt = 0; attempt < 5; attempt++) {
    const frame = app.captureCharFrame()
    if (frame.trim().length > 0) return frame
    await new Promise((resolve) => setTimeout(resolve, 50))
    await app.renderOnce()
  }
  return app.captureCharFrame()
}

function findText(frame: string, text: string) {
  const lines = frame.split("\n")
  const y = lines.findIndex((line) => line.includes(text))
  expect(y).toBeGreaterThanOrEqual(0)
  return { x: Math.max(0, lines[y].indexOf(text)), y }
}

const thinkEntry: SpineEntryModel = {
  id: "think-entry",
  index: 1,
  elapsed: "",
  kind: "think",
  label: "",
  glyph: "?",
  summary: "reasoning header",
  body: "full reasoning body",
  collapsible: true,
  expandedByDefault: false,
}

test("spine entry hover highlights and right-click expands collapsible thinking", async () => {
  let hoverCount = 0
  let focusCount = 0
  let toggleCount = 0

  const app = await testRender(
    () =>
      withTheme(() => {
        const [expanded, setExpanded] = createSignal(false)
        const [focused, setFocused] = createSignal(false)
        return (
          <box flexDirection="column" width="100%" height="100%">
            <SpineEntry
              entry={thinkEntry}
              layout="wide"
              expanded={expanded()}
              focused={focused()}
              onHover={() => {
                hoverCount++
                setFocused(true)
              }}
              onFocus={() => {
                focusCount++
                setFocused(true)
              }}
              onToggle={() => {
                toggleCount++
                setExpanded((value) => !value)
              }}
            />
          </box>
        )
      }),
    { width: 80, height: 12, useMouse: true, enableMouseMovement: true },
  )

  try {
    const initialFrame = await capture(app)
    const header = findText(initialFrame, "reasoning header")

    await app.mockMouse.moveTo(header.x, header.y)
    await renderSettled(app)
    expect(hoverCount).toBeGreaterThan(0)

    await app.mockMouse.click(header.x, header.y, MouseButton.RIGHT)
    await renderSettled(app)

    expect(focusCount).toBeGreaterThan(0)
    expect(toggleCount).toBe(1)
    expect(await capture(app)).toContain("full reasoning body")
  } finally {
    app.renderer.destroy()
  }
})
test("spine entry right-click toggles reasoning with local state", async () => {
  const app = await testRender(
    () =>
      withTheme(() => (
        <box flexDirection="column" width="100%" height="100%">
          <SpineEntry entry={thinkEntry} layout="wide" />
        </box>
      )),
    { width: 80, height: 12, useMouse: true, enableMouseMovement: true },
  )

  try {
    const initialFrame = await capture(app)
    expect(initialFrame).not.toContain("full reasoning body")
    const header = findText(initialFrame, "reasoning header")

    await app.mockMouse.click(header.x, header.y, MouseButton.RIGHT)
    await renderSettled(app)

    expect(await capture(app)).toContain("full reasoning body")
  } finally {
    app.renderer.destroy()
  }
})