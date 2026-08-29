import { Config } from "@/config/config"
import { GlobalBus, type GlobalEvent as GlobalBusEvent } from "@/bus/global"
import { EffectBridge } from "@/effect/bridge"
import { EventV2 } from "@arcana/core/event"
import { Installation } from "@/installation"
import { disposeAllInstancesAndEmitGlobalDisposed } from "@/server/global-lifecycle"
import { InstallationVersion } from "@arcana/core/installation/version"
import { Effect, Queue, Schema } from "effect"
import * as Stream from "effect/Stream"
import { HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import * as Sse from "effect/unstable/encoding/Sse"
import { resetActivity, sseConnected, sseDisconnected } from "@/daemon/activity"
import { RootHttpApi } from "../api"
import { GlobalUpgradeInput } from "../groups/global"
import path from "path"

type GlobalEventFilter = {
  readonly directory?: string
  readonly workspace?: string
}

type GlobalWireEvent = GlobalBusEvent & {
  readonly directory: string
  readonly transport: {
    readonly streamID: string
    readonly sequence: number
    readonly headSequence?: number
  }
}

const GLOBAL_QUEUE_CAPACITY = 4096

function normalizeDirectory(value: string) {
  // HttpApi has already decoded query parameters. Decoding a second time would
  // turn a literal "%20" in a directory name into a space and could make two
  // distinct locations compare equal.
  const normalized = path.normalize(value)
  return process.platform === "win32" ? normalized.toLowerCase() : normalized
}

function isGlobalEvent(event: GlobalBusEvent) {
  return (
    (event.directory === undefined || event.directory.length === 0 || event.directory === "global") &&
    event.workspace === undefined
  )
}

function belongsToFilter(event: GlobalBusEvent, filter: GlobalEventFilter) {
  // Installation/lifecycle events without an instance location are global by
  // definition and must remain visible to every local operator console.
  if (isGlobalEvent(event)) return true

  // Workspace-scoped control-plane events intentionally have no instance
  // directory. Match the workspace when one was selected; otherwise preserve
  // the legacy global-stream behavior and expose them to unscoped clients.
  if (event.directory === undefined || event.directory.length === 0 || event.directory === "global") {
    return filter.workspace === undefined || event.workspace === filter.workspace
  }

  if (filter.directory && normalizeDirectory(event.directory ?? "") !== normalizeDirectory(filter.directory))
    return false
  if (filter.workspace && event.workspace !== undefined && event.workspace !== filter.workspace) return false
  return true
}

function eventData(data: GlobalWireEvent): Sse.Event {
  const kind = data.transport.headSequence === undefined ? "event" : "heartbeat"
  return {
    _tag: "Event",
    event: "message",
    id: `${data.transport.streamID}:${kind}:${data.transport.sequence}`,
    data: JSON.stringify(data),
  }
}

function parseBody(body: string) {
  try {
    return JSON.parse(body || "{}") as unknown
  } catch {
    return undefined
  }
}

function eventResponse(filter: GlobalEventFilter) {
  return Effect.gen(function* () {
    const streamID = `stm_${EventV2.ID.create()}`
    let wireSequence = 0
    let heartbeatSequence = 0
    let offered = 0
    let delivered = 0
    let lastReportedDropped = 0

    // The old Stream.callback path had no explicit capacity and registered
    // lazily after server.connected. A slow TUI could retain every unrelated
    // project's event, and a fast producer could race the first frame. Use an
    // eager bounded queue so registration happens before the response returns.
    const queue = yield* Queue.sliding<GlobalBusEvent>(GLOBAL_QUEUE_CAPACITY)
    const handler = (event: GlobalBusEvent) => {
      if (!belongsToFilter(event, filter)) return
      offered += 1
      Queue.offerUnsafe(queue, event)
    }
    yield* Effect.sync(() => GlobalBus.on("event", handler))
    yield* Effect.addFinalizer(() => Effect.sync(() => GlobalBus.off("event", handler)))

    const stream = Stream.fromQueue(queue).pipe(
      Stream.tap(() =>
        Effect.sync(() => {
          delivered += 1
        }),
      ),
      Stream.map((event) => ({
        ...event,
        directory: event.directory ?? "global",
        transport: {
          streamID,
          sequence: ++wireSequence,
        },
      })),
    )

    const heartbeat = Stream.tick("10 seconds").pipe(
      Stream.drop(1),
      Stream.mapEffect(() =>
        Effect.gen(function* () {
          const queueDepth = yield* Queue.size(queue)
          const estimatedDropped = Math.max(0, offered - delivered - queueDepth)
          // A global stream is still a live TUI connection. Keep the daemon's
          // idle lease alive during quiet periods just like the instance SSE.
          resetActivity()
          if (estimatedDropped > lastReportedDropped) {
            lastReportedDropped = estimatedDropped
            yield* Effect.logWarning(
              `[sse] global subscriber overflow stream=${streamID} droppedOffers=${estimatedDropped} queue=${queueDepth} offered=${offered} delivered=${delivered} head=${wireSequence}`,
            )
          }
          return {
            directory: filter.directory ?? "global",
            ...(filter.workspace ? { workspace: filter.workspace } : {}),
            payload: {
              id: EventV2.ID.create(),
              type: "server.heartbeat",
              properties: { headSequence: wireSequence },
            },
            transport: {
              streamID,
              sequence: ++heartbeatSequence,
              headSequence: wireSequence,
            },
          } as GlobalWireEvent
        }),
      ),
    )

    yield* Effect.logInfo(`global event connected stream=${streamID}`)
    yield* Effect.sync(() => {
      sseConnected()
      resetActivity()
    })

    return HttpServerResponse.stream(
      Stream.make({
        directory: filter.directory ?? "global",
        ...(filter.workspace ? { workspace: filter.workspace } : {}),
        payload: { id: EventV2.ID.create(), type: "server.connected", properties: {} },
        transport: { streamID, sequence: 0 },
      } as GlobalWireEvent).pipe(
        Stream.concat(stream.pipe(Stream.merge(heartbeat, { haltStrategy: "left" }))),
        Stream.map(eventData),
        Stream.pipeThroughChannel(Sse.encode()),
        Stream.encodeText,
        Stream.ensuring(
          Effect.gen(function* () {
            yield* Effect.logInfo(
              `[sse] global subscriber closed stream=${streamID} offered=${offered} delivered=${delivered} estimatedDropped=${lastReportedDropped} head=${wireSequence}`,
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

export const globalHandlers = HttpApiBuilder.group(RootHttpApi, "global", (handlers) =>
  Effect.gen(function* () {
    const config = yield* Config.Service
    const installation = yield* Installation.Service
    const bridge = yield* EffectBridge.make()

    const health = Effect.fn("GlobalHttpApi.health")(function* () {
      return { healthy: true as const, version: InstallationVersion }
    })

    const event = Effect.fn("GlobalHttpApi.event")(function* (ctx: { query: GlobalEventFilter }) {
      return yield* eventResponse(ctx.query)
    })

    const configGet = Effect.fn("GlobalHttpApi.configGet")(function* () {
      return yield* config.getGlobal()
    })

    const configUpdate = Effect.fn("GlobalHttpApi.configUpdate")(function* (ctx) {
      const result = yield* config.updateGlobal(ctx.payload)
      if (result.changed) bridge.fork(disposeAllInstancesAndEmitGlobalDisposed({ swallowErrors: true }))
      return result.info
    })

    const dispose = Effect.fn("GlobalHttpApi.dispose")(function* () {
      yield* disposeAllInstancesAndEmitGlobalDisposed()
      return true
    })

    const upgrade = Effect.fn("GlobalHttpApi.upgrade")(function* (ctx: { payload: typeof GlobalUpgradeInput.Type }) {
      const method = yield* installation.method()
      if (method === "unknown") {
        return {
          status: 400,
          body: { success: false as const, error: "Unknown installation method" },
        }
      }
      const target = ctx.payload.target || (yield* installation.latest(method))
      const result = yield* installation.upgrade(method, target).pipe(
        Effect.as({ status: 200, body: { success: true as const, version: target } }),
        Effect.catch((err) =>
          Effect.succeed({
            status: 500,
            body: {
              success: false as const,
              error: err instanceof Error ? err.message : String(err),
            },
          }),
        ),
      )
      if (!result.body.success) return result
      GlobalBus.emit("event", {
        directory: "global",
        payload: {
          type: Installation.Event.Updated.type,
          properties: { version: target },
        },
      })
      return result
    })

    const upgradeRaw = Effect.fn("GlobalHttpApi.upgradeRaw")(function* (ctx: {
      request: HttpServerRequest.HttpServerRequest
    }) {
      const body = yield* Effect.orDie(ctx.request.text)
      const json = parseBody(body)
      if (json === undefined) {
        return HttpServerResponse.jsonUnsafe({ success: false, error: "Invalid request body" }, { status: 400 })
      }
      const payload = yield* Schema.decodeUnknownEffect(GlobalUpgradeInput)(json).pipe(
        Effect.map((payload) => ({ valid: true as const, payload })),
        Effect.catch(() => Effect.succeed({ valid: false as const })),
      )
      if (!payload.valid) {
        return HttpServerResponse.jsonUnsafe({ success: false, error: "Invalid request body" }, { status: 400 })
      }
      const result = yield* upgrade({ payload: payload.payload })
      return HttpServerResponse.jsonUnsafe(result.body, { status: result.status })
    })

    return handlers
      .handle("health", health)
      .handleRaw("event", event)
      .handle("configGet", configGet)
      .handle("configUpdate", configUpdate)
      .handle("dispose", dispose)
      .handleRaw("upgrade", upgradeRaw)
  }),
)
