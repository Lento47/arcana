/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import { testRender, type JSX } from "@opentui/solid"
import { For, createMemo, createSignal, type Setter } from "solid-js"
import { ThemeProvider } from "../src/context/theme"
import { ToastProvider } from "../src/ui/toast"
import { TuiConfigProvider } from "../src/config"
import { KVProvider } from "../src/context/kv"
import { ArgsProvider } from "../src/context/args"
import { ExitProvider } from "../src/context/exit"
import { SDKProvider } from "../src/context/sdk"
import { ProjectProvider } from "../src/context/project"
import { SyncProvider } from "../src/context/sync"
import { SpineEntryBinding } from "../src/shell/command-spine/spine-entry-binding"
import type { SpineEntry } from "../src/shell/command-spine/spine-types"
import { TestTuiContexts } from "./fixture/tui-environment"
import { createTuiResolvedConfig } from "./fixture/tui-runtime"
import { createEventSource, createFetch, directory } from "./fixture/tui-sdk"

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

async function settle(app: Awaited<ReturnType<typeof testRender>>) {
  await app.renderOnce()
  await new Promise((resolve) => setTimeout(resolve, 50))
  await app.flush()
  await app.renderOnce()
}

async function capture(app: Awaited<ReturnType<typeof testRender>>) {
  for (let attempt = 0; attempt < 8; attempt++) {
    await settle(app)
    const frame = app.captureCharFrame()
    if (frame.trim()) return frame
  }
  return app.captureCharFrame()
}

test("stable entry id renders the latest streamed entry object", async () => {
  const prefix: SpineEntry = {
    id: "assistant:msg_live:think",
    index: 2,
    elapsed: "",
    kind: "think",
    label: "Thinking",
    glyph: "*",
    summary: "The",
  }
  let setEntry!: Setter<SpineEntry>

  const app = await testRender(
    () =>
      withProviders(() => {
        const [entry, updateEntry] = createSignal(prefix)
        setEntry = updateEntry
        const ids = createMemo(() => [entry().id])
        const entriesByID = createMemo(() => new Map([[entry().id, entry()]]))

        return (
          <box flexDirection="column" width="100%" height="100%">
            <For each={ids()}>
              {(id) => (
                <SpineEntryBinding
                  getEntry={() => entriesByID().get(id)}
                  layout="wide"
                  expanded={true}
                  focused={false}
                />
              )}
            </For>
          </box>
        )
      }),
    { width: 120, height: 12 },
  )

  try {
    const initial = await capture(app)
    expect(initial).toContain("The")
    expect(initial).not.toContain("The user said good to see you")

    setEntry({ ...prefix, summary: "The user said good to see you" })
    const complete = await capture(app)

    expect(complete).toContain("The user said good to see you")
  } finally {
    app.renderer.destroy()
  }
})
