import { Effect, Context, Layer } from "effect"
import { eq, inArray } from "drizzle-orm"
import { randomUUID } from "node:crypto"
import { Database } from "@arcana/core/database/database"
import { ContractAcceptanceCriteriaTable, ContractTable } from "@arcana/core/epistemic/contract-sql"
import { ObligationTable, ObligationTemplateTable } from "@arcana/core/epistemic/obligation-sql"
import { BASELINE_TEMPLATES } from "@arcana/core/epistemic/obligation"
import type { ProofObligation, ObligationStatus } from "@arcana/core/epistemic/obligation"
import type { EvidenceRef } from "@arcana/core/epistemic/claim"
import { EventStore } from "./event-store"
import { LayerNode } from "@arcana/core/effect/layer-node"

export interface Interface {
  readonly createFromClaim: (input: { claimProposition: string; contractId: string }) => Effect.Effect<ProofObligation[]>
  readonly createFromAcceptanceCriteria: (contractId: string, criteriaIds: string[]) => Effect.Effect<ProofObligation[]>
  readonly listByContract: (contractId: string) => Effect.Effect<ProofObligation[]>
  readonly resolve: (obligationId: string, status: ObligationStatus, evidence: EvidenceRef[]) => Effect.Effect<void>
  readonly getOwningSession: (obligationId: string) => Effect.Effect<string | undefined>
  readonly recordVerification: (input: {
    obligationId: string
    outcome: "satisfied" | "failed" | "waived"
    reason: string
    details?: Record<string, unknown>
  }) => Effect.Effect<void>
  readonly getUnresolvedRequired: (contractId: string) => Effect.Effect<ProofObligation[]>
  readonly seedTemplates: () => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@arcana/ObligationEngine") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const { db } = yield* Database.Service
    const eventStore = yield* EventStore.Service

    // EVIDENCE ATTRIBUTION BOUNDARY: RunProof and the operator console are
    // session projections. Every obligation event must carry its contract's
    // owning session or durable evidence becomes globally stored but invisible.
    const sessionIdForContract = Effect.fn("ObligationEngine.sessionIdForContract")(function* (contractId: string) {
      const rows = yield* db.select({ session_id: ContractTable.session_id }).from(ContractTable)
        .where(eq(ContractTable.id, contractId)).limit(1).pipe(Effect.orDie)
      const sessionId = rows[0]?.session_id
      if (!sessionId) return yield* Effect.die(new Error(`Contract ${contractId} has no owning session`))
      return sessionId
    })

    const seedTemplates = Effect.fn("ObligationEngine.seedTemplates")(function* () {
      for (const t of BASELINE_TEMPLATES) {
        yield* db.insert(ObligationTemplateTable).values({
          rule_id: t.ruleId,
          description: t.description,
          trigger: t.trigger,
          verification: t.verification,
          required: t.required ? 1 : 0,
        }).onConflictDoNothing().pipe(Effect.orDie)
      }
    })

    const createFromClaim = Effect.fn("ObligationEngine.createFromClaim")(function* (input: { claimProposition: string; contractId: string }) {
      const templates = yield* db.select().from(ObligationTemplateTable).pipe(Effect.orDie)
      const matched = matchTemplates(input.claimProposition, templates)
      const sessionId = yield* sessionIdForContract(input.contractId)
      const obligations: ProofObligation[] = []
      for (const t of matched) {
        const obl: ProofObligation = {
          id: randomUUID(),
          contractId: input.contractId,
          source: { kind: "registry", ruleId: t.rule_id },
          description: t.description,
          required: !!t.required,
          verification: t.verification as ProofObligation["verification"],
          status: "pending",
          evidence: [],
          createdAt: new Date().toISOString(),
        }
        yield* db.insert(ObligationTable).values({
          id: obl.id,
          contract_id: obl.contractId,
          source_kind: "registry",
          source_rule_id: t.rule_id,
          description: obl.description,
          required: obl.required ? 1 : 0,
          verification: obl.verification,
          status: "pending",
          created_at: obl.createdAt,
        }).pipe(Effect.orDie)
        // Emit obligation.created event
        yield* eventStore.append({
          sessionId,
          actor: { kind: "policy", id: "obligation-engine" },
          type: "obligation.created",
          payload: { obligationId: obl.id, contractId: input.contractId, description: obl.description, required: obl.required, source: obl.source },
        }).pipe(Effect.catch(() => Effect.void), Effect.ignore)
        obligations.push(obl)
      }
      return obligations
    })

    const createFromAcceptanceCriteria = Effect.fn("ObligationEngine.createFromCriteria")(function* (contractId: string, criteriaIds: string[]) {
      const sessionId = yield* sessionIdForContract(contractId)
      const criteria = criteriaIds.length > 0
        ? yield* db.select({
            id: ContractAcceptanceCriteriaTable.id,
            description: ContractAcceptanceCriteriaTable.description,
            verification: ContractAcceptanceCriteriaTable.verification,
          })
            .from(ContractAcceptanceCriteriaTable)
            .where(inArray(ContractAcceptanceCriteriaTable.id, criteriaIds))
            .pipe(Effect.orDie)
        : []
      const obligations: ProofObligation[] = []
      for (const criterion of criteria) {
        const obl: ProofObligation = {
          id: randomUUID(),
          contractId,
          source: { kind: "acceptance_criterion", criterionId: criterion.id },
          description: criterion.description,
          required: true,
          verification: criterion.verification as ProofObligation["verification"],
          status: "pending",
          evidence: [],
          createdAt: new Date().toISOString(),
        }
        yield* db.insert(ObligationTable).values({
          id: obl.id,
          contract_id: obl.contractId,
          source_kind: "acceptance_criterion",
          source_criterion_id: criterion.id,
          description: obl.description,
          required: 1,
          verification: obl.verification,
          status: "pending",
          created_at: obl.createdAt,
        }).pipe(Effect.orDie)
        // Emit obligation.created event
        yield* eventStore.append({
          sessionId,
          actor: { kind: "policy", id: "obligation-engine" },
          type: "obligation.created",
          payload: {
            obligationId: obl.id,
            contractId,
            description: obl.description,
            required: true,
            verification: obl.verification,
            source: obl.source,
          },
        }).pipe(Effect.catch(() => Effect.void), Effect.ignore)
        obligations.push(obl)
      }
      return obligations
    })

    const listByContract = Effect.fn("ObligationEngine.listByContract")(function* (contractId: string) {
      const rows = yield* db.select().from(ObligationTable)
        .where(eq(ObligationTable.contract_id, contractId))
        .pipe(Effect.orDie)
      return rows.map(hydrateObligation)
    })

    const getUnresolvedRequired = Effect.fn("ObligationEngine.getUnresolvedRequired")(function* (contractId: string) {
      const all = yield* listByContract(contractId)
      return all.filter(o => o.required && o.status === "pending")
    })

    const resolve = Effect.fn("ObligationEngine.resolve")(function* (obligationId: string, status: ObligationStatus, _evidence: EvidenceRef[]) {
      // Look up obligation for event context
      const oblRows = yield* db.select({ contract_id: ObligationTable.contract_id }).from(ObligationTable)
        .where(eq(ObligationTable.id, obligationId)).limit(1).pipe(Effect.orDie)
      const contractId = oblRows[0]?.contract_id
      if (!contractId) return yield* Effect.die(new Error(`Obligation ${obligationId} has no owning contract`))
      const sessionId = yield* sessionIdForContract(contractId)
      yield* db.update(ObligationTable).set({
        status,
        resolved_at: new Date().toISOString(),
      }).where(eq(ObligationTable.id, obligationId)).pipe(Effect.orDie)
      // Emit obligation.resolved event
      yield* eventStore.append({
        sessionId,
        actor: { kind: "policy", id: "obligation-engine" },
        type: "obligation.resolved",
        payload: { obligationId, contractId, status },
      }).pipe(Effect.catch(() => Effect.void), Effect.ignore)
    })

    const getOwningSession = Effect.fn("ObligationEngine.getOwningSession")(function* (obligationId: string) {
      const obligationRows = yield* db
        .select({ contract_id: ObligationTable.contract_id })
        .from(ObligationTable)
        .where(eq(ObligationTable.id, obligationId))
        .limit(1)
        .pipe(Effect.orDie)
      const contractId = obligationRows[0]?.contract_id
      if (!contractId) return undefined
      const contractRows = yield* db
        .select({ session_id: ContractTable.session_id })
        .from(ContractTable)
        .where(eq(ContractTable.id, contractId))
        .limit(1)
        .pipe(Effect.orDie)
      return contractRows[0]?.session_id
    })

    /**
     * Operator/verifier path for obligations that cannot be auto-resolved
     * from executed effects alone: comparison, human_decision, and
     * external_confirmation. Records a durable `verification.recorded`
     * governance event (the completion gate consumes these) and resolves the
     * obligation with the recorded outcome. A non-empty reason is required so
     * the decision is an explicit recorded limitation, not silent prose.
     */
    const recordVerification = Effect.fn("ObligationEngine.recordVerification")(function* (input: {
      obligationId: string
      outcome: "satisfied" | "failed" | "waived"
      reason: string
      details?: Record<string, unknown>
    }) {
      if (!input.reason.trim()) {
        return yield* Effect.die(new Error("Verification record requires a reason"))
      }
      const rows = yield* db
        .select({
          contract_id: ObligationTable.contract_id,
          verification: ObligationTable.verification,
        })
        .from(ObligationTable)
        .where(eq(ObligationTable.id, input.obligationId))
        .limit(1)
        .pipe(Effect.orDie)
      const contractId = rows[0]?.contract_id
      if (!contractId) return yield* Effect.die(new Error(`Obligation ${input.obligationId} has no owning contract`))
      const sessionId = yield* sessionIdForContract(contractId)
      yield* eventStore.append({
        sessionId,
        actor: { kind: "operator", id: "verification" },
        type: "verification.recorded",
        payload: {
          obligationId: input.obligationId,
          contractId,
          verification: rows[0].verification,
          outcome: input.outcome,
          reason: input.reason,
          ...(input.details ? { details: input.details } : {}),
        },
      }).pipe(Effect.catch(() => Effect.void), Effect.ignore)
      yield* resolve(input.obligationId, input.outcome, [])
    })

    // Seed on first use
    yield* seedTemplates()

    return Service.of({
      createFromClaim,
      createFromAcceptanceCriteria,
      listByContract,
      resolve,
      getOwningSession,
      recordVerification,
      getUnresolvedRequired,
      seedTemplates,
    })
  }),
)

export const node = LayerNode.make(layer, [Database.node, EventStore.node])

// ── Template matching ─────────────────────────────────────────────────

function matchTemplates(
  proposition: string,
  templates: (typeof ObligationTemplateTable.$inferSelect)[],
): (typeof ObligationTemplateTable.$inferSelect)[] {
  const p = proposition.toLowerCase()
  return templates.filter((t) => {
    switch (t.trigger) {
      case "file_content_assertion": return p.includes("file") && p.includes("contain")
      case "symbol_existence_assertion": return p.includes("function") || p.includes("unused") || p.includes("symbol")
      case "bug_fixed_assertion": return p.includes("bug") || p.includes("fix")
      case "regression_free_assertion": return p.includes("regression")
      case "build_success_assertion": return p.includes("build")
      case "command_success_assertion": return p.includes("command") || p.includes("exit")
      default: return false
    }
  })
}

function hydrateObligation(row: typeof ObligationTable.$inferSelect): ProofObligation {
  return {
    id: row.id,
    contractId: row.contract_id,
    source: row.source_kind === "registry"
      ? { kind: "registry", ruleId: row.source_rule_id ?? "" }
      : row.source_kind === "acceptance_criterion"
        ? { kind: "acceptance_criterion", criterionId: row.source_criterion_id ?? "" }
        : { kind: "agent", reason: row.source_reason ?? "" },
    description: row.description,
    required: !!row.required,
    verification: row.verification as ProofObligation["verification"],
    status: row.status as ProofObligation["status"],
    evidence: [],
    createdAt: row.created_at,
    resolvedAt: row.resolved_at ?? undefined,
    waivedByEventId: row.waived_by_event_id ?? undefined,
    waiverReason: row.waiver_reason ?? undefined,
  }
}

export * as ObligationEngine from "./obligation-engine"
