import { describe, expect, test } from "bun:test"
import { Effect, Layer } from "effect"
import { eq } from "drizzle-orm"
import { Database } from "@arcana/core/database/database"
import { ContractAcceptanceCriteriaTable, ContractTable } from "@arcana/core/epistemic/contract-sql"
import { ObligationTable } from "@arcana/core/epistemic/obligation-sql"
import type { SessionID } from "../../src/session/schema"
import { EventStore } from "../../src/session/epistemic/event-store"
import { ObligationEngine } from "../../src/session/epistemic/obligation-engine"
import { resolveObligationsFromEvidence } from "../../src/session/epistemic/completion-verifier"

const dbLayer = Database.layerFromPath(":memory:")
const eventStoreLayer = EventStore.layer.pipe(Layer.provide(dbLayer))
const obligationLayer = ObligationEngine.layer.pipe(
  Layer.provide(eventStoreLayer),
  Layer.provide(dbLayer),
)
const runtimeLayer = Layer.mergeAll(dbLayer, eventStoreLayer, obligationLayer)

const sessionId = "session-verifier" as SessionID
const contractId = "contract-verifier"

function run<A, E>(
  effect: Effect.Effect<A, E, EventStore.Service | ObligationEngine.Service | Database.Service>,
) {
  return Effect.runPromise(effect.pipe(Effect.provide(runtimeLayer)))
}

const seedContract = Database.Service.use(({ db }) =>
  Effect.gen(function* () {
    yield* db.insert(ContractTable).values({
      id: contractId,
      session_id: sessionId,
      objective: "Verify obligation resolution",
      risk_class: "modify",
      source_event_id: "user-1",
      revision: 1,
      status: "active",
      created_at: "2026-08-01T00:00:00.000Z",
    })
    yield* db.insert(ContractAcceptanceCriteriaTable).values({
      id: "criterion-execution",
      contract_id: contractId,
      description: "Executed work exists",
      required: 1,
      verification: "execution",
    })
    yield* db.insert(ContractAcceptanceCriteriaTable).values({
      id: "criterion-observation",
      contract_id: contractId,
      description: "Evidence observed",
      required: 1,
      verification: "observation",
    })
  }),
)

describe("completion verifier", () => {
  test("resolves execution obligations from authorized executed effects", async () => {
    await run(
      Effect.gen(function* () {
        yield* seedContract
        const database = yield* Database.Service
        const eventStore = yield* EventStore.Service
        const obligations = yield* ObligationEngine.Service
        yield* obligations.createFromAcceptanceCriteria(contractId, ["criterion-execution"])

        const executed = yield* eventStore.append({
          sessionId,
          actor: { kind: "policy", id: "pep" },
          type: "authorization.executed",
          payload: { requestId: "req-1" },
        })

        const result = yield* resolveObligationsFromEvidence({
          sessionId,
          contractId,
          obligations,
          eventStore,
        })
        expect(result).toEqual({ resolved: 1, pending: 0 })

        const rows = yield* database.db
          .select({ status: ObligationTable.status })
          .from(ObligationTable)
          .where(eq(ObligationTable.contract_id, contractId))
        expect(rows[0]?.status).toBe("satisfied")

        const governance = yield* eventStore.listGovernance(sessionId)
        const resolvedEvent = governance.find((event) => event.type === "obligation.resolved")
        expect(resolvedEvent).toBeDefined()
        expect((resolvedEvent!.payload as { obligationId?: string }).obligationId).toBeDefined()
        expect(executed.id.length).toBeGreaterThan(0)
      }),
    )
  })

  test("leaves obligations pending when no durable evidence exists", async () => {
    await run(
      Effect.gen(function* () {
        yield* seedContract
        const database = yield* Database.Service
        const eventStore = yield* EventStore.Service
        const obligations = yield* ObligationEngine.Service
        yield* obligations.createFromAcceptanceCriteria(contractId, ["criterion-execution"])

        const result = yield* resolveObligationsFromEvidence({
          sessionId,
          contractId,
          obligations,
          eventStore,
        })
        expect(result).toEqual({ resolved: 0, pending: 1 })

        const rows = yield* database.db
          .select({ status: ObligationTable.status })
          .from(ObligationTable)
          .where(eq(ObligationTable.contract_id, contractId))
        expect(rows[0]?.status).toBe("pending")
      }),
    )
  })

  test("resolves observation obligations from attached evidence", async () => {
    await run(
      Effect.gen(function* () {
        yield* seedContract
        const database = yield* Database.Service
        const eventStore = yield* EventStore.Service
        const obligations = yield* ObligationEngine.Service
        yield* obligations.createFromAcceptanceCriteria(contractId, ["criterion-observation"])
        yield* eventStore.append({
          sessionId,
          actor: { kind: "policy", id: "claim-store" },
          type: "evidence.attached",
          payload: { claimId: "claim-1", evidenceId: "evidence-1" },
        })

        const result = yield* resolveObligationsFromEvidence({
          sessionId,
          contractId,
          obligations,
          eventStore,
        })
        expect(result).toEqual({ resolved: 1, pending: 0 })

        const rows = yield* database.db
          .select({ status: ObligationTable.status })
          .from(ObligationTable)
          .where(eq(ObligationTable.contract_id, contractId))
        expect(rows[0]?.status).toBe("satisfied")
      }),
    )
  })

  test("resolves test criteria only from test-like executed effects", async () => {
    await run(
      Effect.gen(function* () {
        const database = yield* Database.Service
        const eventStore = yield* EventStore.Service
        const obligations = yield* ObligationEngine.Service
        yield* seedContract
        yield* database.db.insert(ContractAcceptanceCriteriaTable).values({
          id: "criterion-tests",
          contract_id: contractId,
          description: "Relevant tests and checks pass",
          required: 1,
          verification: "execution",
        })
        yield* obligations.createFromAcceptanceCriteria(contractId, ["criterion-tests"])

        // A non-test effect does not satisfy the test criterion.
        yield* eventStore.append({
          sessionId,
          actor: { kind: "policy", id: "pep" },
          type: "authorization.executed",
          payload: {
            requestId: "req-read",
            tool: "read",
            action: "filesystem.read",
            arguments: [],
          },
        })
        let result = yield* resolveObligationsFromEvidence({
          sessionId,
          contractId,
          obligations,
          eventStore,
        })
        expect(result).toEqual({ resolved: 0, pending: 1 })

        // A test-like effect satisfies it.
        yield* eventStore.append({
          sessionId,
          actor: { kind: "policy", id: "pep" },
          type: "authorization.executed",
          payload: {
            requestId: "req-test",
            tool: "terminal",
            action: "process.execute",
            executable: "bun",
            arguments: ["test"],
          },
        })
        // Test criteria also require a durable test receipt.
        yield* eventStore.append({
          sessionId,
          actor: { kind: "policy", id: "claim-store" },
          type: "evidence.attached",
          payload: { claimId: "claim-tests", evidenceId: "evidence-tests", kind: "test_receipt" },
        })
        result = yield* resolveObligationsFromEvidence({
          sessionId,
          contractId,
          obligations,
          eventStore,
        })
        expect(result).toEqual({ resolved: 1, pending: 0 })
      }),
    )
  })

  test("resolves build criteria only from build-like executed effects", async () => {
    await run(
      Effect.gen(function* () {
        const database = yield* Database.Service
        const eventStore = yield* EventStore.Service
        const obligations = yield* ObligationEngine.Service
        yield* seedContract
        yield* database.db.insert(ContractAcceptanceCriteriaTable).values({
          id: "criterion-build",
          contract_id: contractId,
          description: "The project builds successfully",
          required: 1,
          verification: "execution",
        })
        yield* obligations.createFromAcceptanceCriteria(contractId, ["criterion-build"])

        // A read-only effect does not satisfy the build criterion.
        yield* eventStore.append({
          sessionId,
          actor: { kind: "policy", id: "pep" },
          type: "authorization.executed",
          payload: {
            requestId: "req-read-only",
            tool: "read",
            action: "filesystem.read",
            arguments: [],
          },
        })
        let result = yield* resolveObligationsFromEvidence({
          sessionId,
          contractId,
          obligations,
          eventStore,
        })
        expect(result).toEqual({ resolved: 0, pending: 1 })

        // A build-like effect satisfies it.
        yield* eventStore.append({
          sessionId,
          actor: { kind: "policy", id: "pep" },
          type: "authorization.executed",
          payload: {
            requestId: "req-build",
            tool: "terminal",
            action: "process.execute",
            executable: "bun",
            arguments: ["run", "build"],
          },
        })
        // Build criteria also require a durable build receipt.
        yield* eventStore.append({
          sessionId,
          actor: { kind: "policy", id: "claim-store" },
          type: "evidence.attached",
          payload: { claimId: "claim-build", evidenceId: "evidence-build", kind: "build_receipt" },
        })
        result = yield* resolveObligationsFromEvidence({
          sessionId,
          contractId,
          obligations,
          eventStore,
        })
        expect(result).toEqual({ resolved: 1, pending: 0 })
      }),
    )
  })

  test("diff and artifact criteria require matching evidence receipts", async () => {
    await run(
      Effect.gen(function* () {
        const database = yield* Database.Service
        const eventStore = yield* EventStore.Service
        const obligations = yield* ObligationEngine.Service
        yield* seedContract
        yield* database.db.insert(ContractAcceptanceCriteriaTable).values({
          id: "criterion-diff",
          contract_id: contractId,
          description: "Changes match the requested diff digest",
          required: 1,
          verification: "execution",
        })
        yield* database.db.insert(ContractAcceptanceCriteriaTable).values({
          id: "criterion-artifact",
          contract_id: contractId,
          description: "Build artifact hash matches the recorded receipt",
          required: 1,
          verification: "execution",
        })
        yield* obligations.createFromAcceptanceCriteria(contractId, ["criterion-diff", "criterion-artifact"])
        yield* eventStore.append({
          sessionId,
          actor: { kind: "policy", id: "pep" },
          type: "authorization.executed",
          payload: { requestId: "req-diff", tool: "edit", action: "filesystem.edit", arguments: [] },
        })

        // Without any receipt both stay pending.
        let result = yield* resolveObligationsFromEvidence({
          sessionId,
          contractId,
          obligations,
          eventStore,
        })
        expect(result).toEqual({ resolved: 0, pending: 2 })

        // Only the matching receipt kinds resolve their criteria.
        yield* eventStore.append({
          sessionId,
          actor: { kind: "policy", id: "claim-store" },
          type: "evidence.attached",
          payload: { claimId: "claim-diff", evidenceId: "evidence-diff", kind: "diff_receipt", digest: "abc123" },
        })
        result = yield* resolveObligationsFromEvidence({
          sessionId,
          contractId,
          obligations,
          eventStore,
        })
        expect(result).toEqual({ resolved: 1, pending: 1 })

        yield* eventStore.append({
          sessionId,
          actor: { kind: "policy", id: "claim-store" },
          type: "evidence.attached",
          payload: { claimId: "claim-artifact", evidenceId: "evidence-artifact", kind: "artifact_receipt", hash: "def456" },
        })
        result = yield* resolveObligationsFromEvidence({
          sessionId,
          contractId,
          obligations,
          eventStore,
        })
        // The diff obligation was already resolved by the previous pass, so
        // this invocation only resolves the artifact obligation.
        expect(result).toEqual({ resolved: 1, pending: 0 })
      }),
    )
  })

  test("human, comparison, and external obligations resolve only from recorded verification", async () => {
    await run(
      Effect.gen(function* () {
        const database = yield* Database.Service
        const eventStore = yield* EventStore.Service
        const obligations = yield* ObligationEngine.Service
        yield* seedContract
        for (const [id, verification] of [
          ["criterion-human", "human_decision"],
          ["criterion-comparison", "comparison"],
          ["criterion-external", "external_confirmation"],
        ] as const) {
          yield* database.db.insert(ContractAcceptanceCriteriaTable).values({
            id,
            contract_id: contractId,
            description: `Requires ${verification}`,
            required: 1,
            verification,
          })
        }
        yield* obligations.createFromAcceptanceCriteria(contractId, [
          "criterion-human",
          "criterion-comparison",
          "criterion-external",
        ])

        // Executed effects must never satisfy these verification classes.
        yield* eventStore.append({
          sessionId,
          actor: { kind: "policy", id: "pep" },
          type: "authorization.executed",
          payload: { requestId: "req-human", tool: "terminal", action: "process.execute" },
        })
        let result = yield* resolveObligationsFromEvidence({
          sessionId,
          contractId,
          obligations,
          eventStore,
        })
        expect(result).toEqual({ resolved: 0, pending: 3 })

        const pending = yield* obligations.getUnresolvedRequired(contractId)
        const byVerification = new Map(pending.map((obligation) => [obligation.verification, obligation.id]))

        // A recorded human decision (written by the operator/verifier path
        // without resolving the row) resolves its obligation at the gate.
        yield* eventStore.append({
          sessionId,
          actor: { kind: "operator", id: "verification" },
          type: "verification.recorded",
          payload: {
            obligationId: byVerification.get("human_decision")!,
            contractId,
            verification: "human_decision",
            outcome: "satisfied",
            reason: "Operator reviewed the security policy check",
          },
        })
        result = yield* resolveObligationsFromEvidence({
          sessionId,
          contractId,
          obligations,
          eventStore,
        })
        expect(result).toEqual({ resolved: 1, pending: 2 })

        // A recorded comparison outcome (failed) resolves as failed.
        yield* eventStore.append({
          sessionId,
          actor: { kind: "operator", id: "verification" },
          type: "verification.recorded",
          payload: {
            obligationId: byVerification.get("comparison")!,
            contractId,
            verification: "comparison",
            outcome: "failed",
            reason: "Expected output digest does not match observed evidence",
            details: { expected: "abc", actual: "def", matches: false },
          },
        })
        result = yield* resolveObligationsFromEvidence({
          sessionId,
          contractId,
          obligations,
          eventStore,
        })
        expect(result).toEqual({ resolved: 1, pending: 1 })

        // The operator API records AND resolves immediately: the gate then
        // sees no pending obligations left.
        yield* obligations.recordVerification({
          obligationId: byVerification.get("external_confirmation")!,
          outcome: "satisfied",
          reason: "Deployment confirmed by the target environment",
          details: { source: "deploy-api", deployedAt: "2026-08-01T00:00:00.000Z" },
        })
        result = yield* resolveObligationsFromEvidence({
          sessionId,
          contractId,
          obligations,
          eventStore,
        })
        expect(result).toEqual({ resolved: 0, pending: 0 })

        const rows = yield* database.db
          .select({ status: ObligationTable.status })
          .from(ObligationTable)
          .where(eq(ObligationTable.contract_id, contractId))
        expect(rows.map((row) => row.status).sort()).toEqual(["failed", "satisfied", "satisfied"])

        const governance = yield* eventStore.listGovernance(sessionId)
        const recorded = governance.filter((event) => event.type === "verification.recorded")
        expect(recorded).toHaveLength(3)
        expect(recorded.every((event) => typeof (event.payload as { reason?: string }).reason === "string")).toBe(true)
      }),
    )
  })
})
