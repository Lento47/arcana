import { Effect } from "effect"
import type { EvidenceRef } from "@arcana/core/epistemic/claim"
import { EventStore } from "./event-store"
import { ObligationEngine } from "./obligation-engine"

/**
 * Production obligation verifier.
 *
 * Resolves pending REQUIRED obligations from durable governance evidence so
 * the completion gate is evidence-gated instead of treating "zero obligations"
 * as satisfied. Rules are deliberately conservative:
 *
 * - `execution` obligations are satisfied when the session has at least one
 *   `authorization.executed` event (a real effect ran through the PEP).
 *   Criteria compiled from the request are command-aware: "tests and checks"
 *   obligations require an executed test-like effect AND a durable
 *   `evidence.attached` test receipt; "builds successfully" obligations
 *   require a build-like effect AND a build receipt; diff-digest and
 *   artifact-hash criteria require the matching receipt kind. Generic task
 *   obligations accept any executed effect.
 * - `observation` obligations are satisfied when the session has at least one
 *   `evidence.attached` event.
 * - `comparison`, `human_decision`, and `external_confirmation` obligations
 *   are resolved only from durable `verification.recorded` events (an explicit
 *   operator/verifier path that records an outcome and a reason). They are
 *   never resolved from executed effects or model prose.
 */

export interface ObligationVerificationResult {
  readonly resolved: number
  readonly pending: number
}

export const resolveObligationsFromEvidence = Effect.fn("CompletionVerifier.resolve")(
  function* (input: {
    sessionId: string
    contractId: string
    obligations: ObligationEngine.Interface
    eventStore: EventStore.Interface
  }) {
    const pending = yield* input.obligations.getUnresolvedRequired(input.contractId)
    if (pending.length === 0) {
      return { resolved: 0, pending: 0 } satisfies ObligationVerificationResult
    }

    const events = yield* input.eventStore.listGovernance(input.sessionId)
    const executed = events.filter((event) => event.type === "authorization.executed")
    const observed = events.filter((event) => event.type === "evidence.attached")
    const recorded = events.filter((event) => event.type === "verification.recorded")

    const executedCommandText = (payload: unknown): string => {
      const record = payload as Record<string, unknown> | undefined
      if (!record || typeof record !== "object") return ""
      const parts = [record.tool, record.action, record.executable]
      if (Array.isArray(record.arguments)) {
        parts.push(...record.arguments.map((argument) => String(argument)))
      }
      return parts.filter(Boolean).join(" ").toLowerCase()
    }
    const testLike = (payload: unknown) => /(\btests?\b|\bcheck\b|\bverify\b|regression)/.test(executedCommandText(payload))
    const buildLike = (payload: unknown) => /(\bbuild\b|\bcompile\b)/.test(executedCommandText(payload))
    const receiptKind = (payload: unknown): string => {
      const record = payload as Record<string, unknown> | undefined
      return typeof record?.kind === "string" ? record.kind : ""
    }
    const hasReceipt = (kind: string) => observed.some((event) => receiptKind(event.payload) === kind)

    let resolved = 0
    for (const obligation of pending) {
      let evidence: EvidenceRef[] = []
      if (obligation.verification === "execution") {
        const description = obligation.description.toLowerCase()
        let matching = executed
        if (description.includes("tests and checks")) {
          matching = executed.filter((event) => testLike(event.payload))
          if (!hasReceipt("test_receipt")) matching = []
        } else if (description.includes("builds successfully")) {
          matching = executed.filter((event) => buildLike(event.payload))
          if (!hasReceipt("build_receipt")) matching = []
        } else if (description.includes("diff")) {
          if (!hasReceipt("diff_receipt")) matching = []
        } else if (description.includes("artifact")) {
          if (!hasReceipt("artifact_receipt")) matching = []
        }
        evidence = matching.map((event) => ({
          eventId: event.id,
          relationship: "produced_by" as const,
        }))
      } else if (obligation.verification === "observation") {
        evidence = observed.map((event) => ({
          eventId: event.id,
          relationship: "observed_in" as const,
        }))
      } else if (
        obligation.verification === "comparison" ||
        obligation.verification === "human_decision" ||
        obligation.verification === "external_confirmation"
      ) {
        const verdict = recorded.find((event) => {
          const payload = event.payload as Record<string, unknown> | undefined
          return payload?.obligationId === obligation.id && payload?.verification === obligation.verification
        })
        if (!verdict) continue
        const outcome = (verdict.payload as Record<string, unknown> | undefined)?.outcome
        if (outcome !== "satisfied" && outcome !== "failed" && outcome !== "waived") continue
        yield* input.obligations.resolve(obligation.id, outcome, [])
        resolved += 1
        continue
      }
      if (evidence.length === 0) continue
      yield* input.obligations.resolve(obligation.id, "satisfied", evidence)
      resolved += 1
    }

    return { resolved, pending: pending.length - resolved } satisfies ObligationVerificationResult
  },
)

export * as CompletionVerifier from "./completion-verifier"
