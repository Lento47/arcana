import { afterEach, describe, expect } from "bun:test"
import { Effect, Layer, Queue, Schema, Stream } from "effect"
import { EventPaths } from "../../src/server/routes/instance/httpapi/groups/event"
import { EventV2 } from "@arcana/core/event"
import { EventV2Bridge } from "@/event-v2-bridge"
import { resetDatabase } from "../fixture/db"
import { disposeAllInstances, TestInstance } from "../fixture/fixture"
import { testEffectShared } from "../lib/effect"
import { httpApiLayer, requestInDirectory } from "./httpapi-layer"

/**
 * Load reproduction for the mid-stream SSE stall observed live (2026-07-31,
 * 18:16 session ses_04551e419ffeVd3u): the TUI froze at 5 chars of the final
 * text while the daemon kept streaming 7,962 chars into the DB. The turn
 * continued because the publish path (unbounded queue) is decoupled from the
 * SSE write path. This test pumps the same event shapes (50KB tool outputs,
 * 8KB text part updates) through the real publish -> SSE pipeline and verifies
 * the client receives everything, in order.
 */

const LoadEvent = EventV2.define({
  type: "test.load.large",
  schema: {
    n: Schema.Number,
    kind: Schema.String,
    payload: Schema.String,
  },
})

const bigPayload = (size: number) => "x".repeat(size)
const bigJson = (n: number, kind: string, size: number) =>
  JSON.stringify({ n, kind, payload: bigPayload(size) })

/** Persistent SSE frame parser: accumulates chunks across calls, yields one event per take. */
const createParser = () => {
  const decoder = new TextDecoder()
  let buffer = ""
  const events: string[] = []
  return {
    push(chunk: Uint8Array) {
      buffer += decoder.decode(chunk, { stream: true })
      const frames = buffer.split("\n\n")
      buffer = frames.pop() ?? ""
      for (const frame of frames) {
        const dataLine = frame.split("\n").find((line) => line.startsWith("data:"))
        if (dataLine) events.push(dataLine.replace(/^data:\s*/, ""))
      }
    },
    take(timeoutMs = 2_000): Effect.Effect<string | undefined> {
      if (events.length > 0) return Effect.succeed(events.shift()!)
      return Effect.gen(function* () {
        const deadline = Date.now() + timeoutMs
        while (events.length === 0) {
          if (Date.now() > deadline) return yield* Effect.fail(new Error("SSE stalled"))
          yield* Effect.sleep("20 millis")
        }
        return events.shift()!
      }).pipe(Effect.catch(() => Effect.succeed(undefined)))
    },
  }
}

/** Take `expected` events through a persistent parser with an overall deadline. */
const collectEvents = (parser: ReturnType<typeof createParser>, expected: number, timeoutMs = 15_000) =>
  Effect.gen(function* () {
    const received: string[] = []
    const deadline = Date.now() + timeoutMs
    while (received.length < expected) {
      if (Date.now() > deadline) break
      const event = yield* parser.take(2_000).pipe(
        Effect.catch(() => Effect.succeed(undefined as string | undefined)),
      )
      if (event !== undefined) received.push(event)
    }
    return received
  })

const openEventStream = (directory: string) =>
  Effect.gen(function* () {
    const response = yield* requestInDirectory(EventPaths.event, directory)
    const parser = createParser()
    yield* response.stream.pipe(
      Stream.runForEach((value) => Effect.sync(() => parser.push(value as Uint8Array))),
      Effect.forkScoped,
    )
    return { response, parser }
  })

afterEach(async () => {
  await disposeAllInstances()
  await resetDatabase()
})

const it = testEffectShared(
  httpApiLayer.pipe(Layer.provideMerge(EventV2Bridge.defaultLayer)),
)

describe("event HttpApi — large-payload load", () => {
  it.instance(
    "delivers 15x50KB + 10x8KB events in order through the SSE pipeline",
    () =>
      Effect.gen(function* () {
        const { directory } = yield* TestInstance
        const bridge = yield* EventV2Bridge.Service
        const { parser } = yield* openEventStream(directory)

        // Burn the server.connected event.
        const first = yield* collectEvents(parser, 1, 5_000)
        expect(JSON.parse(first[0]).type).toBe("server.connected")

        const payloads: Array<{ n: number; kind: string; size: number }> = []
        for (let n = 0; n < 15; n++) payloads.push({ n, kind: "tool", size: 50_000 })
        for (let n = 15; n < 25; n++) payloads.push({ n, kind: "text", size: 8_000 })

        for (const p of payloads) {
          yield* bridge.publish(LoadEvent, { n: p.n, kind: p.kind, payload: bigPayload(p.size) })
        }

        const received = yield* collectEvents(parser, 25, 20_000)
        expect(received).toHaveLength(25)
        for (let i = 0; i < 25; i++) {
          const parsed = JSON.parse(received[i])
          expect(parsed.type).toBe("test.load.large")
          expect(parsed.properties.n).toBe(i)
          expect(parsed.properties.kind).toBe(i < 15 ? "tool" : "text")
          if (i < 15) {
            expect((parsed.properties.payload as string).length).toBe(50_000)
          }
        }
      }),
    { git: true, config: { formatter: false, lsp: false } },
  )

  it.instance(
    "publishing a burst while the consumer is paused loses nothing (backpressure recovery)",
    () =>
      Effect.gen(function* () {
        const { directory } = yield* TestInstance
        const bridge = yield* EventV2Bridge.Service
        const { parser } = yield* openEventStream(directory)
        yield* collectEvents(parser, 1, 5_000)

        // Publish the whole burst without reading.
        for (let n = 0; n < 10; n++) {
          yield* bridge.publish(LoadEvent, { n, kind: "tool", payload: bigPayload(50_000) })
        }

        // Now consume slowly: one event, small pause, next.
        const received: string[] = []
        for (let i = 0; i < 10; i++) {
          const batch = yield* collectEvents(parser, 1, 10_000)
          received.push(...batch)
          yield* Effect.sleep("50 millis")
        }

        expect(received).toHaveLength(10)
        for (let i = 0; i < 10; i++) {
          expect(JSON.parse(received[i]).properties.n).toBe(i)
        }
      }),
    { git: true, config: { formatter: false, lsp: false } },
  )

  it.instance(
    "a single 100KB event survives chunked writes",
    () =>
      Effect.gen(function* () {
        const { directory } = yield* TestInstance
        const bridge = yield* EventV2Bridge.Service
        const { parser } = yield* openEventStream(directory)
        yield* collectEvents(parser, 1, 5_000)

        yield* bridge.publish(LoadEvent, { n: 0, kind: "tool", payload: bigPayload(100_000) })

        const received = yield* collectEvents(parser, 1, 10_000)
        expect(received).toHaveLength(1)
        const parsed = JSON.parse(received[0])
        expect((parsed.properties.payload as string).length).toBe(100_000)
      }),
    { git: true, config: { formatter: false, lsp: false } },
  )

  it.effect(
    "the per-subscriber sliding queue drops the oldest head on overflow (unit)",
    () =>
      Effect.gen(function* () {
        const queue = yield* Queue.sliding<number>(512)
        for (let n = 0; n < 700; n++) {
          yield* Queue.offer(queue, n)
        }
        const head = yield* Queue.take(queue)
        expect(head).toBe(188) // 700 - 512 = 188 oldest dropped
        const count = yield* Queue.size(queue)
        expect(count).toBe(511)
      }),
  )
})
