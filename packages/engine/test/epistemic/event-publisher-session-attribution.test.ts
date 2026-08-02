import { describe, expect } from "bun:test"
import { Database } from "@arcana/core/database/database"
import type { Claim } from "@arcana/core/epistemic/claim"
import { ClaimStore } from "@arcana/engine/session/epistemic/claim-store"
import { ContractEngine } from "@arcana/engine/session/epistemic/contract-engine"
import { EventStore } from "@arcana/engine/session/epistemic/event-store"
import { ObligationEngine } from "@arcana/engine/session/epistemic/obligation-engine"
import { RunProof } from "@arcana/engine/session/epistemic/run-proof"
import { Effect, Exit, Layer } from "effect"
import { testEffect } from "../lib/effect"

const dbLayer = Database.layerFromPath(":memory:")

const CREATE_TABLES = [
  `CREATE TABLE IF NOT EXISTS events (
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
  )`,
  `CREATE TABLE IF NOT EXISTS trace_health (
    session_id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'COMPLETE',
    error_count INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    recorded_events INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS contracts (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    objective TEXT NOT NULL,
    risk_class TEXT NOT NULL,
    source_event_id TEXT NOT NULL,
    compiler_model TEXT,
    revision INTEGER DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'proposed',
    created_at TEXT NOT NULL,
    resolved_at TEXT,
    resolution_state TEXT,
    resolution_reason TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS contract_acceptance_criteria (
    id TEXT PRIMARY KEY,
    contract_id TEXT NOT NULL,
    description TEXT NOT NULL,
    required INTEGER NOT NULL DEFAULT 1,
    verification TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    evidence_event_id TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS claims (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    proposition TEXT NOT NULL,
    status TEXT NOT NULL,
    scope_workspace TEXT,
    scope_branch TEXT,
    scope_file TEXT,
    scope_symbol TEXT,
    confidence REAL DEFAULT 0.5,
    calibration_domain TEXT,
    valid_from TEXT,
    valid_until TEXT,
    last_verified_at TEXT,
    created_at TEXT NOT NULL,
    created_by_event_id TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS claim_evidence (
    claim_id TEXT NOT NULL,
    event_id TEXT NOT NULL,
    artifact_digest TEXT,
    location_file TEXT,
    location_line_start INTEGER,
    location_line_end INTEGER,
    relationship TEXT NOT NULL,
    PRIMARY KEY (claim_id, event_id, relationship)
  )`,
  `CREATE TABLE IF NOT EXISTS obligation_templates (
    rule_id TEXT PRIMARY KEY,
    description TEXT NOT NULL,
    trigger TEXT NOT NULL,
    verification TEXT NOT NULL,
    required INTEGER NOT NULL DEFAULT 1
  )`,
  `CREATE TABLE IF NOT EXISTS obligations (
    id TEXT PRIMARY KEY,
    contract_id TEXT NOT NULL,
    source_kind TEXT NOT NULL,
    source_rule_id TEXT,
    source_criterion_id TEXT,
    source_reason TEXT,
    description TEXT NOT NULL,
    required INTEGER NOT NULL DEFAULT 1,
    verification TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL,
    resolved_at TEXT,
    waived_by_event_id TEXT,
    waiver_reason TEXT
  )`,
]

const prepareDatabase = Layer.effectDiscard(
  Database.Service.use(({ db }) =>
    Effect.forEach(CREATE_TABLES, (statement) => db.run(statement), { discard: true }),
  ),
).pipe(Layer.provide(dbLayer))

const preparedDatabase = Layer.mergeAll(dbLayer, prepareDatabase)
const eventStoreLayer = EventStore.layer.pipe(Layer.provide(preparedDatabase))
const dependencies = Layer.mergeAll(preparedDatabase, eventStoreLayer)
const layer = Layer.mergeAll(
  dependencies,
  ContractEngine.layer.pipe(
    Layer.provide(ObligationEngine.layer.pipe(Layer.provide(dependencies))),
    Layer.provide(dependencies),
  ),
  ClaimStore.layer.pipe(Layer.provide(dependencies)),
  ObligationEngine.layer.pipe(Layer.provide(dependencies)),
  RunProof.layer.pipe(Layer.provide(preparedDatabase)),
)
const it = testEffect(layer)

describe("epistemic event publisher session attribution", () => {
  it.live("keeps contract, claim, evidence, and obligation evidence in its owning session RunProof", () =>
    Effect.gen(function* () {
      const sessionId = "session-attribution"
      const contracts = yield* ContractEngine.Service
      const claims = yield* ClaimStore.Service
      const obligations = yield* ObligationEngine.Service
      const events = yield* EventStore.Service
      const proofs = yield* RunProof.Service

      const contract = yield* contracts.propose({
        sessionId: sessionId as never,
        userRequest: "fix the authorization bug",
        sourceEventId: "user-request-1",
      })
      yield* contracts.activate(contract.id)

      const claim: Claim = {
        id: "claim-attribution",
        sessionId: sessionId as never,
        proposition: "the authorization bug is fixed",
        status: "observed",
        provenance: [],
        dependencies: [],
        contradicts: [],
        confidence: 0.8,
        createdAt: "2026-08-01T12:00:00.000Z",
        createdByEventId: "claim-source-1",
      }
      yield* claims.create(claim)
      yield* claims.addEvidence(claim.id, {
        eventId: "test-result-1",
        relationship: "verified_by",
      })
      yield* claims.updateStatus(claim.id, "verified")

      const criterionId = contract.acceptanceCriteria[0]!.id
      const created = yield* obligations.createFromAcceptanceCriteria(contract.id, [criterionId])
      yield* obligations.resolve(created[0]!.id, "satisfied", [])

      const projected = yield* events.listGovernance(sessionId)
      const relevant = projected.filter((event) =>
        event.type.startsWith("contract.")
        || event.type.startsWith("claim.")
        || event.type.startsWith("evidence.")
        || event.type.startsWith("obligation."),
      )
      expect(relevant.map((event) => event.type)).toEqual([
        "contract.proposed",
        "contract.activated",
        "obligation.created",
        "claim.created",
        "evidence.attached",
        "claim.transitioned",
        "obligation.created",
        "obligation.resolved",
      ])
      expect(relevant.every((event) => event.sessionId === sessionId)).toBe(true)

      const proof = yield* proofs.derive(sessionId)
      expect(proof.events.map((event) => event.type)).toEqual(relevant.map((event) => event.type))
      expect(proof.contractStatus).toBe("active")
      expect(proof.claimsByStatus.verified).toBe(1)
      expect(proof.obligationsByStatus.satisfied).toBe(1)
    }),
  )

  it.live("fails instead of appending globally unscoped evidence when an owner is missing", () =>
    Effect.gen(function* () {
      const contracts = yield* ContractEngine.Service
      const claims = yield* ClaimStore.Service
      const obligations = yield* ObligationEngine.Service
      const events = yield* EventStore.Service

      expect(Exit.isFailure(yield* contracts.activate("missing-contract").pipe(Effect.exit))).toBe(true)
      expect(Exit.isFailure(yield* claims.updateStatus("missing-claim", "verified").pipe(Effect.exit))).toBe(true)
      expect(
        Exit.isFailure(
          yield* obligations.createFromAcceptanceCriteria("missing-contract", ["criterion"]).pipe(Effect.exit),
        ),
      ).toBe(true)
      expect((yield* events.list()).filter((event) => event.sessionId === undefined)).toEqual([])
    }),
  )
})
