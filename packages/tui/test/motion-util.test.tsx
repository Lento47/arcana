/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import { testRender, type JSX } from "@opentui/solid"
import { createSignal } from "solid-js"
import { KVContext } from "../src/context/kv"
import {
  breathValue,
  createBreath,
  createEase,
  createFlare,
  nextEaseValue,
  nextFlareValue,
} from "../src/util/motion"

function kv(animations: boolean) {
  return {
    ready: true,
    store: {},
    get(key: string, fallback?: unknown) {
      return key === "animations_enabled" ? animations : fallback
    },
    set() {},
    signal<T>(_name: string, fallback: T) {
      return [() => fallback, () => {}] as const
    },
  } as any
}

function withKv(animations: boolean, children: () => JSX.Element) {
  return <KVContext.Provider value={kv(animations)}>{children()}</KVContext.Provider>
}

// ---------- pure math ----------

test("flare decay approaches rest without overshooting", () => {
  let value = 1
  for (let step = 0; step < 40; step++) value = nextFlareValue(value, 0, 30, 60)
  expect(value).toBeGreaterThan(0)
  expect(value).toBeLessThan(0.001)
  // A step at least as long as the fall window snaps in one frame.
  expect(nextFlareValue(1, 0, 40, 40)).toBe(0)
})

test("ease approach moves toward the target and never crosses it", () => {
  let up = 0
  for (let step = 0; step < 30; step++) up = nextEaseValue(up, 1, 0.4, 0.2)
  expect(up).toBeGreaterThan(0.99)
  expect(up).toBeLessThanOrEqual(1)

  let down = 1
  for (let step = 0; step < 30; step++) down = nextEaseValue(down, 0, 0.4, 0.2)
  expect(down).toBeLessThan(0.01)
  expect(down).toBeGreaterThanOrEqual(0)
})

test("breath value is a bounded sine", () => {
  expect(breathValue(0, 1000)).toBeCloseTo(0, 5)
  expect(breathValue(500, 1000)).toBeCloseTo(1, 5)
  expect(breathValue(1000, 1000)).toBeCloseTo(0, 5)
  for (let t = 0; t < 2500; t += 37) {
    const value = breathValue(t, 1000)
    expect(value).toBeGreaterThanOrEqual(0)
    expect(value).toBeLessThanOrEqual(1)
  }
})

// ---------- hook integration ----------

test("createFlare pulses on an observed edge and settles back to rest", async () => {
  const [active, setActive] = createSignal(false)
  let intensity: () => number = () => -1
  const Probe = () => {
    intensity = createFlare(active, { stepMs: 16, fallMs: 32 })
    return null
  }

  const app = await testRender(() => withKv(true, () => <Probe />), { width: 20, height: 2 })
  try {
    await app.renderOnce()
    // No flare on mount: the row was already at rest when it appeared.
    expect(intensity()).toBe(0)

    setActive(true)
    await app.renderOnce()
    expect(intensity()).toBe(1)

    await Bun.sleep(220)
    await app.renderOnce()
    expect(intensity()).toBe(0)
  } finally {
    app.renderer.destroy()
  }
})

test("disabled animations leave every primitive at its static value", async () => {
  const [active, setActive] = createSignal(false)
  const [target, setTarget] = createSignal(0)
  let flare: () => number = () => -1
  let ease: () => number = () => -1
  let breath: () => number = () => -1
  const Probe = () => {
    flare = createFlare(active, { stepMs: 16, fallMs: 32 })
    ease = createEase(target, { stepMs: 16, riseRate: 0.5, fallRate: 0.5 })
    breath = createBreath(() => true, { stepMs: 16, periodMs: 400 })
    return null
  }

  const app = await testRender(() => withKv(false, () => <Probe />), { width: 20, height: 2 })
  try {
    await app.renderOnce()
    setActive(true)
    setTarget(5)
    await app.renderOnce()
    expect(flare()).toBe(0)
    expect(ease()).toBe(5)
    expect(breath()).toBe(0)

    await Bun.sleep(90)
    await app.renderOnce()
    expect(flare()).toBe(0)
    expect(ease()).toBe(5)
    expect(breath()).toBe(0)
  } finally {
    app.renderer.destroy()
  }
})

test("createEase animates a gauge toward its target and then stops", async () => {
  const [target, setTarget] = createSignal(0)
  let eased: () => number = () => -1
  const Probe = () => {
    eased = createEase(target, { stepMs: 16, riseRate: 0.5, fallRate: 0.5, epsilon: 0.5 })
    return null
  }

  const app = await testRender(() => withKv(true, () => <Probe />), { width: 20, height: 2 })
  try {
    await app.renderOnce()
    expect(eased()).toBe(0)

    setTarget(100)
    await app.renderOnce()
    await Bun.sleep(40)
    await app.renderOnce()
    const mid = eased()
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(100)

    await Bun.sleep(200)
    await app.renderOnce()
    expect(eased()).toBe(100)
  } finally {
    app.renderer.destroy()
  }
})

test("createBreath climbs away from rest while animations are enabled", async () => {
  let breath: () => number = () => -1
  const Probe = () => {
    breath = createBreath(() => true, { stepMs: 16, periodMs: 400 })
    return null
  }

  const app = await testRender(() => withKv(true, () => <Probe />), { width: 20, height: 2 })
  try {
    await app.renderOnce()
    expect(breath()).toBe(0)

    await Bun.sleep(120)
    await app.renderOnce()
    expect(breath()).toBeGreaterThan(0)
    expect(breath()).toBeLessThanOrEqual(1)
  } finally {
    app.renderer.destroy()
  }
})

test("createBreath holds rest while its cue is dormant", async () => {
  const [active, setActive] = createSignal(false)
  let breath: () => number = () => -1
  const Probe = () => {
    breath = createBreath(active, { stepMs: 16, periodMs: 400 })
    return null
  }

  const app = await testRender(() => withKv(true, () => <Probe />), { width: 20, height: 2 })
  try {
    await app.renderOnce()
    await Bun.sleep(120)
    await app.renderOnce()
    expect(breath()).toBe(0)

    setActive(true)
    await Bun.sleep(120)
    await app.renderOnce()
    expect(breath()).toBeGreaterThan(0)

    setActive(false)
    await app.renderOnce()
    expect(breath()).toBe(0)
  } finally {
    app.renderer.destroy()
  }
})
