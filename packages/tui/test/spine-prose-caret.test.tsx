/** @jsxImportSource @opentui/solid */
import { afterEach, expect, test } from "bun:test"
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

const CARET = "▌"

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

async function pump() {
  for (let attempt = 0; attempt < 30; attempt++) {
    await app!.renderOnce()
    await app!.flush()
    await Bun.sleep(5)
  }
}

async function renderChat(opts: { streaming?: boolean }) {
  const [text, setText] = createSignal("")
  const [streaming, setStreaming] = createSignal(opts.streaming ?? false)
  const layout = getSpineLayout(100)
  app = await testRender(
    () =>
      withProviders(() => (
        <box width="100%" height="100%" flexDirection="column" paddingLeft={2} paddingRight={2}>
          <SpineChatCard kind="plan" text={text()} layout={layout} streaming={streaming()} contentWidth={90} />
        </box>
      )),
    { width: 100, height: 40 },
  )
  await pump()
  return { setText, setStreaming }
}

test("streaming assistant prose shows a blinking caret at the stream point", async () => {
  const { setText, setStreaming } = await renderChat({ streaming: true })
  setText("hello")
  await pump()
  // Caret is on by default (initial signal true) and the 500ms blink has not
  // fired within the ~150ms pump window.
  expect(app!.captureCharFrame()).toContain(`hello${CARET}`)
  // Once idle, the caret disappears and the text finalizes.
  setStreaming(false)
  await pump()
  const frame = app!.captureCharFrame()
  expect(frame).toContain("hello")
  expect(frame).not.toContain(CARET)
})

test("idle assistant prose never shows a caret", async () => {
  const { setText } = await renderChat({ streaming: false })
  setText("done")
  await pump()
  expect(app!.captureCharFrame()).toContain("done")
  expect(app!.captureCharFrame()).not.toContain(CARET)
})
