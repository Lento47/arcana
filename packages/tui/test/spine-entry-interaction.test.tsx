/** @jsxImportSource @opentui/solid */
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

test("right-click opens entry actions without changing disclosure", async () => {
  let focusCount = 0
  let toggleCount = 0
  let contextCount = 0

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
              onContextMenu={() => {
                contextCount++
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

    expect(focusCount).toBe(1)
    expect(contextCount).toBe(1)
    expect(toggleCount).toBe(0)
    expect(await capture(app)).not.toContain("full reasoning body")
  } finally {
    app.renderer.destroy()
  }
})
test("right-click without a menu handler still does not toggle local disclosure", async () => {
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

    expect(await capture(app)).not.toContain("full reasoning body")
  } finally {
    app.renderer.destroy()
  }
})

test("left-click anywhere on a collapsed thinking row expands it", async () => {
  let toggleCount = 0
  const app = await testRender(
    () =>
      withProviders(() => {
        const [expanded, setExpanded] = createSignal(false)
        return (
          <box flexDirection="column" width="100%" height="100%">
            <SpineEntry
              entry={thinkEntry}
              layout="wide"
              thinkContentWidth={70}
              expanded={expanded()}
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
    const header = findText(initialFrame, "Thought")
    await app.mockMouse.click(1, header.y, MouseButton.LEFT)

    expect(await captureUntil(app, "full reasoning body")).toContain("full reasoning body")
    expect(toggleCount).toBe(1)
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

test("activity reel expands once and exposes the original work steps", async () => {
  const activityEntry: SpineEntryModel = {
    id: "activity:turn-1",
    index: 1,
    elapsed: "+1.2s",
    kind: "think",
    glyph: "●",
    label: "work",
    summary: "3 steps · 2 tools · 1 thought",
    collapsible: true,
    expandedByDefault: false,
    streaming: true,
    activity: { type: "work", turnID: "turn-1", childCount: 3 },
    source: { messageID: "turn-1", kind: "reasoning" },
    children: [
      {
        id: "think-1",
        index: 1,
        elapsed: "",
        kind: "think",
        glyph: "●",
        label: "think",
        summary: "Plan the change",
        streaming: true,
        source: { messageID: "turn-1", kind: "reasoning" },
      },
      {
        id: "run-1",
        index: 2,
        elapsed: "+400ms",
        kind: "run",
        glyph: "✓",
        label: "run",
        summary: "bun test packages/tui",
        source: { messageID: "turn-1", kind: "tool" },
      },
      {
        id: "inspect-1",
        index: 3,
        elapsed: "+600ms",
        kind: "inspect",
        glyph: "✓",
        label: "inspect",
        summary: "packages/tui/src",
        source: { messageID: "turn-1", kind: "tool" },
      },
    ],
  }
  let toggleCount = 0
  const app = await testRender(
    () => withProviders(() => {
      const [expanded, setExpanded] = createSignal(false)
      return (
        <box flexDirection="column" width="100%" height="100%">
          <SpineEntry
            entry={activityEntry}
            layout="wide"
            contentWidth={70}
            expanded={expanded()}
            focused
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
    expect(initial).toContain("working")
    expect(initial).toContain("show 3 steps")
    expect(initial).not.toContain("[1/3]")
    expect(initial).not.toContain("‹")
    expect(initial).not.toContain("›")
    expect(initial).not.toContain("bun test packages/tui")

    // A live turn refreshes its elapsed duration, but the summary never
    // rotates through child details or wraps back to an earlier step.
    await new Promise((resolve) => setTimeout(resolve, 700))
    const later = await capture(app)
    expect(later).toContain("working")
    expect(later).toContain("show 3 steps")
    expect(later).not.toContain("[2/3]")
    expect(later).not.toContain("[3/3]")
    expect(later).not.toContain("‹")
    expect(later).not.toContain("›")

    const summary = findText(initial, "3 steps")
    await app.mockMouse.click(summary.x, summary.y, MouseButton.LEFT)

    const expanded = await captureUntil(app, "bun test packages/tui")
    expect(toggleCount).toBe(1)
    expect(expanded).toContain("Plan the change")
    expect(expanded).toContain("bun test packages/tui")
    expect(expanded).toContain("packages/tui/src")
    expect(expanded).toContain("hide 3 steps")
  } finally {
    app.renderer.destroy()
  }
})

test("subagent title opens its session while the disclosure toggles its preview", async () => {
  const agentEntry: SpineEntryModel = {
    id: "agent-entry",
    index: 1,
    elapsed: "+1.4s",
    kind: "agent",
    glyph: "↳",
    label: "review",
    summary: "Inspect authority boundaries",
    body: "Returned review summary",
    collapsible: true,
    expandedByDefault: false,
    source: { messageID: "agent-message", partID: "agent-part", sessionID: "child-session", kind: "agent" },
  }
  let navigateCount = 0
  let toggleCount = 0

  const app = await testRender(
    () => withProviders(() => {
      const [expanded, setExpanded] = createSignal(false)
      return (
        <box flexDirection="column" width="100%" height="100%">
          <SpineEntry
            entry={agentEntry}
            layout="wide"
            contentWidth={70}
            expanded={expanded()}
            onToggle={() => {
              toggleCount++
              setExpanded((value) => !value)
            }}
            onNavigate={() => {
              navigateCount++
            }}
          />
        </box>
      )
    }),
    { width: 100, height: 14, useMouse: true, enableMouseMovement: true },
  )

  try {
    const initial = await capture(app)
    const title = findText(initial, "Inspect authority boundaries")
    await app.mockMouse.click(title.x + 3, title.y, MouseButton.LEFT)
    await renderSettled(app)
    expect(navigateCount).toBe(1)
    expect(toggleCount).toBe(0)

    const row = (await capture(app)).split("\n")[title.y] ?? ""
    const disclosureX = row.lastIndexOf("▸")
    expect(disclosureX).toBeGreaterThanOrEqual(0)
    await app.mockMouse.click(disclosureX, title.y, MouseButton.LEFT)
    await renderSettled(app)

    expect(navigateCount).toBe(1)
    expect(toggleCount).toBe(1)
    expect(await captureUntil(app, "Returned review summary")).toContain("Returned review summary")
  } finally {
    app.renderer.destroy()
  }
})
