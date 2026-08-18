/**
 * Session prewarm lifecycle — the prewarm must never create junk sessions.
 *
 *  - Boot into a session route: no prewarm session is created (the guard
 *    skips — a session is already open, a prewarm would be an empty row).
 *  - Boot into Home with an unconsumed prewarm: exiting removes the empty
 *    session (best-effort DELETE) instead of leaving it behind.
 */
/** @jsxImportSource @opentui/solid */
import { testRender } from "@opentui/solid"
import { expect, test } from "bun:test"
import { ArgsProvider } from "../src/context/args"
import { RouteProvider } from "../src/context/route"
import { SDKProvider } from "../src/context/sdk"
import { SyncContext } from "../src/context/sync"
import { ThemeProvider } from "../src/context/theme"
import { LocalProvider } from "../src/context/local"
import { ToastProvider } from "../src/ui/toast"
import { SessionPrewarmProvider } from "../src/routes/home/prewarm-session"
import { TestTuiContexts } from "./fixture/tui-environment"
import { TuiConfigProvider } from "../src/config"
import { createTuiResolvedConfig } from "./fixture/tui-runtime"
import { KVProvider } from "../src/context/kv"
import { tmpdir } from "./fixture/fixture"
import path from "node:path"
import { mkdir, writeFile } from "node:fs/promises"

async function wait(fn: () => boolean, timeout = 2000) {
  const start = Date.now()
  while (!fn()) {
    if (Date.now() - start > timeout) throw new Error("timed out waiting for condition")
    await Bun.sleep(10)
  }
}

async function makeStateDir(root: string): Promise<string> {
  const state = path.join(root, "state")
  await mkdir(state, { recursive: true })
  await writeFile(path.join(state, "kv.json"), "{}")
  return state
}

type Call = { method: string; url: string }

async function mountPrewarm(input: { initialRoute: "home" | "session"; root: string }) {
  const calls: Call[] = []
  const fetchStub = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    const method = init?.method ?? (input instanceof Request ? input.method : "GET")
    calls.push({ method, url: url.pathname })
    if (url.pathname === "/session" && method === "POST") {
      return new Response(
        JSON.stringify({
          id: "ses-prewarm-1",
          slug: "ses-prewarm-1",
          projectID: "proj_test",
          title: "New session - 2026-08-17T00:00:00.000Z",
          directory: "/tmp/opencode/packages/tui",
          version: "0",
          time: { created: Date.now(), updated: Date.now() },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )
    }
    if (url.pathname.startsWith("/session/") && method === "DELETE") {
      return new Response("{}", { status: 200, headers: { "content-type": "application/json" } })
    }
    return new Response("[]", { status: 200, headers: { "content-type": "application/json" } })
  }) as typeof fetch

  const syncStub = {
    ready: true,
    data: { agent: [], provider: [], config: {}, session: [] },
    session: {
      upsert: () => {},
      forget: () => {},
    },
  }

  const state = await makeStateDir(input.root)
  const appPromise = testRender(
    () => (
      <TestTuiContexts paths={{ state }}>
        <TuiConfigProvider config={createTuiResolvedConfig()}>
        <ArgsProvider>
          <RouteProvider
            initialRoute={
              input.initialRoute === "session"
                ? { type: "session", sessionID: "ses-existing" }
                : { type: "home" }
            }
          >
            <KVProvider>
            <ToastProvider>
              <ThemeProvider mode="dark">
                <SDKProvider url="http://test" fetch={fetchStub}>
                  <SyncContext.Provider value={syncStub as never}>
                    <LocalProvider>
                      <SessionPrewarmProvider />
                    </LocalProvider>
                  </SyncContext.Provider>
                </SDKProvider>
              </ThemeProvider>
            </ToastProvider>
            </KVProvider>
          </RouteProvider>
        </ArgsProvider>
        </TuiConfigProvider>
      </TestTuiContexts>
    ),
    { width: 80, height: 24 },
  )

  return { calls, appPromise, state }
}

test("boot into a session route never creates a prewarm session", async () => {
  await using tmp = await tmpdir()
  const { calls, appPromise } = await mountPrewarm({ initialRoute: "session", root: tmp.path })
  const app = await appPromise
  try {
    await Bun.sleep(150)
    await app.renderOnce()
    expect(calls.some((c) => c.method === "POST" && c.url === "/session")).toBe(false)
  } finally {
    app.renderer.destroy()
  }
})

test("boot into Home prewarms, and exit removes the unconsumed session", async () => {
  await using tmp = await tmpdir()
  const { calls, appPromise } = await mountPrewarm({ initialRoute: "home", root: tmp.path })
  const app = await appPromise
  try {
    await wait(() => calls.some((c) => c.method === "POST" && c.url === "/session"))
    expect(calls.filter((c) => c.method === "POST" && c.url === "/session")).toHaveLength(1)
  } finally {
    app.renderer.destroy()
  }
  await wait(() => calls.some((c) => c.method === "DELETE" && c.url === "/session/ses-prewarm-1"))
  expect(calls.some((c) => c.method === "DELETE" && c.url === "/session/ses-prewarm-1")).toBe(true)
})
