import { describe, expect, test } from "bun:test"
import type { ApprovalRecord } from "@arcana/core/crypto/approval-lifecycle"
import { buildSpineInspection } from "../src/shell/command-spine/spine-inspector.ts"
import type { SpineEntry } from "../src/shell/command-spine/spine-types"
import type { GovernanceRunProof } from "../src/shell/types"

function entry(overrides: Partial<SpineEntry> = {}): SpineEntry {
  return {
    id: "e1",
    index: 1,
    elapsed: "",
    kind: "inspect",
    glyph: "▸",
    label: "tool",
    summary: "read src/a.ts",
    collapsible: true,
    expandedByDefault: false,
    source: { messageID: "m1", partID: "p1", kind: "tool" },
    ...overrides,
  }
}

const approval: ApprovalRecord = {
  approvalId: "appr_1",
  version: 2,
  sessionId: "s1",
  workspaceId: "w1",
  requestHash: "hash-full",
  contractRevision: 1,
  state: "PENDING",
  expiresAt: "2099-01-01T00:00:00.000Z",
  updatedAt: "2026-08-02T00:00:00.000Z",
  createdAt: "2026-08-02T00:00:00.000Z",
}

describe("PR6 universal inspector content", () => {
  test("approval rows show the immutable exact request", () => {
    const sections = buildSpineInspection({
      entry: entry({
        id: "approval:appr_1:2",
        kind: "approve",
        approval: { requestHash: "hash-full", available: true, tool: "write_file", policy: "dev-secure@18" },
        source: { messageID: "appr_1", kind: "approve" },
      }),
      approval,
      snapshot: { requestHash: "hash-full", available: true, tool: "write_file", policy: "dev-secure@18" },
    })
    const exact = sections.find((section) => section.title === "Exact request")
    expect(exact).toBeDefined()
    const rows = new Map(exact!.rows)
    expect(rows.get("Request hash")).toBe("hash-full")
    expect(rows.get("Tool")).toBe("write_file")
    expect(rows.get("Policy")).toBe("dev-secure@18")
  })

  test("tool rows show command/inputs/output", () => {
    const sections = buildSpineInspection({
      entry: entry({ receipt: { label: "bash", command: "bun test", status: "ok" } }),
      parts: [
        {
          id: "p1",
          sessionID: "s1",
          messageID: "m1",
          type: "tool",
          callID: "c1",
          tool: "bash",
          state: {
            status: "completed",
            input: { command: "bun test" },
            output: "1 passed",
            title: "bun test",
            metadata: {},
            time: { start: 1, end: 2 },
          },
        },
      ],
    })
    const tool = sections.find((section) => section.title === "Tool call")
    expect(tool).toBeDefined()
    const rows = new Map(tool!.rows)
    expect(rows.get("Command")).toBe("bun test")
    expect(rows.get("Inputs")).toContain("bun test")
    expect(rows.get("Output")).toBe("1 passed")
  })

  test("proof rows expose the proof chain and recovery advice for invalid integrity", () => {
    const sections = buildSpineInspection({
      entry: entry({
        id: "proof-continuation:evt",
        kind: "fail",
        proof: { receipt: "abcd…wxyz", integrity: "INVALID", proofLevel: "P3" },
        source: { messageID: "evt", kind: "governance" },
      }),
      proof: {
        proofHash: "full-hash",
        runRoot: "root",
        derivedAt: "2026-08-02T00:00:00.000Z",
        eventCount: 5,
        lastSequence: 5,
        proofLevel: "P3",
        traceHealth: "DEGRADED",
        integrityStatus: "INVALID",
        lifecycleStatus: "INCOMPLETE",
        completionMethod: undefined,
        assuranceProfile: {
          trace: "RECORDED",
          integrity: "UNVERIFIED",
          verification: "UNVERIFIED",
          reproducibility: "NONE",
        },
        claimsByStatus: {},
        obligationsByStatus: {},
        gaps: ["gap"],
        authorizationProfile: {
          policyVersions: [],
          requests: 0,
          allowed: 0,
          denied: 0,
          approvalsRequired: 0,
          staleDecisions: 0,
          executed: 0,
          executionFailures: 0,
          unauthorizedExecutions: 0,
          capabilityViolations: 0,
          authorizationTraceHealth: "UNAVAILABLE",
          orphanExecutions: 0,
          unmatchedAllows: 0,
          unmatchedRequests: 0,
          intentEnforcementMode: "UNAVAILABLE",
          intentBindingsCreated: 0,
          intentTraceHealth: "UNAVAILABLE",
        },
      } satisfies GovernanceRunProof,
    })
    const proofSection = sections.find((section) => section.title === "Execution receipt / proof chain")
    expect(proofSection).toBeDefined()
    const rows = new Map(proofSection!.rows)
    expect(rows.get("Proof hash")).toBe("full-hash")
    expect(rows.get("Integrity")).toBe("INVALID")
    const error = sections.find((section) => section.title === "Error")
    expect(error!.body).toContain("Recovery: proof integrity is invalid")
  })

  test("conversation rows show the source message", () => {
    const sections = buildSpineInspection({
      entry: entry({
        kind: "ask",
        source: { messageID: "m1", kind: "message" },
        body: "fix the authz bug",
      }),
      message: {
        id: "m1",
        sessionID: "s1",
        role: "user",
        time: { created: 1 },
        agent: "codex",
        model: { providerID: "p", modelID: "m" },
      },
    })
    const message = sections.find((section) => section.title === "Source message")
    expect(message).toBeDefined()
    expect(message!.body).toContain("fix the authz bug")
  })

  test("errors surface event id + recovery advice", () => {
    const sections = buildSpineInspection({
      entry: entry({ kind: "fail", summary: "denied by policy", body: "scope mismatch" }),
    })
    const error = sections.find((section) => section.title === "Error")
    expect(error).toBeDefined()
    const rows = new Map(error!.rows)
    expect(rows.get("Event ID")).toBe("e1")
    expect(error!.body).toContain("Recovery:")
  })
})
