import { afterEach, expect, test } from "bun:test"
import { createStreamFrameGate } from "../src/util/stream-frame"

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

let gates: ReturnType<typeof createStreamFrameGate>[] = []

afterEach(() => {
  for (const gate of gates) gate.dispose()
  gates = []
})

test("coalesces updates by key and commits all latest callbacks together", async () => {
  const gate = createStreamFrameGate(0)
  gates.push(gate)
  const committed: string[] = []

  gate.schedule("content", () => committed.push("old"))
  gate.schedule("content", () => committed.push("latest"))
  gate.schedule("scroll", () => committed.push("scroll"))

  expect(committed).toEqual([])
  await wait(30)
  expect(committed).toEqual(["latest", "scroll"])
})

test("cancels a pending key without cancelling unrelated work", async () => {
  const gate = createStreamFrameGate(0)
  gates.push(gate)
  const committed: string[] = []

  gate.schedule("content", () => committed.push("content"))
  gate.schedule("scroll", () => committed.push("scroll"))
  gate.cancel("content")

  await wait(30)
  expect(committed).toEqual(["scroll"])
})

test("dispose prevents a late renderer frame from publishing", async () => {
  const gate = createStreamFrameGate(0)
  gates.push(gate)
  let committed = false

  gate.schedule("content", () => {
    committed = true
  })
  gate.dispose()

  await wait(30)
  expect(committed).toBe(false)
})
