/** @jsxImportSource @opentui/solid */
import { afterEach, describe, expect, test } from "bun:test"
import { testRender, type JSX } from "@opentui/solid"
import { createSignal } from "solid-js"
import { ArgsProvider } from "../src/context/args"
import { ExitProvider } from "../src/context/exit"
import { KVProvider } from "../src/context/kv"
import { ProjectProvider } from "../src/context/project"
import { SDKProvider } from "../src/context/sdk"
import { SyncProvider } from "../src/context/sync"
import { ThemeProvider } from "../src/context/theme"
import { TuiConfigProvider } from "../src/config"
import { ToastProvider } from "../src/ui/toast"
import { TestTuiContexts } from "./fixture/tui-environment"
import { createTuiResolvedConfig } from "./fixture/tui-runtime"
import { createEventSource, createFetch, directory } from "./fixture/tui-sdk"
import { SpineChatCard } from "../src/shell/command-spine/spine-chat"
import { getSpineLayout } from "../src/shell/command-spine/spine-types"

let app: Awaited<ReturnType<typeof testRender>> | undefined
afterEach(() => {
  app?.renderer.destroy()
  app = undefined
})

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

const FULL =
  "I can help with Arcana project work:\n\n**Core capabilities:**\n- Read/write/edit files (surgical edits, wholesale replacements)\n- Search code (grep, glob for pattern/location finding)\n- Run commands (TypeScript checks, tests, builds)\n- Git operations (status, commit, push, merge)\n- Effect/TSE/ML code modifications\n\n**Advanced features:**\n- Delegate parallel tasks via subagents\n- Store facts/skills in persistent memory\n- Connect to MCP servers\n- Execute multi-step workflows\n- Maintain task lists for multi-step work\n\n**Project conventions I follow:**\n- Effect.gen, Schema.Class patterns\n- TypeScript 7.x, Turborepo, Bun\n- AGENTS.md guidelines per package\n- Single-place exports, no barrel indexes\n- Minimal correct edits, no fluff\n\nWhat are you working on? I can start immediately."

async function pump() {
  for (let attempt = 0; attempt < 30; attempt++) {
    await app!.renderOnce()
    await app!.flush()
    await Bun.sleep(5)
  }
}

async function renderChat(opts: { width: number; streaming?: boolean; contentWidth?: number }) {
  const [text, setText] = createSignal("")
  const [streaming, setStreaming] = createSignal(opts.streaming ?? false)
  const [cw, setCw] = createSignal<number | undefined>(opts.contentWidth)
  const layout = getSpineLayout(opts.width)
  app = await testRender(
    () =>
      withProviders(() => (
        <box width="100%" height="100%" flexDirection="column" paddingLeft={2} paddingRight={2}>
          <SpineChatCard
            kind="plan"
            text={text()}
            layout={layout}
            streaming={streaming()}
            contentWidth={cw()}
          />
        </box>
      )),
    { width: opts.width, height: 40 },
  )
  await pump()
  return { setText, setStreaming, setCw }
}

describe("chat wrap regression", () => {
  test("full text at width 100, contentWidth present from start", async () => {
    const { setText } = await renderChat({ width: 100, contentWidth: 90 })
    setText(FULL)
    await pump()
    const frame = app!.captureCharFrame()
    // First paragraph must be on ONE line
    expect(frame).toContain("I can help with Arcana project work:")
    expect(frame).not.toContain("I can help with\n")
  })

  test("streaming: contentWidth undefined first, then 90 — first paragraph must not split", async () => {
    // Regression: parseMarkdownIncremental reused "I can help with" as a stable
    // paragraph token when the content grew, then lexed the remainder
    // " Arcana project work:..." as a separate paragraph — the first paragraph
    // rendered as two blocks ("I can help with" / " Arcana project work:").
    const { setText, setCw } = await renderChat({ width: 100 })
    // First paint: contentWidth undefined -> wrapCols 1
    setText("I can help with")
    await pump()
    // contentWidth becomes available
    setCw(90)
    await pump()
    // Full text streams in
    setText(FULL)
    await pump()
    const frame = app!.captureCharFrame()
    expect(frame).toContain("I can help with Arcana project work:")
    expect(frame).not.toContain("I can help with\n")
  })

  /**
   * Contraction at the wrap boundary.
   *
   * Two `.arcana/learned/` notes claim the renderer "treats apostrophes as
   * word/token boundaries", rendering `here's` as `here` / `'s`. That diagnosis
   * was inferred, never reproduced — and it does not hold: neither the plain
   * `wrapMode="word"` text path nor `<markdown>` breaks inside a word at an
   * apostrophe. This pins the real behaviour so the note cannot quietly become
   * true later, and so nobody re-diagnoses the same symptom from scratch.
   *
   * contentWidth 23 leaves the body 20 columns (minus the 3-cell marker), which
   * is exactly the adversarial case: 20 columns fit "alpha beta gamma here",
   * so an apostrophe-breaking wrapper would drop `'s` to the next line.
   */
  test("a contraction landing on the wrap boundary is not split at the apostrophe", async () => {
    const { setText } = await renderChat({ width: 100, contentWidth: 23 })
    setText("alpha beta gamma here's omega")
    await pump()
    const frame = app!.captureCharFrame()
    const lines = frame.split("\n").map((line) => line.trimEnd())

    // The wrap happened, and it happened after the whole contraction.
    expect(lines.filter((line) => line.length > 0).length).toBeGreaterThan(1)
    expect(lines.some((line) => line.includes("here's") && line.includes("omega"))).toBe(true)
    // The failure shape the notes describe: a line ending at "here" with the
    // orphaned "'s" opening the next.
    expect(
      lines.some((line, i) => line.endsWith("here") && (lines[i + 1] ?? "").trimStart().startsWith("'s")),
    ).toBe(false)
  })

  test("a hyphenated compound may break after the hyphen, which is not the same defect", async () => {
    // Documents where the boundary genuinely is: `well-known` is a legal break
    // point (both halves stay readable, and it is standard terminal behaviour).
    // A contraction is not, because the apostrophe is inside the word.
    const { setText } = await renderChat({ width: 100, contentWidth: 23 })
    setText("alpha beta gamma well-known omega")
    await pump()
    expect(app!.captureCharFrame()).toContain("well-known")
  })
})
