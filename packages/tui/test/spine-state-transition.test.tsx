/** @jsxImportSource @opentui/solid */
import { testRender, type JSX } from "@opentui/solid"
import { test, describe, expect } from "bun:test"
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
import { SpineRail } from "../src/shell/command-spine/spine-rail"
import { SpineGutterSpacer } from "../src/shell/command-spine/spine-lead"
import { useTheme } from "../src/context/theme"
import type { SpineRunState } from "../src/shell/command-spine/spine-footer-hints"

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

type StateHandle = {
  setState: (s: SpineRunState) => void
  setPending: (s: string) => void
}

async function renderOnceSettled(app: Awaited<ReturnType<typeof testRender>>) {
  await app.renderOnce()
  await new Promise((resolve) => setTimeout(resolve, 50))
  await app.renderOnce()
}

async function capture(app: Awaited<ReturnType<typeof testRender>>) {
  await renderOnceSettled(app)
  for (let attempt = 0; attempt < 5; attempt++) {
    const frame = app.captureCharFrame()
    if (frame.trim().length > 0) return frame
    await new Promise((resolve) => setTimeout(resolve, 50))
    await app.renderOnce()
  }
  return app.captureCharFrame()
}

describe("spine state transitions", () => {
  test("footer switches between idle and working trees, causing DOM replacement", async () => {
    // Use a mutable handle so signals declared inside testRender can be driven from outside
    const handle: StateHandle = { setState: () => {}, setPending: () => {} }

    const app = await testRender(
      () =>
        withTheme(() => {
          const [state, setState] = createSignal<SpineRunState>("idle")
          const [pending, setPending] = createSignal("")
          handle.setState = setState
          handle.setPending = setPending

          const dims = useTerminalDimensions()
          const layout = createMemo(() => getSpineLayout(dims().width))
          const { theme } = useTheme()
          const t = theme as Record<string, unknown>
          return (
            <box flexDirection="column" height="100%">
              <SpineHeader layout={layout()} session={() => undefined} segments={sampleSegments} />
              <box flexDirection="column" flexGrow={1}>
                <For each={SAMPLE_ENTRIES}>{(entry) => <SpineEntry entry={entry} layout={layout()} />}</For>
              </box>
              <SpineFooterHints
                layout={layout()}
                entries={SAMPLE_ENTRIES.length}
                pending={pending()}
                permissions={0}
                questions={0}
                viewingArtifact={false}
                state={state()}
              />
            </box>
          )
        }),
      { width: CAPTURE_WIDTH, height: CAPTURE_HEIGHT },
    )

    // Idle footer — renders minimal {height=1} box
    const idleFrame = await capture(app)
    console.log("=== IDLE FOOTER ===")
    console.log(idleFrame)
    console.log("=== END ===")

    // Transition to working — footer switches to completely different JSX tree
    // Idle: <box height=1><text>7 steps</text></box>
    // Working: <box><text>run</text><text>7</text><text>steps</text><text>  ·  </text>...
    handle.setState("working")
    handle.setPending("running tests")
    await renderOnceSettled(app)
    const workingFrame = app.captureCharFrame()
    console.log("=== WORKING FOOTER ===")
    console.log(workingFrame)
    console.log("=== END ===")

    // Verify footer content changed (not still showing idle "7 steps")
    const idleLast = idleFrame.trim().split("\n").filter(Boolean).at(-1) ?? ""
    const workingLast = workingFrame.trim().split("\n").filter(Boolean).at(-1) ?? ""
    console.log(`Idle last line:   ${JSON.stringify(idleLast)}`)
    console.log(`Working last line: ${JSON.stringify(workingLast)}`)
    const changed = idleLast !== workingLast
    console.log(`Footer content changed: ${changed}`)

    if (!changed) {
      console.log("WARNING: signals from test scope did not propagate — state transition not visible!")
    }

    app.renderer.destroy()
  })

  test("header segments swap session↔state causing layout width shift", async () => {
    const handle: { setSegments: (s: StatusSegment[]) => void } = { setSegments: () => {} }

    const baseSegments: StatusSegment[] = [
      { key: "branch", label: "branch", value: "master", tone: "success" },
      { key: "agent", label: "agent", value: "build", tone: "secondary" },
      { key: "model", label: "model", value: "gpt-4.1", tone: "accent" },
      { key: "ctx", label: "ctx", value: "ctx 72%", tone: "warning" },
    ]
    const idleSegments = [...baseSegments, { key: "session", label: "session", value: "run 0b704c", tone: "muted" as const }]
    const workingSegments = [...baseSegments, { key: "state", label: "state", value: "working", tone: "accent" as const }]

    const app = await testRender(
      () =>
        withTheme(() => {
          const [segments, setSegments] = createSignal<StatusSegment[]>(idleSegments)
          handle.setSegments = setSegments

          const dims = useTerminalDimensions()
          const layout = createMemo(() => getSpineLayout(dims().width))
          return (
            <box flexDirection="column" height="100%">
              <SpineHeader layout={layout()} session={() => undefined} segments={segments()} />
              <box flexGrow={1} />
            </box>
          )
        }),
      { width: CAPTURE_WIDTH, height: CAPTURE_HEIGHT },
    )

    // Capture header with "run 0b704c" (idle state)
    const idleFrame = await capture(app)
    console.log("=== HEADER: idle (session='run 0b704c') ===")
    const headerLineIdle = idleFrame.split("\n").filter(Boolean)[0] ?? ""
    console.log(headerLineIdle)
    console.log("=== END ===")

    // Swap to "working" state segment
    handle.setSegments(workingSegments)
    await renderOnceSettled(app)
    const workingFrame = app.captureCharFrame()
    console.log("=== HEADER: working (state='working') ===")
    const headerLineWorking = workingFrame.split("\n").filter(Boolean)[0] ?? ""
    console.log(headerLineWorking)
    console.log("=== END ===")

    // Compare header line lengths — they differ because "run 0b704c" vs "working" have different widths
    console.log(`Idle header length:    ${headerLineIdle.length}`)
    console.log(`Working header length: ${headerLineWorking.length}`)
    const sameLength = headerLineIdle.length === headerLineWorking.length
    console.log(`Same width: ${sameLength}`)
    if (!sameLength) {
      console.log("GLITCH: header width changes when state transitions — causes layout reflow")
      // The header has <box flexGrow={1}> between ARCANA and segments, so width change causes
      // visible shift in the gap
    }

    app.renderer.destroy()
  })

  test("spine prompt marker color changes instantly without transition", async () => {
    const handle: StateHandle = { setState: () => {}, setPending: () => {} }

    const app = await testRender(
      () =>
        withTheme(() => {
          const [state, setState] = createSignal<SpineRunState>("idle")
          const [pending, setPending] = createSignal("")
          handle.setState = setState
          handle.setPending = setPending

          const dims = useTerminalDimensions()
          const layout = createMemo(() => getSpineLayout(dims().width))
          const { theme } = useTheme()
          const t = theme as Record<string, unknown>
          // Marker-only stand-in (full SpinePrompt mounts Prompt + keymap; out of scope here).
          const markerColor = () => {
            if (state() === "stop") return (t.spineFail ?? t.error ?? t.spinePrompt) as any
            if (state() === "thinking") return (t.spineThink ?? t.spinePrompt) as any
            if (state() === "working") return (t.spineRun ?? t.spinePrompt) as any
            return (t.spinePrompt ?? t.primary) as any
          }
          return (
            <box flexDirection="column" height="100%">
              <SpineHeader layout={layout()} session={() => undefined} segments={sampleSegments} />
              <box flexDirection="column" flexGrow={1}>
                <For each={SAMPLE_ENTRIES}>{(entry) => <SpineEntry entry={entry} layout={layout()} />}</For>
              </box>
              <box flexDirection="row">
                <SpineGutterSpacer layout={layout()} />
                <SpineRail layout={layout()} glyph={"✶"} color={markerColor()} active />
                <text fg={markerColor() as any}>{state()}</text>
              </box>
            </box>
          )
        }),
      { width: CAPTURE_WIDTH, height: CAPTURE_HEIGHT },
    )

    // Capture idle prompt (plain ">" marker)
    await renderOnceSettled(app)
    const idleFrame = app.captureCharFrame()
    console.log("=== IDLE PROMPT ===")
    console.log(idleFrame)
    console.log("=== END ===")

    // Transition to working — marker color changes, pulse timer starts
    handle.setState("working")
    handle.setPending("working")
    await renderOnceSettled(app)
    const workingFrame = app.captureCharFrame()
    console.log("=== WORKING PROMPT ===")
    console.log(workingFrame)
    console.log("=== END ===")

    // Transition back to idle — pulse timer clears, marker resets to spinePrompt color
    handle.setState("idle")
    handle.setPending("")
    await renderOnceSettled(app)
    const idleFrame2 = app.captureCharFrame()
    console.log("=== IDLE PROMPT AFTER ===")
    console.log(idleFrame2)
    console.log("=== END ===")

    app.renderer.destroy()
  })

  test("spine header path line positioning shifts with segment width changes", async () => {
    const handle: { setSegments: (s: StatusSegment[]) => void } = { setSegments: () => {} }

    const baseSegments: StatusSegment[] = [
      { key: "branch", label: "branch", value: "master", tone: "success" },
      { key: "agent", label: "agent", value: "build", tone: "secondary" },
      { key: "model", label: "model", value: "gpt-4.1", tone: "accent" },
      { key: "ctx", label: "ctx", value: "ctx 72%", tone: "warning" },
    ]
    const shortSegments = [...baseSegments, { key: "state", label: "state", value: "working", tone: "accent" as const }]
    const longSegments = [...baseSegments, { key: "session", label: "session", value: "run abcdefgh", tone: "muted" as const }]

    const app = await testRender(
      () =>
        withTheme(() => {
          const [segments, setSegments] = createSignal<StatusSegment[]>(shortSegments)
          handle.setSegments = setSegments

          const dims = useTerminalDimensions()
          const layout = createMemo(() => getSpineLayout(dims().width))
          return (
            <box flexDirection="column" height="100%">
              <SpineHeader layout={layout()} session={() => undefined} segments={segments()} />
              <box flexGrow={1} />
            </box>
          )
        }),
      { width: CAPTURE_WIDTH, height: CAPTURE_HEIGHT },
    )

    // Working state — short "working" segment
    await renderOnceSettled(app)
    const shortFrame = app.captureCharFrame()
    const shortHeader = shortFrame.split("\n").filter(Boolean)[0] ?? ""
    const shortPath = shortFrame.split("\n").filter(Boolean)[1] ?? ""
    console.log("=== SHORT SEGMENT (working) ===")
    console.log(shortHeader)
    if (shortPath.trim()) console.log(shortPath)
    console.log("=== END ===")

    // Swap to long session segment
    handle.setSegments(longSegments)
    await renderOnceSettled(app)
    const longFrame = app.captureCharFrame()
    const longHeader = longFrame.split("\n").filter(Boolean)[0] ?? ""
    const longPath = longFrame.split("\n").filter(Boolean)[1] ?? ""
    console.log("=== LONG SEGMENT (run abcdefgh) ===")
    console.log(longHeader)
    if (longPath.trim()) console.log(longPath)
    console.log("=== END ===")

    // Check if the gap between ARCANA and the first segment changed
    const arcanaEndShort = shortHeader.indexOf("master")
    const arcanaEndLong = longHeader.indexOf("master")
    console.log(`ARCANA→master gap (short): ${arcanaEndShort}`)
    console.log(`ARCANA→master gap (long):  ${arcanaEndLong}`)
    console.log(`Gap changes: ${arcanaEndShort !== arcanaEndLong}`)

    app.renderer.destroy()
  })
})
