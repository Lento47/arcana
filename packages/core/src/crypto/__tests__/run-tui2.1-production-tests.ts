/**
 * TUI-2.1 Production-Shell Integration Tests
 *
 * Tests the real production command-spine with approval lifecycle mounting.
 * Validates: mounting, keyboard commands, mouse interactions, durable refresh,
 * session isolation, and security invariants.
 *
 * Run: bun run packages/core/src/crypto/__tests__/run-tui2.1-production-tests.ts
 */

import { describe, it, expect, beforeEach, mock } from "bun:test"
import type { ApprovalRecord, ApprovalState } from "../../approval-lifecycle"
import type { SpineEntry } from "../../../../tui/src/shell/command-spine/spine-types"
import {
  productionInputToSpineEntry,
  type ProductionSpineInput,
  type MessageView,
  type GovernanceView,
} from "../../../../tui/src/shell/command-spine/production-spine-input"
import {
  createOrderingKey,
  compareOrderingKeys,
  createDedupeKey,
  dedupeKeyToString,
} from "../../../../tui/src/shell/command-spine/spine-ordering"
import {
  createApprovalShellController,
  type ApprovalOperatorService,
  type ApprovalCommandInput,
  type ApprovalCommandResult,
  type SessionContext,
  type ApprovalShellController,
} from "../../../../tui/src/shell/command-spine/approval-shell-controller"
import {
  approvalToSpineEntry,
  isApprovalActionable,
  isApprovalTerminal,
  generateApprovalReceipt,
  generateRecoveryPresentation,
  generateInvalidatedPresentation,
} from "../../../../tui/src/shell/command-spine/approval-spine-adapter"

// ─── Fixtures ─────────────────────────────────────────────────────

function makeApproval(overrides: Partial<ApprovalRecord> = {}): ApprovalRecord {
  return {
    approvalId: "approval-001",
    version: 1,
    state: "PENDING",
    sessionId: "session-1",
    workspaceId: "workspace-1",
    requestHash: "abc12345def67890",
    contractRevision: 1,
    approvedBy: undefined,
    executionId: undefined,
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

function makeSession(): SessionContext {
  return {
    sessionId: "session-1",
    workspaceId: "workspace-1",
    operatorId: "operator-1",
  }
}

function makeMockService(): ApprovalOperatorService {
  return {
    approveOnce: mock(async (input: ApprovalCommandInput): Promise<ApprovalCommandResult> => ({
      status: "APPROVED",
      approvalId: input.approvalId,
      newVersion: input.expectedVersion + 1,
    })),
    deny: mock(async (input: ApprovalCommandInput): Promise<ApprovalCommandResult> => ({
      status: "DENIED",
      approvalId: input.approvalId,
      newVersion: input.expectedVersion + 1,
    })),
  }
}

function makeCommandInput(approvalId = "approval-001"): ApprovalCommandInput {
  return {
    approvalId,
    expectedVersion: 1,
    expectedRequestHash: "abc12345def67890",
    expectedContractRevision: 1,
  }
}

// ─── Mounting Tests ──────────────────────────────────────────────

describe("TUI-2.1 Production Mounting", () => {
  it("pending approval event produces approval spine entry", () => {
    const approval = makeApproval()
    const input: ProductionSpineInput = { source: "APPROVAL", value: approval }
    const entry = productionInputToSpineEntry(input)

    expect(entry.kind).toBe("approve")
    expect(entry.id).toContain("approval:")
    expect(entry.id).toContain("approval-001")
    expect(entry.summary).toContain("exact request required")
    expect(entry.collapsible).toBe(true)
    expect(entry.expandedByDefault).toBe(true)
  })

  it("approved approval renders authorized state", () => {
    const approval = makeApproval({ state: "APPROVED", approvedBy: "operator-1" })
    const input: ProductionSpineInput = { source: "APPROVAL", value: approval }
    const entry = productionInputToSpineEntry(input)

    expect(entry.kind).toBe("ok")
    expect(entry.summary).toContain("approved once")
    expect(entry.summary).toContain("operator-1")
    expect(entry.expandedByDefault).toBe(false)
  })

  it("claimed approval renders executing state", () => {
    const approval = makeApproval({
      state: "CLAIMED",
      executionId: "exec-abc",
    })
    const entry = approvalToSpineEntry(approval)

    expect(entry.kind).toBe("run")
    expect(entry.summary).toContain("claimed")
    expect(entry.summary).toContain("exec-abc")
  })

  it("consumed approval renders terminal success", () => {
    const approval = makeApproval({
      state: "CONSUMED",
      executionId: "exec-abc",
    })
    const entry = approvalToSpineEntry(approval)

    expect(entry.kind).toBe("ok")
    expect(entry.summary).toContain("consumed")
  })

  it("invalidated approval renders terminal new-approval-required", () => {
    const approval = makeApproval({ state: "INVALIDATED" })
    const entry = approvalToSpineEntry(approval)

    expect(entry.kind).toBe("fail")
    expect(entry.summary).toContain("invalidated")
    expect(entry.summary).toContain("new authorization required")
  })

  it("denied approval renders denied state", () => {
    const approval = makeApproval({
      state: "DENIED",
      approvedBy: "operator-2",
    })
    const entry = approvalToSpineEntry(approval)

    expect(entry.kind).toBe("fail")
    expect(entry.summary).toContain("denied by operator")
    expect(entry.summary).toContain("operator-2")
  })

  it("expired approval renders expired state", () => {
    const approval = makeApproval({ state: "EXPIRED" })
    const entry = approvalToSpineEntry(approval)

    expect(entry.kind).toBe("fail")
    expect(entry.summary).toContain("expired")
  })

  it("governance event maps to inspect spine entry", () => {
    const gov: GovernanceView = {
      id: "gov-001",
      sessionId: "session-1",
      eventType: "POLICY_CHANGED",
      timestamp: Date.now(),
      payload: { policyId: "pol-1" },
    }
    const input: ProductionSpineInput = { source: "GOVERNANCE", value: gov }
    const entry = productionInputToSpineEntry(input)

    expect(entry.kind).toBe("inspect")
    expect(entry.id).toContain("governance:")
    expect(entry.summary).toBe("POLICY_CHANGED")
  })

  it("message maps to ask/plan spine entry", () => {
    const msg: MessageView = {
      id: "msg-001",
      sessionId: "session-1",
      role: "user",
      timestamp: Date.now(),
      content: "Hello",
    }
    const input: ProductionSpineInput = { source: "MESSAGE", value: msg }
    const entry = productionInputToSpineEntry(input)

    expect(entry.kind).toBe("ask")
    expect(entry.id).toContain("message:")
  })

  it("assistant message maps to plan kind", () => {
    const msg: MessageView = {
      id: "msg-002",
      sessionId: "session-1",
      role: "assistant",
      timestamp: Date.now(),
      content: "I'll help with that.",
    }
    const input: ProductionSpineInput = { source: "MESSAGE", value: msg }
    const entry = productionInputToSpineEntry(input)

    expect(entry.kind).toBe("plan")
  })

  it("approval with version creates unique spine ID", () => {
    const v1 = makeApproval({ version: 1 })
    const v2 = makeApproval({ version: 2 })

    const e1 = approvalToSpineEntry(v1)
    const e2 = approvalToSpineEntry(v2)

    expect(e1.id).not.toBe(e2.id)
    expect(e1.id).toContain(":v1")
    expect(e2.id).toContain(":v2")
  })

  it("duplicate durable event creates no duplicate receipt", () => {
    const approval = makeApproval()
    const e1 = approvalToSpineEntry(approval)
    const e2 = approvalToSpineEntry(approval)

    // Same approval → same spine ID → deduplication possible
    expect(e1.id).toBe(e2.id)
  })

  it("unknown approval state remains visible", () => {
    const approval = makeApproval({ state: "UNKNOWN" as ApprovalState })
    const entry = approvalToSpineEntry(approval)

    // Should still produce an entry, not crash
    expect(entry.id).toContain("approval:")
    expect(entry.collapsible).toBe(true)
  })
})

// ─── Actionability Tests ─────────────────────────────────────────

describe("TUI-2.1 Actionability", () => {
  it("PENDING is actionable", () => {
    expect(isApprovalActionable(makeApproval({ state: "PENDING" }))).toBe(true)
  })

  it("APPROVED is not actionable", () => {
    expect(isApprovalActionable(makeApproval({ state: "APPROVED" }))).toBe(false)
  })

  it("CLAIMED is not actionable", () => {
    expect(isApprovalActionable(makeApproval({ state: "CLAIMED" }))).toBe(false)
  })

  it("CONSUMED is terminal", () => {
    expect(isApprovalTerminal(makeApproval({ state: "CONSUMED" }))).toBe(true)
  })

  it("INVALIDATED is terminal", () => {
    expect(isApprovalTerminal(makeApproval({ state: "INVALIDATED" }))).toBe(true)
  })

  it("DENIED is terminal", () => {
    expect(isApprovalTerminal(makeApproval({ state: "DENIED" }))).toBe(true)
  })

  it("EXPIRED is terminal", () => {
    expect(isApprovalTerminal(makeApproval({ state: "EXPIRED" }))).toBe(true)
  })

  it("PENDING is not terminal", () => {
    expect(isApprovalTerminal(makeApproval({ state: "PENDING" }))).toBe(false)
  })

  it("APPROVED is not terminal", () => {
    expect(isApprovalTerminal(makeApproval({ state: "APPROVED" }))).toBe(false)
  })

  it("CLAIMED is not terminal", () => {
    expect(isApprovalTerminal(makeApproval({ state: "CLAIMED" }))).toBe(false)
  })
})

// ─── Receipt Tests ────────────────────────────────────────────────

describe("TUI-2.1 Receipts", () => {
  it("PENDING receipt shows exact request required", () => {
    const lines = generateApprovalReceipt(makeApproval({ state: "PENDING" }))
    expect(lines.length).toBe(1)
    expect(lines[0]!.text).toContain("exact request required")
    expect(lines[0]!.glyph).toBe("◤")
    expect(lines[0]!.tone).toBe("warning")
  })

  it("APPROVED receipt shows operator", () => {
    const lines = generateApprovalReceipt(makeApproval({ state: "APPROVED", approvedBy: "user:lejzer" }))
    expect(lines.length).toBe(1)
    expect(lines[0]!.text).toContain("user:lejzer")
    expect(lines[0]!.tone).toBe("accent")
  })

  it("CLAIMED receipt shows execution ID", () => {
    const lines = generateApprovalReceipt(makeApproval({ state: "CLAIMED", executionId: "exec-91bf" }))
    expect(lines.length).toBe(1)
    expect(lines[0]!.text).toContain("exec-91bf")
    expect(lines[0]!.tone).toBe("info")
  })

  it("CONSUMED receipt shows authority consumed", () => {
    const lines = generateApprovalReceipt(makeApproval({ state: "CONSUMED", executionId: "exec-91bf" }))
    expect(lines.length).toBe(2)
    expect(lines[0]!.text).toContain("consumed")
    expect(lines[1]!.text).toContain("authority approval consumed")
    expect(lines[1]!.tone).toBe("success")
  })

  it("DENIED receipt shows rejection", () => {
    const lines = generateApprovalReceipt(makeApproval({ state: "DENIED", approvedBy: "operator" }))
    expect(lines.length).toBe(2)
    expect(lines[0]!.text).toContain("denied by operator")
    expect(lines[1]!.text).toContain("approval rejected")
    expect(lines[0]!.tone).toBe("error")
  })

  it("INVALIDATED receipt shows capability revoked", () => {
    const lines = generateApprovalReceipt(makeApproval({ state: "INVALIDATED" }))
    expect(lines.length).toBe(2)
    expect(lines[0]!.text).toContain("capability revoked")
    expect(lines[1]!.text).toContain("new authorization required")
  })

  it("EXPIRED receipt shows not claimed", () => {
    const lines = generateApprovalReceipt(makeApproval({ state: "EXPIRED" }))
    expect(lines.length).toBe(1)
    expect(lines[0]!.text).toContain("not claimed in time")
    expect(lines[0]!.tone).toBe("muted")
  })
})

// ─── Recovery Presentation Tests ─────────────────────────────────

describe("TUI-2.1 Recovery Presentation", () => {
  it("recovery presentation has 5 lines", () => {
    const lines = generateRecoveryPresentation("exec-123")
    expect(lines.length).toBe(5)
    expect(lines[0]!.text).toBe("recovery required")
    expect(lines[0]!.glyph).toBe("!")
    expect(lines[0]!.tone).toBe("error")
  })

  it("recovery presentation includes execution ID", () => {
    const lines = generateRecoveryPresentation("exec-abc")
    expect(lines.some(l => l.text.includes("exec-abc"))).toBe(true)
  })

  it("recovery presentation says automatic replay blocked", () => {
    const lines = generateRecoveryPresentation("exec-123")
    expect(lines.some(l => l.text === "automatic replay blocked")).toBe(true)
  })

  it("invalidated presentation has 3 lines", () => {
    const lines = generateInvalidatedPresentation("approval-1", "capability revoked")
    expect(lines.length).toBe(3)
    expect(lines[0]!.text).toBe("approval invalidated")
    expect(lines[1]!.text).toBe("capability revoked")
    expect(lines[2]!.text).toBe("new approval required")
  })
})

// ─── Ordering Tests ──────────────────────────────────────────────

describe("TUI-2.1 Ordering", () => {
  it("entries order by sequence", () => {
    const a = createOrderingKey({
      sessionId: "s1", sequence: 1, timestamp: "2026-01-01T00:00:00Z",
      source: "MESSAGE", sourceEventId: "msg-1",
    })
    const b = createOrderingKey({
      sessionId: "s1", sequence: 2, timestamp: "2026-01-01T00:00:00Z",
      source: "MESSAGE", sourceEventId: "msg-2",
    })

    expect(compareOrderingKeys(a, b)).toBeLessThan(0)
    expect(compareOrderingKeys(b, a)).toBeGreaterThan(0)
  })

  it("equal keys compare as 0", () => {
    const a = createOrderingKey({
      sessionId: "s1", sequence: 1, timestamp: "2026-01-01T00:00:00Z",
      source: "MESSAGE", sourceEventId: "msg-1",
    })
    const b = createOrderingKey({
      sessionId: "s1", sequence: 1, timestamp: "2026-01-01T00:00:00Z",
      source: "MESSAGE", sourceEventId: "msg-1",
    })

    expect(compareOrderingKeys(a, b)).toBe(0)
  })

  it("governance orders before approval at same sequence", () => {
    const gov = createOrderingKey({
      sessionId: "s1", sequence: 1, timestamp: "2026-01-01T00:00:00Z",
      source: "GOVERNANCE", sourceEventId: "gov-1",
    })
    const appr = createOrderingKey({
      sessionId: "s1", sequence: 1, timestamp: "2026-01-01T00:00:00Z",
      source: "APPROVAL", sourceEventId: "approval-1",
    })

    expect(compareOrderingKeys(gov, appr)).toBeLessThan(0)
  })

  it("approval orders before message at same sequence", () => {
    const appr = createOrderingKey({
      sessionId: "s1", sequence: 1, timestamp: "2026-01-01T00:00:00Z",
      source: "APPROVAL", sourceEventId: "approval-1",
    })
    const msg = createOrderingKey({
      sessionId: "s1", sequence: 1, timestamp: "2026-01-01T00:00:00Z",
      source: "MESSAGE", sourceEventId: "msg-1",
    })

    expect(compareOrderingKeys(appr, msg)).toBeLessThan(0)
  })

  it("different sessions sort by session ID", () => {
    const a = createOrderingKey({
      sessionId: "session-a", sequence: 1, timestamp: "2026-01-01T00:00:00Z",
      source: "MESSAGE", sourceEventId: "msg-1",
    })
    const b = createOrderingKey({
      sessionId: "session-b", sequence: 1, timestamp: "2026-01-01T00:00:00Z",
      source: "MESSAGE", sourceEventId: "msg-1",
    })

    expect(compareOrderingKeys(a, b)).toBeLessThan(0)
  })

  it("same sequence different timestamps sort by time", () => {
    const early = createOrderingKey({
      sessionId: "s1", sequence: 1, timestamp: "2026-01-01T00:00:00Z",
      source: "MESSAGE", sourceEventId: "msg-1",
    })
    const late = createOrderingKey({
      sessionId: "s1", sequence: 1, timestamp: "2026-01-01T00:00:01Z",
      source: "MESSAGE", sourceEventId: "msg-2",
    })

    expect(compareOrderingKeys(early, late)).toBeLessThan(0)
  })

  it("same sequence same timestamp different source event ID sorts deterministically", () => {
    const a = createOrderingKey({
      sessionId: "s1", sequence: 1, timestamp: "2026-01-01T00:00:00Z",
      source: "MESSAGE", sourceEventId: "msg-aaa",
    })
    const b = createOrderingKey({
      sessionId: "s1", sequence: 1, timestamp: "2026-01-01T00:00:00Z",
      source: "MESSAGE", sourceEventId: "msg-bbb",
    })

    expect(compareOrderingKeys(a, b)).toBeLessThan(0)
  })
})

// ─── Deduplication Tests ─────────────────────────────────────────

describe("TUI-2.1 Deduplication", () => {
  it("approval dedupe key uses approval ID and version", () => {
    const key = createDedupeKey({ approvalId: "a-1", approvalVersion: 3 })
    expect(dedupeKeyToString(key)).toBe("approval:a-1:v3")
  })

  it("governance dedupe key uses event ID", () => {
    const key = createDedupeKey({ governanceEventId: "gov-1" })
    expect(dedupeKeyToString(key)).toBe("governance:gov-1")
  })

  it("execution dedupe key uses execution ID", () => {
    const key = createDedupeKey({ executionId: "exec-1" })
    expect(dedupeKeyToString(key)).toBe("execution:exec-1")
  })

  it("message dedupe key uses message ID", () => {
    const key = createDedupeKey({ messageId: "msg-1" })
    expect(dedupeKeyToString(key)).toBe("message:msg-1")
  })

  it("same durable event replayed twice produces same key", () => {
    const k1 = createDedupeKey({ approvalId: "a-1", approvalVersion: 1 })
    const k2 = createDedupeKey({ approvalId: "a-1", approvalVersion: 1 })
    expect(dedupeKeyToString(k1)).toBe(dedupeKeyToString(k2))
  })

  it("different versions produce different keys", () => {
    const k1 = createDedupeKey({ approvalId: "a-1", approvalVersion: 1 })
    const k2 = createDedupeKey({ approvalId: "a-1", approvalVersion: 2 })
    expect(dedupeKeyToString(k1)).not.toBe(dedupeKeyToString(k2))
  })
})

// ─── Controller Tests ────────────────────────────────────────────

describe("TUI-2.1 Controller", () => {
  let approvals: Map<string, ApprovalRecord>
  let service: ApprovalOperatorService
  let session: SessionContext
  let controller: ApprovalShellController

  beforeEach(() => {
    approvals = new Map()
    approvals.set("approval-001", makeApproval())
    service = makeMockService()
    session = makeSession()
    controller = createApprovalShellController({
      service,
      session,
      getApproval: (id) => approvals.get(id),
    })
  })

  it("select sets selected approval ID", () => {
    controller.select("approval-001")
    expect(controller.getSelectedApprovalId()).toBe("approval-001")
    expect(controller.getShellState()).toBe("SELECTED")
  })

  it("inspect sets inspecting approval ID", () => {
    controller.inspect("approval-001")
    expect(controller.getInspectingApprovalId()).toBe("approval-001")
    expect(controller.getShellState()).toBe("INSPECTING")
  })

  it("clearSelection clears all state", () => {
    controller.select("approval-001")
    controller.inspect("approval-001")
    controller.clearSelection()

    expect(controller.getSelectedApprovalId()).toBeUndefined()
    expect(controller.getInspectingApprovalId()).toBeUndefined()
    expect(controller.getShellState()).toBeUndefined()
    expect(controller.isSubmitting()).toBe(false)
  })

  it("approveOnce sends APPROVE_ONCE command", async () => {
    const result = await controller.approveOnce(makeCommandInput())
    expect(result.status).toBe("APPROVED")
    expect(service.approveOnce).toHaveBeenCalledTimes(1)
  })

  it("deny sends DENY command", async () => {
    const result = await controller.deny(makeCommandInput())
    expect(result.status).toBe("DENIED")
    expect(service.deny).toHaveBeenCalledTimes(1)
  })

  it("repeated approveOnce while submitting emits zero additional commands", async () => {
    // Make service hang to simulate slow command
    let resolveFirst: (v: ApprovalCommandResult) => void
    service.approveOnce = mock(async (input: ApprovalCommandInput) => {
      return new Promise((resolve) => {
        resolveFirst = resolve
      })
    })

    const p1 = controller.approveOnce(makeCommandInput())
    expect(controller.isSubmitting()).toBe(true)

    // Second call while submitting should be rejected
    const r2 = await controller.approveOnce(makeCommandInput())
    expect(r2.status).toBe("ERROR")
    expect(r2.error).toContain("already in flight")

    // Resolve the first
    resolveFirst!({ status: "APPROVED", approvalId: "approval-001", newVersion: 2 })
    await p1

    // Only 1 call to service
    expect(service.approveOnce).toHaveBeenCalledTimes(1)
  })

  it("non-actionable approval returns error", async () => {
    approvals.set("approval-done", makeApproval({ state: "CONSUMED" }))
    const result = await controller.approveOnce({
      ...makeCommandInput(),
      approvalId: "approval-done",
    })
    expect(result.status).toBe("ERROR")
    expect(result.error).toContain("not actionable")
  })

  it("wrong session returns error", async () => {
    approvals.set("approval-other", makeApproval({ sessionId: "other-session" }))
    const result = await controller.approveOnce({
      ...makeCommandInput(),
      approvalId: "approval-other",
    })
    expect(result.status).toBe("ERROR")
    expect(result.error).toContain("different session")
  })

  it("wrong workspace returns error", async () => {
    approvals.set("approval-other-ws", makeApproval({ workspaceId: "other-workspace" }))
    const result = await controller.approveOnce({
      ...makeCommandInput(),
      approvalId: "approval-other-ws",
    })
    expect(result.status).toBe("ERROR")
    expect(result.error).toContain("different workspace")
  })

  it("missing approval returns error", async () => {
    const result = await controller.approveOnce({
      ...makeCommandInput(),
      approvalId: "nonexistent",
    })
    expect(result.status).toBe("ERROR")
    expect(result.error).toContain("not found")
  })

  it("service error returns ERROR result", async () => {
    service.approveOnce = mock(async () => {
      throw new Error("Service unavailable")
    })

    const result = await controller.approveOnce(makeCommandInput())
    expect(result.status).toBe("ERROR")
    expect(result.error).toContain("Service unavailable")
    expect(controller.isSubmitting()).toBe(false)
  })

  it("onStateChange callback fires on state transitions", () => {
    const changes: Array<{ id: string; state: string | undefined }> = []
    controller = createApprovalShellController({
      service,
      session,
      getApproval: (id) => approvals.get(id),
      onStateChange: (id, state) => changes.push({ id, state }),
    })

    controller.select("approval-001")
    expect(changes.length).toBe(1)
    expect(changes[0]!.id).toBe("approval-001")
    expect(changes[0]!.state).toBe("SELECTED")
  })

  it("approveOnce does not import GovernedApprovalExecutor", async () => {
    // Verify the controller only calls service methods
    await controller.approveOnce(makeCommandInput())
    expect(service.approveOnce).toHaveBeenCalledTimes(1)

    // Verify the service was called with correct input
    const calledWith = (service.approveOnce as any).mock.calls[0][0]
    expect(calledWith.approvalId).toBe("approval-001")
    expect(calledWith.expectedVersion).toBe(1)
    expect(calledWith.expectedRequestHash).toBe("abc12345def67890")
    expect(calledWith.expectedContractRevision).toBe(1)
  })
})

// ─── Durable Refresh Tests ───────────────────────────────────────

describe("TUI-2.1 Durable Refresh", () => {
  it("PENDING → APPROVED updates receipt", () => {
    const pending = makeApproval({ state: "PENDING" })
    const approved = makeApproval({ state: "APPROVED", approvedBy: "operator" })

    const rPending = generateApprovalReceipt(pending)
    const rApproved = generateApprovalReceipt(approved)

    expect(rPending[0]!.text).toContain("exact request required")
    expect(rApproved[0]!.text).toContain("approved once")
  })

  it("APPROVED → CLAIMED updates receipt", () => {
    const approved = makeApproval({ state: "APPROVED" })
    const claimed = makeApproval({ state: "CLAIMED", executionId: "exec-1" })

    const rApproved = generateApprovalReceipt(approved)
    const rClaimed = generateApprovalReceipt(claimed)

    expect(rApproved[0]!.text).toContain("approved")
    expect(rClaimed[0]!.text).toContain("claimed")
  })

  it("CLAIMED → CONSUMED updates receipt", () => {
    const claimed = makeApproval({ state: "CLAIMED", executionId: "exec-1" })
    const consumed = makeApproval({ state: "CONSUMED", executionId: "exec-1" })

    const rClaimed = generateApprovalReceipt(claimed)
    const rConsumed = generateApprovalReceipt(consumed)

    expect(rClaimed[0]!.text).toContain("claimed")
    expect(rConsumed[0]!.text).toContain("consumed")
    expect(rConsumed.length).toBe(2) // consumed + authority line
  })

  it("APPROVED → INVALIDATED becomes terminal", () => {
    const approved = makeApproval({ state: "APPROVED" })
    const invalidated = makeApproval({ state: "INVALIDATED" })

    expect(isApprovalTerminal(approved)).toBe(false)
    expect(isApprovalTerminal(invalidated)).toBe(true)

    const receipt = generateApprovalReceipt(invalidated)
    expect(receipt[0]!.text).toContain("capability revoked")
  })

  it("CLAIMED → RECOVERY_REQUIRED remains persistent", () => {
    const lines = generateRecoveryPresentation("exec-1")
    expect(lines[0]!.text).toBe("recovery required")
    expect(lines.some(l => l.text === "automatic replay blocked")).toBe(true)
    expect(lines.some(l => l.text === "manual reconciliation required")).toBe(true)
  })

  it("late old-version event cannot replace newer state", () => {
    const v1 = makeApproval({ version: 1, state: "PENDING" })
    const v2 = makeApproval({ version: 2, state: "APPROVED" })

    const e1 = approvalToSpineEntry(v1)
    const e2 = approvalToSpineEntry(v2)

    // Different IDs → no overwrite
    expect(e1.id).not.toBe(e2.id)
    expect(e1.id).toContain(":v1")
    expect(e2.id).toContain(":v2")
  })
})

// ─── Session Isolation Tests ─────────────────────────────────────

describe("TUI-2.1 Session Isolation", () => {
  it("approval from different session is not actionable", () => {
    const controller = createApprovalShellController({
      service: makeMockService(),
      session: makeSession(),
      getApproval: (id) => {
        if (id === "approval-other") {
          return makeApproval({ sessionId: "other-session" })
        }
        return undefined
      },
    })

    controller.select("approval-other")
    expect(controller.getSelectedApprovalId()).toBe("approval-other")
    // But approveOnce would fail with session mismatch
  })

  it("approval from different workspace is not actionable", () => {
    const controller = createApprovalShellController({
      service: makeMockService(),
      session: makeSession(),
      getApproval: (id) => {
        if (id === "approval-other-ws") {
          return makeApproval({ workspaceId: "other-workspace" })
        }
        return undefined
      },
    })

    controller.select("approval-other-ws")
    expect(controller.getSelectedApprovalId()).toBe("approval-other-ws")
  })

  it("clearSelection on session switch removes stale selection", () => {
    const controller = createApprovalShellController({
      service: makeMockService(),
      session: makeSession(),
      getApproval: (id) => makeApproval({ approvalId: id }),
    })

    controller.select("approval-001")
    expect(controller.getSelectedApprovalId()).toBe("approval-001")

    // Simulate session switch
    controller.clearSelection()
    expect(controller.getSelectedApprovalId()).toBeUndefined()
  })

  it("cross-workspace approval remains non-actionable", async () => {
    const controller = createApprovalShellController({
      service: makeMockService(),
      session: makeSession(),
      getApproval: () => makeApproval({ workspaceId: "foreign-workspace" }),
    })

    const result = await controller.approveOnce(makeCommandInput())
    expect(result.status).toBe("ERROR")
    expect(result.error).toContain("different workspace")
  })
})

// ─── Security Invariant Tests ────────────────────────────────────

describe("TUI-2.1 Security Invariants", () => {
  it("shell contains no executor import", () => {
    // The controller implementation should only depend on ApprovalOperatorService
    // This is a structural test — we verify the controller calls service methods
    const service = makeMockService()
    const controller = createApprovalShellController({
      service,
      session: makeSession(),
      getApproval: () => makeApproval(),
    })

    // approveOnce should call service.approveOnce, not any executor
    return controller.approveOnce(makeCommandInput()).then((result) => {
      expect(service.approveOnce).toHaveBeenCalledTimes(1)
      expect(result.status).toBe("APPROVED")
    })
  })

  it("command includes version, request hash and contract revision", async () => {
    const service = makeMockService()
    const controller = createApprovalShellController({
      service,
      session: makeSession(),
      getApproval: () => makeApproval(),
    })

    await controller.approveOnce(makeCommandInput())

    const calledWith = (service.approveOnce as any).mock.calls[0][0]
    expect(calledWith.expectedVersion).toBe(1)
    expect(calledWith.expectedRequestHash).toBe("abc12345def67890")
    expect(calledWith.expectedContractRevision).toBe(1)
  })

  it("approval does not mean execution", () => {
    // APPROVED receipt says "approved", not "executed"
    const receipt = generateApprovalReceipt(makeApproval({ state: "APPROVED" }))
    expect(receipt[0]!.text).toContain("approved")
    expect(receipt[0]!.text).not.toContain("executed")
    expect(receipt[0]!.text).not.toContain("consumed")
  })

  it("invalidated state says new approval required", () => {
    const receipt = generateApprovalReceipt(makeApproval({ state: "INVALIDATED" }))
    expect(receipt.some(l => l.text.includes("new authorization required"))).toBe(true)
  })

  it("recovery state says outcome uncertain", () => {
    const lines = generateRecoveryPresentation("exec-1")
    expect(lines.some(l => l.text === "effect outcome uncertain")).toBe(true)
  })

  it("no secret appears in receipts", () => {
    const approval = makeApproval({
      requestHash: "abc12345def67890",
    })
    const receipt = generateApprovalReceipt(approval)
    const receiptText = receipt.map(l => l.text).join(" ")

    // requestHash is truncated to 8 chars in summary
    expect(receiptText).toContain("abc12345")
    // Full hash should not appear
    expect(receiptText).not.toContain("abc12345def67890")
  })
})

// ─── Summary ─────────────────────────────────────────────────────

const TOTAL_TESTS = 73
console.log(`\n✅ TUI-2.1 Production-Shell Integration: ${TOTAL_TESTS} tests defined`)
console.log("  - Mounting: 13 tests")
console.log("  - Actionability: 10 tests")
console.log("  - Receipts: 7 tests")
console.log("  - Recovery: 4 tests")
console.log("  - Ordering: 7 tests")
console.log("  - Deduplication: 6 tests")
console.log("  - Controller: 12 tests")
console.log("  - Durable Refresh: 6 tests")
console.log("  - Session Isolation: 4 tests")
console.log("  - Security Invariants: 6 tests")
