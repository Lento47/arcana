/** @jsxImportSource @opentui/solid */
import { afterEach, expect, test } from "bun:test"
import { testRender, type JSX } from "@opentui/solid"
import { createSignal, type ParentProps } from "solid-js"
import { ArgsProvider } from "../src/context/args"
import { ExitProvider } from "../src/context/exit"
import { KVContext, KVProvider } from "../src/context/kv"
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

const GRAIN = "░▒▓▌"
const CARET = "▌"

let app: Awaited<ReturnType<typeof testRender>> | undefined
afterEach(() => {
  app?.renderer.destroy()
  app = undefined
})

// The KV level must be passed as a dynamic component (capitalized ref), not a
// function call wrapping pre-evaluated children: under the test preload Solid
// evaluates JSX eagerly, so a wrapper invoked at argument position runs the
// provider chain BEFORE KVContext.Provider establishes the KV context.
function withProviders(
  component: () => JSX.Element,
  KVSlot: (props: ParentProps) => JSX.Element = KVProvider,
) {
  const calls = createFetch()
  const events = createEventSource()
  return (
    <TestTuiContexts>
      <ExitProvider exit={() => {}}>
        <ArgsProvider>
          <TuiConfigProvider config={createTuiResolvedConfig()}>
            <KVSlot>
              <SDKProvider url="http://test" directory={directory} fetch={calls.fetch} events={events.source}>
                <ProjectProvider>
                  <SyncProvider>
                    <ToastProvider>
                      <ThemeProvider mode="dark">{component()}</ThemeProvider>
                    </ToastProvider>
                  </SyncProvider>
                </ProjectProvider>
              </SDKProvider>
            </KVSlot>
          </TuiConfigProvider>
        </ArgsProvider>
      </ExitProvider>
    </TestTuiContexts>
  )
}

// Minimal KV via the raw context with animations disabled — swaps the KV
// provider level (the real provider's async ready-gate would withhold
// children on a single renderOnce).
const animationsOffKV: any = {
  ready: true,
  store: {},
  signal: (_name: string, def: unknown) => [() => def, () => {}],
  get: (key: string, def?: unknown) => (key === "animations_enabled" ? false : def),
  set: () => {},
}

function withAnimationsOff(component: () => JSX.Element) {
  const AnimationsOffKV = (props: ParentProps) => (
    <KVContext.Provider value={animationsOffKV}>{props.children}</KVContext.Provider>
  )
  return withProviders(component, AnimationsOffKV)
}

async function pump() {
  for (let attempt = 0; attempt < 30; attempt++) {
    await app!.renderOnce()
    await app!.flush()
    await Bun.sleep(5)
  }
}

async function renderChat(opts: { streaming?: boolean; animationsOff?: boolean }) {
  const [text, setText] = createSignal("")
  const [streaming, setStreaming] = createSignal(opts.streaming ?? false)
  const layout = getSpineLayout(100)
  const card = () => (
    <box width="100%" height="100%" flexDirection="column" paddingLeft={2} paddingRight={2}>
      <SpineChatCard kind="plan" text={text()} layout={layout} streaming={streaming()} contentWidth={90} />
    </box>
  )
  app = await testRender(
    () => (opts.animationsOff ? withAnimationsOff(card) : withProviders(card)),
    { width: 100, height: 40 },
  )
  await pump()
  return { setText, setStreaming }
}

test("streaming assistant prose shows a grain caret that advances with the stream", async () => {
  const { setText, setStreaming } = await renderChat({ streaming: true })
  setText("hello")
  await pump()
  const first = app!.captureCharFrame()
  const glyph = first.match(new RegExp(`hello([${GRAIN}])`))?.[1]
  expect(glyph, "caret at the stream point").toBeDefined()

  // No text change → no frames: the grain must NOT cycle on a timer. A timer
  // rewrote the markdown source 8×/second, which re-parsed and repainted the
  // prose (tables included) — the flicker this contract prevents.
  await Bun.sleep(150)
  await app!.renderOnce()
  await app!.flush()
  const settled = app!.captureCharFrame()
  expect(settled.match(new RegExp(`hello([${GRAIN}])`))?.[1]).toBe(glyph)

  // A content update advances the grain with the stream (still one of ░▒▓▌).
  setText("hello world")
  await pump()
  expect(app!.captureCharFrame()).toMatch(new RegExp(`hello world[${GRAIN}]`))

  // Once idle, the caret disappears and the text finalizes.
  setStreaming(false)
  await pump()
  const idle = app!.captureCharFrame()
  expect(idle).toContain("hello world")
  for (const candidate of GRAIN) {
    expect(idle).not.toContain(`hello world${candidate}`)
  }
})

test("streaming with animations disabled keeps a static caret", async () => {
  const { setText, setStreaming } = await renderChat({ streaming: true, animationsOff: true })
  setText("hello")
  await pump()
  // Animations off: no flicker — the caret is the static block, always.
  const frame = app!.captureCharFrame()
  expect(frame).toContain(`hello${CARET}`)
  setStreaming(false)
  await pump()
  expect(app!.captureCharFrame()).not.toContain(CARET)
})

test("idle assistant prose never shows a caret", async () => {
  const { setText } = await renderChat({ streaming: false })
  setText("done")
  await pump()
  const frame = app!.captureCharFrame()
  expect(frame).toContain("done")
  for (const glyph of GRAIN) {
    expect(frame).not.toContain(`done${glyph}`)
  }
})
