import { describe, expect, test } from "bun:test"
import { Effect, Layer } from "effect"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Database } from "@arcana/core/database/database"
import { ContractTable } from "@arcana/core/epistemic/contract-sql"
import { ObligationTable } from "@arcana/core/epistemic/obligation-sql"
import { EventStore } from "@arcana/engine/session/epistemic/event-store"
import { RunProof } from "@arcana/engine/session/epistemic/run-proof"

const sessionId = "session-runproof-restart"
const contractId = "contract-runproof-restart"

function layers(dbPath: string) {
  const dbLayer = Database.layerFromPath(dbPath)
  const eventStoreLayer = EventStore.layer.pipe(Layer.provide(dbLayer))
  const runProofLayer = RunProof.layer.pipe(Layer.provide(dbLayer))
  return Layer.mergeAll(dbLayer, eventStoreLayer, runProofLayer)
}

describe("RunProof file-backed restart", () => {
  test("the governance projection reconstructs identically after a database reopen", async () => {
    const dir = mkdtempSync(join(tmpdir(), "arcana-runproof-restart-"))
    const dbPath = join(dir, "arcana.db")
    try {
      // First "process": seed a resolved contract with satisfied obligations
      // and a full lifecycle event chain.
      const baseline = await Effect.runPromise(
        Effect.gen(function* () {
          const database = yield* Database.Service
          const eventStore = yield* EventStore.Service
          yield* database.db.insert(ContractTable).values({
            id: contractId,
            session_id: sessionId,
            objective: "Restart reconstruction",
            risk_class: "modify",
            source_event_id: "user-1",
            revision: 1,
            status: "resolved",
            created_at: "2026-08-01T00:00:00.000Z",
            resolved_at: "2026-08-01T01:00:00.000Z",
            resolution_state: "VERIFIED_COMPLETE",
            resolution_reason: "All required obligations satisfied by durable evidence",
          })
          yield* database.db.insert(ObligationTable).values({
            id: "obligation-restart",
            contract_id: contractId,
            source_kind: "acceptance_criterion",
            source_criterion_id: "criterion-restart",
            description: "Acceptance criterion: criterion-restart",
            required: 1,
            verification: "execution",
            status: "satisfied",
            created_at: "2026-08-01T00:00:00.000Z",
            resolved_at: "2026-08-01T01:00:00.000Z",
          })

          const events: Array<{ type: Parameters<typeof eventStore.append>[0]["type"]; payload: unknown }> = [
            { type: "session.started", payload: { agent: "build" } },
            { type: "contract.proposed", payload: { contractId } },
            { type: "contract.activated", payload: { contractId } },
            { type: "obligation.created", payload: { obligationId: "obligation-restart", contractId, required: true } },
            { type: "authorization.requested", payload: { requestId: "req-1" } },
            { type: "authorization.allowed", payload: { requestId: "req-1" } },
            { type: "authorization.executed", payload: { requestId: "req-1" } },
            { type: "obligation.resolved", payload: { obligationId: "obligation-restart", contractId, status: "satisfied" } },
            { type: "completion.resolved", payload: { contractId, method: "VERIFIED_COMPLETE" } },
            { type: "session.completed", payload: { steps: 1 } },
          ]
          for (const event of events) {
            yield* eventStore.append({
              sessionId,
              actor: { kind: "policy", id: "test" },
              ...event,
            })
          }

          const runProof = yield* RunProof.Service
          return yield* runProof.derive(sessionId)
        }).pipe(Effect.provide(layers(dbPath))),
      )

      // "Restart": brand-new layers from the same file must reconstruct the
      // same projection and the event chain must still verify.
      const restarted = await Effect.runPromise(
        Effect.gen(function* () {
          const eventStore = yield* EventStore.Service
          const runProof = yield* RunProof.Service
          const integrity = yield* eventStore.verify()
          const proof = yield* runProof.derive(sessionId)
          return { integrity, proof }
        }).pipe(Effect.provide(layers(dbPath))),
      )

      expect(restarted.integrity.valid).toBe(true)
      expect(restarted.proof.eventCount).toBe(baseline.eventCount)
      expect(restarted.proof.events.at(-1)?.sequence).toBe(baseline.events.at(-1)?.sequence)
      expect(restarted.proof.integrityStatus).toBe("VALID")
      expect(restarted.proof.contractStatus).toBe(baseline.contractStatus)
      expect(restarted.proof.completionMethod).toBe("VERIFIED_COMPLETE")
      expect(restarted.proof.obligationsByStatus).toEqual(baseline.obligationsByStatus)
      expect(restarted.proof.authorizationProfile.unauthorizedExecutions).toBe(0)
    } finally {
      try {
        rmSync(dir, { recursive: true, force: true })
      } catch {
        // ignore
      }
    }
  })
})
