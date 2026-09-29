/** @jsxImportSource @opentui/solid */
/**
 * Operator-initiated closes dissolve before the stack pops (color-only wash).
 * Programmatic clear()/replace() stay synchronous — that split is the contract
 * this test pins.
 */
import { expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { onMount } from "solid-js"
import { useKV } from "../src/context/kv"
import { useDialog } from "../src/ui/dialog"
import { TestTuiProviders } from "./fixture/tui-providers"

async function settleUntil(
  app: Awaited<ReturnType<typeof testRender>>,
  predicate: (frame: string) => boolean,
  attempts = 60,
) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    await app.renderOnce()
    if (predicate(app.captureCharFrame())) return
    await Bun.sleep(10)
  }
}

test("an operator close dissolves before the stack pops", async () => {
  let dialog!: ReturnType<typeof useDialog>
  const Probe = () => {
    dialog = useDialog()
    const kv = useKV()
    onMount(() => {
      // Hermetic: the shared test KV path can hold `animations_enabled:false`
      // from another suite. This test pins the dissolve, not the snap.
      kv.set("animations_enabled", true)
      dialog.replace(<text>dissolve probe</text>)
    })
    return null
  }

  const app = await testRender(() => (
    <TestTuiProviders>
      <Probe />
    </TestTuiProviders>
  ), { width: 80, height: 24 })

  try {
    await settleUntil(app, (frame) => frame.includes("dissolve probe"))
    expect(app.captureCharFrame()).toContain("dissolve probe")

    dialog.dismiss(() => dialog.clear())
    await app.renderOnce()
    // The card is still painted while the wash runs.
    expect(app.captureCharFrame()).toContain("dissolve probe")

    await Bun.sleep(300)
    await app.renderOnce()
    expect(app.captureCharFrame()).not.toContain("dissolve probe")
  } finally {
    app.renderer.destroy()
  }
})

test("programmatic clear stays synchronous", async () => {
  let dialog!: ReturnType<typeof useDialog>
  const Probe = () => {
    dialog = useDialog()
    const kv = useKV()
    onMount(() => {
      kv.set("animations_enabled", true)
      dialog.replace(<text>sync probe</text>)
    })
    return null
  }

  const app = await testRender(() => (
    <TestTuiProviders>
      <Probe />
    </TestTuiProviders>
  ), { width: 80, height: 24 })

  try {
    await settleUntil(app, (frame) => frame.includes("sync probe"))
    expect(app.captureCharFrame()).toContain("sync probe")

    dialog.clear()
    await app.renderOnce()
    expect(app.captureCharFrame()).not.toContain("sync probe")
  } finally {
    app.renderer.destroy()
  }
})
