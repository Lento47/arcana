/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import type { GlobalEvent, SessionGovernanceResponse } from "@arcana/sdk/v2"
import { tmpdir } from "../../../fixture/fixture"
import { json, mount, wait } from "./sync-fixture"

const sessionID = "ses_governance_live"
const recorded = {
  id: "evt_governance_live",
  sequence: 42,
  sessionId: sessionID,
  timestamp: "2026-08-01T12:00:00.000Z",
  previousHash: "hash-previous",
  hash: "hash-current",
  actor: { kind: "policy" as const, id: "pdp" },
  type: "authorization.denied" as const,
  payload: { requestId: "req-live", reason: "scope mismatch" },
}

function governanceEvent(): GlobalEvent {
  return {
    directory: "/tmp/other",
    project: "proj_test",
    payload: {
      id: "evt_transport_governance_live",
      type: "governance.recorded",
      properties: { sessionID, event: recorded },
    },
  }
}

test("a committed governance event remains visible while trace health refreshes", async () => {
  await using tmp = await tmpdir()
  await Bun.write(`${tmp.path}/kv.json`, "{}")
  let failRefresh = true
  const complete: SessionGovernanceResponse = {
    sessionId: sessionID,
    trace: {
      status: "COMPLETE",
      expectedCriticalEvents: 1,
      recordedCriticalEvents: 1,
      recordingErrors: [],
    },
    events: [recorded],
    proof: {
      proofHash: "proof-hash",
      runRoot: "run-root",
      derivedAt: "2026-08-01T12:00:01.000Z",
      eventCount: 3,
      lastSequence: 42,
      proofLevel: "P1",
      traceHealth: "COMPLETE",
      integrityStatus: "VALID",
      lifecycleStatus: "INCOMPLETE",
      assuranceProfile: {
        trace: "RECORDED",
        integrity: "VALID",
        verification: "UNVERIFIED",
        reproducibility: "NONE",
      },
      claimsByStatus: {},
      obligationsByStatus: {},
      gaps: [],
      authorizationProfile: {
        policyVersions: ["policy-v1"],
        requests: 1,
        allowed: 0,
        denied: 1,
        approvalsRequired: 0,
        staleDecisions: 0,
        executed: 0,
        executionFailures: 0,
        unauthorizedExecutions: 0,
        capabilityViolations: 1,
        authorizationTraceHealth: "COMPLETE",
        orphanExecutions: 0,
        unmatchedAllows: 0,
        unmatchedRequests: 0,
        intentEnforcementMode: "REQUIRED",
        intentBindingsCreated: 1,
        intentTraceHealth: "COMPLETE",
      },
    },
  }
  const { app, emit, sync } = await mount((url) => {
    if (url.pathname !== `/session/${sessionID}/governance`) return undefined
    if (failRefresh) throw new Error("governance endpoint unavailable")
    return json(complete)
  }, tmp.path)

  try {
    emit(governanceEvent())
    await wait(() => sync.data.governance[sessionID]?.events[0]?.id === recorded.id)
    expect(sync.data.governance[sessionID]?.trace.status).toBe("UNAVAILABLE")

    failRefresh = false
    emit(governanceEvent())
    await wait(() => sync.data.governance[sessionID]?.trace.status === "COMPLETE")
    expect(sync.data.governance[sessionID]?.events.map((event) => event.id)).toEqual([recorded.id])
    expect(sync.data.governance[sessionID]?.proof.proofHash).toBe("proof-hash")
  } finally {
    app.renderer.destroy()
  }
})
