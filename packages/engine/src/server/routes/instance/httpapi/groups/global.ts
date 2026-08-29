import { ConfigV1 } from "@arcana/core/v1/config/config"
import { EventV2 } from "@arcana/core/event"
import { InstanceDisposed } from "@/server/event"
import "@arcana/core/account"
import "@/server/event"
// This module snapshots EventV2.registry below. Register the governance
// variant here so direct imports cannot silently omit it from the SSE schema.
import "@/session/epistemic/governance-event"
import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiError, HttpApiGroup, HttpApiSchema, OpenApi } from "effect/unstable/httpapi"
import { described } from "./metadata"
import { WorkspaceRoutingQuery } from "../middleware/workspace-routing"

const GlobalHealth = Schema.Struct({
  healthy: Schema.Literal(true),
  version: Schema.String,
})

const SyncEventSchemas = EventV2.registry
  .values()
  .flatMap((definition) => {
    if (!definition.sync) return []
    return [
      Schema.Struct({
        type: Schema.Literal("sync"),
        id: EventV2.ID,
        syncEvent: Schema.Struct({
          type: Schema.Literal(EventV2.versionedType(definition.type, definition.sync.version)),
          id: EventV2.ID,
          seq: Schema.Finite,
          aggregateID: Schema.String,
          data: definition.data,
        }),
      }).annotate({ identifier: `SyncEvent.${definition.type}` }),
    ]
  })
  .toArray()

const TransportEnvelope = Schema.Struct({
  streamID: Schema.String,
  sequence: Schema.Finite,
  headSequence: Schema.optional(Schema.Finite),
})

// Heartbeats are transport control frames, not durable EventV2 records. Keep
// them in the HTTP contract so schema-aware clients can validate every frame
// without registering a synthetic event in the persistence/event registry.
export const ServerHeartbeat = Schema.Struct({
  id: EventV2.ID,
  type: Schema.Literal("server.heartbeat"),
  properties: Schema.Struct({
    headSequence: Schema.optional(Schema.Finite),
  }),
}).annotate({ identifier: "Event.server.heartbeat" })

const GlobalEventSchema = Schema.Struct({
  directory: Schema.String,
  project: Schema.optional(Schema.String),
  workspace: Schema.optional(Schema.String),
  transport: Schema.optional(TransportEnvelope),
  payload: Schema.Union([
    ...EventV2.registry
      .values()
      .map((definition) =>
        Schema.Struct({ id: EventV2.ID, type: Schema.Literal(definition.type), properties: definition.data }),
      )
      .toArray(),
    ServerHeartbeat,
    InstanceDisposed,
    ...SyncEventSchemas,
  ]),
}).annotate({ identifier: "GlobalEvent" })

export const GlobalUpgradeInput = Schema.Struct({
  target: Schema.optional(Schema.String),
})

const GlobalUpgradeResult = Schema.Union([
  Schema.Struct({
    success: Schema.Literal(true),
    version: Schema.String,
  }),
  Schema.Struct({
    success: Schema.Literal(false),
    error: Schema.String,
  }),
])

export const GlobalPaths = {
  health: "/global/health",
  event: "/global/event",
  config: "/global/config",
  dispose: "/global/dispose",
  upgrade: "/global/upgrade",
} as const

export const GlobalApi = HttpApi.make("global").add(
  HttpApiGroup.make("global")
    .add(
      HttpApiEndpoint.get("health", GlobalPaths.health, {
        success: described(GlobalHealth, "Health information"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "global.health",
          summary: "Get health",
          description: "Get health information about the Arcana server.",
        }),
      ),
      HttpApiEndpoint.get("event", GlobalPaths.event, {
        // The global stream is also used by local TUI clients. Accept the
        // same location selectors that the client interceptor adds to every
        // GET request so one TUI cannot receive another project's delta flood.
        query: WorkspaceRoutingQuery,
        success: GlobalEventSchema,
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "global.event",
          summary: "Get global events",
          description: "Subscribe to global events from the Arcana system using server-sent events.",
        }),
      ),
      HttpApiEndpoint.get("configGet", GlobalPaths.config, {
        success: described(ConfigV1.Info, "Get global config info"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "global.config.get",
          summary: "Get global configuration",
          description: "Retrieve the current global Arcana configuration settings and preferences.",
        }),
      ),
      HttpApiEndpoint.patch("configUpdate", GlobalPaths.config, {
        payload: ConfigV1.Info,
        success: described(ConfigV1.Info, "Successfully updated global config"),
        error: HttpApiError.BadRequest,
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "global.config.update",
          summary: "Update global configuration",
          description: "Update global Arcana configuration settings and preferences.",
        }),
      ),
      HttpApiEndpoint.post("dispose", GlobalPaths.dispose, {
        success: described(Schema.Boolean, "Global disposed"),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "global.dispose",
          summary: "Dispose instance",
          description: "Clean up and dispose all Arcana instances, releasing all resources.",
        }),
      ),
      HttpApiEndpoint.post("upgrade", GlobalPaths.upgrade, {
        payload: [HttpApiSchema.NoContent, GlobalUpgradeInput],
        success: described(GlobalUpgradeResult, "Upgrade result"),
        error: HttpApiError.BadRequest,
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "global.upgrade",
          summary: "Upgrade arcana",
          description: "Upgrade arcana to the specified version or latest if not specified.",
        }),
      ),
    )
    .annotateMerge(OpenApi.annotations({ title: "global", description: "Global server routes." })),
)
