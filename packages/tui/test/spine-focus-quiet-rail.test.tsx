/** @jsxImportSource @opentui/solid */
/**
 * Quiet Rail — focus is structural, not a wash.
 *
 * Focus used to repaint the whole row (tint toward backgroundElement) and add
 * a left border for non-chat rows; chat rows lost their card fill entirely.
 * Quiet Rail: chat prose gets NO row fill (hairline + marker glyph carry
 * focus), dense rows get a whisper fill, and focus never changes geometry —
 * focused and unfocused frames must render identical characters.
 *
 * These are rendered contracts: colors come from `captureSpans`, characters
 * from `captureCharFrame`.
 */
import { expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { createSignal, type Setter } from "solid-js"
import { ArgsProvider } from "../src/context/args"
import { ExitProvider } from "../src/context/exit"
import { SDKProvider } from "../src/context/sdk"
import { ProjectProvider } from "../src/context/project"
import { SyncProvider } from "../src/context/sync"
import { SpineEntryBinding } from "../src/shell/command-spine/spine-entry-binding"
import type { SpineEntry } from "../src/shell/command-spine/spine-types"
import { fallbackTheme } from "../src/theme"
import { tint } from "../src/theme/emphasis"
import { TestTuiProviders } from "./fixture/tui-providers"
import { createEventSource, createFetch, directory } from "./fixture/tui-sdk"

type Span = { text: string; fg: unknown; bg: unknown }

/** RGBA spans arrive as an indexed 4-byte buffer, not as floats. */
function ints(color: unknown): number[] | undefined {
  const buffer = (color as { buffer?: Record<number, number> } | undefined)?.buffer
  if (!buffer) return undefined
  return [buffer[0]!, buffer[1]!, buffer[2]!, buffer[3]!]
}

const THEME = fallbackTheme("dark")
const WHISPER = ints(tint(THEME.background, THEME.backgroundElement, 0.3))!.join(",")

function allSpans(app: Awaited<ReturnType<typeof testRender>>): Span[] {
  return app
    .captureSpans()
    .lines.flatMap((line: { spans: Span[] }) => line.spans)
    .filter((span) => span.text.trim().length > 0)
}

function bgSet(app: Awaited<ReturnType<typeof testRender>>): Set<string> {
  return new Set(allSpans(app).map((span) => ints(span.bg)?.join(",") ?? "none"))
}

function spanWith(app: Awaited<ReturnType<typeof testRender>>, needle: string): Span | undefined {
  return allSpans(app).find((span) => span.text.includes(needle))
}

async function settle(app: Awaited<ReturnType<typeof testRender>>, iterations = 8, ms = 30) {
  for (let i = 0; i < iterations; i++) {
    await app.renderOnce()
    await new Promise((resolve) => setTimeout(resolve, ms))
    await app.flush()
  }
}

const CHAT: SpineEntry = {
  id: "e-chat-quiet-rail",
  index: 1,
  elapsed: "",
  timestamp: "12:00",
  kind: "plan",
  label: "arcana",
  glyph: "✦",
  summary: "A focused block should signal with the rail, not a wash of color.",
  streaming: false,
}

const TOOL: SpineEntry = {
  id: "e-tool-quiet-rail",
  index: 2,
  elapsed: "+1s",
  kind: "inspect",
  label: "read",
  glyph: "▸",
  summary: "src/auth.ts",
  streaming: false,
}

async function renderEntry(entry: SpineEntry) {
  let setFocused!: Setter<boolean>
  const app = await testRender(
    () => (
      <TestTuiProviders>
        <ExitProvider exit={() => {}}>
          <ArgsProvider>
            <SDKProvider url="http://test" directory={directory} fetch={createFetch().fetch} events={createEventSource().source}>
              <ProjectProvider>
                <SyncProvider>
                  {(() => {
                    const [focused, set] = createSignal(false)
                    setFocused = set
                    return (
                      <box width="100%" height="100%" flexDirection="column">
                        <SpineEntryBinding
                          getEntry={() => entry}
                          layout="wide"
                          expanded={true}
                          focused={focused()}
                        />
                      </box>
                    )
                  })()}
                </SyncProvider>
              </ProjectProvider>
            </SDKProvider>
          </ArgsProvider>
        </ExitProvider>
      </TestTuiProviders>
    ),
    { width: 100, height: 10 },
  )
  return { app, setFocused: (value: boolean) => setFocused(value) }
}

test("chat prose focus adds no row fill and keeps geometry", async () => {
  const { app, setFocused } = await renderEntry(CHAT)
  try {
    await settle(app)
    const beforeChars = app.captureCharFrame()
    const beforeBg = bgSet(app)
    const beforeGlyph = ints(spanWith(app, "✦")?.fg)

    setFocused(true)
    await settle(app)
    const afterChars = app.captureCharFrame()
    const afterBg = bgSet(app)
    const afterGlyph = ints(spanWith(app, "✦")?.fg)

    // Quiet Rail: no border, no band — the frame is character-identical.
    expect(afterChars).toBe(beforeChars)
    // No background token that was not already present.
    for (const bg of afterBg) expect(beforeBg.has(bg)).toBe(true)
    expect(afterBg.has(WHISPER)).toBe(false)
    // The marker glyph carries the focus signal.
    expect(afterGlyph).toEqual(ints(THEME.accent))
    expect(beforeGlyph).not.toEqual(ints(THEME.accent))
  } finally {
    app.renderer.destroy()
  }
})

test("tool rows focus with a whisper fill, not a border", async () => {
  const { app, setFocused } = await renderEntry(TOOL)
  try {
    await settle(app)
    const beforeChars = app.captureCharFrame()
    const beforeBg = bgSet(app)
    expect(beforeBg.has(WHISPER)).toBe(false)

    setFocused(true)
    await settle(app)
    const afterChars = app.captureCharFrame()
    const afterBg = bgSet(app)

    // Geometry is stable: the old focus border would have shifted a column.
    expect(afterChars).toBe(beforeChars)
    // The whisper fill is present…
    expect(afterBg.has(WHISPER)).toBe(true)
    // …and the leading rail turns accent.
    expect(ints(spanWith(app, "▸")?.fg)).toEqual(ints(THEME.accent))
  } finally {
    app.renderer.destroy()
  }
})
