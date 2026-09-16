import { describe, expect, test } from "bun:test"
import { createRoot, type Accessor } from "solid-js"
import {
  terminalSizeConsumers,
  useTerminalSize,
  type SizeSource,
  type TerminalSize,
} from "../src/util/terminal-size"

/**
 * A renderer stand-in: an emitter plus a mutable measured size, so a resize can
 * be delivered exactly the way `CliRenderer` delivers one — `emit("resize", w, h)`
 * after the width has moved.
 */
function createFakeRenderer(width = 120, height = 40) {
  const listeners = new Set<(width: number, height: number) => void>()
  const source: SizeSource = {
    get width() {
      return width
    },
    get height() {
      return height
    },
    on(event, listener) {
      if (event === "resize") listeners.add(listener)
    },
    off(event, listener) {
      if (event === "resize") listeners.delete(listener)
    },
  }
  return {
    source,
    get listenerCount() {
      return listeners.size
    },
    resize(next: number, nextHeight = height) {
      width = next
      height = nextHeight
      for (const listener of [...listeners]) listener(width, height)
    },
  }
}

/** Runs `body` inside an owner so the hook's `onCleanup` has somewhere to land. */
function withOwner<T>(body: () => T): { value: T; dispose: () => void } {
  let dispose = () => {}
  const value = createRoot((rootDispose) => {
    dispose = rootDispose
    return body()
  })
  return { value, dispose }
}

describe("terminal size source", () => {
  test("every consumer shares one resize subscription", () => {
    const renderer = createFakeRenderer()
    const seen: Array<{ accessor: Accessor<TerminalSize>; dispose: () => void }> = []
    for (let i = 0; i < 5; i++) {
      const owner = withOwner(() => useTerminalSize(renderer.source))
      seen.push({ accessor: owner.value, dispose: owner.dispose })
    }
    // The whole point: five surfaces, one listener on the renderer.
    expect(renderer.listenerCount).toBe(1)
    expect(terminalSizeConsumers(renderer.source)).toBe(5)

    renderer.resize(80, 24)
    // ...and every one of them hears about it.
    for (const consumer of seen) expect(consumer.accessor()).toEqual({ width: 80, height: 24 })
  })

  test("the subscription ends when the last consumer unmounts", () => {
    const renderer = createFakeRenderer()
    const first = withOwner(() => useTerminalSize(renderer.source))
    const second = withOwner(() => useTerminalSize(renderer.source))
    expect(renderer.listenerCount).toBe(1)

    // The first to mount can be the first to unmount — a route swap does
    // exactly that — and the survivor must keep its subscription.
    first.dispose()
    expect(renderer.listenerCount).toBe(1)
    renderer.resize(80)
    expect(second.value().width).toBe(80)

    second.dispose()
    expect(renderer.listenerCount).toBe(0)
    expect(terminalSizeConsumers(renderer.source)).toBe(0)
  })

  test("a consumer that mounts after the creator unmounted still watches", () => {
    const renderer = createFakeRenderer()
    const creator = withOwner(() => useTerminalSize(renderer.source))
    creator.dispose()
    expect(renderer.listenerCount).toBe(0)

    const late = withOwner(() => useTerminalSize(renderer.source))
    expect(renderer.listenerCount).toBe(1)
    renderer.resize(64)
    expect(late.value().width).toBe(64)
    late.dispose()
    expect(renderer.listenerCount).toBe(0)
  })

  test("two renderers never share a subscription or a measurement", () => {
    const one = createFakeRenderer(100, 30)
    const two = createFakeRenderer(200, 60)
    const a = withOwner(() => useTerminalSize(one.source))
    const b = withOwner(() => useTerminalSize(two.source))
    expect(one.listenerCount).toBe(1)
    expect(two.listenerCount).toBe(1)

    one.resize(90)
    expect(a.value().width).toBe(90)
    expect(b.value().width).toBe(200)
  })

  test("a first measurement is taken at mount, not at the first resize", () => {
    const renderer = createFakeRenderer(140, 50)
    const { value } = withOwner(() => useTerminalSize(renderer.source))
    expect(value()).toEqual({ width: 140, height: 50 })
  })

  test("an unmeasured renderer reports zero, and a bad one is not measured", () => {
    // The convention `useTerminalDimensions` already used: a renderer that has
    // not been laid out says 0. `NaN`/`Infinity` are the same "not measured",
    // rather than a width that propagates into arithmetic.
    const before = createFakeRenderer(0, 0)
    const unmeasured = withOwner(() => useTerminalSize(before.source))
    expect(unmeasured.value()).toEqual({ width: 0, height: 0 })

    const strange = { ...createFakeRenderer(Number.NaN, Number.POSITIVE_INFINITY).source }
    Object.defineProperty(strange, "width", { value: Number.NaN })
    Object.defineProperty(strange, "height", { value: Number.POSITIVE_INFINITY })
    const guarded = withOwner(() => useTerminalSize(strange as SizeSource))
    expect(guarded.value()).toEqual({ width: 0, height: 0 })
  })

  test("a plugin with no renderer reads zero and subscribes to nothing", () => {
    // The argument is optional because a plugin is handed its renderer as a
    // prop. Nothing to watch means nothing to unwatch, so the cleanup must not
    // reach for a renderer that was never there.
    const { value, dispose } = withOwner(() => useTerminalSize(undefined))
    expect(value()).toEqual({ width: 0, height: 0 })
    expect(() => dispose()).not.toThrow()
  })
})
