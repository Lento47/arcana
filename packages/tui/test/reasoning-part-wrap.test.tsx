/** @jsxImportSource @opentui/solid */
import { testRender, type JSX } from "@opentui/solid"
import { MouseButton } from "@opentui/core"
import { afterEach, describe, expect, test } from "bun:test"
import { createSignal } from "solid-js"
import { context as SessionRouteContext, ReasoningPart } from "../src/routes/session/index"
import { ThemeProvider } from "../src/context/theme"
import { ToastProvider } from "../src/ui/toast"
import { ArgsProvider } from "../src/context/args"
import { TuiConfigProvider } from "../src/config"
import { KVProvider } from "../src/context/kv"
import { TestTuiContexts } from "./fixture/tui-environment"
import { createTuiResolvedConfig } from "./fixture/tui-runtime"

// Exact reasoning payload observed in the live store (133 chars, finalized).
const REASONING_FULL =
  'The user said "hi" - a simple greeting. I should respond briefly and directly per the SOUL.md instructions (terse, direct, no fluff).'
// Mid-stream snapshot: the stream was still producing when the user copied.
const REASONING_PARTIAL =
  'The user said "hi" - a simple greeting. I should respond briefly and directly per the SOUL.md instructions (terse'
const TAIL = "direct, no fluff)"

let testSetup: Awaited<ReturnType<typeof testRender>> | undefined

afterEach(() => {
  testSetup?.renderer.destroy()
  testSetup = undefined
})

function makePart(text: string, ended: boolean) {
  const start = 1785527975049
  return {
    id: "prt_test",
    messageID: "msg_test",
    type: "reasoning",
    text,
    time: ended ? { start, end: start + 201 } : { start },
    metadata: {},
  } as any
}

function makeMessage(sessionID = "sess_test") {
  return { id: "msg_test", role: "assistant", sessionID } as any
}

function Harness(props: {
  part: () => any
  mode: () => "show" | "hide"
  terminalWidth: () => number
}) {
  return (
    <TestTuiContexts>
      <ArgsProvider>
        <TuiConfigProvider config={createTuiResolvedConfig()}>
          <KVProvider>
            <ToastProvider>
              <ThemeProvider mode="dark">
              <SessionRouteContext.Provider
                value={
                  {
                    // Mirrors the real Session: ctx.width = terminal width - 4.
                    width: props.terminalWidth() - 4,
                    sessionID: "sess_test",
                    conceal: () => false,
                    thinkingMode: props.mode,
                    showThinking: () => true,
                    showTimestamps: () => false,
                    showDetails: () => false,
                    showGenericToolOutput: () => false,
                    userMessageIDs: () => new Set(),
                    diffWrapMode: () => "word",
                    providers: () => new Map(),
                  } as any
                }
              >
                <box flexDirection="column" width="100%" height="100%">
                  <ReasoningPart last={true} part={props.part()} message={makeMessage()} />
                </box>
              </SessionRouteContext.Provider>
              </ThemeProvider>
            </ToastProvider>
          </KVProvider>
        </TuiConfigProvider>
      </ArgsProvider>
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

function occurrences(frame: string, needle: string) {
  return frame.split(needle).length - 1
}

describe("ReasoningPart wrap (session route)", () => {
  test("at 120 columns the full 133-char reasoning wraps onto multiple lines and shows the final words", async () => {
    const [part] = createSignal(makePart(REASONING_FULL, true))
    testSetup = await testRender(
      () => <Harness part={part} mode={() => "show"} terminalWidth={() => 120} />,
      { width: 120, height: 12 },
    )
    const frame = await capture(testSetup)

    expect(frame).toContain("The user said")
    expect(frame).toContain(TAIL)
    // Wrapped: the head and the tail must live on different rows.
    const headRow = frame.split("\n").findIndex((line) => line.includes("The user said"))
    const tailRow = frame.split("\n").findIndex((line) => line.includes(TAIL))
    expect(headRow).toBeGreaterThanOrEqual(0)
    expect(tailRow).toBeGreaterThan(headRow)
    // No duplication after time.end.
    expect(occurrences(frame, TAIL)).toBe(1)
    expect(occurrences(frame, "The user said")).toBe(1)
  })

  test("streaming shows partial content while the part is unfinished", async () => {
    const [part] = createSignal(makePart(REASONING_PARTIAL, false))
    testSetup = await testRender(
      () => <Harness part={part} mode={() => "show"} terminalWidth={() => 120} />,
      { width: 120, height: 12 },
    )
    const frame = await capture(testSetup)

    // The streamed-so-far text is visible, including its cut-off tail.
    // Assert on fragments: word-wrap may split the partial sentence anywhere.
    expect(frame).toContain("The user said")
    expect(frame).toContain("terse")
    expect(frame).not.toContain(TAIL)
  })

  test("after the final stream update the complete text becomes visible without duplication", async () => {
    const [part, setPart] = createSignal(makePart(REASONING_PARTIAL, false))
    testSetup = await testRender(
      () => <Harness part={part} mode={() => "show"} terminalWidth={() => 120} />,
      { width: 120, height: 12 },
    )
    expect(await capture(testSetup)).not.toContain(TAIL)

    // Final reasoning-delta arrives: full text + time.end.
    setPart(makePart(REASONING_FULL, true))
    const frame = await capture(testSetup)

    expect(frame).toContain(TAIL)
    expect(occurrences(frame, TAIL)).toBe(1)
  })

  test("minimal (hide) mode stays collapsed until the header is clicked", async () => {
    const [part] = createSignal(makePart(REASONING_FULL, true))
    testSetup = await testRender(
      () => <Harness part={part} mode={() => "hide"} terminalWidth={() => 120} />,
      { width: 120, height: 12, useMouse: true, enableMouseMovement: true },
    )
    const collapsed = await capture(testSetup)
    expect(collapsed).not.toContain("The user said")

    const rows = collapsed.split("\n")
    const y = rows.findIndex((line) => line.trim().length > 0)
    expect(y).toBeGreaterThanOrEqual(0)

    await testSetup.mockMouse.moveTo(4, y)
    await testSetup.mockMouse.click(4, y, MouseButton.LEFT)
    const expanded = await capture(testSetup)
    expect(expanded).toContain("The user said")
  })

  test("normal (show) mode remains expanded", async () => {
    const [part] = createSignal(makePart(REASONING_FULL, true))
    testSetup = await testRender(
      () => <Harness part={part} mode={() => "show"} terminalWidth={() => 120} />,
      { width: 120, height: 12 },
    )
    const frame = await capture(testSetup)
    expect(frame).toContain("The user said")
    expect(frame).toContain(TAIL)
  })

  test("widths 59, 80, 100, 120, and 180 render the complete text without throwing", async () => {
    for (const width of [59, 80, 100, 120, 180]) {
      const [part] = createSignal(makePart(REASONING_FULL, true))
      testSetup?.renderer.destroy()
      testSetup = await testRender(
        () => <Harness part={part} mode={() => "show"} terminalWidth={() => width} />,
        { width, height: 12 },
      )
      const frame = await capture(testSetup)
      expect(frame, `width ${width}`).toContain("The user said")
      expect(frame, `width ${width}`).toContain(TAIL)
      expect(occurrences(frame, TAIL)).toBe(1)
    }
  })

  test("degenerate width clamps reasoningBodyWidth so rendering never throws", async () => {
    const [part] = createSignal(makePart(REASONING_FULL, true))
    testSetup = await testRender(
      () => <Harness part={part} mode={() => "hide"} terminalWidth={() => 5} />,
      { width: 5, height: 12 },
    )
    // ctx.width = 1 → clamp → no crash, frame still renders the header.
    expect((await capture(testSetup)).trim().length).toBeGreaterThan(0)
  })

  test("resizing narrower and wider preserves the complete content", async () => {
    const [part] = createSignal(makePart(REASONING_FULL, true))
    const [width, setWidth] = createSignal(120)
    testSetup = await testRender(
      () => <Harness part={part} mode={() => "show"} terminalWidth={width} />,
      { width: 120, height: 12 },
    )

    expect(await capture(testSetup)).toContain(TAIL)

    // Terminal resize narrower: renderer + ctx.width stay in sync.
    testSetup.resize(80, 12)
    setWidth(80)
    await capture(testSetup)
    expect(testSetup.captureCharFrame()).toContain(TAIL)

    // Terminal resize wider.
    testSetup.resize(180, 12)
    setWidth(180)
    await capture(testSetup)
    expect(testSetup.captureCharFrame()).toContain(TAIL)
  })
})
