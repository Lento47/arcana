import { describe, expect, test } from "bun:test"
import { createIsolatedEmitter } from "../src/util/isolated-emitter"

describe("createIsolatedEmitter (P12.2)", () => {
  test("a throwing subscriber does not block later subscribers for the same event", () => {
    const emitter = createIsolatedEmitter<{ n: number }>()
    const seen: number[] = []
    emitter.on(() => {
      throw new Error("subscriber A boom")
    })
    emitter.on((e) => seen.push(e.n))
    emitter.on((e) => seen.push(e.n * 10))

    emitter.emit({ n: 1 })

    expect(seen).toEqual([1, 10])
  })

  test("subsequent events continue after a subscriber throws", () => {
    const emitter = createIsolatedEmitter<{ n: number }>()
    const seen: number[] = []
    let failOnce = true
    emitter.on((e) => {
      if (failOnce) {
        failOnce = false
        throw new Error("boom once")
      }
      seen.push(e.n)
    })

    emitter.emit({ n: 1 }) // throws, isolated
    emitter.emit({ n: 2 }) // runs
    emitter.emit({ n: 3 }) // runs

    expect(seen).toEqual([2, 3])
  })

  test("unsubscribe removes the handler", () => {
    const emitter = createIsolatedEmitter<{ n: number }>()
    const seen: number[] = []
    const off = emitter.on((e) => seen.push(e.n))
    off()
    emitter.emit({ n: 1 })
    expect(seen).toEqual([])
    expect(emitter.listenerCount()).toBe(0)
  })

  test("clear removes all handlers", () => {
    const emitter = createIsolatedEmitter<{ n: number }>()
    emitter.on(() => {})
    emitter.on(() => {})
    emitter.clear()
    expect(emitter.listenerCount()).toBe(0)
  })
})
