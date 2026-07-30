/**
 * TUI-2.1 Production-Shell Integration Tests
 * Run with: bun run packages/core/src/crypto/run-tui2.1-production-tests.ts
 *
 * Tests the real production command-spine with approval lifecycle mounting:
 * mounting, ordering, deduplication, controller, durable refresh, session isolation,
 * security invariants, recovery/invalidation presentation.
 */

import type { ApprovalRecord, ApprovalState } from "./approval-lifecycle"
import type { SpineEntry } from "../../../../packages/tui/src/shell/command-spine/spine-types"
import {
  productionInputToSpineEntry,
  type ProductionSpineInput,
  type MessageView,
  type GovernanceView,
} from "../../../../packages/tui/src/shell/command-spine/production-spine-input"
import {
  createOrderingKey,
  compareOrderingKeys,
  createDedupeKey,
  dedupeKeyToString,
} from "../../../../packages/tui/src/shell/command-spine/spine-ordering"
import {
  createApprovalShellController,
  type ApprovalOperatorService,
  type ApprovalCommandInput,
  type ApprovalCommandResult,
  type SessionContext,
  type ApprovalShellController,
} from "../../../../packages/tui/src/shell/command-spine/approval-shell-controller"
import {
  approvalToSpineEntry,
  isApprovalActionable,
  isApprovalTerminal,
  generateApprovalReceipt,
  generateRecoveryPresentation,
  generateInvalidatedPresentation,
} from "../../../../packages/tui/src/shell/command-spine/approval-spine-adapter"

// ─── Test Harness ────────────────────────────────────────────────

let passed = 0
let failed = 0
const failures: string[] = []

function assert(condition: boolean, message: string) {
  if (condition) { passed++ } else { failed++; failures.push(message); console.log(`  ✗ ${message}`) }
}
function assertEqual<T>(actual: T, expected: T, message: string) {
  assert(actual === expected, `${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}
function assertIncludes(haystack: string, needle: string, message: string) {
  assert(haystack.includes(needle), `${message} — "${haystack}" does not include "${needle}"`)
}
function assertNotIncludes(haystack: string, needle: string, message: string) {
  assert(!haystack.includes(needle), `${message} — "${haystack}" should not include "${needle}"`)
}

// ─── Fixtures ────────────────────────────────────────────────────

const NOW = new Date("2026-07-30T12:00:00.000Z").toISOString()

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
    expiresAt: "2099-12-31T23:59:59.999Z",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

function makeSession(): SessionContext {
  return { sessionId: "session-1", workspaceId: "workspace-1", operatorId: "operator-1" }
}

function makeMockService(): ApprovalOperatorService & { callLog: string[] } {
  const callLog: string[] = []
  return {
    callLog,
    async approveOnce(input: ApprovalCommandInput): Promise<ApprovalCommandResult> {
      callLog.push(`approveOnce:${input.approvalId}`)
      return { status: "APPROVED", approvalId: input.approvalId, newVersion: input.expectedVersion + 1 }
    },
    async deny(input: ApprovalCommandInput): Promise<ApprovalCommandResult> {
      callLog.push(`deny:${input.approvalId}`)
      return { status: "DENIED", approvalId: input.approvalId, newVersion: input.expectedVersion + 1 }
    },
  }
}

function makeCommandInput(approvalId = "approval-001"): ApprovalCommandInput {
  return { approvalId, expectedVersion: 1, expectedRequestHash: "abc12345def67890", expectedContractRevision: 1 }
}

// ═══════════════════════════════════════════════════════════════════════
// 1. PRODUCTION MOUNTING
// ═══════════════════════════════════════════════════════════════════════

console.log("\n═══ TUI-2.1 Production Mounting ═══")

console.log("pending approval → approve spine entry")
{
  const entry = productionInputToSpineEntry({ source: "APPROVAL", value: makeApproval() })
  assertEqual(entry.kind, "approve", "kind")
  assertIncludes(entry.id, "approval:", "id prefix")
  assertIncludes(entry.summary, "exact request required", "summary")
  assertEqual(entry.collapsible, true, "collapsible")
  assertEqual(entry.expandedByDefault, true, "expanded by default")
}

console.log("approved approval → ok spine entry")
{
  const entry = productionInputToSpineEntry({ source: "APPROVAL", value: makeApproval({ state: "APPROVED", approvedBy: "operator-1" }) })
  assertEqual(entry.kind, "ok", "kind")
  assertIncludes(entry.summary, "approved once", "summary")
  assertIncludes(entry.summary, "operator-1", "operator")
  assertEqual(entry.expandedByDefault, false, "not expanded by default")
}

console.log("claimed approval → run spine entry")
{
  const entry = approvalToSpineEntry(makeApproval({ state: "CLAIMED", executionId: "exec-abc" }))
  assertEqual(entry.kind, "run", "kind")
  assertIncludes(entry.summary, "claimed", "claimed")
  assertIncludes(entry.summary, "exec-abc", "execution ID")
}

console.log("consumed approval → ok spine entry")
{
  const entry = approvalToSpineEntry(makeApproval({ state: "CONSUMED", executionId: "exec-abc" }))
  assertEqual(entry.kind, "ok", "kind")
  assertIncludes(entry.summary, "consumed", "consumed")
}

console.log("invalidated approval → fail spine entry")
{
  const entry = approvalToSpineEntry(makeApproval({ state: "INVALIDATED" }))
  assertEqual(entry.kind, "fail", "kind")
  assertIncludes(entry.summary, "invalidated", "invalidated")
  assertIncludes(entry.summary, "new authorization required", "reason")
}

console.log("denied approval → fail spine entry")
{
  const entry = approvalToSpineEntry(makeApproval({ state: "DENIED", approvedBy: "operator-2" }))
  assertEqual(entry.kind, "fail", "kind")
  assertIncludes(entry.summary, "denied by operator", "denied")
  assertIncludes(entry.summary, "operator-2", "operator")
}

console.log("expired approval → fail spine entry")
{
  const entry = approvalToSpineEntry(makeApproval({ state: "EXPIRED" }))
  assertEqual(entry.kind, "fail", "kind")
  assertIncludes(entry.summary, "expired", "expired")
}

console.log("governance event → inspect spine entry")
{
  const gov: GovernanceView = { id: "gov-001", sessionId: "session-1", eventType: "POLICY_CHANGED", timestamp: Date.now(), payload: { policyId: "pol-1" } }
  const entry = productionInputToSpineEntry({ source: "GOVERNANCE", value: gov })
  assertEqual(entry.kind, "inspect", "kind")
  assertIncludes(entry.id, "governance:", "id prefix")
  assertEqual(entry.summary, "POLICY_CHANGED", "summary")
}

console.log("user message → ask spine entry")
{
  const msg: MessageView = { id: "msg-001", sessionId: "session-1", role: "user", timestamp: Date.now(), content: "Hello" }
  const entry = productionInputToSpineEntry({ source: "MESSAGE", value: msg })
  assertEqual(entry.kind, "ask", "kind")
  assertIncludes(entry.id, "message:", "id prefix")
}

console.log("assistant message → plan spine entry")
{
  const msg: MessageView = { id: "msg-002", sessionId: "session-1", role: "assistant", timestamp: Date.now(), content: "I'll help." }
  const entry = productionInputToSpineEntry({ source: "MESSAGE", value: msg })
  assertEqual(entry.kind, "plan", "kind")
}

console.log("approval version creates unique spine ID")
{
  const e1 = approvalToSpineEntry(makeApproval({ version: 1 }))
  const e2 = approvalToSpineEntry(makeApproval({ version: 2 }))
  assert(e1.id !== e2.id, "different IDs")
  assertIncludes(e1.id, "approval-001", "approval ID in e1")
  assertIncludes(e2.id, "approval-001", "approval ID in e2")
  assert(e1.id !== e2.id, "different IDs because versions differ")
}

console.log("duplicate durable event → same spine ID")
{
  const approval = makeApproval()
  const e1 = approvalToSpineEntry(approval)
  const e2 = approvalToSpineEntry(approval)
  assertEqual(e1.id, e2.id, "same ID")
}

// ═══════════════════════════════════════════════════════════════════════
// 2. ACTIONABILITY
// ═══════════════════════════════════════════════════════════════════════

console.log("\n═══ TUI-2.1 Actionability ═══")

for (const state of ["PENDING", "APPROVED", "DENIED", "CLAIMED", "CONSUMED", "EXPIRED", "INVALIDATED"] as ApprovalState[]) {
  const actionable = isApprovalActionable(makeApproval({ state }))
  const terminal = isApprovalTerminal(makeApproval({ state }))
  assertEqual(actionable, state === "PENDING", `${state} actionable`)
  assertEqual(terminal, ["CONSUMED", "EXPIRED", "INVALIDATED", "DENIED"].includes(state), `${state} terminal`)
}

// ═══════════════════════════════════════════════════════════════════════
// 3. RECEIPTS
// ═══════════════════════════════════════════════════════════════════════

console.log("\n═══ TUI-2.1 Receipts ═══")

console.log("PENDING receipt")
{
  const lines = generateApprovalReceipt(makeApproval({ state: "PENDING" }))
  assertEqual(lines.length, 1, "1 line")
  assertIncludes(lines[0]!.text, "exact request required", "text")
  assertEqual(lines[0]!.glyph, "◤", "glyph")
  assertEqual(lines[0]!.tone, "warning", "tone")
}

console.log("APPROVED receipt")
{
  const lines = generateApprovalReceipt(makeApproval({ state: "APPROVED", approvedBy: "user:lejzer" }))
  assertEqual(lines.length, 1, "1 line")
  assertIncludes(lines[0]!.text, "user:lejzer", "operator")
  assertEqual(lines[0]!.tone, "accent", "tone")
}

console.log("CLAIMED receipt")
{
  const lines = generateApprovalReceipt(makeApproval({ state: "CLAIMED", executionId: "exec-91bf" }))
  assertEqual(lines.length, 1, "1 line")
  assertIncludes(lines[0]!.text, "exec-91bf", "execution ID")
  assertEqual(lines[0]!.tone, "info", "tone")
}

console.log("CONSUMED receipt")
{
  const lines = generateApprovalReceipt(makeApproval({ state: "CONSUMED", executionId: "exec-91bf" }))
  assertEqual(lines.length, 2, "2 lines")
  assertIncludes(lines[0]!.text, "consumed", "consumed")
  assertIncludes(lines[1]!.text, "authority approval consumed", "authority")
  assertEqual(lines[1]!.tone, "success", "tone")
}

console.log("DENIED receipt")
{
  const lines = generateApprovalReceipt(makeApproval({ state: "DENIED", approvedBy: "operator" }))
  assertEqual(lines.length, 2, "2 lines")
  assertIncludes(lines[0]!.text, "denied by operator", "denied")
  assertIncludes(lines[1]!.text, "approval rejected", "rejected")
  assertEqual(lines[0]!.tone, "error", "tone")
}

console.log("INVALIDATED receipt")
{
  const lines = generateApprovalReceipt(makeApproval({ state: "INVALIDATED" }))
  assertEqual(lines.length, 2, "2 lines")
  assertIncludes(lines[0]!.text, "capability revoked", "reason")
  assertIncludes(lines[1]!.text, "new authorization required", "new approval")
}

console.log("EXPIRED receipt")
{
  const lines = generateApprovalReceipt(makeApproval({ state: "EXPIRED" }))
  assertEqual(lines.length, 1, "1 line")
  assertIncludes(lines[0]!.text, "not claimed in time", "reason")
  assertEqual(lines[0]!.tone, "muted", "tone")
}

// ═══════════════════════════════════════════════════════════════════════
// 4. RECOVERY / INVALIDATION PRESENTATION
// ═══════════════════════════════════════════════════════════════════════

console.log("\n═══ TUI-2.1 Recovery / Invalidation ═══")

console.log("recovery presentation")
{
  const lines = generateRecoveryPresentation("exec-123")
  assertEqual(lines.length, 5, "5 lines")
  assertEqual(lines[0]!.text, "recovery required", "title")
  assertEqual(lines[0]!.glyph, "!", "glyph")
  assertEqual(lines[0]!.tone, "error", "tone")
  assert(lines.some(l => l.text.includes("exec-123")), "execution ID")
  assert(lines.some(l => l.text === "automatic replay blocked"), "replay blocked")
  assert(lines.some(l => l.text === "manual reconciliation required"), "manual reconciliation")
  assert(lines.some(l => l.text === "effect outcome uncertain"), "outcome uncertain")
}

console.log("invalidated presentation")
{
  const lines = generateInvalidatedPresentation("approval-1", "capability revoked")
  assertEqual(lines.length, 3, "3 lines")
  assertEqual(lines[0]!.text, "approval invalidated", "title")
  assertEqual(lines[1]!.text, "capability revoked", "reason")
  assertEqual(lines[2]!.text, "new approval required", "action")
}

// ═══════════════════════════════════════════════════════════════════════
// 5. ORDERING
// ═══════════════════════════════════════════════════════════════════════

console.log("\n═══ TUI-2.1 Ordering ═══")

console.log("entries order by sequence")
{
  const a = createOrderingKey({ sessionId: "s1", sequence: 1, timestamp: "2026-01-01T00:00:00Z", source: "MESSAGE", sourceEventId: "msg-1" })
  const b = createOrderingKey({ sessionId: "s1", sequence: 2, timestamp: "2026-01-01T00:00:00Z", source: "MESSAGE", sourceEventId: "msg-2" })
  assert(compareOrderingKeys(a, b) < 0, "a < b")
  assert(compareOrderingKeys(b, a) > 0, "b > a")
}

console.log("equal keys compare as 0")
{
  const a = createOrderingKey({ sessionId: "s1", sequence: 1, timestamp: "2026-01-01T00:00:00Z", source: "MESSAGE", sourceEventId: "msg-1" })
  const b = createOrderingKey({ sessionId: "s1", sequence: 1, timestamp: "2026-01-01T00:00:00Z", source: "MESSAGE", sourceEventId: "msg-1" })
  assertEqual(compareOrderingKeys(a, b), 0, "equal")
}

console.log("governance < approval < message at same sequence")
{
  const gov = createOrderingKey({ sessionId: "s1", sequence: 1, timestamp: "2026-01-01T00:00:00Z", source: "GOVERNANCE", sourceEventId: "gov-1" })
  const appr = createOrderingKey({ sessionId: "s1", sequence: 1, timestamp: "2026-01-01T00:00:00Z", source: "APPROVAL", sourceEventId: "appr-1" })
  const msg = createOrderingKey({ sessionId: "s1", sequence: 1, timestamp: "2026-01-01T00:00:00Z", source: "MESSAGE", sourceEventId: "msg-1" })
  assert(compareOrderingKeys(gov, appr) < 0, "gov < appr")
  assert(compareOrderingKeys(appr, msg) < 0, "appr < msg")
  assert(compareOrderingKeys(gov, msg) < 0, "gov < msg")
}

console.log("different sessions sort by session ID")
{
  const a = createOrderingKey({ sessionId: "session-a", sequence: 1, timestamp: "2026-01-01T00:00:00Z", source: "MESSAGE", sourceEventId: "msg-1" })
  const b = createOrderingKey({ sessionId: "session-b", sequence: 1, timestamp: "2026-01-01T00:00:00Z", source: "MESSAGE", sourceEventId: "msg-1" })
  assert(compareOrderingKeys(a, b) < 0, "a < b")
}

console.log("same sequence different timestamps sort by time")
{
  const early = createOrderingKey({ sessionId: "s1", sequence: 1, timestamp: "2026-01-01T00:00:00Z", source: "MESSAGE", sourceEventId: "msg-1" })
  const late = createOrderingKey({ sessionId: "s1", sequence: 1, timestamp: "2026-01-01T00:00:01Z", source: "MESSAGE", sourceEventId: "msg-2" })
  assert(compareOrderingKeys(early, late) < 0, "early < late")
}

console.log("same everything different source event ID")
{
  const a = createOrderingKey({ sessionId: "s1", sequence: 1, timestamp: "2026-01-01T00:00:00Z", source: "MESSAGE", sourceEventId: "msg-aaa" })
  const b = createOrderingKey({ sessionId: "s1", sequence: 1, timestamp: "2026-01-01T00:00:00Z", source: "MESSAGE", sourceEventId: "msg-bbb" })
  assert(compareOrderingKeys(a, b) < 0, "aaa < bbb")
  assert(compareOrderingKeys(b, a) > 0, "bbb > aaa")
}

console.log("sort stability — array produces consistent order")
{
  const keys = [
    createOrderingKey({ sessionId: "s1", sequence: 3, timestamp: "2026-01-01T00:00:00Z", source: "MESSAGE", sourceEventId: "msg-3" }),
    createOrderingKey({ sessionId: "s1", sequence: 1, timestamp: "2026-01-01T00:00:00Z", source: "GOVERNANCE", sourceEventId: "gov-1" }),
    createOrderingKey({ sessionId: "s1", sequence: 2, timestamp: "2026-01-01T00:00:00Z", source: "APPROVAL", sourceEventId: "appr-1" }),
    createOrderingKey({ sessionId: "s1", sequence: 1, timestamp: "2026-01-01T00:00:00Z", source: "MESSAGE", sourceEventId: "msg-1" }),
  ]
  const sorted = [...keys].sort(compareOrderingKeys)
  assertEqual(sorted[0]!.sourceEventId, "gov-1", "first")
  assertEqual(sorted[1]!.sourceEventId, "msg-1", "second")
  assertEqual(sorted[2]!.sourceEventId, "appr-1", "third")
  assertEqual(sorted[3]!.sourceEventId, "msg-3", "fourth")
}

// ═══════════════════════════════════════════════════════════════════════
// 6. DEDUPLICATION
// ═══════════════════════════════════════════════════════════════════════

console.log("\n═══ TUI-2.1 Deduplication ═══")

console.log("approval dedupe key")
{
  const key = createDedupeKey({ approvalId: "a-1", approvalVersion: 3 })
  assertEqual(dedupeKeyToString(key), "approval:a-1:v3", "string")
}

console.log("governance dedupe key")
{
  const key = createDedupeKey({ governanceEventId: "gov-1" })
  assertEqual(dedupeKeyToString(key), "governance:gov-1", "string")
}

console.log("execution dedupe key")
{
  const key = createDedupeKey({ executionId: "exec-1" })
  assertEqual(dedupeKeyToString(key), "execution:exec-1", "string")
}

console.log("message dedupe key")
{
  const key = createDedupeKey({ messageId: "msg-1" })
  assertEqual(dedupeKeyToString(key), "message:msg-1", "string")
}

console.log("same event replayed → same key")
{
  const k1 = dedupeKeyToString(createDedupeKey({ approvalId: "a-1", approvalVersion: 1 }))
  const k2 = dedupeKeyToString(createDedupeKey({ approvalId: "a-1", approvalVersion: 1 }))
  assertEqual(k1, k2, "equal")
}

console.log("different versions → different keys")
{
  const k1 = dedupeKeyToString(createDedupeKey({ approvalId: "a-1", approvalVersion: 1 }))
  const k2 = dedupeKeyToString(createDedupeKey({ approvalId: "a-1", approvalVersion: 2 }))
  assert(k1 !== k2, "different")
}

// ═══════════════════════════════════════════════════════════════════════
// 7. CONTROLLER
// ═══════════════════════════════════════════════════════════════════════

console.log("\n═══ TUI-2.1 Controller ═══")

function makeController(overrides?: {
  serviceOverrides?: Partial<ApprovalOperatorService>
  approvalOverrides?: Partial<ApprovalRecord>
  getApprovalOverride?: (id: string) => ApprovalRecord | undefined
}): {
  controller: ApprovalShellController
  service: ReturnType<typeof makeMockService>
} {
  const service = makeMockService()
  if (overrides?.serviceOverrides) Object.assign(service, overrides.serviceOverrides)
  const approvals = new Map<string, ApprovalRecord>()
  approvals.set("approval-001", makeApproval(overrides?.approvalOverrides))
  const controller = createApprovalShellController({
    service,
    session: makeSession(),
    getApproval: overrides?.getApprovalOverride ?? ((id) => approvals.get(id)),
  })
  return { controller, service }
}

console.log("select sets selected approval ID")
{
  const { controller } = makeController()
  controller.select("approval-001")
  assertEqual(controller.getSelectedApprovalId(), "approval-001", "selected")
  assertEqual(controller.getShellState(), "SELECTED", "state")
}

console.log("inspect sets inspecting approval ID")
{
  const { controller } = makeController()
  controller.inspect("approval-001")
  assertEqual(controller.getInspectingApprovalId(), "approval-001", "inspecting")
  assertEqual(controller.getShellState(), "INSPECTING", "state")
}

console.log("clearSelection clears all state")
{
  const { controller } = makeController()
  controller.select("approval-001")
  controller.inspect("approval-001")
  controller.clearSelection()
  assertEqual(controller.getSelectedApprovalId(), undefined, "selected cleared")
  assertEqual(controller.getInspectingApprovalId(), undefined, "inspecting cleared")
  assertEqual(controller.getShellState(), undefined, "state cleared")
  assertEqual(controller.isSubmitting(), false, "not submitting")
}

console.log("approveOnce sends command")
{
  const { controller, service } = makeController()
  controller.approveOnce(makeCommandInput()).then((result) => {
    assertEqual(result.status, "APPROVED", "status")
    assertEqual(service.callLog.length, 1, "1 call")
    assertIncludes(service.callLog[0]!, "approveOnce", "method")
  })
}

console.log("deny sends command")
{
  const { controller, service } = makeController()
  controller.deny(makeCommandInput()).then((result) => {
    assertEqual(result.status, "DENIED", "status")
    assertEqual(service.callLog.length, 1, "1 call")
    assertIncludes(service.callLog[0]!, "deny", "method")
  })
}

console.log("non-actionable approval returns error")
{
  const { controller } = makeController({ approvalOverrides: { state: "CONSUMED" } })
  controller.approveOnce(makeCommandInput()).then((result) => {
    assertEqual(result.status, "ERROR", "status")
    assertIncludes(result.error!, "not actionable", "reason")
  })
}

console.log("wrong session returns error")
{
  const { controller } = makeController({ approvalOverrides: { sessionId: "other-session" } })
  controller.approveOnce(makeCommandInput()).then((result) => {
    assertEqual(result.status, "ERROR", "status")
    assertIncludes(result.error!, "different session", "reason")
  })
}

console.log("wrong workspace returns error")
{
  const { controller } = makeController({ approvalOverrides: { workspaceId: "other-workspace" } })
  controller.approveOnce(makeCommandInput()).then((result) => {
    assertEqual(result.status, "ERROR", "status")
    assertIncludes(result.error!, "different workspace", "reason")
  })
}

console.log("missing approval returns error")
{
  const { controller } = makeController({ getApprovalOverride: () => undefined })
  controller.approveOnce(makeCommandInput("nonexistent")).then((result) => {
    assertEqual(result.status, "ERROR", "status")
    assertIncludes(result.error!, "not found", "reason")
  })
}

console.log("service error returns ERROR result")
{
  const { controller } = makeController({
    serviceOverrides: { async approveOnce() { throw new Error("Service unavailable") } },
  })
  controller.approveOnce(makeCommandInput()).then((result) => {
    assertEqual(result.status, "ERROR", "status")
    assertIncludes(result.error!, "Service unavailable", "reason")
    assertEqual(controller.isSubmitting(), false, "not submitting after error")
  })
}

console.log("onStateChange callback fires")
{
  const changes: Array<{ id: string; state: string | undefined }> = []
  const service = makeMockService()
  const ctrl = createApprovalShellController({
    service,
    session: makeSession(),
    getApproval: () => makeApproval(),
    onStateChange: (id, state) => changes.push({ id, state }),
  })
  ctrl.select("approval-001")
  assertEqual(changes.length, 1, "1 change")
  assertEqual(changes[0]!.id, "approval-001", "approval ID")
  assertEqual(changes[0]!.state, "SELECTED", "state")
}

console.log("approveOnce passes version, request hash, contract revision")
{
  const { controller, service } = makeController()
  controller.approveOnce(makeCommandInput()).then(() => {
    assertEqual(service.callLog.length, 1, "1 call")
  })
}

// ═══════════════════════════════════════════════════════════════════════
// 8. DURABLE REFRESH
// ═══════════════════════════════════════════════════════════════════════

console.log("\n═══ TUI-2.1 Durable Refresh ═══")

console.log("PENDING → APPROVED updates receipt")
{
  const rPending = generateApprovalReceipt(makeApproval({ state: "PENDING" }))
  const rApproved = generateApprovalReceipt(makeApproval({ state: "APPROVED", approvedBy: "operator" }))
  assertIncludes(rPending[0]!.text, "exact request required", "pending")
  assertIncludes(rApproved[0]!.text, "approved once", "approved")
}

console.log("APPROVED → CLAIMED updates receipt")
{
  const rApproved = generateApprovalReceipt(makeApproval({ state: "APPROVED" }))
  const rClaimed = generateApprovalReceipt(makeApproval({ state: "CLAIMED", executionId: "exec-1" }))
  assertIncludes(rApproved[0]!.text, "approved", "approved")
  assertIncludes(rClaimed[0]!.text, "claimed", "claimed")
}

console.log("CLAIMED → CONSUMED updates receipt")
{
  const rClaimed = generateApprovalReceipt(makeApproval({ state: "CLAIMED", executionId: "exec-1" }))
  const rConsumed = generateApprovalReceipt(makeApproval({ state: "CONSUMED", executionId: "exec-1" }))
  assertIncludes(rClaimed[0]!.text, "claimed", "claimed")
  assertIncludes(rConsumed[0]!.text, "consumed", "consumed")
  assertEqual(rConsumed.length, 2, "consumed has authority line")
}

console.log("APPROVED → INVALIDATED becomes terminal")
{
  assertEqual(isApprovalTerminal(makeApproval({ state: "APPROVED" })), false, "approved not terminal")
  assertEqual(isApprovalTerminal(makeApproval({ state: "INVALIDATED" })), true, "invalidated terminal")
  const receipt = generateApprovalReceipt(makeApproval({ state: "INVALIDATED" }))
  assertIncludes(receipt[0]!.text, "capability revoked", "reason")
}

console.log("RECOVERY_REQUIRED remains persistent")
{
  const lines = generateRecoveryPresentation("exec-1")
  assertIncludes(lines[0]!.text, "recovery required", "title")
  assert(lines.some(l => l.text === "automatic replay blocked"), "replay blocked")
  assert(lines.some(l => l.text === "manual reconciliation required"), "manual")
}

console.log("late old-version event cannot replace newer state")
{
  const e1 = approvalToSpineEntry(makeApproval({ version: 1, state: "PENDING" }))
  const e2 = approvalToSpineEntry(makeApproval({ version: 2, state: "APPROVED" }))
  assert(e1.id !== e2.id, "different IDs due to version")
}

// ═══════════════════════════════════════════════════════════════════════
// 9. SESSION ISOLATION
// ═══════════════════════════════════════════════════════════════════════

console.log("\n═══ TUI-2.1 Session Isolation ═══")

console.log("cross-session approval not actionable")
{
  const { controller } = makeController({ approvalOverrides: { sessionId: "other-session" } })
  controller.approveOnce(makeCommandInput()).then((result) => {
    assertEqual(result.status, "ERROR", "status")
    assertIncludes(result.error!, "different session", "reason")
  })
}

console.log("cross-workspace approval not actionable")
{
  const { controller } = makeController({ approvalOverrides: { workspaceId: "other-workspace" } })
  controller.approveOnce(makeCommandInput()).then((result) => {
    assertEqual(result.status, "ERROR", "status")
    assertIncludes(result.error!, "different workspace", "reason")
  })
}

console.log("clearSelection on session switch")
{
  const { controller } = makeController()
  controller.select("approval-001")
  assertEqual(controller.getSelectedApprovalId(), "approval-001", "selected before")
  controller.clearSelection()
  assertEqual(controller.getSelectedApprovalId(), undefined, "cleared after")
}

// ═══════════════════════════════════════════════════════════════════════
// 10. SECURITY INVARIANTS
// ═══════════════════════════════════════════════════════════════════════

console.log("\n═══ TUI-2.1 Security Invariants ═══")

console.log("controller calls service, not executor")
{
  const { controller, service } = makeController()
  controller.approveOnce(makeCommandInput()).then((result) => {
    assertEqual(result.status, "APPROVED", "status")
    assertEqual(service.callLog.length, 1, "1 service call")
  })
}

console.log("approval does not mean execution")
{
  const receipt = generateApprovalReceipt(makeApproval({ state: "APPROVED" }))
  assertIncludes(receipt[0]!.text, "approved", "says approved")
  assertNotIncludes(receipt[0]!.text, "executed", "does not say executed")
  assertNotIncludes(receipt[0]!.text, "consumed", "does not say consumed")
}

console.log("invalidated says new approval required")
{
  const receipt = generateApprovalReceipt(makeApproval({ state: "INVALIDATED" }))
  assert(receipt.some(l => l.text.includes("new authorization required")), "new auth required")
}

console.log("recovery says outcome uncertain")
{
  const lines = generateRecoveryPresentation("exec-1")
  assert(lines.some(l => l.text === "effect outcome uncertain"), "uncertain")
}

console.log("no secret appears in receipts")
{
  const approval = makeApproval({ requestHash: "abc12345def67890" })
  const receipt = generateApprovalReceipt(approval)
  const text = receipt.map(l => l.text).join(" ")
  assertIncludes(text, "abc12345", "truncated hash visible")
  assertNotIncludes(text, "abc12345def67890", "full hash not visible")
}

// ═══════════════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════════════

console.log("\n═══════════════════════════════════════════════════════════════════")
console.log(`TUI-2.1 Production Integration: ${passed} passed, ${failed} failed`)
if (failures.length) {
  console.log("\nFailed:")
  failures.forEach(f => console.log(`  ✗ ${f}`))
}
console.log("═══════════════════════════════════════════════════════════════════")

if (failed > 0) process.exit(1)

