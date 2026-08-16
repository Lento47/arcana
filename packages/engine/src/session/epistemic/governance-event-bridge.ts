import { EventV2Bridge } from "@/event-v2-bridge"
import { InstanceRef } from "@/effect/instance-ref"
import {
  governanceConfigPath,
  loadGovernanceConfig,
  shouldForwardGovernanceEventToDesktop,
  type GovernanceConfig,
} from "@arcana/core/governance-config"
import { LayerNode } from "@arcana/core/effect/layer-node"
import { Context, Effect, Layer } from "effect"
import { statSync } from "node:fs"
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
    let configCache:
      | { directory: string; mtimeMs: number; config: GovernanceConfig }
      | undefined

    // Reload only when governance.yml changes. stat is cheap on the hot
    // event path; YAML parsing happens once per file revision.
    const desktopConfig = (directory: string): GovernanceConfig => {
      const path = governanceConfigPath(directory)
      const mtimeMs = path
        ? (statSync(path, { throwIfNoEntry: false })?.mtimeMs ?? -1)
        : -1
      if (
        configCache
        && configCache.directory === directory
        && configCache.mtimeMs === mtimeMs
      ) {
        return configCache.config
      }
      const loaded = loadGovernanceConfig(directory)
      configCache = { directory, mtimeMs, config: loaded.config }
      return loaded.config
    }

    const unsubscribe = yield* eventStore.listen((event) => {
      const sessionID = event.sessionId
      if (!sessionID || !GovernanceEvent.isGovernanceEvent(event)) return Effect.void
      return Effect.gen(function* () {
        const instance = yield* InstanceRef
        const directory = instance?.directory ?? process.cwd()
        if (!shouldForwardGovernanceEventToDesktop(desktopConfig(directory), event.type)) {
          return
        }
        yield* events.publish(GovernanceEvent.Recorded, {
          sessionID,
          event,
        })
      })
    })
    yield* Effect.addFinalizer(() => unsubscribe)
    return Service.of({ active: true })
  }),
)

export const node = LayerNode.make(layer, [EventStore.node, EventV2Bridge.node])

export * as GovernanceEventBridge from "./governance-event-bridge"
