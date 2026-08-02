import { Effect, Context, Layer } from "effect"
import { eq, and } from "drizzle-orm"
import { Database } from "@arcana/core/database/database"
import { ClaimTable, ClaimEvidenceTable, ClaimDependencyTable, ClaimContradictionTable, ClaimOutcomeTable } from "@arcana/core/epistemic/sql"
import type { Claim, ClaimStatus, EvidenceRef, ClaimOutcome } from "@arcana/core/epistemic/claim"
import { SessionID } from "../schema"
import { EventStore } from "./event-store"

export interface Interface {
  readonly create: (claim: Claim) => Effect.Effect<void>
  readonly get: (id: string) => Effect.Effect<Claim | undefined>
  readonly listBySession: (sessionId: SessionID) => Effect.Effect<Claim[]>
  readonly updateStatus: (id: string, status: ClaimStatus) => Effect.Effect<void>
  readonly addEvidence: (claimId: string, evidence: EvidenceRef) => Effect.Effect<void>
  readonly addDependency: (claimId: string, dependsOnId: string) => Effect.Effect<void>
  readonly addContradiction: (claimId: string, contradictsId: string) => Effect.Effect<void>
  readonly recordOutcome: (outcome: ClaimOutcome) => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@arcana/ClaimStore") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const { db } = yield* Database.Service
    const eventStore = yield* EventStore.Service

    const create = Effect.fn("ClaimStore.create")(function* (claim: Claim) {
      yield* db.insert(ClaimTable).values({
        id: claim.id,
        session_id: claim.sessionId,
        proposition: claim.proposition,
        status: claim.status,
        scope_workspace: claim.scope?.workspace ?? null,
        scope_branch: claim.scope?.branch ?? null,
        scope_file: claim.scope?.file ?? null,
        scope_symbol: claim.scope?.symbol ?? null,
        confidence: claim.confidence,
        calibration_domain: claim.calibrationDomain ?? null,
        valid_from: claim.validFrom ?? null,
        valid_until: claim.validUntil ?? null,
        last_verified_at: claim.lastVerifiedAt ?? null,
        created_at: claim.createdAt,
        created_by_event_id: claim.createdByEventId,
      }).pipe(Effect.orDie)

      for (const ev of claim.provenance) {
        yield* addEvidence(claim.id, ev)
      }
      for (const dep of claim.dependencies) {
        yield* addDependency(claim.id, dep.claimId)
      }
      for (const con of claim.contradicts) {
        yield* addContradiction(claim.id, con.claimId)
      }
      // Emit epistemic claim.created event
      yield* eventStore.append({
        sessionId: claim.sessionId,
        actor: { kind: "policy", id: "claim-store" },
        type: "claim.created",
        payload: { claimId: claim.id, proposition: claim.proposition, status: claim.status, confidence: claim.confidence },
      }).pipe(Effect.catch(() => Effect.void), Effect.ignore)
    })

    const get = Effect.fn("ClaimStore.get")(function* (id: string) {
      const rows = yield* db.select().from(ClaimTable).where(eq(ClaimTable.id, id)).pipe(Effect.orDie)
      if (!rows.length) return undefined
      const evidenceRows = yield* db.select().from(ClaimEvidenceTable).where(eq(ClaimEvidenceTable.claim_id, id)).pipe(Effect.orDie)
      const depRows = yield* db.select().from(ClaimDependencyTable).where(eq(ClaimDependencyTable.claim_id, id)).pipe(Effect.orDie)
      const contraRows = yield* db.select().from(ClaimContradictionTable).where(eq(ClaimContradictionTable.claim_id, id)).pipe(Effect.orDie)
      return hydrateRow(rows[0]!, evidenceRows, depRows, contraRows)
    })

    const listBySession = Effect.fn("ClaimStore.listBySession")(function* (sessionId: SessionID) {
      const rows = yield* db.select().from(ClaimTable).where(eq(ClaimTable.session_id, sessionId)).pipe(Effect.orDie)
      const claims: Claim[] = []
      for (const row of rows) {
        const evidenceRows = yield* db.select().from(ClaimEvidenceTable).where(eq(ClaimEvidenceTable.claim_id, row.id)).pipe(Effect.orDie)
        const depRows = yield* db.select().from(ClaimDependencyTable).where(eq(ClaimDependencyTable.claim_id, row.id)).pipe(Effect.orDie)
        const contraRows = yield* db.select().from(ClaimContradictionTable).where(eq(ClaimContradictionTable.claim_id, row.id)).pipe(Effect.orDie)
        claims.push(hydrateRow(row, evidenceRows, depRows, contraRows))
      }
      return claims
    })

    const updateStatus = Effect.fn("ClaimStore.updateStatus")(function* (id: string, status: ClaimStatus) {
      const claimRows = yield* db.select({ session_id: ClaimTable.session_id }).from(ClaimTable)
        .where(eq(ClaimTable.id, id)).limit(1).pipe(Effect.orDie)
      const sessionId = claimRows[0]?.session_id
      if (!sessionId) return yield* Effect.die(new Error(`Claim ${id} has no owning session`))
      yield* db.update(ClaimTable).set({ status, last_verified_at: new Date().toISOString() }).where(eq(ClaimTable.id, id)).pipe(Effect.orDie)
      // Emit epistemic claim.transitioned event
      yield* eventStore.append({
        sessionId,
        actor: { kind: "policy", id: "claim-store" },
        type: "claim.transitioned",
        payload: { claimId: id, newStatus: status },
      }).pipe(Effect.catch(() => Effect.void), Effect.ignore)
    })

    const addEvidence = Effect.fn("ClaimStore.addEvidence")(function* (claimId: string, evidence: EvidenceRef) {
      const claimRows = yield* db.select({ session_id: ClaimTable.session_id }).from(ClaimTable)
        .where(eq(ClaimTable.id, claimId)).limit(1).pipe(Effect.orDie)
      const sessionId = claimRows[0]?.session_id
      if (!sessionId) return yield* Effect.die(new Error(`Claim ${claimId} has no owning session`))
      yield* db.insert(ClaimEvidenceTable).values({
        claim_id: claimId,
        event_id: evidence.eventId,
        artifact_digest: evidence.artifactDigest ?? null,
        location_file: evidence.location?.file ?? null,
        location_line_start: evidence.location?.lineStart ?? null,
        location_line_end: evidence.location?.lineEnd ?? null,
        relationship: evidence.relationship,
      }).pipe(Effect.orDie)
      // Emit epistemic evidence.attached event
      yield* eventStore.append({
        sessionId,
        actor: { kind: "policy", id: "claim-store" },
        type: "evidence.attached",
        payload: { claimId, evidenceEventId: evidence.eventId, relationship: evidence.relationship },
      }).pipe(Effect.catch(() => Effect.void), Effect.ignore)
    })

    const addDependency = Effect.fn("ClaimStore.addDependency")(function* (claimId: string, dependsOnId: string) {
      yield* db.insert(ClaimDependencyTable).values({ claim_id: claimId, depends_on_claim_id: dependsOnId }).pipe(Effect.orDie)
    })

    const addContradiction = Effect.fn("ClaimStore.addContradiction")(function* (claimId: string, contradictsId: string) {
      yield* db.insert(ClaimContradictionTable).values({ claim_id: claimId, contradicts_claim_id: contradictsId }).pipe(Effect.orDie)
    })

    const recordOutcome = Effect.fn("ClaimStore.recordOutcome")(function* (outcome: ClaimOutcome) {
      yield* db.insert(ClaimOutcomeTable).values({
        claim_id: outcome.claimId,
        predicted_confidence: outcome.predictedConfidence ?? null,
        final_outcome: outcome.finalOutcome,
        resolved_at: outcome.resolvedAt,
      }).onConflictDoUpdate({
        target: ClaimOutcomeTable.claim_id,
        set: { final_outcome: outcome.finalOutcome, resolved_at: outcome.resolvedAt },
      }).pipe(Effect.orDie)
    })

    return Service.of({ create, get, listBySession, updateStatus, addEvidence, addDependency, addContradiction, recordOutcome })
  }),
)

// ── Row hydration ─────────────────────────────────────────────────────

function hydrateRow(
  row: typeof ClaimTable.$inferSelect,
  evidenceRows: (typeof ClaimEvidenceTable.$inferSelect)[],
  depRows: (typeof ClaimDependencyTable.$inferSelect)[],
  contraRows: (typeof ClaimContradictionTable.$inferSelect)[],
): Claim {
  return {
    id: row.id,
    sessionId: row.session_id,
    proposition: row.proposition,
    status: row.status as ClaimStatus,
    scope: row.scope_workspace
      ? {
          workspace: row.scope_workspace ?? undefined,
          branch: row.scope_branch ?? undefined,
          file: row.scope_file ?? undefined,
          symbol: row.scope_symbol ?? undefined,
        }
      : undefined,
    provenance: evidenceRows.map((e) => ({
      eventId: e.event_id,
      artifactDigest: e.artifact_digest ?? undefined,
      location: e.location_file
        ? { file: e.location_file ?? undefined, lineStart: e.location_line_start ?? undefined, lineEnd: e.location_line_end ?? undefined }
        : undefined,
      relationship: e.relationship as EvidenceRef["relationship"],
    })),
    dependencies: depRows.map((d) => ({ claimId: d.depends_on_claim_id })),
    contradicts: contraRows.map((c) => ({ claimId: c.contradicts_claim_id })),
    validFrom: row.valid_from ?? undefined,
    validUntil: row.valid_until ?? undefined,
    lastVerifiedAt: row.last_verified_at ?? undefined,
    confidence: row.confidence ?? 0.5,
    calibrationDomain: row.calibration_domain ?? undefined,
    createdAt: row.created_at,
    createdByEventId: row.created_by_event_id,
  }
}

export * as ClaimStore from "./claim-store"
