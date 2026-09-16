/** @jsxImportSource @opentui/solid */
/**
 * "Go Home" goes home. The click is spent there.
 *
 * This route renders inside the app root box, whose `onMouseUp` is
 * copy-on-select (`Selection.copy(renderer, toast, clipboard)`), and OpenTUI
 * mouse events bubble (`Renderable.processMouseEvent` walks to `this.parent`
 * unless a handler stops propagation). A bare `onMouseUp={props.onHome}` takes
 * no event and so cannot stop anything, leaving the app's copy handler reachable
 * from a click that meant only "leave this route".
 *
 * The handler below deliberately does NOT change the route, and that is the
 * point: navigating away unmounts this route during dispatch, which detaches
 * the node before the walk reads `this.parent` — so the walk dead-ends and the
 * app handler happens not to run. That shield is an accident of the unmount
 * being synchronous, not a decision, and it is not what this route promises.
 * The ancestor box stands in for the app handler and must never be reached.
 */
import { testRender } from "@opentui/solid"
import { MouseButton } from "@opentui/core"
import { expect, test } from "bun:test"
import { PluginRouteMissing } from "../src/component/plugin-route-missing"
import { TestTuiProviders } from "./fixture/tui-providers"

test("the Go Home click never reaches an ancestor's mouse-up handler", async () => {
  let rootMouseUp = 0
  let homeCount = 0

  const app = await testRender(
    () => (
      <TestTuiProviders>
        <box
          flexDirection="column"
          width="100%"
          height="100%"
          onMouseUp={() => {
            rootMouseUp++
          }}
        >
          <PluginRouteMissing
            id="demo"
            onHome={() => {
              homeCount++
            }}
          />
        </box>
      </TestTuiProviders>
    ),
    { width: 80, height: 10, useMouse: true, enableMouseMovement: true },
  )

  try {
    let frame = ""
    let lastFrame = ""
    for (let attempt = 0; attempt < 12; attempt++) {
      await app.renderOnce()
      await app.flush()
      frame = app.captureCharFrame()
      if (frame.includes("Go Home") && frame === lastFrame) break
      lastFrame = frame
      await Bun.sleep(30)
    }
    expect(frame).toContain("Go Home")

    // The button, not the hint line above it — that one reads "Click Go Home to
    // return to your session." and carries no handler.
    const lines = frame.split("\n")
    const y = lines.findIndex((line) => line.trim() === "Go Home")
    expect(y).toBeGreaterThanOrEqual(0)
    const x = lines[y]!.indexOf("Go Home")

    await app.mockMouse.moveTo(x, y)
    await app.mockMouse.click(x, y, MouseButton.LEFT)
    await app.renderOnce()

    expect(homeCount).toBe(1)
    expect(rootMouseUp).toBe(0)
  } finally {
    app.renderer.destroy()
  }
})
