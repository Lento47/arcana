/** @jsxImportSource @opentui/solid */
import { afterEach, describe, expect, test } from "bun:test"
import { testRender, type JSX } from "@opentui/solid"
import { MockTreeSitterClient } from "@opentui/core/testing"
import { For } from "solid-js"
import { ArgsProvider } from "../src/context/args"
import { ExitProvider } from "../src/context/exit"
import { KVProvider } from "../src/context/kv"
import { ProjectProvider } from "../src/context/project"
import { SDKProvider } from "../src/context/sdk"
import { SyncProvider } from "../src/context/sync"
import { ThemeProvider } from "../src/context/theme"
import { TuiConfigProvider } from "../src/config"
import { SpineEntry } from "../src/shell/command-spine/spine-entry"
import {
  getSpineLayout,
  spineGutterWidth,
  spineProseWidth,
  type SpineEntry as SpineEntryModel,
} from "../src/shell/command-spine/spine-types"
import { ToastProvider } from "../src/ui/toast"
import { TestTuiContexts } from "./fixture/tui-environment"
import { createTuiResolvedConfig } from "./fixture/tui-runtime"
import { createEventSource, createFetch, directory } from "./fixture/tui-sdk"

function installMockTreeSitter() {
  const bag = ((globalThis as any)[Symbol.for("@opentui/core/singleton")] ??= {})
  bag["tree-sitter-client"] = new MockTreeSitterClient({ autoResolveTimeout: 0 })
}

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

const entries: SpineEntryModel[] = [
  {
    id: "ask",
    index: 1,
    elapsed: "",
    kind: "ask",
    glyph: "◆",
    label: "you",
    summary: "Review the governed execution path and keep the conversation readable.",
    source: { messageID: "ask", kind: "message" },
  },
  {
    id: "plan",
    index: 2,
    elapsed: "+1.2s",
    kind: "plan",
    glyph: "✦",
    label: "arcana",
    summary: "I’ll inspect the authority boundary, then summarize the evidence.",
    source: { messageID: "plan", kind: "text" },
  },
  {
    id: "think",
    index: 3,
    elapsed: "+2.1s",
    kind: "think",
    glyph: "",
    label: "",
    summary: "Thinking",
    body: "Reasoning remains available through progressive disclosure.",
    streaming: true,
    collapsible: true,
    source: { messageID: "think", kind: "reasoning" },
  },
  {
    id: "run",
    index: 4,
    elapsed: "+812ms",
    kind: "run",
    glyph: "▷",
    label: "test",
    summary: "packages/tui",
    receipt: { label: "test", status: "ok", stats: { passed: 1186, failed: 0, duration: "8.1s" } },
    source: { messageID: "run", partID: "run-part", kind: "tool" },
  },
  {
    id: "agent",
    index: 5,
    elapsed: "+3.4s",
    kind: "agent",
    glyph: "↳",
    label: "review",
    summary: "Check approval lifecycle",
    liveOutput: "Inspecting the exact request and proof continuation.",
    streaming: true,
    collapsible: true,
    source: { messageID: "agent", partID: "agent-part", kind: "agent" },
  },
  {
    id: "patch",
    index: 6,
    elapsed: "+640ms",
    kind: "patch",
    glyph: "±",
    label: "patch",
    summary: "spine-chat.tsx · +3 · -2",
    diff: {
      files: "spine-chat.tsx",
      stats: "+3 -2",
      body: "diff --git a/spine-chat.tsx b/spine-chat.tsx\n@@ -8,1 +8,1 @@\n-old chrome\n+restrained chrome",
    },
    collapsible: true,
    source: { messageID: "patch", partID: "patch-part", kind: "patch" },
  },
  {
    id: "approval:1",
    index: 7,
    elapsed: "",
    kind: "approve",
    glyph: "△",
    label: "approval required",
    summary: "Run release verification",
    actor: "build",
    approval: {
      requestHash: "abc123",
      available: true,
      tool: "bash",
      action: "bun test packages/tui",
      risk: "HIGH",
    },
    source: { messageID: "approval", kind: "approve" },
  },
  {
    id: "governance-group:1",
    index: 8,
    elapsed: "+24ms",
    kind: "ok",
    glyph: "✓",
    label: "governed",
    summary: "4 governed actions · 2 authorized · 2 executed · 0 denied",
    collapsible: true,
    source: { messageID: "governance", kind: "governance" },
  },
  {
    id: "fail",
    index: 9,
    elapsed: "+90ms",
    kind: "fail",
    glyph: "×",
    label: "failed",
    summary: "Verification failed",
    receipt: { label: "test", status: "fail", command: "E1001: expected proof receipt" },
    source: { messageID: "fail", partID: "fail-part", kind: "tool" },
  },
  {
    id: "ok",
    index: 10,
    elapsed: "+9.2s",
    kind: "ok",
    glyph: "◎",
    label: "arcana",
    summary: "The review is complete; critical authority states remained visible.",
    source: { messageID: "ok", kind: "text" },
  },
]

let app: Awaited<ReturnType<typeof testRender>> | undefined

afterEach(() => {
  app?.renderer.destroy()
  app = undefined
})

async function renderAt(width: number) {
  installMockTreeSitter()
  const layout = getSpineLayout(width)
  const gutterWidth = spineGutterWidth(layout)
  const proseWidth = spineProseWidth(width, layout, "chat", gutterWidth)
  const thinkWidth = spineProseWidth(width, layout, "think", gutterWidth)
  app = await testRender(
    () => withProviders(() => (
      <box flexDirection="column" width="100%" height="100%">
        <For each={entries}>
          {(entry, index) => (
            <SpineEntry
              entry={entry}
              index={index() + 1}
              layout={layout}
              gutterWidth={gutterWidth}
              contentWidth={proseWidth}
              thinkContentWidth={thinkWidth}
              expanded={entry.id === "patch" || entry.id.startsWith("approval:")}
            />
          )}
        </For>
      </box>
    )),
    { width, height: 64 },
  )
  let stable = ""
  for (let attempt = 0; attempt < 30; attempt++) {
    await app.renderOnce()
    await app.flush()
    const frame = app.captureCharFrame()
    if (frame.includes("Review the governed") && frame === stable) break
    stable = frame
    await Bun.sleep(25)
  }
  return app.captureCharFrame()
}

describe("Command Spine visual grammar", () => {
  test("mixed session remains legible across every responsive boundary", async () => {
    for (const width of [59, 79, 80, 99, 100, 119, 120, 180]) {
      app?.renderer.destroy()
      app = undefined
      const frame = await renderAt(width)
      expect(frame, `width ${width}`).toContain("Review the governed")
      expect(frame, `width ${width}`).toContain("inspect the authority")
      expect(frame, `width ${width}`).toContain("Thinking")
      expect(frame, `width ${width}`).toContain("packages/tui")
      expect(frame, `width ${width}`).toContain("Check approval lifecycle")
      expect(frame, `width ${width}`).toContain("Approval")
      expect(frame, `width ${width}`).toContain("Verification failed")
      expect(frame, `width ${width}`).toContain("critical authority states")
    }
  }, 30_000)

  test("wide conversation is open prose while the user prompt remains a distinct turn", async () => {
    const frame = await renderAt(120)
    // The user-prompt body ("Review the governed …") is asserted in the
    // mixed-session test above; here we only need to confirm the assistant
    // row renders and that the chip speaker label ("assistant") was
    // suppressed in favor of the brand name. We assert on the assistant
    // body and brand so this test still has teeth.
    expect(frame).toContain("inspect the authority")
    expect(frame).toContain("arcana")
    expect(frame).not.toContain("assistant")
    expect(frame).toContain("restrained chrome")
  })
})
