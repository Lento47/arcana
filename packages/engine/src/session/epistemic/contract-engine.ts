import { Effect, Context, Layer } from "effect"
import { eq } from "drizzle-orm"
import { randomUUID } from "node:crypto"
import { Database } from "@arcana/core/database/database"
import { ContractTable, ContractAcceptanceCriteriaTable, ContractForbiddenOutcomesTable, ContractAssumptionsTable } from "@arcana/core/epistemic/contract-sql"
import type { CompletionContract, CompletionResolution } from "@arcana/core/epistemic/contract"
import { SessionID } from "../schema"
import { EventStore } from "./event-store"

export interface Interface {
  readonly propose: (input: {
    sessionId: SessionID
    userRequest: string
    sourceEventId: string
    model?: string
  }) => Effect.Effect<CompletionContract>
  readonly activate: (contractId: string) => Effect.Effect<void>
  readonly getActive: (sessionId: SessionID) => Effect.Effect<CompletionContract | undefined>
  readonly resolve: (contractId: string, resolution: CompletionResolution) => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@arcana/ContractEngine") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const { db } = yield* Database.Service
    const eventStore = yield* EventStore.Service

    const propose = Effect.fn("ContractEngine.propose")(function* (input) {
      const contract: CompletionContract = {
        id: randomUUID(),
        sessionId: input.sessionId,
        objective: input.userRequest.slice(0, 200),
        deliverables: [{ description: "Complete requested task", verificationMethod: "execution" }],
        constraints: [],
        acceptanceCriteria: [
          { id: `ac-${randomUUID().slice(0, 8)}`, description: "Task completed as described", required: true, verification: "execution" },
        ],
        assumptions: [],
        forbiddenOutcomes: [],
        riskClass: "modify",
        sourceEventId: input.sourceEventId,
        compilerModel: input.model,
        revision: 1,
        status: "proposed",
      }

      yield* db.insert(ContractTable).values({
        id: contract.id,
        session_id: contract.sessionId,
        objective: contract.objective,
        risk_class: contract.riskClass,
        source_event_id: contract.sourceEventId,
        compiler_model: contract.compilerModel ?? null,
        revision: contract.revision,
        status: contract.status,
        created_at: new Date().toISOString(),
      }).pipe(Effect.orDie)

      for (const ac of contract.acceptanceCriteria) {
        yield* db.insert(ContractAcceptanceCriteriaTable).values({
          id: ac.id,
          contract_id: contract.id,
          description: ac.description,
          required: ac.required ? 1 : 0,
          verification: ac.verification,
        }).pipe(Effect.orDie)
      }

      // Emit epistemic contract.proposed event
      yield* eventStore.append({
        sessionId: input.sessionId,
        actor: { kind: "policy", id: "contract-engine" },
        type: "contract.proposed",
        payload: { contractId: contract.id, objective: contract.objective, revision: contract.revision },
      }).pipe(Effect.catch(() => Effect.void), Effect.ignore)

      return contract
    })

    const activate = Effect.fn("ContractEngine.activate")(function* (contractId: string) {
      yield* db.update(ContractTable).set({ status: "active" }).where(eq(ContractTable.id, contractId)).pipe(Effect.orDie)
      // Emit epistemic contract.activated event
      yield* eventStore.append({
        actor: { kind: "policy", id: "contract-engine" },
        type: "contract.activated",
        payload: { contractId },
      }).pipe(Effect.catch(() => Effect.void), Effect.ignore)
    })

    const getActive = Effect.fn("ContractEngine.getActive")(function* (sessionId: SessionID) {
      const rows = yield* db.select().from(ContractTable)
        .where(eq(ContractTable.session_id, sessionId))
        .pipe(Effect.orDie)
      // Find most recent active or proposed contract
      const active = rows.filter(r => r.status === "active" || r.status === "proposed").sort((a, b) => (b.revision ?? 1) - (a.revision ?? 1))[0]
      if (!active) return undefined

      const criteria = yield* db.select().from(ContractAcceptanceCriteriaTable)
        .where(eq(ContractAcceptanceCriteriaTable.contract_id, active.id))
        .pipe(Effect.orDie)

      const forbidden = yield* db.select().from(ContractForbiddenOutcomesTable)
        .where(eq(ContractForbiddenOutcomesTable.contract_id, active.id))
        .pipe(Effect.orDie)

      const assumptions = yield* db.select().from(ContractAssumptionsTable)
        .where(eq(ContractAssumptionsTable.contract_id, active.id))
        .pipe(Effect.orDie)

      return hydrateContract(active, criteria, forbidden, assumptions)
    })

    const resolve = Effect.fn("ContractEngine.resolve")(function* (contractId: string, resolution: CompletionResolution) {
      // Look up session for event emission
      const contractRows = yield* db.select({ session_id: ContractTable.session_id }).from(ContractTable)
        .where(eq(ContractTable.id, contractId)).limit(1).pipe(Effect.orDie)
      yield* db.update(ContractTable).set({
        status: "satisfied",
        resolved_at: new Date().toISOString(),
        resolution_state: resolution.state,
        resolution_reason: resolution.reason,
      }).where(eq(ContractTable.id, contractId)).pipe(Effect.orDie)
      // Emit epistemic contract.amended event (resolution)
      yield* eventStore.append({
        sessionId: contractRows[0]?.session_id,
        actor: { kind: "policy", id: "contract-engine" },
        type: "contract.amended",
        payload: { contractId, resolution: resolution.state, reason: resolution.reason },
      }).pipe(Effect.catch(() => Effect.void), Effect.ignore)
    })

    return Service.of({ propose, activate, getActive, resolve })
  }),
)

// ── Hydration ─────────────────────────────────────────────────────────

function hydrateContract(
  row: typeof ContractTable.$inferSelect,
  criteria: (typeof ContractAcceptanceCriteriaTable.$inferSelect)[],
  forbidden: (typeof ContractForbiddenOutcomesTable.$inferSelect)[],
  assumptions: (typeof ContractAssumptionsTable.$inferSelect)[],
): CompletionContract {
  return {
    id: row.id,
    sessionId: row.session_id,
    objective: row.objective,
    deliverables: [],
    constraints: [],
    acceptanceCriteria: criteria.map((c) => ({
      id: c.id,
      description: c.description,
      required: !!c.required,
      verification: c.verification as CompletionContract["acceptanceCriteria"][number]["verification"],
    })),
    assumptions: assumptions.map((a) => ({ claimId: a.claim_id })),
    forbiddenOutcomes: forbidden.map((f) => f.description),
    riskClass: row.risk_class as CompletionContract["riskClass"],
    sourceEventId: row.source_event_id,
    compilerModel: row.compiler_model ?? undefined,
    revision: row.revision ?? 1,
    status: row.status as CompletionContract["status"],
  }
}
