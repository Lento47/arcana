/** @jsxImportSource @opentui/solid */
/**
 * The spine's shared tick is a liveness clock, not decoration.
 *
 * Two readouts depend on it while work is in flight — the composer's working
 * star, and a live row's elapsed duration (`spine-node.tsx` and
 * `spine-activity-reel.tsx` both memoize their duration on `phase()`, so a
 * frozen phase freezes the duration at whatever value it held). Gating the
 * clock on the animation preference stopped that tick while the row was still
 * working: the duration simply stopped counting.
 *
 * The preference therefore gates decoration DOWNSTREAM — every decorative
 * consumer asks `enabled()` / `isCueActive()` first — which is what this pins:
 * with animations disabled the clock keeps running, the decorative cue stays
 * off, and an idle screen (no cue) still ticks nothing.
 */
import { expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { createSignal } from "solid-js"
import { TestTuiProviders } from "./fixture/tui-providers"
import { useKV } from "../src/context/kv"
import { SpineMotionProvider, useSpineMotion } from "../src/shell/command-spine/spine-motion"

type Probe = {
  phase: () => number
  enabled: () => boolean
  isCueActive: (cue: string | undefined) => boolean
}

/** Mount the provider with animations off, and a cue the test controls. */
async function mount(cue: string | undefined) {
  const [cueValue, setCue] = createSignal<string | undefined>(cue)
  let probe: Probe | undefined
  const app = await testRender(
    () => (
      <TestTuiProviders>
        {/* Runs before its siblings, so the provider below reads the stored
            value rather than its `true` default. */}
        <box>
          {(() => {
            useKV().set("animations_enabled", false)
            return null
          })()}
        </box>
        <SpineMotionProvider activeCue={cueValue}>
          <box>
            {(() => {
              const motion = useSpineMotion()!
              probe = {
                phase: () => motion.phase(),
                enabled: () => motion.enabled(),
                isCueActive: (value) => motion.isCueActive(value),
              }
              return null
            })()}
          </box>
        </SpineMotionProvider>
      </TestTuiProviders>
    ),
    { width: 80, height: 6 },
  )
  // The tree resolves over a few passes (the same mount loop the other render
  // tests run), so wait for the probe to exist before returning.
  for (let attempt = 0; attempt < 40 && probe === undefined; attempt++) {
    await Bun.sleep(15)
    await app.renderOnce()
  }
  if (probe === undefined) throw new Error("the motion probe never mounted")
  return { app, probe, setCue }
}

test("a live cue keeps the clock ticking while animations are disabled", async () => {
  const { app, probe } = await mount("entry:work-1")
  try {
    // The preference is off, and it stays off for the decorative consumers.
    expect(probe.enabled()).toBe(false)
    expect(probe.isCueActive("entry:work-1")).toBe(false)

    // The clock, however, keeps its cadence: this is the readout's liveness.
    const before = probe.phase()
    await Bun.sleep(900)
    expect(probe.phase(), "the liveness clock stopped with animations disabled").toBeGreaterThan(before)
  } finally {
    app.renderer.destroy()
  }
})

test("an idle screen ticks nothing", async () => {
  const { app, probe } = await mount(undefined)
  try {
    await Bun.sleep(900)
    expect(probe.phase(), "the clock ran with no cue active").toBe(0)
  } finally {
    app.renderer.destroy()
  }
})

test("a cue that clears stops the clock", async () => {
  const { app, probe, setCue } = await mount("entry:work-1")
  try {
    await Bun.sleep(600)
    expect(probe.phase()).toBeGreaterThan(0)
    setCue(undefined)
    await app.renderOnce()
    await Bun.sleep(300)
    const settled = probe.phase()
    await Bun.sleep(700)
    expect(probe.phase(), "the clock outlived its cue").toBe(settled)
  } finally {
    app.renderer.destroy()
  }
})
