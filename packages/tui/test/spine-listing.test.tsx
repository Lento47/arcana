/** @jsxImportSource @opentui/solid */
import { afterEach, describe, expect, test } from "bun:test"
import { testRender, type JSX } from "@opentui/solid"
import { ArgsProvider } from "../src/context/args"
import { ExitProvider } from "../src/context/exit"
import { KVProvider } from "../src/context/kv"
import { ProjectProvider } from "../src/context/project"
import { SDKProvider } from "../src/context/sdk"
import { SyncProvider } from "../src/context/sync"
import { ThemeProvider } from "../src/context/theme"
import { TuiConfigProvider } from "../src/config"
import { SpineListing } from "../src/shell/command-spine/spine-listing"
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

async function renderListing(entries: string[], note?: string) {
  app = await testRender(
    () =>
      withProviders(() => (
        <box width="100%" height="100%" flexDirection="column">
          <SpineListing entries={entries} note={note} />
        </box>
      )),
    { width: 40, height: 10 },
  )
  let frame = ""
  for (let attempt = 0; attempt < 20; attempt++) {
    await app.renderOnce()
    await app.flush()
    frame = app.captureCharFrame()
    if (frame.replace(/\s/g, "").length > 0) break
    await Bun.sleep(5)
  }
  return frame
}

describe("SpineListing pill suppression", () => {
  test("drops the per-row pill when every entry is a file", async () => {
    const frame = await renderListing(["a.ts", "b.ts", "c.ts"])
    // Uniform → no 'file' pill cells at all.
    expect(frame).not.toMatch(/file\s+a\.ts/)
    expect(frame).toInclude("a.ts")
    expect(frame).not.toMatch(/dir/)
  })

  test("drops the per-row pill when every entry is a dir", async () => {
    const frame = await renderListing(["src/", "test/", "docs/"])
    expect(frame).not.toMatch(/dir\s+src/)
    expect(frame).toInclude("src/")
  })

  test("keeps the per-row pill when the listing mixes dirs and files", async () => {
    const frame = await renderListing(["src/", "readme.md", "test/"])
    // Mixed → pills stay so the kind distinguishes rows.
    expect(frame).toMatch(/dir\s+src/)
    expect(frame).toMatch(/file\s+readme.md/)
    expect(frame).toMatch(/dir\s+test/)
  })

  test("renders the cap note before the entries", async () => {
    const frame = await renderListing(["a.ts", "b.ts"], "… (4998 more entries — refine the query)")
    const noteLine = frame.split("\n").findIndex((line) => line.includes("refine the"))
    const firstEntry = frame.split("\n").findIndex((line) => line.trim().startsWith("a.ts"))
    expect(noteLine).toBeGreaterThanOrEqual(0)
    expect(firstEntry).toBeGreaterThan(noteLine)
  })
})
