/** @jsxImportSource @opentui/solid */
import { afterEach, expect, test } from "bun:test"
import { testRender, type JSX } from "@opentui/solid"
import { MockTreeSitterClient } from "@opentui/core/testing"
import { For, onMount } from "solid-js"
import { ArgsProvider } from "../src/context/args"
import { ExitProvider } from "../src/context/exit"
import { KVProvider } from "../src/context/kv"
import { ProjectProvider } from "../src/context/project"
import { SDKProvider } from "../src/context/sdk"
import { SyncProvider, useSync } from "../src/context/sync"
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
import { createEventSource, createFetch, directory, json, type FetchHandler } from "./fixture/tui-sdk"

const CHILD = "ses_subagent_child"

function installMockTreeSitter() {
  const bag = ((globalThis as any)[Symbol.for("@opentui/core/singleton")] ??= {})
  bag["tree-sitter-client"] = new MockTreeSitterClient({ autoResolveTimeout: 0 })
}

type Harness = {
  app: Awaited<ReturnType<typeof testRender>>
  sync: ReturnType<typeof useSync>
}

async function renderCards(
  entries: SpineEntryModel[],
  options: { expanded?: string[]; fetch?: FetchHandler; waitFor?: (sync: ReturnType<typeof useSync>) => boolean } = {},
): Promise<Harness> {
  installMockTreeSitter()
  const calls = createFetch(options.fetch)
  const events = createEventSource()
  const layout = getSpineLayout(100)
  const gutterWidth = spineGutterWidth(layout)
  const proseWidth = spineProseWidth(100, layout, "chat", gutterWidth)
  const thinkWidth = spineProseWidth(100, layout, "think", gutterWidth)
  let sync!: ReturnType<typeof useSync>
  let ready!: () => void
  const mounted = new Promise<void>((resolve) => (ready = resolve))

  function Probe() {
    const ctx = useSync()
    onMount(() => {
      sync = ctx
      ready()
    })
    return <box />
  }

  const app = await testRender(
    () => (
      <TestTuiContexts>
        <ExitProvider exit={() => {}}>
          <ArgsProvider>
            <TuiConfigProvider config={createTuiResolvedConfig()}>
              <KVProvider>
                <SDKProvider url="http://test" directory={directory} fetch={calls.fetch} events={events.source}>
                  <ProjectProvider>
                    <SyncProvider>
                      <ToastProvider>
                        <ThemeProvider mode="dark">
                          <box flexDirection="column" width="100%" height="100%">
                            <Probe />
                            <For each={entries}>
                              {(entry, index) => (
                                <SpineEntry
                                  entry={entry}
                                  index={index() + 1}
                                  layout={layout}
                                  gutterWidth={gutterWidth}
                                  contentWidth={proseWidth}
                                  thinkContentWidth={thinkWidth}
                                  expanded={options.expanded?.includes(entry.id) ?? false}
                                />
                              )}
                            </For>
                          </box>
                        </ThemeProvider>
                      </ToastProvider>
                    </SyncProvider>
                  </ProjectProvider>
                </SDKProvider>
              </KVProvider>
            </TuiConfigProvider>
          </ArgsProvider>
        </ExitProvider>
      </TestTuiContexts>
    ),
    { width: 100, height: 30 },
  )

  await mounted
  if (options.waitFor) {
    const start = Date.now()
    while (!options.waitFor(sync)) {
      if (Date.now() - start > 2000) throw new Error("timed out waiting for sync data")
      await app.renderOnce()
      await Bun.sleep(10)
    }
  }
  for (let attempt = 0; attempt < 8; attempt++) {
    await app.renderOnce()
    await app.flush()
    await Bun.sleep(10)
  }
  return { app, sync }
}

function agent(overrides: Partial<SpineEntryModel> & { id: string }): SpineEntryModel {
  return {
    index: 1,
    elapsed: "+12.4s",
    kind: "agent",
    glyph: "↳",
    label: "review",
    summary: "Check approval lifecycle",
    streaming: true,
    collapsible: true,
    source: { messageID: overrides.id, partID: `${overrides.id}-part`, kind: "agent" },
    ...overrides,
  }
}

let harness: Harness | undefined

afterEach(() => {
  harness?.app.renderer.destroy()
  harness = undefined
})

test("running card: terse status, bounded live ticker, elapsed only in the header", async () => {
  harness = await renderCards([
    agent({
      id: "live",
      liveOutput: "oldest line\nmiddle line\nnewest line",
      source: { messageID: "live", partID: "live-part", kind: "agent", sessionID: CHILD },
    }),
  ])
  const frame = harness.app.captureCharFrame()

  // Status: handover cue + dive affordance, no duplicated bullet/elapsed.
  expect(frame).toContain("delegated · ↵ open")
  expect(frame).not.toContain("↵ enter its context")

  // Elapsed lives in the header only — exactly one occurrence on the row.
  expect(frame.match(/\+12\.4s/g)?.length).toBe(1)

  // Live ticker: only the newest two lines, with a cut marker on the first.
  expect(frame).toContain("… middle line")
  expect(frame).toContain("newest line")
  expect(frame).not.toContain("oldest line")
})

test("quiet running card falls back to a terse working line", async () => {
  harness = await renderCards([agent({ id: "quiet", label: "explore", summary: "Map the mapper" })])
  const frame = harness.app.captureCharFrame()
  expect(frame).toContain("delegated")
  expect(frame).toContain("Working in the explore context…")
  expect(frame).not.toContain("no streamed output")
  expect(frame).not.toContain("watch it think")
})

test("collapsed returned card previews the report; expanding drops the preview", async () => {
  const entry = agent({
    id: "returned",
    streaming: false,
    body: "## Verdict\n\nThe diff is clean; nothing further needed.",
    bodyLabel: "report",
  })
  harness = await renderCards([entry])
  let frame = harness.app.captureCharFrame()
  expect(frame).toContain("returned")
  expect(frame).toContain("Verdict")

  harness.app.renderer.destroy()
  harness = await renderCards([entry], { expanded: ["returned"] })
  frame = harness.app.captureCharFrame()
  expect(frame).toContain("Verdict")
  // Expanded: the report is the body, not a one-line preview — the full markdown
  // body renders (mock highlighter leaves the running copy in place).
  expect(frame).toContain("nothing further needed")
})

test("returned card caps its step list and counts the remainder", async () => {
  const parts = Array.from({ length: 8 }, (_, i) => ({
    id: `prt_step_${i}`,
    sessionID: CHILD,
    messageID: "msg_child",
    type: "tool" as const,
    callID: `call_${i}`,
    tool: "read",
    state: {
      status: "completed" as const,
      title: `packages/tui/step-${i}.ts`,
      input: {},
      time: { start: 1, end: 2 },
    },
  }))
  const messages = [
    {
      info: {
        id: "msg_child",
        sessionID: CHILD,
        role: "assistant" as const,
        agent: "review",
        modelID: "model",
        providerID: "test",
        mode: "build",
        cost: 0,
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        time: { created: 1, completed: 2 },
      },
      parts,
    },
  ]
  harness = await renderCards(
    [agent({
      id: "steps",
      streaming: false,
      body: "## Report\n\ndone",
      bodyLabel: "report",
      source: { messageID: "steps", partID: "steps-part", kind: "agent", sessionID: CHILD },
    })],
    {
      expanded: ["steps"],
      fetch: (url) => {
        if (url.pathname === `/session/${CHILD}/message`) return json(messages)
        if (url.pathname === `/session/${CHILD}`) {
          return json({
            id: CHILD,
            parentID: "ses_parent",
            title: "@review subagent",
            time: { created: 1, updated: 2 },
            version: "1.0.0",
            directory,
          })
        }
        if (url.pathname === `/session/${CHILD}/todo` || url.pathname === `/session/${CHILD}/diff`) return json([])
        return undefined
      },
      waitFor: (sync) => (sync.data.message[CHILD] ?? []).length > 0,
    },
  )
  const frame = harness.app.captureCharFrame()
  expect(frame).toContain("step-0.ts")
  expect(frame).toContain("step-5.ts")
  expect(frame).not.toContain("step-6.ts")
  expect(frame).toContain("… 2 more steps")
})
