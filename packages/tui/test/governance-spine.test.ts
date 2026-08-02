import { describe, expect, test } from "bun:test"
import {
  governanceProofToSpineEntry,
  governanceTraceToSpineEntry,
  productionInputToSpineEntry,
  type GovernanceView,
} from "../src/shell/command-spine/production-spine-input"
import type { GovernanceRunProof } from "../src/shell/types"

function governance(overrides: Partial<GovernanceView> = {}): GovernanceView {
  return {
    id: "event-1",
    sessionId: "session-1",
    eventType: "authorization.denied",
    timestamp: Date.parse("2026-08-01T12:00:00.000Z"),
    sequence: 42,
    actor: "policy:pdp",
    payload: { requestId: "request-1", reason: "scope mismatch" },
    ...overrides,
  }
}

function proof(overrides: Partial<GovernanceRunProof> = {}): GovernanceRunProof {
  return {
    proofHash: "proof-hash-full",
    runRoot: "run-root-full",
    derivedAt: "2026-08-01T12:00:01.000Z",
    eventCount: 9,
    lastSequence: 42,
    proofLevel: "P3",
    traceHealth: "COMPLETE",
    integrityStatus: "VALID",
    lifecycleStatus: "COMPLETE",
    completionMethod: "VERIFIED_COMPLETE",
    assuranceProfile: {
      trace: "RECORDED",
      integrity: "VALID",
      verification: "VERIFIED",
      reproducibility: "PARTIAL",
      reproducibilityDetail: "1/2 declared steps",
    },
    contractStatus: "satisfied",
    claimsByStatus: { verified: 1 },
    obligationsByStatus: { satisfied: 2 },
    gaps: [],
    authorizationProfile: {
      policyVersions: ["policy-v1"],
      requests: 1,
      allowed: 1,
      denied: 0,
      approvalsRequired: 0,
      staleDecisions: 0,
      executed: 1,
      executionFailures: 0,
      unauthorizedExecutions: 0,
      capabilityViolations: 0,
      authorizationTraceHealth: "COMPLETE",
      orphanExecutions: 0,
      unmatchedAllows: 0,
      unmatchedRequests: 0,
      intentEnforcementMode: "REQUIRED",
      intentBindingsCreated: 1,
      intentTraceHealth: "COMPLETE",
    },
    ...overrides,
  }
}

describe("governance Command Spine projection", () => {
  test("renders a denial as an expanded failure with its stable reason", () => {
    const entry = productionInputToSpineEntry({ source: "GOVERNANCE", value: governance() })

    expect(entry.kind).toBe("fail")
    expect(entry.label).toBe("denied")
    expect(entry.summary).toContain("scope mismatch")
    expect(entry.expandedByDefault).toBe(true)
    expect(entry.index).toBe(42)
    expect(entry.source?.kind).toBe("governance")
  })

  test("preserves the complete committed payload in the expandable body", () => {
    const evidence = "x".repeat(3_000)
    const entry = productionInputToSpineEntry({
      source: "GOVERNANCE",
      value: governance({ payload: { evidence } }),
    })

    expect(entry.body).toContain(evidence)
    expect(entry.body).not.toContain("(truncated)")
  })

  test("keeps unknown event types visible without inventing semantics", () => {
    const entry = productionInputToSpineEntry({
      source: "GOVERNANCE",
      value: governance({ eventType: "POLICY_CHANGED" }),
    })

    expect(entry.kind).toBe("inspect")
    expect(entry.summary).toBe("POLICY_CHANGED")
  })

  test("renders operator verification decisions from verification.recorded", () => {
    const satisfied = productionInputToSpineEntry({
      source: "GOVERNANCE",
      value: governance({
        eventType: "verification.recorded",
        payload: {
          obligationId: "obl-1",
          verification: "human_decision",
          outcome: "satisfied",
          reason: "operator reviewed the security policy check",
        },
      }),
    })
    expect(satisfied.kind).toBe("ok")
    expect(satisfied.label).toBe("operator decision")
    expect(satisfied.summary).toContain("Operator verification satisfied")
    expect(satisfied.summary).toContain("human_decision")
    expect(satisfied.summary).toContain("operator reviewed the security policy check")
    expect(satisfied.expandedByDefault).toBe(false)

    const failed = productionInputToSpineEntry({
      source: "GOVERNANCE",
      value: governance({
        eventType: "verification.recorded",
        payload: {
          obligationId: "obl-2",
          verification: "comparison",
          outcome: "failed",
          reason: "expected digest does not match observed evidence",
        },
      }),
    })
    expect(failed.kind).toBe("fail")
    expect(failed.summary).toContain("Operator verification failed")
    expect(failed.expandedByDefault).toBe(true)
  })

  test("maps canonical intent, provenance, and verifier events from durable payloads", () => {
    const contract = productionInputToSpineEntry({
      source: "GOVERNANCE",
      value: governance({
        eventType: "contract.proposed",
        payload: { contractId: "contract-1", objective: "fix authorization", revision: 8, criteria: 4 },
      }),
    })
    const evidence = productionInputToSpineEntry({
      source: "GOVERNANCE",
      value: governance({ eventType: "evidence.attached", payload: { claimId: "claim-1", relationship: "verified_by" } }),
    })
    const verification = productionInputToSpineEntry({
      source: "GOVERNANCE",
      value: governance({ eventType: "completion.resolved", payload: { method: "VERIFIED_COMPLETE" } }),
    })

    expect(contract.label).toBe("contract")
    expect(contract.summary).toContain("revision 8 · 4 criteria")
    expect(evidence.label).toBe("evidence")
    expect(evidence.summary).toContain("verified_by")
    expect(verification.label).toBe("verify")
    expect(verification.kind).toBe("ok")
  })

  test("shows a healthy canonical RunProof without dropping hashes or assurance axes", () => {
    const entry = governanceProofToSpineEntry("session-1", proof())

    expect(entry.kind).toBe("ok")
    expect(entry.label).toBe("proof")
    expect(entry.summary).toContain("complete")
    expect(entry.summary).toContain("1 authorized")
    expect(entry.summary).toContain("1 executed")
    expect(entry.summary).toContain("0 denied")
    expect(entry.expandedByDefault).toBe(false)
    expect(entry.body).toContain("Overall assurance: COMPLETE")
    expect(entry.body).toContain("Recorded trace: COMPLETE")
    expect(entry.body).toContain("Execution failures: 0")
    expect(entry.body).toContain("Proof hash: proof-hash-full")
    expect(entry.body).toContain("Run root: run-root-full")
    expect(entry.body).toContain("Reproducibility: PARTIAL · 1/2 declared steps")
    expect(entry.index).toBe(Number.MAX_SAFE_INTEGER)
  })

  test("never presents a zero-violation claim as healthy when authorization evidence is unavailable", () => {
    const unavailable = governanceProofToSpineEntry(
      "session-1",
      proof({
        traceHealth: "UNAVAILABLE",
        authorizationProfile: {
          ...proof().authorizationProfile,
          authorizationTraceHealth: "UNAVAILABLE",
        },
      }),
    )

    expect(unavailable.kind).toBe("fail")
    expect(unavailable.body).toContain("Authorization trace: UNAVAILABLE")
    expect(unavailable.body).toContain("Overall assurance: UNAVAILABLE")
    expect(unavailable.body).toContain("Recorded trace: UNAVAILABLE")
    expect(unavailable.summary).toContain("unavailable")
    // Progressive disclosure: the summary row stays collapsed; axes + raw
    // events live in the expanded inspector body.
    expect(unavailable.expandedByDefault).toBe(false)
  })

  test("renders compatibility intent as degraded even with zero unauthorized executions", () => {
    const entry = governanceProofToSpineEntry("session-1", proof({
      authorizationProfile: {
        ...proof().authorizationProfile,
        intentEnforcementMode: "LEGACY_COMPAT",
        intentTraceHealth: "DEGRADED",
      },
      gaps: ["intent enforcement is LEGACY_COMPAT - security assurance is degraded"],
    }))

    expect(entry.kind).toBe("fail")
    expect(entry.summary).toContain("degraded")
    expect(entry.body).toContain("Intent trace: DEGRADED")
    expect(entry.body).toContain("security assurance is degraded")
  })

  test("surfaces operator-rejected executions as failures, not as executed", () => {
    const entry = governanceProofToSpineEntry("session-1", proof({
      authorizationProfile: {
        ...proof().authorizationProfile,
        requests: 2,
        allowed: 2,
        executed: 1,
        executionFailures: 1,
      },
    }))

    expect(entry.summary).toContain("2 authorized")
    expect(entry.summary).toContain("1 executed")
    expect(entry.summary).toContain("1 failed")
    expect(entry.body).toContain("Execution failures: 1")
  })

  test("surfaces missing trace evidence and stays silent for complete traces", () => {
    expect(
      governanceTraceToSpineEntry({
        sessionId: "session-1",
        status: "COMPLETE",
        expectedCriticalEvents: 2,
        recordedCriticalEvents: 2,
        recordingErrors: [],
      }),
    ).toBeUndefined()

    const unavailable = governanceTraceToSpineEntry({
      sessionId: "session-1",
      status: "UNAVAILABLE",
      expectedCriticalEvents: 0,
      recordedCriticalEvents: 0,
      recordingErrors: [],
    })
    expect(unavailable?.kind).toBe("fail")
    expect(unavailable?.summary).toContain("unavailable")
    expect(unavailable?.expandedByDefault).toBe(true)
  })
})
