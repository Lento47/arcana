/** @jsxImportSource @opentui/solid */
import { testRender, useRenderer } from "@opentui/solid"
import { expect, test } from "bun:test"
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui"
import { onCleanup } from "solid-js"
import { Path as GlobalPath } from "@arcana/core/global"
import { ProviderTree } from "../src/provider-tree"
import { createPluginRuntime } from "../src/plugin/runtime"
import { registerOpencodeKeymap } from "../src/keymap"
import { Prompt } from "../src/component/prompt"
import { createTuiResolvedConfig } from "./fixture/tui-runtime"
import { createEventSource, createFetch, directory } from "./fixture/tui-sdk"

/**
 * Composer smoke harness: the only render-level coverage of component/prompt.
 * Mounts the real ProviderTree so the composer's contexts resolve, then
 * asserts the resting surface (marker + placeholder + frame).
 */
function ComposerHarness() {
  const renderer = useRenderer()
  const calls = createFetch()
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
      <box flexDirection="column" width="100%" height="100%">
        <Prompt sessionID="ses-composer-review" visible variant="command-spine" onSubmit={() => {}} />
      </box>
    </ProviderTree>
  )
}

test("composer rests on the prompt marker and placeholder", async () => {
  const app = await testRender(() => <ComposerHarness />, { width: 120, height: 24 })
  try {
    let frame = ""
    for (let attempt = 0; attempt < 20; attempt++) {
      await app.renderOnce()
      await app.flush()
      const next = app.captureCharFrame()
      if (next.trim().length > 0 && next === frame) break
      frame = next
      await Bun.sleep(30)
    }
    expect(frame).toContain("❯")
    expect(frame).toContain("Speak your intent…")
    expect(frame).toContain("╭")
  } finally {
    app.renderer.destroy()
  }
})
