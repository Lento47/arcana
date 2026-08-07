import { describe, expect, test } from "bun:test"
import type { SpineEntry } from "../src/shell/command-spine/spine-types"
import { attachProofContinuations } from "../src/shell/command-spine/spine-proof-attach"
import type { GovernanceRunProof } from "../src/shell/types"

function toolRow(overrides: Partial<SpineEntry> = {}): SpineEntry {
  return {
    id: "msg:tool:run",
    index: 1,
    elapsed: "",
    kind: "run",
    glyph: "▸",
    label: "run",
    summary: "bun test",
    collapsible: true,
    expandedByDefault: false,
    receipt: { label: "bash", command: "bun test", status: "ok" },
    source: { messageID: "msg", partID: "tool-1", kind: "tool" },
    ...overrides,
  }
}

const proof: GovernanceRunProof = {
  proofHash: "proof-hash",
  runRoot: "root",
  derivedAt: "2026-08-02T00:00:00.000Z",
  eventCount: 2,
  lastSequence: 2,
  proofLevel: "P3" as const,
  traceHealth: "COMPLETE" as const,
  integrityStatus: "VALID" as const,
  lifecycleStatus: "COMPLETE" as const,
  completionMethod: "VERIFIED_COMPLETE",
  assuranceProfile: {
    trace: "RECORDED",
    integrity: "VALID",
    verification: "VERIFIED",
    reproducibility: "PARTIAL",
  },
  contractStatus: "satisfied",
  claimsByStatus: {},
  obligationsByStatus: {},
  gaps: [],
  authorizationProfile: {
    policyVersions: ["dev-secure@18"],
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
}

describe("PR6 proof continuation attachment", () => {
  test("attaches proof to the matching run tool row and hides the standalone row", () => {
    const entries = [
      toolRow(),
      {
        id: "proof-continuation:evt-exec-1",
        index: 2,
        elapsed: "",
        kind: "ok" as const,
        glyph: "◎",
        label: "verified effect",
        summary: "VERIFIED EFFECT · bash",
        source: { messageID: "evt-exec-1", kind: "governance" as const },
      },
    ]
    const result = attachProofContinuations({
      entries,
      executedEvents: [
        {
          id: "evt-exec-1",
          type: "authorization.executed",
          payload: {
            requestHash: "hash-1",
            executionId: "exec-1",
            tool: "bash",
            executable: "bun",
            arguments: ["test"],
            decision: { policyVersion: "dev-secure@18" },
          },
        },
      ],
      evidenceCountByRequestHash: { "hash-1": 3 },
      proof,
    })

    const attached = result.find((entry) => entry.id === "msg:tool:run")
    expect(attached?.proof).toBeDefined()
    expect(attached?.proof?.receipt).toBe("hash-1")
    expect(attached?.proof?.evidence).toBe(3)
    expect(attached?.proof?.proofLevel).toBe("P3")
    expect(attached?.proof?.integrity).toBe("VALID")
    expect(attached?.proof?.policy).toBe("dev-secure@18")
    expect(result.find((entry) => entry.id === "proof-continuation:evt-exec-1")?.hidden).toBe(true)
  })

  test("never invents a proof when the command does not match", () => {
    const entries = [toolRow({ id: "other-tool", receipt: { label: "bash", command: "ls -la", status: "ok" } })]
    const result = attachProofContinuations({
      entries,
      executedEvents: [
        {
          id: "evt-1",
          type: "authorization.executed",
          payload: { requestHash: "hash-2", tool: "bash", executable: "bun", arguments: ["test"] },
        },
      ],
      evidenceCountByRequestHash: {},
      proof,
    })
    expect(result[0]?.proof).toBeUndefined()
  })

  test("enriches standalone proof rows with evidence + proof snapshot", () => {
    const entries = [
      {
        id: "proof-continuation:evt-2",
        index: 1,
        elapsed: "",
        kind: "ok" as const,
        glyph: "◎",
        label: "verified effect",
        summary: "VERIFIED EFFECT · bash",
        proof: { receipt: "old" },
        source: { messageID: "evt-2", kind: "governance" as const },
      },
    ]
    const result = attachProofContinuations({
      entries,
      executedEvents: [
        {
          id: "evt-2",
          type: "authorization.executed",
          payload: { requestHash: "hash-3", executionId: "exec-3", tool: "bash" },
        },
      ],
      evidenceCountByRequestHash: { "hash-3": 2 },
      proof,
    })
    expect(result[0]?.proof?.evidence).toBe(2)
    expect(result[0]?.proof?.proofLevel).toBe("P3")
    expect(result[0]?.proof?.executionId).toBe("exec-3")
  })
})
