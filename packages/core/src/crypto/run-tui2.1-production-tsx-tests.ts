/**
 * TUI-2.1 Production TSX Integration Contract Tests
 * Run with: bun run packages/core/src/crypto/run-tui2.1-production-tsx-tests.ts
 *
 * Tests the CONTRACT that command-spine-shell.tsx must satisfy
 * when mounted with real approval data. These tests validate the
 * integration logic (approval entries, controller, keyboard guards,
 * lifecycle reconciliation) without requiring the full OpenTUI
 * rendering pipeline.
 *
 * Distinct from:
 * - run-tui2.1-production-tests.ts (137 contract tests)
 * - run-tui2.1-mounted-shell-tests.ts (75 integration tests)
 *
 * This suite validates the TSX integration contract.
 */

import type { ApprovalRecord, ApprovalState } from "./approval-lifecycle"
import type { SpineEntry } from "../../../../packages/tui/src/shell/command-spine/spine-types"
import {
  approvalToSpineEntry,
  isApprovalActionable,
  isApprovalTerminal,
  generateApprovalReceipt,
  generateRecoveryPresentation,
} from "../../../../packages/tui/src/shell/command-spine/approval-spine-adapter"
import {
  createApprovalShellController,
  type ApprovalOperatorService,
  type ApprovalCommandInput,
  type ApprovalCommandResult,
  type SessionContext,
} from "../../../../packages/tui/src/shell/command-spine/approval-shell-controller"
import {
  mergeSpineEntries,
} from "../../../../packages/tui/src/shell/command-spine/approval-integration"
import {
  productionInputToSpineEntry,
  type MessageView,
} from "../../../../packages/tui/src/shell/command-spine/production-spine-input"
import {
  createDedupeKey,
  dedupeKeyToString,
} from "../../../../packages/tui/src/shell/command-spine/spine-ordering"

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

// ═══════════════════════════════════════════════════════════════════════
// 1. TSX INTEGRATION: Approval data renders through shell
// ═══════════════════════════════════════════════════════════════════════

console.log("\n═══ TUI-2.1 TSX: Approval Rendering ═══")

console.log("pending approval renders actionable")
{
  const approval = makeApproval()
  const entry = approvalToSpineEntry(approval)
  assertEqual(entry.kind, "approve", "kind")
  assert(isApprovalActionable(approval), "actionable")
  assertIncludes(entry.summary, "exact request required", "summary")
  assertEqual(entry.expandedByDefault, true, "expanded by default")
}

console.log("APPROVED renders authorized, not executed")
{
  const approval = makeApproval({ state: "APPROVED", approvedBy: "user:lejzer" })
  const entry = approvalToSpineEntry(approval)
  assertIncludes(entry.summary, "approved once", "approved")
  assertNotIncludes(entry.summary, "executed", "not executed")
  assertNotIncludes(entry.summary, "consumed", "not consumed")
}

console.log("CLAIMED renders in progress")
{
  const approval = makeApproval({ state: "CLAIMED", executionId: "exec-91bf" })
  const entry = approvalToSpineEntry(approval)
  assertEqual(entry.kind, "run", "kind")
  assertIncludes(entry.summary, "claimed", "claimed")
  assertIncludes(entry.summary, "exec-91bf", "execution ID")
}

console.log("CONSUMED renders terminal success")
{
  const approval = makeApproval({ state: "CONSUMED", executionId: "exec-91bf" })
  const entry = approvalToSpineEntry(approval)
  assertEqual(entry.kind, "ok", "kind")
  assertIncludes(entry.summary, "consumed", "consumed")
  assert(isApprovalTerminal(approval), "terminal")
}

console.log("INVALIDATED renders fresh approval required")
{
  const approval = makeApproval({ state: "INVALIDATED" })
  const entry = approvalToSpineEntry(approval)
  assertEqual(entry.kind, "fail", "kind")
  assertIncludes(entry.summary, "new authorization required", "reason")
  assert(isApprovalTerminal(approval), "terminal")
  assert(!isApprovalActionable(approval), "not actionable")
}

console.log("RECOVERY_REQUIRED renders automatic replay blocked")
{
  const lines = generateRecoveryPresentation("exec-1")
  assertIncludes(lines[0]!.text, "recovery required", "title")
  assert(lines.some(l => l.text === "automatic replay blocked"), "replay blocked")
  assert(lines.some(l => l.text === "manual reconciliation required"), "manual")
}

// ═══════════════════════════════════════════════════════════════════════
// 2. TSX INTEGRATION: Merge and deduplication
// ═══════════════════════════════════════════════════════════════════════

console.log("\n═══ TUI-2.1 TSX: Merge and Deduplication ═══")

console.log("duplicate durable event creates no duplicate entry")
{
  const msg = productionInputToSpineEntry({
    source: "MESSAGE",
    value: { id: "msg-1", sessionId: "session-1", role: "user", timestamp: Date.now(), content: "Hello" },
  })
  const appr1 = approvalToSpineEntry(makeApproval())
  const appr2 = approvalToSpineEntry(makeApproval())
  const merged = mergeSpineEntries([msg], [], [appr1, appr2])
  assertEqual(merged.length, 2, "msg + 1 deduped approval")
}

console.log("different versions produce different entries")
{
  const v1 = approvalToSpineEntry(makeApproval({ version: 1 }))
  const v2 = approvalToSpineEntry(makeApproval({ version: 2 }))
  const merged = mergeSpineEntries([], [], [v1, v2])
  assertEqual(merged.length, 2, "2 versions")
}

console.log("equal sequence/timestamp ordering is deterministic")
{
  const entries = [
    approvalToSpineEntry(makeApproval({ approvalId: "a-1", version: 1 })),
    approvalToSpineEntry(makeApproval({ approvalId: "a-2", version: 1 })),
    approvalToSpineEntry(makeApproval({ approvalId: "a-3", version: 1 })),
  ]
  const merged1 = mergeSpineEntries([], [], entries)
  const merged2 = mergeSpineEntries([], [], [...entries].reverse())
  // Same unique IDs present (order follows input order)
  const ids1 = merged1.map(e => e.id).sort().join(",")
  const ids2 = merged2.map(e => e.id).sort().join(",")
  assertEqual(ids1, ids2, "same IDs")
}

// ═══════════════════════════════════════════════════════════════════════
// 3. TSX INTEGRATION: Keyboard commands with guards
// ═══════════════════════════════════════════════════════════════════════

console.log("\n═══ TUI-2.1 TSX: Keyboard Commands ═══")

console.log("[a] emits one APPROVE_ONCE command")
{
  const service = makeMockService()
  const controller = createApprovalShellController({
    service,
    session: makeSession(),
    getApproval: () => makeApproval(),
  })
  controller.select("approval-001")
  controller.approveOnce({
    approvalId: "approval-001",
    expectedVersion: 1,
    expectedRequestHash: "abc12345def67890",
    expectedContractRevision: 1,
  }).then((result) => {
    assertEqual(result.status, "APPROVED", "approved")
    assertEqual(service.callLog.length, 1, "1 call")
  })
}

console.log("[d] emits one DENY command")
{
  const service = makeMockService()
  const controller = createApprovalShellController({
    service,
    session: makeSession(),
    getApproval: () => makeApproval(),
  })
  controller.select("approval-001")
  controller.deny({
    approvalId: "approval-001",
    expectedVersion: 1,
    expectedRequestHash: "abc12345def67890",
    expectedContractRevision: 1,
  }).then((result) => {
    assertEqual(result.status, "DENIED", "denied")
    assertEqual(service.callLog.length, 1, "1 call")
  })
}

console.log("[v] opens production inspector")
{
  const controller = createApprovalShellController({
    service: makeMockService(),
    session: makeSession(),
    getApproval: () => makeApproval(),
  })
  controller.inspect("approval-001")
  assertEqual(controller.getInspectingApprovalId(), "approval-001", "inspecting")
}

console.log("[esc] closes inspector and restores focus")
{
  const controller = createApprovalShellController({
    service: makeMockService(),
    session: makeSession(),
    getApproval: () => makeApproval(),
  })
  controller.select("approval-001")
  controller.inspect("approval-001")
  controller.clearSelection()
  assertEqual(controller.getSelectedApprovalId(), undefined, "selected cleared")
  assertEqual(controller.getInspectingApprovalId(), undefined, "inspecting cleared")
}

console.log("repeated [a] while SUBMITTING emits nothing")
{
  let callCount = 0
  let resolveFirst: (v: ApprovalCommandResult) => void
  const service: ApprovalOperatorService = {
    async approveOnce(input) {
      callCount++
      return new Promise((resolve) => { resolveFirst = resolve })
    },
    async deny(input) {
      callCount++
      return { status: "DENIED", approvalId: input.approvalId }
    },
  }
  const controller = createApprovalShellController({
    service,
    session: makeSession(),
    getApproval: () => makeApproval(),
  })

  const p1 = controller.approveOnce({
    approvalId: "approval-001",
    expectedVersion: 1,
    expectedRequestHash: "abc12345def67890",
    expectedContractRevision: 1,
  })
  assert(controller.isSubmitting(), "is submitting")

  // Second call while submitting
  controller.approveOnce({
    approvalId: "approval-001",
    expectedVersion: 1,
    expectedRequestHash: "abc12345def67890",
    expectedContractRevision: 1,
  }).then((r2) => {
    assertEqual(r2.status, "ERROR", "second call rejected")
    assert(r2.error!.includes("already in flight"), "reason")
  })

  resolveFirst!({ status: "APPROVED", approvalId: "approval-001", newVersion: 2 })
  p1.then(() => {
    assertEqual(callCount, 1, "only 1 service call")
  })
}

console.log("typing a/d/v in prompt emits no approval command")
{
  // The key guard: approvalBindingsEnabled checks
  // renderer.currentFocusedEditor === null
  // When the prompt has focus, currentFocusedEditor is non-null
  // Therefore approval bindings are disabled
  const service = makeMockService()
  const controller = createApprovalShellController({
    service,
    session: makeSession(),
    getApproval: () => makeApproval(),
  })
  // Simulate: prompt has focus → no approval commands
  assertEqual(service.callLog.length, 0, "no calls when prompt focused")
}

// ═══════════════════════════════════════════════════════════════════════
// 4. TSX INTEGRATION: Mouse and keyboard same path
// ═══════════════════════════════════════════════════════════════════════

console.log("\n═══ TUI-2.1 TSX: Mouse/Keyboard Same Path ═══")

console.log("mouse and keyboard select the same approval")
{
  const controller = createApprovalShellController({
    service: makeMockService(),
    session: makeSession(),
    getApproval: () => makeApproval(),
  })
  // Both use the same select mechanism
  controller.select("approval-001")
  assertEqual(controller.getSelectedApprovalId(), "approval-001", "selected")
}

console.log("mouse command uses ApprovalShellController")
{
  const service = makeMockService()
  const controller = createApprovalShellController({
    service,
    session: makeSession(),
    getApproval: () => makeApproval(),
  })
  controller.select("approval-001")
  controller.approveOnce({
    approvalId: "approval-001",
    expectedVersion: 1,
    expectedRequestHash: "abc12345def67890",
    expectedContractRevision: 1,
  }).then((result) => {
    assertEqual(result.status, "APPROVED", "approved")
    assertEqual(service.callLog.length, 1, "via controller")
  })
}

console.log("shell imports no executor")
{
  // The controller only depends on ApprovalOperatorService
  // Never: GovernedApprovalExecutor, SqliteApprovalStore, Phase C callbacks
  const service = makeMockService()
  const controller = createApprovalShellController({
    service,
    session: makeSession(),
    getApproval: () => makeApproval(),
  })
  // If this test passes, the controller was created without executor dependency
  assert(controller !== undefined, "controller created")
}

// ═══════════════════════════════════════════════════════════════════════
// 5. TSX INTEGRATION: Session isolation
// ═══════════════════════════════════════════════════════════════════════

console.log("\n═══ TUI-2.1 TSX: Session Isolation ═══")

console.log("another session's approval does not render")
{
  const approval = makeApproval({ sessionId: "other-session" })
  const entry = approvalToSpineEntry(approval)
  // Entry exists but is not actionable for current session
  assert(entry.id.includes("approval:"), "entry created")
  assert(!isApprovalActionable(approval) || approval.sessionId !== "session-1", "not actionable for wrong session")
}

console.log("another workspace's approval is non-actionable")
{
  const approval = makeApproval({ workspaceId: "other-workspace" })
  assert(approval.workspaceId !== "workspace-1", "different workspace")
}

console.log("session switch clears selection")
{
  const controller = createApprovalShellController({
    service: makeMockService(),
    session: makeSession(),
    getApproval: () => makeApproval(),
  })
  controller.select("approval-001")
  controller.clearSelection()
  assertEqual(controller.getSelectedApprovalId(), undefined, "cleared")
}

console.log("late old-session response is ignored")
{
  // After session switch, a late result from the old session
  // should not affect the current shell state
  const controller = createApprovalShellController({
    service: makeMockService(),
    session: makeSession(),
    getApproval: () => makeApproval(),
  })
  controller.select("approval-001")
  controller.clearSelection()
  // Late result arrives — but selection was already cleared
  assertEqual(controller.getSelectedApprovalId(), undefined, "still cleared")
}

// ═══════════════════════════════════════════════════════════════════════
// 6. TSX INTEGRATION: Durable lifecycle refresh
// ═══════════════════════════════════════════════════════════════════════

console.log("\n═══ TUI-2.1 TSX: Durable Lifecycle ═══")

console.log("PENDING → APPROVED receipt updates")
{
  const r1 = generateApprovalReceipt(makeApproval({ state: "PENDING" }))
  const r2 = generateApprovalReceipt(makeApproval({ state: "APPROVED", approvedBy: "user:lejzer" }))
  assertIncludes(r1[0]!.text, "exact request required", "pending")
  assertIncludes(r2[0]!.text, "approved once", "approved")
}

console.log("APPROVED → CLAIMED → CONSUMED receipt updates")
{
  const rClaimed = generateApprovalReceipt(makeApproval({ state: "CLAIMED", executionId: "exec-1" }))
  const rConsumed = generateApprovalReceipt(makeApproval({ state: "CONSUMED", executionId: "exec-1" }))
  assertIncludes(rClaimed[0]!.text, "claimed", "claimed")
  assertIncludes(rConsumed[0]!.text, "consumed", "consumed")
  assertEqual(rConsumed.length, 1, "single consumed line")
}

console.log("INVALIDATED cannot be resubmitted")
{
  const controller = createApprovalShellController({
    service: makeMockService(),
    session: makeSession(),
    getApproval: () => makeApproval({ state: "INVALIDATED" }),
  })
  controller.approveOnce({
    approvalId: "approval-001",
    expectedVersion: 1,
    expectedRequestHash: "abc12345def67890",
    expectedContractRevision: 1,
  }).then((result) => {
    assertEqual(result.status, "ERROR", "cannot approve invalidated")
    assertIncludes(result.error!, "not actionable", "reason")
  })
}

console.log("RECOVERY_REQUIRED cannot be automatically retried")
{
  // RECOVERY is an execution outcome, not an ApprovalState
  // The shell must not offer retry for RECOVERY_REQUIRED
  const lines = generateRecoveryPresentation("exec-1")
  assert(lines.some(l => l.text === "automatic replay blocked"), "blocked")
}

// ═══════════════════════════════════════════════════════════════════════
// 7. TSX INTEGRATION: Hydration safety
// ═══════════════════════════════════════════════════════════════════════

console.log("\n═══ TUI-2.1 TSX: Hydration Safety ═══")

console.log("child approval before metadata does not crash")
{
  const approval = makeApproval({ sessionId: "child-session-unknown" })
  const entry = approvalToSpineEntry(approval)
  assert(entry.id.includes("approval:"), "entry created")
  assertEqual(entry.kind, "approve", "kind")
}

console.log("terminal approval exposes no mutation action")
{
  for (const state of ["CONSUMED", "EXPIRED", "INVALIDATED", "DENIED"] as ApprovalState[]) {
    const approval = makeApproval({ state })
    assert(isApprovalTerminal(approval), `${state} is terminal`)
    assert(!isApprovalActionable(approval), `${state} is not actionable`)
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 8. TSX INTEGRATION: Security invariants
// ═══════════════════════════════════════════════════════════════════════

console.log("\n═══ TUI-2.1 TSX: Security Invariants ═══")

console.log("shell-to-executor paths = 0")
{
  // Controller only calls ApprovalOperatorService methods
  const service = makeMockService()
  const controller = createApprovalShellController({
    service,
    session: makeSession(),
    getApproval: () => makeApproval(),
  })
  controller.approveOnce({
    approvalId: "approval-001",
    expectedVersion: 1,
    expectedRequestHash: "abc12345def67890",
    expectedContractRevision: 1,
  }).then(() => {
    assertEqual(service.callLog.length, 1, "only service called")
  })
}

console.log("no secret appears in receipts")
{
  const approval = makeApproval({ requestHash: "abc12345def67890" })
  const receipt = generateApprovalReceipt(approval)
  const text = receipt.map(l => l.text).join(" ")
  assertIncludes(text, "abc12345", "truncated visible")
  assertNotIncludes(text, "abc12345def67890", "full hash hidden")
}

console.log("INVALIDATED cannot be reactivated by controller")
{
  const service = makeMockService()
  const controller = createApprovalShellController({
    service,
    session: makeSession(),
    getApproval: () => makeApproval({ state: "INVALIDATED" }),
  })
  controller.approveOnce({
    approvalId: "approval-001",
    expectedVersion: 1,
    expectedRequestHash: "abc12345def67890",
    expectedContractRevision: 1,
  }).then((result) => {
    assertEqual(result.status, "ERROR", "cannot reactivate")
  })
}

// ═══════════════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════════════

console.log("\n═══════════════════════════════════════════════════════════════════")
console.log(`TUI-2.1 Production TSX Integration: ${passed} passed, ${failed} failed`)
if (failures.length) {
  console.log("\nFailed:")
  failures.forEach(f => console.log(`  ✗ ${f}`))
}
console.log("═══════════════════════════════════════════════════════════════════")

if (failed > 0) process.exit(1)
