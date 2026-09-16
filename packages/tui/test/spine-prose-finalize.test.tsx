/** @jsxImportSource @opentui/solid */
import { afterEach, expect, test } from "bun:test"
import { testRender, type JSX } from "@opentui/solid"
import { RGBA, SyntaxStyle } from "@opentui/core"
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

function walk(node: any, out: any[] = []): any[] {
  if (!node) return out
  out.push(node)
  for (const child of node._childrenInLayoutOrder ?? []) walk(child, out)
  return out
}

function findMarkdown(): any {
  return walk(app!.renderer.root).find((node) => node.constructor?.name === "MarkdownRenderable")
}

const syntaxStyle = SyntaxStyle.fromStyles({
  default: { fg: RGBA.fromHex("#ffffff") },
})

/**
 * The streaming→idle flip must reuse the existing block renderables, not
 * destroy and re-create them. Upstream `set streaming` forces a full
 * re-render (`updateBlocks(true)`), which drops every block's retained styled
 * frame — the whole answer flashes to raw text and re-highlights. Arcana
 * patches the flip to `updateBlocks(false)` so stable blocks keep their
 * frames; only the trailing block re-parses.
 */
test("streaming→idle flip reuses block renderables", async () => {
  const [content, setContent] = createSignal("Here is a list:\n- item one\n- item two")
  const [streaming, setStreaming] = createSignal(true)
  app = await testRender(
    () =>
      withProviders(() => (
        <box width="100%" height="100%" flexDirection="column" paddingLeft={2} paddingRight={2}>
          <markdown
            width={90}
            content={content()}
            streaming={streaming()}
            syntaxStyle={syntaxStyle}
            internalBlockMode="top-level"
            conceal={true}
          />
        </box>
      )),
    { width: 100, height: 40 },
  )
  await pump()

  const md = findMarkdown()
  expect(md).toBeDefined()
  const before = md._childrenInLayoutOrder.slice()
  expect(before.length).toBeGreaterThan(0)

  setStreaming(false)
  await pump()

  const after = md._childrenInLayoutOrder
  expect(after.length).toBe(before.length)
  for (let i = 0; i < before.length; i++) {
    expect(after[i]).toBe(before[i])
  }
})

/**
 * The trailing block still finalizes: content that completes on idle (an
 * unclosed `**` pair closing) must render its final form.
 */
test("trailing block finalizes its content on idle", async () => {
  const [content, setContent] = createSignal("hello **wor")
  const [streaming, setStreaming] = createSignal(true)
  app = await testRender(
    () =>
      withProviders(() => (
        <box width="100%" height="100%" flexDirection="column" paddingLeft={2} paddingRight={2}>
          <markdown
            width={90}
            content={content()}
            streaming={streaming()}
            syntaxStyle={syntaxStyle}
            internalBlockMode="top-level"
            conceal={true}
          />
        </box>
      )),
    { width: 100, height: 40 },
  )
  await pump()

  setContent("hello **world**")
  setStreaming(false)
  await pump()

  // Final form: the closed ** pair renders as styled emphasis, consuming the
  // literal markers. The unfinalized streaming form ("hello **wor") never
  // contains this sequence.
  expect(app!.captureCharFrame()).toContain("hello world")
})
