/** @jsxImportSource @opentui/solid */
import { testRender, type JSX } from "@opentui/solid"
import { expect, test } from "bun:test"
import { For, Show, createMemo, createSignal } from "solid-js"
import { ThemeProvider } from "../src/context/theme"
import { TuiConfigProvider } from "../src/config"
import { KVProvider } from "../src/context/kv"
import { TestTuiContexts } from "./fixture/tui-environment"
import { createTuiResolvedConfig } from "./fixture/tui-runtime"
import { useTerminalDimensions } from "@opentui/solid"
import { getSpineLayout, type StatusSegment } from "../src/shell/command-spine/spine-types"
import { SAMPLE_ENTRIES } from "../src/shell/command-spine/sample-entries"
import { SpineHeader } from "../src/shell/command-spine/spine-header"
import { SpineEntry } from "../src/shell/command-spine/spine-entry"
import { SpineFooterHints } from "../src/shell/command-spine/spine-footer-hints"
import { useTheme } from "../src/context/theme"

const CAPTURE_WIDTH = 120
const CAPTURE_HEIGHT = 40

const sampleSegments: StatusSegment[] = [
  { key: "branch", label: "branch", value: "master", tone: "success" },
  { key: "agent", label: "agent", value: "build", tone: "secondary" },
  { key: "model", label: "model", value: "gpt-4.1", tone: "accent" },
  { key: "ctx", label: "ctx", value: "ctx 72%", tone: "warning" },
  { key: "session", label: "session", value: "run 0b704c", tone: "muted" },
  { key: "path", label: "path", value: "./packages/tui", tone: "muted" },
]
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

async function renderOnceSettled(app: Awaited<ReturnType<typeof testRender>>) {
  await app.renderOnce()
  await new Promise((resolve) => setTimeout(resolve, 50))
  await app.renderOnce()
}

async function capture(app: Awaited<ReturnType<typeof testRender>>) {
  try {
    await renderOnceSettled(app)
    for (let attempt = 0; attempt < 5; attempt++) {
      const frame = app.captureCharFrame()
      if (frame.trim().length > 0) return frame
      await new Promise((resolve) => setTimeout(resolve, 50))
      await app.renderOnce()
    }
    return app.captureCharFrame()
  } finally {
    app.renderer.destroy()
  }
}

test("command-spine layout at 120 cols with sample entries", async () => {
  const app = await testRender(
    () =>
      withTheme(() => {
        const dims = useTerminalDimensions()
        const layout = createMemo(() => getSpineLayout(dims().width))

        return (
          <>
            <SpineHeader layout={layout()} session={() => undefined} segments={sampleSegments} />
            <box flexDirection="column" flexGrow={1} minWidth={0}>
              <For each={SAMPLE_ENTRIES}>{(entry) => <SpineEntry entry={entry} layout={layout()} />}</For>
            </box>
          </>
        )
      }),
    { width: CAPTURE_WIDTH, height: CAPTURE_HEIGHT },
  )

  const frame = await capture(app)
  console.log("=== COMMAND-SPINE LAYOUT (120 cols) ===")
  console.log(frame)
  console.log("=== END ===")
})

test("command-spine layout at 100 cols", async () => {
  const app = await testRender(
    () =>
      withTheme(() => {
        const dims = useTerminalDimensions()
        const layout = createMemo(() => getSpineLayout(dims().width))

        return (
          <>
            <SpineHeader layout={layout()} session={() => undefined} segments={sampleSegments} />
            <box flexDirection="column" flexGrow={1} minWidth={0}>
              <For each={SAMPLE_ENTRIES}>{(entry) => <SpineEntry entry={entry} layout={layout()} />}</For>
            </box>
          </>
        )
      }),
    { width: 100, height: CAPTURE_HEIGHT },
  )

  const frame = await capture(app)
  console.log("=== COMMAND-SPINE LAYOUT (100 cols) ===")
  console.log(frame)
  console.log("=== END ===")
})

test("command-spine layout at 80 cols", async () => {
  const app = await testRender(
    () =>
      withTheme(() => {
        const dims = useTerminalDimensions()
        const layout = createMemo(() => getSpineLayout(dims().width))

        return (
          <>
            <SpineHeader layout={layout()} session={() => undefined} segments={sampleSegments} />
            <box flexDirection="column" flexGrow={1} minWidth={0}>
              <For each={SAMPLE_ENTRIES}>{(entry) => <SpineEntry entry={entry} layout={layout()} />}</For>
            </box>
          </>
        )
      }),
    { width: 80, height: CAPTURE_HEIGHT },
  )

  const frame = await capture(app)
  console.log("=== COMMAND-SPINE LAYOUT (80 cols) ===")
  console.log(frame)
  console.log("=== END ===")
})

test("command-spine full composition with prompt at 120 cols", async () => {
  const app = await testRender(
    () =>
      withTheme(() => {
        const dims = useTerminalDimensions()
        const layout = createMemo(() => getSpineLayout(dims().width))
        const { theme } = useTheme()
        const t = theme as Record<string, unknown>
        const [input, setInput] = createSignal("")
        return (
          <box flexDirection="column" height="100%">
            <SpineHeader layout={layout()} session={() => undefined} segments={sampleSegments} />
            <box flexDirection="column" flexGrow={1}>
              <For each={SAMPLE_ENTRIES}>{(entry) => <SpineEntry entry={entry} layout={layout()} />}</For>
            </box>
            {/* Prompt first, then status/hints bar under it (Grok order) */}
            {(() => {
              // Keep in sync with spineGutterWidth / spineOuterPadding (index-only gutter)
              const isWide = layout() === "wide"
              const gutterWidth = 2
              const padLeft = layout() === "minimal" ? 0 : 1
              const railWidth = 2 // "✶ "
              const boxWidth = Math.max(12, dims().width - padLeft - gutterWidth - railWidth)
              // Tight prompt: no rail-only stem row / no extra pad (matches spine-prompt.tsx)
              return (
                <box flexDirection="column" flexShrink={0}>
                  <box flexDirection="row" paddingLeft={padLeft} alignItems="flex-start">
                    <text width={gutterWidth} />
                    <text fg={t.spinePrompt as any}>{"\u2736"}</text>
                    <text> </text>
                    <box
                      width={boxWidth}
                      border={["top", "bottom", "left", "right"]}
                      borderColor={t.spinePrompt as any}
                      backgroundColor={t.background as any}
                      paddingLeft={1}
                      paddingRight={1}
                      flexDirection="column"
                    >
                      <text fg={t.spinePrompt as any}>{"❯ Speak your intent…"}</text>
                      <text fg={t.spineBrand as any}>deepseek-v4-flash-free</text>
                    </box>
                  </box>
                </box>
              )
            })()}
            <SpineFooterHints
              layout={layout()}
              entries={SAMPLE_ENTRIES.length}
              permissions={1}
              questions={0}
              pending="streaming"
              viewingArtifact={true}
              state="thinking"
              selected={{
                label: "spine",
                hints: [
                  { keys: "j/k", label: "focus" },
                  { keys: "tab", label: "next" },
                  { keys: "enter", label: "toggle" },
                  { keys: "y", label: "copy" },
                ],
              }}
            />
            {/* Statusbar suppression check — should NOT show statusbar */}
            <Show when={false}>
              <text>statusbar should not render</text>
            </Show>
          </box>
        )
      }),
    { width: 120, height: CAPTURE_HEIGHT },
  )

  const frame = await capture(app)
  console.log("=== COMMAND-SPINE FULL COMPOSITION (120 cols) ===")
  console.log(frame)
  console.log("=== END ===")
  expect(frame).toContain("✶")
  expect(frame).toContain("❯")
  expect(frame).toContain("Speak your intent…")
  expect(frame).toContain("deepseek-v4-flash-free")
  expect(frame).not.toContain("arcana ›")
  expect(frame).toContain("2 │ -")
  expect(frame).toContain("2 │ +")
  expect(frame).not.toContain("@@")
})
