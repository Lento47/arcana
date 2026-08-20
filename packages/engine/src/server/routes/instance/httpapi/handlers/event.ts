import { EventV2Bridge } from "@/event-v2-bridge"
import { InstanceState } from "@/effect/instance-state"
import { GlobalBus } from "@/bus/global"
import { EventV2 } from "@arcana/core/event"
import { Effect, Queue } from "effect"
import * as Stream from "effect/Stream"
import { HttpServerResponse } from "effect/unstable/http"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import * as Sse from "effect/unstable/encoding/Sse"
import { resetActivity, sseConnected, sseDisconnected } from "@/daemon/activity"
import { EventApi } from "../groups/event"
import path from "path"

function eventData(data: unknown): Sse.Event {
  return {
    _tag: "Event",
    event: "message",
    id: undefined,
    data: JSON.stringify(data),
  }
}

function eventID() {
  return EventV2.ID.create()
}

/**
 * Live-consistency transport envelope (P12).
 *
 * Every event emitted to a subscriber carries a per-connection streamID and a
 * monotonic wire sequence. Heartbeats carry headSequence = the highest
 * state-bearing sequence enqueued before the heartbeat tick, so a client can
 * detect divergence while the connection is alive: if headSequence outruns
 * what the client applied, events were dropped or failed to apply, and the
 * client must reconcile from REST. The sequence space is assigned AFTER the
 * workspace/directory filter, so clients see a gapless sequence over exactly
 * the events they were meant to receive.
 *
 * The sliding queue stays bounded (slow consumers cannot stall the publish
 * path), but drops are no longer silent: the heartbeat fiber estimates drops
 * from offered/delivered/queue-depth accounting and logs an overflow warning.
 * The client-side sequence gap remains the authoritative correctness detector.
 */
function eventResponse(events: EventV2.Interface) {
  return Effect.gen(function* () {
    const instance = yield* InstanceState.context
    const workspaceID = yield* InstanceState.workspaceID
    const streamID = `stm_${eventID()}`
    // Listener registration is eager, so events published after this point cannot
    // be lost while the HTTP body fiber is starting or emitting server.connected.
    // Sliding (drop-oldest) per subscriber: a slow consumer can never stall the
    // publish path or accumulate unbounded memory. F-A2: capacity raised from
    // 512 to 4096, and foreign events are filtered BEFORE the offer below —
    // a cross-directory/workspace flood can no longer evict this subscriber's
    // own deltas from the queue.
    const queue = yield* Queue.sliding<EventV2.Payload>(4096)
    // Normalize paths for comparison to handle Windows mixed separators (\ vs /)
    // and case differences. path.normalize handles separator normalization;
    // lowercase ensures case-insensitive matching on Windows.
    const normalizedInstanceDir = path.normalize(instance.directory).toLowerCase()
    const belongsToSubscriber = (event: EventV2.Payload) => {
      if (!event.location?.directory) return false
      const normalizedEventDir = path.normalize(event.location.directory).toLowerCase()
      return (
        normalizedEventDir === normalizedInstanceDir &&
        (event.location.workspaceID === undefined || event.location.workspaceID === workspaceID)
      )
    }
    const unsubscribe = yield* events.listen((event) =>
      Effect.sync(() => {
        offered += 1
        // Pre-filter before the offer: foreign events never consume queue
        // budget (F-A2). The post-stream filter below remains as
        // defense-in-depth and keeps the wire sequence gapless over exactly
        // this subscriber's events.
        if (!belongsToSubscriber(event)) return
        Queue.offerUnsafe(queue, event)
      }),
    )
    yield* Effect.addFinalizer(() => unsubscribe)

    // Per-subscriber wire counters. All increments happen on the single-threaded
    // event loop (no awaits between read and write), so plain numbers are safe.
    let wireSeq = 0 // state-bearing events emitted to the wire (post-filter)
    let hbSeq = 0 // heartbeat sequence (own counter, never pollutes wireSeq)
    let offered = 0 // events offered to the sliding queue
    let delivered = 0 // events pulled from the queue by the stream
    let lastReportedDropped = 0

    const stream = Stream.fromQueue(queue).pipe(
      Stream.tap(() =>
        Effect.sync(() => {
          delivered += 1
        }),
      ),
      Stream.filter(belongsToSubscriber),
    )
    const disposed = Stream.callback<{ id: string; type: string; properties: unknown }>((queue) => {
      const listener = (event: {
        directory?: string
        payload: { id?: string; type?: string; properties?: unknown }
      }) => {
        if (event.directory !== instance.directory || event.payload.type !== "server.instance.disposed") return
        Queue.offerUnsafe(queue, {
          id: event.payload.id ?? eventID(),
          type: "server.instance.disposed",
          properties: event.payload.properties ?? {},
        })
      }
      return Effect.acquireRelease(
        Effect.sync(() => GlobalBus.on("event", listener)),
        () => Effect.sync(() => GlobalBus.off("event", listener)),
      )
    })
    const output = stream.pipe(
      Stream.merge(disposed, { haltStrategy: "left" }),
      Stream.takeUntil((event) => event.type === "server.instance.disposed"),
      // Number everything that goes on the wire with the per-connection envelope.
      Stream.map((event) => ({
        id: (event as { id?: string }).id ?? eventID(),
        type: (event as { type: string }).type,
        properties: ((event as { data?: unknown }).data ?? (event as { properties?: unknown }).properties ?? {}) as unknown,
        transport: { streamID, sequence: ++wireSeq },
      })),
    )
    const heartbeat = Stream.tick("10 seconds").pipe(
      Stream.drop(1),
      Stream.mapEffect(() =>
        Effect.gen(function* () {
          // A flowing heartbeat means at least one live SSE client: keep the
          // daemon's idle self-destruct from firing (see daemon/activity.ts).
          resetActivity()
          const queueDepth = yield* Queue.size(queue)
          const estimatedDropped = Math.max(0, offered - delivered - queueDepth)
          if (estimatedDropped > lastReportedDropped) {
            // What CHANGED, not just that it happened: the sliding queue
            // evicts the OLDEST entries, so the dropped offers are exactly
            // offers [delivered+1 .. delivered+dropped]. For a single
            // workspace/directory subscriber, offer order == wire sequence
            // order, so this is the dropped wire range the client will see
            // as a sequence gap.
            const firstDropped = delivered + 1
            const lastDropped = delivered + estimatedDropped
            lastReportedDropped = estimatedDropped
            yield* Effect.logWarning(
              `[sse] subscriber overflow stream=${streamID} droppedOffers=${estimatedDropped} droppedOfferRange=${firstDropped}-${lastDropped} queue=${queueDepth} offered=${offered} delivered=${delivered} head=${wireSeq}`,
            )
          }
          return {
            id: eventID(),
            type: "server.heartbeat",
            properties: { headSequence: wireSeq },
            transport: { streamID, sequence: ++hbSeq, headSequence: wireSeq },
          }
        }),
      ),
    )

    yield* Effect.logInfo("event connected")
    yield* Effect.sync(() => {
      sseConnected()
      resetActivity()
    })
    return HttpServerResponse.stream(
      Stream.make({
        id: eventID(),
        type: "server.connected",
        properties: {},
        transport: { streamID, sequence: 0, headSequence: 0 },
      }).pipe(
        Stream.concat(output.pipe(Stream.merge(heartbeat, { haltStrategy: "left" }))),
        Stream.map(eventData),
        Stream.pipeThroughChannel(Sse.encode()),
        Stream.encodeText,
        Stream.ensuring(
          Effect.gen(function* () {
            yield* Effect.logInfo(
              `[sse] subscriber closed stream=${streamID} offered=${offered} delivered=${delivered} estimatedDropped=${lastReportedDropped} head=${wireSeq}`,
            )
            yield* Effect.sync(() => sseDisconnected())
          }),
        ),
      ),
      {
        contentType: "text/event-stream",
        headers: {
          "Cache-Control": "no-cache, no-transform",
          "X-Accel-Buffering": "no",
          "X-Content-Type-Options": "nosniff",
        },
      },
    )
  })
}

export const eventHandlers = HttpApiBuilder.group(EventApi, "event", (handlers) =>
  Effect.gen(function* () {
    const events = yield* EventV2Bridge.Service
    return handlers.handleRaw(
      "subscribe",
      Effect.fn("EventHttpApi.subscribe")(function* () {
        return yield* eventResponse(events)
      }),
    )
  }),
)
