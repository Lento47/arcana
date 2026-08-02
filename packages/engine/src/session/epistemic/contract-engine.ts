import { Effect, Context, Layer } from "effect"
import { eq } from "drizzle-orm"
import { randomUUID } from "node:crypto"
import { Database } from "@arcana/core/database/database"
import { ContractTable, ContractAcceptanceCriteriaTable, ContractForbiddenOutcomesTable, ContractAssumptionsTable } from "@arcana/core/epistemic/contract-sql"
import type { CompletionContract, CompletionResolution } from "@arcana/core/epistemic/contract"
import type { AcceptanceCriterion } from "@arcana/core/epistemic/contract"
import { SessionID } from "../schema"
import { EventStore } from "./event-store"
import { LayerNode } from "@arcana/core/effect/layer-node"
import { ObligationEngine } from "./obligation-engine"

/**
 * Compile acceptance criteria from the user's request.
 *
 * Deliberately conservative: only criteria whose verification can be satisfied
 * by the production verifier are emitted (execution evidence from the PEP).
 * Requests that mention tests, defects, or builds get specific, meaningful
 * criteria; everything else keeps the generic task-completion criterion. No
 * criterion is produced that would block completion without a resolution path.
 */
export function compileAcceptanceCriteria(
  userRequest: string,
): CompletionContract["acceptanceCriteria"] {
  const text = userRequest.toLowerCase()
  const criteria: AcceptanceCriterion[] = []
  if (/(\btests?\b|\bverify\b|\bcheck\b|regression)/.test(text)) {
    criteria.push({
      id: `ac-${randomUUID().slice(0, 8)}`,
      description: "Relevant tests and checks pass",
      required: true,
      verification: "execution",
    })
  }
  if (/(\bfix\b|\bbug\b|\brepair\b)/.test(text)) {
    criteria.push({
      id: `ac-${randomUUID().slice(0, 8)}`,
      description: "The reported defect is fixed",
      required: true,
      verification: "execution",
    })
  }
  if (/(\bbuild\b|\bcompile\b)/.test(text)) {
    criteria.push({
      id: `ac-${randomUUID().slice(0, 8)}`,
      description: "The project builds successfully",
      required: true,
      verification: "execution",
    })
  }
  if (criteria.length === 0) {
    criteria.push({
      id: `ac-${randomUUID().slice(0, 8)}`,
      description: "Task completed as described",
      required: true,
      verification: "execution",
    })
  }
  return criteria
}

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
    const obligations = yield* ObligationEngine.Service

    const propose = Effect.fn("ContractEngine.propose")(function* (input) {
      // Contract re-admission: each new objective for a session gets the next
      // revision so the contract lineage is durable and ordered after a
      // resolved contract. First contract on a session starts at revision 1.
      const revisions = yield* db
        .select({ revision: ContractTable.revision })
        .from(ContractTable)
        .where(eq(ContractTable.session_id, input.sessionId))
        .pipe(Effect.orDie)
      const revision = (revisions.reduce((max, row) => Math.max(max, row.revision ?? 0), 0) ?? 0) + 1
      const contract: CompletionContract = {
        id: randomUUID(),
        sessionId: input.sessionId,
        objective: input.userRequest.slice(0, 200),
        deliverables: [{ description: "Complete requested task", verificationMethod: "execution" }],
        constraints: [],
        acceptanceCriteria: compileAcceptanceCriteria(input.userRequest),
        assumptions: [],
        forbiddenOutcomes: [],
        riskClass: "modify",
        sourceEventId: input.sourceEventId,
        compilerModel: input.model,
        revision,
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
        payload: {
          contractId: contract.id,
          objective: contract.objective,
          revision: contract.revision,
          criteria: contract.acceptanceCriteria.length,
        },
      }).pipe(Effect.catch(() => Effect.void), Effect.ignore)

      return contract
    })

    const activate = Effect.fn("ContractEngine.activate")(function* (contractId: string) {
      const contractRows = yield* db.select({
        session_id: ContractTable.session_id,
        revision: ContractTable.revision,
      }).from(ContractTable)
        .where(eq(ContractTable.id, contractId)).limit(1).pipe(Effect.orDie)
      const sessionId = contractRows[0]?.session_id
      if (!sessionId) return yield* Effect.die(new Error(`Contract ${contractId} has no owning session`))
      yield* db.update(ContractTable).set({ status: "active" }).where(eq(ContractTable.id, contractId)).pipe(Effect.orDie)
      // Emit epistemic contract.activated event
      yield* eventStore.append({
        sessionId,
        actor: { kind: "policy", id: "contract-engine" },
        type: "contract.activated",
        payload: { contractId },
      }).pipe(Effect.catch(() => Effect.void), Effect.ignore)
      // Seed proof obligations from the contract's required acceptance
      // criteria so completion is gated on evidence, not on zero obligations.
      // Idempotent: an already-seeded contract is never seeded twice.
      const existing = yield* obligations.listByContract(contractId)
      if (existing.length === 0) {
        const criteria = yield* db.select({ id: ContractAcceptanceCriteriaTable.id })
          .from(ContractAcceptanceCriteriaTable)
          .where(eq(ContractAcceptanceCriteriaTable.contract_id, contractId))
          .pipe(Effect.orDie)
        yield* obligations
          .createFromAcceptanceCriteria(contractId, criteria.map((criterion) => criterion.id))
          .pipe(Effect.catch(() => Effect.void), Effect.ignore)
      }
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
        status: "resolved",
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

export const node = LayerNode.make(layer, [Database.node, EventStore.node, ObligationEngine.node])

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

export * as ContractEngine from "./contract-engine"
