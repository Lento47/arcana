import { Effect, Context, Layer } from "effect"
import { eq } from "drizzle-orm"
import { randomUUID } from "node:crypto"
import { Database } from "@arcana/core/database/database"
import { ObligationTable, ObligationTemplateTable } from "@arcana/core/epistemic/obligation-sql"
import { BASELINE_TEMPLATES } from "@arcana/core/epistemic/obligation"
import type { ProofObligation, ObligationStatus } from "@arcana/core/epistemic/obligation"
import type { EvidenceRef } from "@arcana/core/epistemic/claim"

export interface Interface {
  readonly createFromClaim: (input: { claimProposition: string; contractId: string }) => Effect.Effect<ProofObligation[]>
  readonly createFromAcceptanceCriteria: (contractId: string, criteriaIds: string[]) => Effect.Effect<ProofObligation[]>
  readonly listByContract: (contractId: string) => Effect.Effect<ProofObligation[]>
  readonly resolve: (obligationId: string, status: ObligationStatus, evidence: EvidenceRef[]) => Effect.Effect<void>
  readonly getUnresolvedRequired: (contractId: string) => Effect.Effect<ProofObligation[]>
  readonly seedTemplates: () => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@arcana/ObligationEngine") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const { db } = yield* Database.Service

    const seedTemplates = Effect.fn("ObligationEngine.seedTemplates")(function* () {
      for (const t of BASELINE_TEMPLATES) {
        yield* db.insert(ObligationTemplateTable).values({
          rule_id: t.ruleId,
          description: t.description,
          trigger: t.trigger,
          verification: t.verification,
          required: t.required ? 1 : 0,
        }).pipe(Effect.orDie)
      }
    })

    const createFromClaim = Effect.fn("ObligationEngine.createFromClaim")(function* (input: { claimProposition: string; contractId: string }) {
      const templates = yield* db.select().from(ObligationTemplateTable).pipe(Effect.orDie)
      const matched = matchTemplates(input.claimProposition, templates)
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
        obligations.push(obl)
      }
      return obligations
    })

    const createFromAcceptanceCriteria = Effect.fn("ObligationEngine.createFromCriteria")(function* (contractId: string, criteriaIds: string[]) {
      const obligations: ProofObligation[] = []
      for (const cid of criteriaIds) {
        const obl: ProofObligation = {
          id: randomUUID(),
          contractId,
          source: { kind: "acceptance_criterion", criterionId: cid },
          description: `Acceptance criterion: ${cid}`,
          required: true,
          verification: "execution",
          status: "pending",
          evidence: [],
          createdAt: new Date().toISOString(),
        }
        yield* db.insert(ObligationTable).values({
          id: obl.id,
          contract_id: obl.contractId,
          source_kind: "acceptance_criterion",
          source_criterion_id: cid,
          description: obl.description,
          required: 1,
          verification: obl.verification,
          status: "pending",
          created_at: obl.createdAt,
        }).pipe(Effect.orDie)
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
      yield* db.update(ObligationTable).set({
        status,
        resolved_at: new Date().toISOString(),
      }).where(eq(ObligationTable.id, obligationId)).pipe(Effect.orDie)
    })

    // Seed on first use
    yield* seedTemplates()

    return Service.of({ createFromClaim, createFromAcceptanceCriteria, listByContract, resolve, getUnresolvedRequired, seedTemplates })
  }),
)

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
