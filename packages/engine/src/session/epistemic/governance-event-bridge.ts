import { EventV2Bridge } from "@/event-v2-bridge"
import { LayerNode } from "@arcana/core/effect/layer-node"
import { Context, Effect, Layer } from "effect"
import { EventStore } from "./event-store"
import { GovernanceEvent } from "./governance-event"

export interface Interface {
  readonly active: true
}

export class Service extends Context.Service<Service, Interface>()("@arcana/GovernanceEventBridge") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const eventStore = yield* EventStore.Service
    const events = yield* EventV2Bridge.Service
    const unsubscribe = yield* eventStore.listen((event) => {
      if (!event.sessionId || !GovernanceEvent.isGovernanceEvent(event)) return Effect.void
      return events
        .publish(GovernanceEvent.Recorded, { sessionID: event.sessionId, event })
        .pipe(Effect.asVoid)
    })
    yield* Effect.addFinalizer(() => unsubscribe)
    return Service.of({ active: true })
  }),
)

export const node = LayerNode.make(layer, [EventStore.node, EventV2Bridge.node])

export * as GovernanceEventBridge from "./governance-event-bridge"
