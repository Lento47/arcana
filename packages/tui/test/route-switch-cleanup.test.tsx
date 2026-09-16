/** @jsxImportSource @opentui/solid */
import { testRender, useRenderer } from "@opentui/solid"
import { expect, test } from "bun:test"
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui"
import { onCleanup } from "solid-js"
import { Path as GlobalPath } from "@arcana/core/global"
import { ProviderTree } from "../src/provider-tree"
import { App } from "../src/app"
import { createPluginRuntime } from "../src/plugin/runtime"
import { registerOpencodeKeymap } from "../src/keymap"
import { useRoute } from "../src/context/route"
import { createTuiResolvedConfig } from "./fixture/tui-runtime"
import { createEventSource, createFetch, directory, json } from "./fixture/tui-sdk"

/**
 * Regression: switching from a session to Home used to crash the whole TUI with
 * "null is not an object (evaluating 'node.cleanups[i]')".
 *
 * The composer's ref cleanup runs while the session tree is being disposed. It
 * evaluated `props.bind` from `<Dynamic {...shellProps()} />`, which re-ran the
 * shell-props memo (route/store reads) *inside* Solid's cleanNode, re-entering
 * the update queue and calling cleanNode on an owner that was already being
 * cleaned. The prompt store was read in the same cleanup for the composer
 * stash. Both paths must stay inert during teardown.
 */

let route: ReturnType<typeof useRoute> | undefined

function RouteCapture() {
  route = useRoute()
  return <box />
}

function Harness() {
  const renderer = useRenderer()
  const calls = createFetch((url) => {
    if (url.pathname === "/session/ses_cleanup") {
      const now = Date.now()
      return json({
        id: "ses_cleanup",
        slug: "ses_cleanup",
        projectID: "proj_test",
        directory,
        title: "cleanup regression",
        version: "0",
        time: { created: now, updated: now },
      })
    }
    if (url.pathname === "/session/ses_cleanup/message") return json([])
    if (url.pathname === "/session/ses_cleanup/diff") return json([])
    return undefined
  })
  const events = createEventSource()
  const resolvedConfig = createTuiResolvedConfig()
  const keymap = createDefaultOpenTuiKeymap(renderer)
  const off = registerOpencodeKeymap(keymap, renderer, resolvedConfig)
  onCleanup(off)
  return (
    <ProviderTree
      mode="dark"
      global={GlobalPath}
      keymap={keymap}
      pluginRuntime={createPluginRuntime()}
      config={resolvedConfig}
      args={{} as any}
      url="http://test"
      directory={directory}
      fetch={calls.fetch}
      events={events.source}
      onExit={() => {}}
      setEpilogue={() => {}}
    >
      <RouteCapture />
      <App pluginHost={{ start: async () => {}, dispose: async () => {} }} />
    </ProviderTree>
  )
}

async function pump(app: Awaited<ReturnType<typeof testRender>>, count: number) {
  for (let i = 0; i < count; i++) {
    await app.renderOnce()
    await app.flush()
    await Bun.sleep(10)
  }
}

test("session → home route switch disposes the composer without a cleanup crash", async () => {
  const app = await testRender(() => <Harness />, { width: 120, height: 40 })
  try {
    await pump(app, 12)
    route!.navigate({ type: "session", sessionID: "ses_cleanup" })
    await pump(app, 12)
    route!.navigate({ type: "home" })
    await pump(app, 12)
    expect(app.captureCharFrame().length).toBeGreaterThan(0)
  } finally {
    app.renderer.destroy()
  }
})
