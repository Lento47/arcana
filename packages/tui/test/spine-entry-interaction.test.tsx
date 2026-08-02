/** @jsxImportSource @opentui/solid */
import { testRender, type JSX } from "@opentui/solid"
import { MouseButton } from "@opentui/core"
import { expect, test } from "bun:test"
import { createSignal } from "solid-js"
import { ThemeProvider } from "../src/context/theme"
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
                    <ThemeProvider mode="dark">{component()}</ThemeProvider>
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

async function renderSettled(app: Awaited<ReturnType<typeof testRender>>) {
  await app.renderOnce()
  await new Promise((resolve) => setTimeout(resolve, 50))
  await app.flush()
  await app.renderOnce()
}

async function capture(app: Awaited<ReturnType<typeof testRender>>) {
  await renderSettled(app)
  // Wait for a STABLE frame, not just the first non-empty one: under parallel
  // suite load a header/body paint can land in separate frames, and returning
  // the first non-empty frame then races the body mount (observed flake:
  // disclosure updated to "▾" while "full reasoning body" had not painted yet).
  let last = ""
  for (let attempt = 0; attempt < 10; attempt++) {
    const frame = app.captureCharFrame()
    if (frame.trim().length > 0 && frame === last) return frame
    last = frame
    await new Promise((resolve) => setTimeout(resolve, 50))
    await app.renderOnce()
  }
  return app.captureCharFrame()
}

/** Poll until a frame containing `text` paints (body mounts can lag the
 *  header disclosure under parallel suite load — see capture() note). */
async function captureUntil(app: Awaited<ReturnType<typeof testRender>>, text: string) {
  for (let attempt = 0; attempt < 20; attempt++) {
    await renderSettled(app)
    const frame = app.captureCharFrame()
    if (frame.includes(text)) return frame
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
  let focusCount = 0
  let toggleCount = 0

  const app = await testRender(
    () =>
      withProviders(() => {
        const [expanded, setExpanded] = createSignal(false)
        const [focused, setFocused] = createSignal(false)
        return (
          <box flexDirection="column" width="100%" height="100%">
            <SpineEntry
              entry={thinkEntry}
              layout="wide"
              thinkContentWidth={70}
              expanded={expanded()}
              focused={focused()}
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
    // Collapsed thinking is progressive: verb + duration, not the monologue.
    const header = findText(initialFrame, "Thought")

    await app.mockMouse.moveTo(header.x, header.y)
    await app.mockMouse.click(header.x, header.y, MouseButton.RIGHT)
    await renderSettled(app)

    // M4: the row's onMouseUp was removed, so the right-click toggle path fires
    // onFocus exactly once (handleToggle) — no leaked row-mouseup second fire.
    expect(focusCount).toBe(1)
    expect(toggleCount).toBe(1)
    const expandedFrame = await captureUntil(app, "full reasoning body")
    expect(expandedFrame).toContain("reasoning header")
    expect(expandedFrame).toContain("full reasoning body")
  } finally {
    app.renderer.destroy()
  }
})
test("spine entry right-click toggles reasoning with local state", async () => {
  const app = await testRender(
    () =>
      withProviders(() => (
        <box flexDirection="column" width="100%" height="100%">
          <SpineEntry entry={thinkEntry} layout="wide" thinkContentWidth={70} />
        </box>
      )),
    { width: 80, height: 12, useMouse: true, enableMouseMovement: true },
  )

  try {
    const initialFrame = await capture(app)
    expect(initialFrame).not.toContain("full reasoning body")
    const header = findText(initialFrame, "Thought")

    await app.mockMouse.click(header.x, header.y, MouseButton.RIGHT)
    await renderSettled(app)

    const expandedFrame = await captureUntil(app, "full reasoning body")
    expect(expandedFrame).toContain("reasoning header")
    expect(expandedFrame).toContain("full reasoning body")
  } finally {
    app.renderer.destroy()
  }
})

test("plain row click fires onFocus exactly once (M4: no double on mousedown+up)", async () => {
  let focusCount = 0

  const app = await testRender(
    () =>
      withProviders(() => (
        <box flexDirection="column" width="100%" height="100%">
          <SpineEntry
            entry={thinkEntry}
            layout="wide"
            onFocus={() => {
              focusCount++
            }}
          />
        </box>
      )),
    { width: 80, height: 12, useMouse: true, enableMouseMovement: true },
  )

  try {
    const initialFrame = await capture(app)
    const header = findText(initialFrame, "Thought")

    // Click in the left gutter column — outside the toggleable header box — so
    // only the row box handlers fire. mockMouse.click dispatches mousedown,
    // then mouseup (core/testing.js:383-387). A single sequence must fire
    // onFocus once; before M4 it fired twice (down + up both → handleFocus).
    await app.mockMouse.click(1, header.y, MouseButton.LEFT)
    await renderSettled(app)

    expect(focusCount).toBe(1)
  } finally {
    app.renderer.destroy()
  }
})

test("left-click on a collapsed governance block expands it and keeps focus", async () => {
  const groupEntry: SpineEntryModel = {
    id: "governance-group:g1",
    index: 1,
    elapsed: "",
    kind: "ok",
    glyph: "✓",
    label: "governed",
    summary: "4 governed actions · 1 authorized · 1 executed",
    collapsible: true,
    expandedByDefault: false,
    children: [
      {
        id: "governance:e1",
        index: 0,
        elapsed: "",
        kind: "inspect",
        glyph: "◇",
        label: "authorization",
        summary: "Authorization requested",
        collapsible: true,
        expandedByDefault: false,
        source: { messageID: "e1", kind: "governance" },
      },
      {
        id: "governance:e2",
        index: 0,
        elapsed: "",
        kind: "ok",
        glyph: "✓",
        label: "authorized",
        summary: "Authorization allowed",
        collapsible: true,
        expandedByDefault: false,
        source: { messageID: "e2", kind: "governance" },
      },
    ],
    source: { messageID: "g1", kind: "governance" },
  }
  let toggleCount = 0
  let focusCount = 0

  const app = await testRender(
    () =>
      withProviders(() => {
        const [expanded, setExpanded] = createSignal(false)
        const [focused, setFocused] = createSignal(false)
        return (
          <box flexDirection="column" width="100%" height="100%">
            <SpineEntry
              entry={groupEntry}
              layout="wide"
              contentWidth={70}
              expanded={expanded()}
              focused={focused()}
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
    expect(initialFrame).not.toContain("Authorization requested")
    const header = findText(initialFrame, "4 governed actions")
    await app.mockMouse.click(header.x + 3, header.y, MouseButton.LEFT)
    await renderSettled(app)

    expect(toggleCount).toBe(1)
    expect(focusCount).toBeGreaterThanOrEqual(1)
    const expandedFrame = await captureUntil(app, "Authorization requested")
    expect(expandedFrame).toContain("Authorization requested")
    expect(expandedFrame).toContain("Authorization allowed")
  } finally {
    app.renderer.destroy()
  }
})
