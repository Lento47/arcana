/** @jsxImportSource @opentui/solid */
/**
 * A click on the toast's dismiss glyph is spent on dismissing.
 *
 * The dismiss glyph is a leaf affordance inside the app's root box, and the
 * root's `onMouseUp` is copy-on-select (`Selection.copy(renderer, toast,
 * clipboard)`). OpenTUI mouse events bubble (`Renderable.processMouseEvent`
 * walks to `this.parent` unless a handler stops propagation), so the glyph has
 * to claim the click or whatever text is selected in the transcript gets copied
 * by a click that meant only "go away".
 *
 * The dismiss below deliberately does NOT remove the toast, and that is the
 * point of the test. A real dismissal empties the store during dispatch, which
 * detaches this renderable before the walk reads `this.parent` — so the walk
 * stops at a dead end and the app handler happens not to run. That shield is an
 * accident of the removal being synchronous, not a decision: hold the toast on
 * screen (a fade, a queued store update, a dismiss that lingers) and the same
 * click reaches the app's copy handler. The ancestor box stands in for that
 * handler and must never be reached, whatever the dismissal does to the tree.
 *
 * On the shipped macOS/Linux default copy-on-select is live; on Windows
 * `ARCANA_EXPERIMENTAL_DISABLE_COPY_ON_SELECT` defaults to true and the app
 * handler is undefined, so rendering the real root would pass for the wrong
 * reason.
 */
import { testRender } from "@opentui/solid"
import { MouseButton } from "@opentui/core"
import { expect, test } from "bun:test"
import { onMount } from "solid-js"
import { Glyph } from "../src/branding"
import { Toast, useToast } from "../src/ui/toast"
import { TestTuiProviders } from "./fixture/tui-providers"

const MESSAGE = "connection lost — retrying"

test("the dismiss click never reaches an ancestor's mouse-up handler", async () => {
  let rootMouseUp = 0
  let dismissed: number[] = []

  function Harness() {
    const toast = useToast()
    // Keep the toast mounted so the propagation contract is what is measured.
    toast.dismiss = (id: number) => {
      dismissed.push(id)
    }
    onMount(() => {
      toast.show({ message: MESSAGE, variant: "info", duration: 60_000 })
    })
    return (
      <box
        flexDirection="column"
        width="100%"
        height="100%"
        onMouseUp={() => {
          rootMouseUp++
        }}
      >
        <Toast />
      </box>
    )
  }

  const app = await testRender(() => <TestTuiProviders><Harness /></TestTuiProviders>, {
    width: 100,
    height: 12,
    useMouse: true,
    enableMouseMovement: true,
  })

  try {
    let frame = ""
    for (let attempt = 0; attempt < 12; attempt++) {
      await app.renderOnce()
      await app.flush()
      frame = app.captureCharFrame()
      if (frame.includes(MESSAGE)) break
      await Bun.sleep(30)
    }
    expect(frame).toContain(MESSAGE)

    // Sanity: the ancestor does receive bubbled clicks, so a zero below means
    // the dismiss claimed the event rather than that bubbling never worked.
    const lines = frame.split("\n")
    const messageY = lines.findIndex((line) => line.includes("connection"))
    const messageX = lines[messageY]!.indexOf("connection")
    await app.mockMouse.moveTo(messageX, messageY)
    await app.mockMouse.click(messageX, messageY, MouseButton.LEFT)
    await app.renderOnce()
    expect(rootMouseUp).toBe(1)

    const dismissY = lines.findIndex((line) => line.includes(Glyph.dismiss))
    expect(dismissY).toBeGreaterThanOrEqual(0)
    const dismissX = lines[dismissY]!.indexOf(Glyph.dismiss)

    await app.mockMouse.moveTo(dismissX, dismissY)
    await app.mockMouse.click(dismissX, dismissY, MouseButton.LEFT)
    await app.renderOnce()

    expect(dismissed.length).toBe(1)
    expect(rootMouseUp).toBe(1)
  } finally {
    app.renderer.destroy()
  }
})
