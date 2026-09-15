import { afterEach, expect, test } from "bun:test"
import { createStreamFrameGate } from "../src/util/stream-frame"

/**
 * The gate commits on the next renderer frame (RAF, or setTimeout(0) in the
 * test runner). Under a saturated event loop (16 parallel workers) a real
 * timer may not fire within any reasonable wait, so these tests stub RAF and
 * drive the commit synchronously. They verify the coalescing semantics — the
 * frame mechanism itself is an implementation detail.
 */
let rafCallback: ((time: number) => void) | null = null

const installRafStub = () => {
  rafCallback = null
  globalThis.requestAnimationFrame = (cb: (time: number) => void) => {
    rafCallback = cb
    return 1
  }
  globalThis.cancelAnimationFrame = () => {
    rafCallback = null
  }
}

/** Run the captured frame callback synchronously, if one is pending. */
const commitFrame = () => {
  const cb = rafCallback
  rafCallback = null
  cb?.(performance.now())
}

afterEach(() => {
  delete (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame
  delete (globalThis as { cancelAnimationFrame?: unknown }).cancelAnimationFrame
})

test("coalesces updates by key and commits all latest callbacks together", () => {
  installRafStub()
  const gate = createStreamFrameGate(0)
  const committed: string[] = []

  gate.schedule("content", () => committed.push("old"))
  gate.schedule("content", () => committed.push("latest"))
  gate.schedule("scroll", () => committed.push("scroll"))

  expect(committed).toEqual([])
  commitFrame()
  expect(committed).toEqual(["latest", "scroll"])
  gate.dispose()
})

test("cancels a pending key without cancelling unrelated work", () => {
  installRafStub()
  const gate = createStreamFrameGate(0)
  const committed: string[] = []

  gate.schedule("content", () => committed.push("content"))
  gate.schedule("scroll", () => committed.push("scroll"))
  gate.cancel("content")

  commitFrame()
  expect(committed).toEqual(["scroll"])
  gate.dispose()
})

test("dispose prevents a late renderer frame from publishing", () => {
  installRafStub()
  const gate = createStreamFrameGate(0)
  let committed = false

  gate.schedule("content", () => {
    committed = true
  })
  gate.dispose()
  commitFrame()

  expect(committed).toBe(false)
})
