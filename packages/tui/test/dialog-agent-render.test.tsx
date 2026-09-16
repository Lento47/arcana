/** @jsxImportSource @opentui/solid */
/**
 * The agent picker's tag column is read by an operator, not by the SDK.
 *
 * A built-in agent carries `native: true`, and the picker printed that SDK
 * field name verbatim as the muted tag under every built-in row — the same
 * column that reads "Built-in" on the plugin surface. The tag is asserted by
 * frame, where the operator actually reads it: the row for the built-in agent
 * must carry the copy, and no row may carry the field name.
 *
 * The picker is rendered inline rather than through `dialog.replace`: the
 * dialog host renders its content in a sibling subtree of the provider
 * children, so the surface contexts `DialogAgent` needs would sit below
 * `DialogProvider` and never reach it.
 */
import { expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { DialogAgent } from "../src/component/dialog-agent"
import { COPY } from "../src/branding"
import { ArgsProvider } from "../src/context/args"
import { RouteProvider } from "../src/context/route"
import { SDKProvider } from "../src/context/sdk"
import { SyncContext } from "../src/context/sync"
import { LocalProvider } from "../src/context/local"
import { TestTuiProviders } from "./fixture/tui-providers"

const BUILT_IN = "rite-forge"
const CUSTOM = "scribe"

const AGENTS = [
  { name: BUILT_IN, description: "Shapes the raw stuff", mode: "primary", native: true, permission: [], options: {} },
  { name: CUSTOM, description: "Writes the prose", mode: "primary", permission: [], options: {} },
]

/** Render the agent picker and return the settled frame, right-trimmed. */
async function capture(): Promise<string[]> {
  const syncStub = {
    ready: true,
    data: { agent: AGENTS, provider: [], config: {}, session: [] },
    session: { upsert: () => {}, forget: () => {} },
  }

  const app = await testRender(
    () => (
      <TestTuiProviders>
        <ArgsProvider>
          <RouteProvider initialRoute={{ type: "home" }}>
            <SDKProvider url="http://test" fetch={(() => new Response("[]")) as unknown as typeof fetch}>
              <SyncContext.Provider value={syncStub as never}>
                <LocalProvider>
                  <DialogAgent />
                </LocalProvider>
              </SyncContext.Provider>
            </SDKProvider>
          </RouteProvider>
        </ArgsProvider>
      </TestTuiProviders>
    ),
    { width: 96, height: 30 },
  )
  try {
    let lines: string[] = []
    for (let i = 0; i < 80; i++) {
      await Bun.sleep(15)
      await app.renderOnce()
      await app.flush()
      await app.renderOnce()
      lines = app.captureCharFrame().split("\n")
      if (lines.some((line) => line.includes(CUSTOM))) break
    }
    return lines.map((line) => line.replace(/\s+$/, ""))
  } finally {
    app.renderer.destroy()
  }
}

test("the built-in agent is tagged with copy, not the SDK field name", async () => {
  const lines = await capture()
  const builtIn = lines.find((line) => line.includes(BUILT_IN))
  expect(builtIn).toBeDefined()
  expect(builtIn!).toContain(COPY.dialog.nativeTag)

  // The custom agent's own description still carries that column...
  expect(lines.some((line) => line.includes(`${CUSTOM} Writes the prose`))).toBe(true)
  // ...and the field name never reaches the frame.
  expect(lines.some((line) => /\bnative\b/.test(line))).toBe(false)
})
