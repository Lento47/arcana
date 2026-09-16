/**
 * Spine scroll cues — the indicator contract.
 *
 * `use-spine-scroll.ts` fed `s.y` into the split-cue policy. `y` on a
 * ScrollBoxRenderable is **layout position**, not scroll offset: the class
 * extends BoxRenderable and neither defines a `y` accessor nor ever assigns
 * `this.y` (verified in the installed dist), so `y` is whatever the flexbox
 * gave it. Reading it as a scroll offset makes both cues lie — the ↑ cue
 * shows while already at the top (because the box sits below the header, so
 * `y > 0`), and the ↓ cue keeps showing after scrolling to the bottom.
 *
 * Both directions are asserted here. The harness drives the hook's own
 * actions (`scrollToBottom` / `scrollToTop`), because the indicators
 * recompute on those events — a raw `scrollTo` on the renderable would leave
 * them stale and prove nothing.
 */
/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import { For, createSignal } from "solid-js"
import { type Renderable, ScrollBoxRenderable } from "@opentui/core"
import { testRender } from "@opentui/solid"
import { useSpineScroll } from "../src/shell/command-spine/use-spine-scroll"

const ROWS = 20
const VIEWPORT_HEIGHT = 6

function findScrollBox(root: Renderable): ScrollBoxRenderable | undefined {
  if (root instanceof ScrollBoxRenderable) return root
  for (const child of root.getChildren()) {
    const found = findScrollBox(child)
    if (found) return found
  }
  return undefined
}

async function renderHarness() {
  let api: ReturnType<typeof useSpineScroll> | undefined
  const [revision, setRevision] = createSignal(0)
  const app = await testRender(
    () => {
      const scroll = useSpineScroll({ onRef: () => {}, contentRevision: revision })
      api = scroll
      return (
        <box flexDirection="column" width={40} height={12}>
          {/* Header rows above the scrollbox give it a non-zero layout y, which
              is what makes a "read y as scrollTop" bug observable. */}
          <box height={2}>
            <text>Spine header</text>
          </box>
          <text>{scroll.showScrollUpButton() ? "CUE-UP" : "no-up"}</text>
          <text>{scroll.showScrollDownButton() ? "CUE-DOWN" : "no-down"}</text>
          <scrollbox
            ref={(r) => scroll.setScrollRef(r as ScrollBoxRenderable)}
            width={30}
            height={VIEWPORT_HEIGHT}
          >
            <For each={Array.from({ length: ROWS }, (_, i) => `row ${i}`)}>
              {(row) => <text>{row}</text>}
            </For>
          </scrollbox>
        </box>
      )
    },
    { width: 40, height: 12 },
  )
  for (let attempt = 0; attempt < 50 && app.renderer.root.getChildren().length === 0; attempt++) {
    await Bun.sleep(10)
    await app.renderOnce()
  }
  await app.waitForFrame((frame) => frame.includes("Spine header"))
  await settle(app)
  // The shell feeds `scrollContentRevision`, which changes as rows arrive; the
  // hook recomputes on it. `onMount` alone runs before the first layout pass,
  // so bumping the revision here reproduces "content landed, recompute now" —
  // the state the real shell reaches whenever a session's rows load. Without
  // it the cues would be read from a pre-layout measurement, which would make
  // these assertions test the harness rather than the policy.
  setRevision(1)
  await settle(app)
  return { app, api: api! }
}

async function settle(app: Awaited<ReturnType<typeof testRender>>, frames = 5) {
  for (let attempt = 0; attempt < frames; attempt++) {
    await Bun.sleep(30)
    await app.renderOnce()
  }
}

test("the up cue stays hidden at the top of the content", async () => {
  const { app, api } = await renderHarness()
  try {
    const frame = app.captureCharFrame()
    expect(frame).toContain("no-up")
    // 20 rows of content in a 6-row viewport: there is content below.
    expect(frame).toContain("CUE-DOWN")
    expect(api.refreshScrollIndicators).toBeDefined()
  } finally {
    app.renderer.destroy()
  }
})

test("scrolling to the bottom flips the cues", async () => {
  const { app, api } = await renderHarness()
  try {
    const scroll = findScrollBox(app.renderer.root)
    expect(scroll).toBeDefined()

    api.scrollToBottom()
    await settle(app)

    // Genuinely scrolled (not a no-op), so the assertion below is about the
    // policy and not about nothing having happened.
    expect(scroll!.scrollTop).toBeGreaterThan(0)

    const frame = app.captureCharFrame()
    expect(frame).toContain("CUE-UP")
    // At the bottom there is nothing further to reveal.
    expect(frame).toContain("no-down")
  } finally {
    app.renderer.destroy()
  }
})

test("scrolling back to the top hides the up cue again", async () => {
  const { app, api } = await renderHarness()
  try {
    api.scrollToBottom()
    await settle(app, 3)
    api.scrollToTop()
    await settle(app, 3)

    const frame = app.captureCharFrame()
    expect(frame).toContain("no-up")
    expect(frame).toContain("CUE-DOWN")
  } finally {
    app.renderer.destroy()
  }
})
