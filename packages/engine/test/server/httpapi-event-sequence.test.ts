import { afterEach, describe, expect } from "bun:test"
import { Effect, Layer, Schema, Stream } from "effect"
import { EventPaths } from "../../src/server/routes/instance/httpapi/groups/event"
import { EventV2 } from "@arcana/core/event"
import { EventV2Bridge } from "@/event-v2-bridge"
import { resetDatabase } from "../fixture/db"
import { disposeAllInstances, TestInstance } from "../fixture/fixture"
import { testEffectShared } from "../lib/effect"
import { httpApiLayer, requestInDirectory } from "./httpapi-layer"

/**
 * Live-consistency transport envelope tests (P12.3).
 *
 * The engine numbers every state-bearing event per subscriber with a
 * monotonic wire sequence and a per-connection streamID. Heartbeats carry
 * headSequence = the highest state-bearing sequence enqueued before the tick.
 * A client that tracks lastApplied can therefore detect divergence while the
 * connection is alive: headSequence outrunning applied means events were
 * dropped or failed to apply, and the client must reconcile from REST.
 */

const SeqEvent = EventV2.define({
  type: "test.seq",
  schema: {
    n: Schema.Number,
  },
})

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

/** Read events until `match` returns true or the deadline passes. */
const readUntil = (
  parser: ReturnType<typeof createParser>,
  match: (event: any) => boolean,
  timeoutMs = 15_000,
): Effect.Effect<any | undefined> =>
  Effect.gen(function* () {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const event = yield* parser.take(2_000).pipe(Effect.catch(() => Effect.succeed(undefined as string | undefined)))
      if (event !== undefined) {
        const parsed = JSON.parse(event)
        if (match(parsed)) return parsed
      }
    }
    return undefined
  })

afterEach(async () => {
  await disposeAllInstances()
  await resetDatabase()
})

const it = testEffectShared(
  httpApiLayer.pipe(Layer.provideMerge(EventV2Bridge.defaultLayer)),
)

describe("event HttpApi — live-consistency transport envelope (P12)", () => {
  it.instance(
    "wire sequences are monotonic and gapless per subscriber",
    () =>
      Effect.gen(function* () {
        const { directory } = yield* TestInstance
        const bridge = yield* EventV2Bridge.Service
        const { parser } = yield* openEventStream(directory)

        const connected = yield* readUntil(parser, (e) => e.type === "server.connected", 5_000)
        expect(connected.transport.sequence).toBe(0)
        expect(connected.transport.streamID).toMatch(/^stm_/)

        for (let n = 1; n <= 5; n++) {
          yield* bridge.publish(SeqEvent, { n })
        }

        for (let expected = 1; expected <= 5; expected++) {
          const event = yield* readUntil(parser, (e) => e.type === "test.seq" && e.properties.n === expected, 10_000)
          expect(event.transport.sequence).toBe(expected)
          expect(event.transport.streamID).toBe(connected.transport.streamID)
        }
      }),
    { git: true, config: { formatter: false, lsp: false } },
  )

  it.instance(
    "heartbeat headSequence exposes events enqueued but not yet applied (gap detection)",
    () =>
      Effect.gen(function* () {
        const { directory } = yield* TestInstance
        const bridge = yield* EventV2Bridge.Service
        const { parser } = yield* openEventStream(directory)

        yield* readUntil(parser, (e) => e.type === "server.connected", 5_000)

        // Publish 5 events but consume only 2 before the heartbeat lands.
        for (let n = 1; n <= 5; n++) {
          yield* bridge.publish(SeqEvent, { n })
        }
        for (let expected = 1; expected <= 2; expected++) {
          yield* readUntil(parser, (e) => e.type === "test.seq" && e.properties.n === expected, 10_000)
        }

        const heartbeat = yield* readUntil(parser, (e) => e.type === "server.heartbeat", 15_000)
        expect(heartbeat).toBeDefined()
        // headSequence = ALL state-bearing events enqueued (5), not the 2 applied.
        expect(heartbeat.transport.headSequence).toBe(5)
        // Heartbeat carries its own sequence counter and the stream identity.
        expect(heartbeat.transport.streamID).toMatch(/^stm_/)
        expect(typeof heartbeat.transport.sequence).toBe("number")
      }),
    { git: true, config: { formatter: false, lsp: false } },
    20_000,
  )

  it.instance(
    "a new connection gets a new streamID and restarts at sequence 0",
    () =>
      Effect.gen(function* () {
        const { directory } = yield* TestInstance
        const bridge = yield* EventV2Bridge.Service
        const first = yield* openEventStream(directory)
        const second = yield* openEventStream(directory)

        const connectedA = yield* readUntil(first.parser, (e) => e.type === "server.connected", 5_000)
        const connectedB = yield* readUntil(second.parser, (e) => e.type === "server.connected", 5_000)

        expect(connectedA.transport.streamID).not.toBe(connectedB.transport.streamID)
        expect(connectedA.transport.sequence).toBe(0)
        expect(connectedB.transport.sequence).toBe(0)

        // The same published event is numbered independently per subscriber.
        yield* bridge.publish(SeqEvent, { n: 1 })
        const onA = yield* readUntil(first.parser, (e) => e.type === "test.seq", 10_000)
        const onB = yield* readUntil(second.parser, (e) => e.type === "test.seq", 10_000)
        expect(onA.transport.streamID).toBe(connectedA.transport.streamID)
        expect(onB.transport.streamID).toBe(connectedB.transport.streamID)
        expect(onA.transport.sequence).toBe(1)
        expect(onB.transport.sequence).toBe(1)
      }),
    { git: true, config: { formatter: false, lsp: false } },
  )
})
