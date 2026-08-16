import { describe, expect } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Database } from "@arcana/core/database/database"
import { Project } from "@arcana/core/project"
import { EventStore } from "@arcana/engine/session/epistemic/event-store"
import { GovernanceEvent } from "@arcana/engine/session/epistemic/governance-event"
import { GovernanceEventBridge } from "@arcana/engine/session/epistemic/governance-event-bridge"
import { EventV2Bridge } from "@arcana/engine/event-v2-bridge"
import { EventV2 } from "@arcana/core/event"
import { InstanceRef } from "@/effect/instance-ref"
import type { InstanceContext } from "@/project/instance-context"
import { Effect, Layer } from "effect"
import { testEffect } from "../lib/effect"

const dbLayer = Database.layerFromPath(":memory:")
const it = testEffect(Layer.mergeAll(dbLayer, EventStore.layer.pipe(Layer.provide(dbLayer))))

const eventV2Layer = EventV2.layer.pipe(Layer.provide(dbLayer))
const eventBridgeLayer = EventV2Bridge.layer.pipe(Layer.provide(eventV2Layer))
const eventStoreLayer = EventStore.layer.pipe(Layer.provide(dbLayer))
const bridgeDependencies = Layer.mergeAll(dbLayer, eventV2Layer, eventBridgeLayer, eventStoreLayer)
const bridgeIt = testEffect(
  Layer.mergeAll(
    bridgeDependencies,
    GovernanceEventBridge.layer.pipe(Layer.provide(bridgeDependencies)),
  ),
)

const CREATE_EVENTS = `
  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    sequence INTEGER NOT NULL UNIQUE,
    session_id TEXT,
    timestamp TEXT NOT NULL,
    previous_hash TEXT,
    hash TEXT NOT NULL,
    actor_kind TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    type TEXT NOT NULL,
    payload TEXT NOT NULL
  )
`

const CREATE_TRACE_HEALTH = `
  CREATE TABLE IF NOT EXISTS trace_health (
    session_id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'COMPLETE',
    error_count INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    recorded_events INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
  )
`

const createTables = Database.Service.use(({ db }) =>
  Effect.gen(function* () {
    yield* db.run(CREATE_EVENTS)
    yield* db.run(CREATE_TRACE_HEALTH)
  }),
)

describe("EventStore governance projection", () => {
  it.live("returns canonical operator evidence only for the requested session", () =>
    Effect.gen(function* () {
      yield* createTables
      const store = yield* EventStore.Service
      yield* store.append({
        sessionId: "session-a",
        actor: { kind: "policy", id: "pep" },
        type: "authorization.requested",
        payload: { requestId: "request-a" },
      })
      yield* store.append({
        sessionId: "session-a",
        actor: { kind: "tool", id: "terminal" },
        type: "tool.called",
        payload: { command: "bun test" },
      })
      yield* store.append({
        sessionId: "session-b",
        actor: { kind: "policy", id: "pdp" },
        type: "authorization.denied",
        payload: { requestId: "request-b" },
      })
      yield* store.append({
        sessionId: "session-a",
        actor: { kind: "policy", id: "pdp" },
        type: "capability.revoked",
        payload: { capabilityId: "cap-a" },
      })
      yield* store.append({
        sessionId: "session-a",
        actor: { kind: "policy", id: "contract-engine" },
        type: "contract.proposed",
        payload: { contractId: "contract-a", objective: "ship safely", revision: 1 },
      })
      yield* store.append({
        sessionId: "session-a",
        actor: { kind: "policy", id: "claim-store" },
        type: "claim.created",
        payload: { claimId: "claim-a", proposition: "tests pass" },
      })
      yield* store.append({
        sessionId: "session-a",
        actor: { kind: "policy", id: "claim-store" },
        type: "evidence.attached",
        payload: { claimId: "claim-a", relationship: "verified_by" },
      })
      yield* store.append({
        sessionId: "session-a",
        actor: { kind: "policy", id: "obligation-engine" },
        type: "obligation.created",
        payload: { obligationId: "obligation-a", required: true },
      })
      yield* store.append({
        sessionId: "session-a",
        actor: { kind: "policy", id: "completion-gate" },
        type: "completion.resolved",
        payload: { method: "VERIFIED_COMPLETE" },
      })

      const events = yield* store.listGovernance("session-a")
      expect(events.map((event) => event.type)).toEqual([
        "authorization.requested",
        "capability.revoked",
        "contract.proposed",
        "claim.created",
        "evidence.attached",
        "obligation.created",
        "completion.resolved",
      ])
      expect(events.every((event) => event.sessionId === "session-a")).toBe(true)
      expect(events[0]!.sequence).toBeLessThan(events[1]!.sequence)
    }),
  )

  it.live("isolates listener failures after the durable append", () =>
    Effect.gen(function* () {
      yield* createTables
      const store = yield* EventStore.Service
      let observed = ""
      yield* store.listen((event) =>
        Effect.sync(() => {
          observed = event.id
        }),
      )
      yield* store.listen(() => Effect.fail(new Error("simulated observer failure")))

      const appended = yield* store.append({
        sessionId: "session-a",
        actor: { kind: "policy", id: "pdp" },
        type: "authorization.allowed",
        payload: { requestId: "request-a" },
      })

      expect(observed).toBe(appended.id)
      expect((yield* store.listGovernance("session-a")).map((event) => event.id)).toEqual([appended.id])
    }),
  )
})

describe("GovernanceEventBridge", () => {
  bridgeIt.live("publishes only committed canonical operator evidence to EventV2", () =>
    Effect.gen(function* () {
      yield* createTables
      const store = yield* EventStore.Service
      const events = yield* EventV2.Service
      const observed: Array<EventV2.Data<typeof GovernanceEvent.Recorded>> = []
      const unsubscribe = yield* events.listen((event) =>
        Effect.sync(() => {
          if (event.type === GovernanceEvent.Recorded.type) {
            observed.push(event.data as EventV2.Data<typeof GovernanceEvent.Recorded>)
          }
        }),
      )

      const recorded = yield* store.append({
        sessionId: "session-live",
        actor: { kind: "policy", id: "pdp" },
        type: "authorization.denied",
        payload: { requestId: "request-live", reason: "no matching grant" },
      })
      const contract = yield* store.append({
        sessionId: "session-live",
        actor: { kind: "policy", id: "contract-engine" },
        type: "contract.proposed",
        payload: { contractId: "contract-live", objective: "show evidence", revision: 1 },
      })
      yield* store.append({
        sessionId: "session-live",
        actor: { kind: "tool", id: "terminal" },
        type: "tool.called",
        payload: { command: "bun test" },
      })
      yield* unsubscribe

      expect(observed).toHaveLength(2)
      expect(observed[0]!.sessionID).toBe("session-live")
      expect(observed[0]!.event.id).toBe(recorded.id)
      expect(observed[0]!.event.type).toBe("authorization.denied")
      expect(observed[1]!.event.id).toBe(contract.id)
      expect(observed[1]!.event.type).toBe("contract.proposed")
    }),
  )

  bridgeIt.live("honors desktop include/exclude prefixes from governance.yml", () =>
    Effect.gen(function* () {
      const directory = mkdtempSync(join(tmpdir(), "arcana-governance-bridge-"))
      try {
        mkdirSync(join(directory, ".arcana"), { recursive: true })
        writeFileSync(
          join(directory, ".arcana", "governance.yml"),
          [
            "version: 1",
            "display:",
            "  tui:",
            "    enabled: false",
            "  desktop:",
            "    enabled: true",
            "    includePrefixes:",
            '      - "contract."',
            "    excludePrefixes: []",
            "",
          ].join("\n"),
          "utf8",
        )

        const instance: InstanceContext = {
          directory,
          worktree: directory,
          project: {
            id: Project.ID.make("proj-governance-bridge"),
            worktree: directory,
            time: { created: 0, updated: 0 },
            sandboxes: [],
          },
          startedAt: 0,
        }

        yield* createTables
        const store = yield* EventStore.Service
        const events = yield* EventV2.Service
        const observed: Array<EventV2.Data<typeof GovernanceEvent.Recorded>> = []
        const unsubscribe = yield* events.listen((event) =>
          Effect.sync(() => {
            if (event.type === GovernanceEvent.Recorded.type) {
              observed.push(event.data as EventV2.Data<typeof GovernanceEvent.Recorded>)
            }
          }),
        )

        yield* store.append({
          sessionId: "session-filtered",
          actor: { kind: "policy", id: "pdp" },
          type: "authorization.denied",
          payload: { requestId: "not-for-desktop" },
        }).pipe(Effect.provideService(InstanceRef, instance))
        yield* store.append({
          sessionId: "session-filtered",
          actor: { kind: "policy", id: "contract-engine" },
          type: "contract.proposed",
          payload: { contractId: "for-desktop" },
        }).pipe(Effect.provideService(InstanceRef, instance))
        yield* unsubscribe

        expect(observed.map((item) => item.event.type)).toEqual(["contract.proposed"])
      } finally {
        rmSync(directory, { recursive: true, force: true })
      }
    }),
  )

  bridgeIt.live("keeps governance records durable but unpublished when desktop is disabled", () =>
    Effect.gen(function* () {
      const directory = mkdtempSync(join(tmpdir(), "arcana-governance-bridge-off-"))
      try {
        mkdirSync(join(directory, ".arcana"), { recursive: true })
        writeFileSync(
          join(directory, ".arcana", "governance.yml"),
          [
            "version: 1",
            "display:",
            "  desktop:",
            "    enabled: false",
            "",
          ].join("\n"),
          "utf8",
        )
        const instance: InstanceContext = {
          directory,
          worktree: directory,
          project: {
            id: Project.ID.make("proj-governance-bridge-off"),
            worktree: directory,
            time: { created: 0, updated: 0 },
            sandboxes: [],
          },
          startedAt: 0,
        }

        yield* createTables
        const store = yield* EventStore.Service
        const events = yield* EventV2.Service
        const observed: Array<EventV2.Data<typeof GovernanceEvent.Recorded>> = []
        const unsubscribe = yield* events.listen((event) =>
          Effect.sync(() => {
            if (event.type === GovernanceEvent.Recorded.type) {
              observed.push(event.data as EventV2.Data<typeof GovernanceEvent.Recorded>)
            }
          }),
        )

        yield* store.append({
          sessionId: "session-disabled",
          actor: { kind: "policy", id: "contract-engine" },
          type: "contract.proposed",
          payload: { contractId: "durable-but-unpublished" },
        }).pipe(Effect.provideService(InstanceRef, instance))
        yield* unsubscribe

        expect(observed).toHaveLength(0)
        const durable = yield* store.listGovernance("session-disabled")
        expect(durable.map((event) => event.type)).toEqual(["contract.proposed"])
      } finally {
        rmSync(directory, { recursive: true, force: true })
      }
    }),
  )
})
