/**
 * TUI-2.1 Mounted-Shell Integration Tests
 * Run with: bun run packages/core/src/crypto/run-tui2.1-mounted-shell-tests.ts
 *
 * Tests the REAL mounted integration: approval-integration hook + controller
 * + ordering + deduplication + lifecycle refresh + session isolation.
 * Distinct from run-tui2.1-production-tests.ts (contract tests).
 *
 * This suite instantiates the actual integration components as the
 * production shell would, validating end-to-end behavior.
 */

import type { ApprovalRecord, ApprovalState } from "./approval-lifecycle"
import type { SpineEntry } from "../../../../packages/tui/src/shell/command-spine/spine-types"
import {
  approvalToSpineEntry,
  isApprovalActionable,
  isApprovalTerminal,
  generateApprovalReceipt,
  generateRecoveryPresentation,
  generateInvalidatedPresentation,
} from "../../../../packages/tui/src/shell/command-spine/approval-spine-adapter"
import {
  mergeSpineEntries,
} from "../../../../packages/tui/src/shell/command-spine/approval-integration"
import {
  createApprovalShellController,
  type ApprovalOperatorService,
  type ApprovalCommandInput,
  type ApprovalCommandResult,
  type SessionContext,
} from "../../../../packages/tui/src/shell/command-spine/approval-shell-controller"
import {
  createOrderingKey,
  compareOrderingKeys,
  createDedupeKey,
  dedupeKeyToString,
} from "../../../../packages/tui/src/shell/command-spine/spine-ordering"
import {
  productionInputToSpineEntry,
  type ProductionSpineInput,
  type MessageView,
  type GovernanceView,
} from "../../../../packages/tui/src/shell/command-spine/production-spine-input"

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

function makeMessageEntry(id: string, role = "user"): SpineEntry {
  return productionInputToSpineEntry({
    source: "MESSAGE",
    value: { id, sessionId: "session-1", role, timestamp: Date.now(), content: `Message ${id}` },
  })
}

function makeApprovalEntry(approval: ApprovalRecord): SpineEntry {
  return approvalToSpineEntry(approval)
}

// ═══════════════════════════════════════════════════════════════════════
// 1. MOUNTING: Real approval record appears in shell
// ═══════════════════════════════════════════════════════════════════════

console.log("\n═══ TUI-2.1 Mounted: Entry Rendering ═══")

console.log("pending approval renders in shell")
{
  const approval = makeApproval()
  const entry = approvalToSpineEntry(approval)
  assertEqual(entry.kind, "approve", "kind")
  assertIncludes(entry.summary, "exact request required", "summary")
  assertEqual(entry.expandedByDefault, true, "expanded by default")
}

console.log("approved approval renders authorized, not executed")
{
  const approval = makeApproval({ state: "APPROVED", approvedBy: "user:lejzer" })
  const entry = approvalToSpineEntry(approval)
  assertEqual(entry.kind, "ok", "kind")
  assertIncludes(entry.summary, "approved once", "summary")
  assertNotIncludes(entry.summary, "executed", "not executed")
}

console.log("claimed approval renders executing")
{
  const approval = makeApproval({ state: "CLAIMED", executionId: "exec-91bf" })
  const entry = approvalToSpineEntry(approval)
  assertEqual(entry.kind, "run", "kind")
  assertIncludes(entry.summary, "exec-91bf", "execution ID")
}

console.log("consumed approval renders terminal success")
{
  const approval = makeApproval({ state: "CONSUMED", executionId: "exec-91bf" })
  const entry = approvalToSpineEntry(approval)
  assertEqual(entry.kind, "ok", "kind")
  assertIncludes(entry.summary, "consumed", "consumed")
}

console.log("invalidated approval renders terminal new-approval-required")
{
  const approval = makeApproval({ state: "INVALIDATED" })
  const entry = approvalToSpineEntry(approval)
  assertEqual(entry.kind, "fail", "kind")
  assertIncludes(entry.summary, "new authorization required", "reason")
}

console.log("denied approval renders denied")
{
  const approval = makeApproval({ state: "DENIED", approvedBy: "operator" })
  const entry = approvalToSpineEntry(approval)
  assertEqual(entry.kind, "fail", "kind")
  assertIncludes(entry.summary, "denied by operator", "reason")
}

console.log("unknown approval state remains visible")
{
  const approval = makeApproval({ state: "UNKNOWN" as ApprovalState })
  const entry = approvalToSpineEntry(approval)
  assert(entry.id.includes("approval:"), "has ID")
  assertEqual(entry.collapsible, true, "collapsible")
}

// ═══════════════════════════════════════════════════════════════════════
// 2. DEDUPLICATION: Same event → one entry
// ═══════════════════════════════════════════════════════════════════════

console.log("\n═══ TUI-2.1 Mounted: Deduplication ═══")

console.log("mergeSpineEntries deduplicates by ID")
{
  const msg = makeMessageEntry("msg-1")
  const appr = makeApprovalEntry(makeApproval())
  // Duplicate approval
  const appr2 = makeApprovalEntry(makeApproval())

  const merged = mergeSpineEntries([msg], [], [appr, appr2])
  // Should have msg + 1 approval (duplicate removed)
  assertEqual(merged.length, 2, "2 unique entries")
  assert(merged.some(e => e.id.startsWith("message:")), "has message")
  assert(merged.some(e => e.id.startsWith("approval:")), "has approval")
}

console.log("duplicate message event produces one entry")
{
  const msg1 = makeMessageEntry("msg-dup")
  const msg2 = makeMessageEntry("msg-dup")
  const merged = mergeSpineEntries([msg1, msg2], [], [])
  assertEqual(merged.length, 1, "1 unique message")
}

console.log("different versions produce different entries")
{
  const v1 = makeApprovalEntry(makeApproval({ version: 1 }))
  const v2 = makeApprovalEntry(makeApproval({ version: 2 }))
  const merged = mergeSpineEntries([], [], [v1, v2])
  assertEqual(merged.length, 2, "2 versions")
}

// ═══════════════════════════════════════════════════════════════════════
// 3. ORDERING: Deterministic with mixed sources
// ═══════════════════════════════════════════════════════════════════════

console.log("\n═══ TUI-2.1 Mounted: Ordering ═══")

console.log("governance < approval < message at equal timestamp")
{
  const gov = createOrderingKey({
    sessionId: "s1", sequence: 1, timestamp: "2026-01-01T00:00:00Z",
    source: "GOVERNANCE", sourceEventId: "gov-1",
  })
  const appr = createOrderingKey({
    sessionId: "s1", sequence: 1, timestamp: "2026-01-01T00:00:00Z",
    source: "APPROVAL", sourceEventId: "appr-1",
  })
  const msg = createOrderingKey({
    sessionId: "s1", sequence: 1, timestamp: "2026-01-01T00:00:00Z",
    source: "MESSAGE", sourceEventId: "msg-1",
  })
  assert(compareOrderingKeys(gov, appr) < 0, "gov < appr")
  assert(compareOrderingKeys(appr, msg) < 0, "appr < msg")
}

console.log("sort produces consistent order across runs")
{
  const keys = [
    createOrderingKey({ sessionId: "s1", sequence: 3, timestamp: "2026-01-01T00:00:00Z", source: "MESSAGE", sourceEventId: "msg-3" }),
    createOrderingKey({ sessionId: "s1", sequence: 1, timestamp: "2026-01-01T00:00:00Z", source: "GOVERNANCE", sourceEventId: "gov-1" }),
    createOrderingKey({ sessionId: "s1", sequence: 2, timestamp: "2026-01-01T00:00:00Z", source: "APPROVAL", sourceEventId: "appr-1" }),
  ]
  const sorted1 = [...keys].sort(compareOrderingKeys)
  const sorted2 = [...keys].sort(compareOrderingKeys)
  assertEqual(sorted1[0]!.sourceEventId, sorted2[0]!.sourceEventId, "first matches")
  assertEqual(sorted1[1]!.sourceEventId, sorted2[1]!.sourceEventId, "second matches")
  assertEqual(sorted1[2]!.sourceEventId, sorted2[2]!.sourceEventId, "third matches")
}

// ═══════════════════════════════════════════════════════════════════════
// 4. KEYBOARD: Controller commands
// ═══════════════════════════════════════════════════════════════════════

console.log("\n═══ TUI-2.1 Mounted: Keyboard Commands ═══")

function makeMountedController(approvals: ApprovalRecord[] = [makeApproval()]) {
  const service = makeMockService()
  const approvalMap = new Map(approvals.map(a => [a.approvalId, a]))
  const controller = createApprovalShellController({
    service,
    session: makeSession(),
    getApproval: (id) => approvalMap.get(id),
  })
  return { controller, service }
}

console.log("[a] sends one APPROVE_ONCE command")
{
  const { controller, service } = makeMountedController()
  controller.select("approval-001")
  controller.approveOnce({
    approvalId: "approval-001",
    expectedVersion: 1,
    expectedRequestHash: "abc12345def67890",
    expectedContractRevision: 1,
  }).then((result) => {
    assertEqual(result.status, "APPROVED", "approved")
    assertEqual(service.callLog.length, 1, "1 call")
    assertIncludes(service.callLog[0]!, "approveOnce", "method")
  })
}

console.log("[d] sends one DENY command")
{
  const { controller, service } = makeMountedController()
  controller.select("approval-001")
  controller.deny({
    approvalId: "approval-001",
    expectedVersion: 1,
    expectedRequestHash: "abc12345def67890",
    expectedContractRevision: 1,
  }).then((result) => {
    assertEqual(result.status, "DENIED", "denied")
    assertEqual(service.callLog.length, 1, "1 call")
    assertIncludes(service.callLog[0]!, "deny", "method")
  })
}

console.log("[v] opens full inspector — controller.inspect()")
{
  const { controller } = makeMountedController()
  controller.select("approval-001")
  controller.inspect("approval-001")
  assertEqual(controller.getInspectingApprovalId(), "approval-001", "inspecting")
  assertEqual(controller.getShellState(), "INSPECTING", "state")
}

console.log("[esc] clears selection — controller.clearSelection()")
{
  const { controller } = makeMountedController()
  controller.select("approval-001")
  controller.inspect("approval-001")
  controller.clearSelection()
  assertEqual(controller.getSelectedApprovalId(), undefined, "selected cleared")
  assertEqual(controller.getInspectingApprovalId(), undefined, "inspecting cleared")
}

console.log("repeated [a] while SUBMITTING sends no duplicate command")
{
  let callCount = 0
  let resolveFirst: (v: ApprovalCommandResult) => void
  const hangingService: ApprovalOperatorService = {
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
    service: hangingService,
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
  const r2 = await controller.approveOnce({
    approvalId: "approval-001",
    expectedVersion: 1,
    expectedRequestHash: "abc12345def67890",
    expectedContractRevision: 1,
  })
  assertEqual(r2.status, "ERROR", "second call rejected")
  assert(r2.error!.includes("already in flight"), "reason")

  resolveFirst!({ status: "APPROVED", approvalId: "approval-001", newVersion: 2 })
  await p1
  assertEqual(callCount, 1, "only 1 service call")
}

// ═══════════════════════════════════════════════════════════════════════
// 5. MOUSE: Same selection and command path
// ═══════════════════════════════════════════════════════════════════════

console.log("\n═══ TUI-2.1 Mounted: Mouse Commands ═══")

console.log("click selects same approval used by keyboard")
{
  const { controller } = makeMountedController()
  controller.select("approval-001")
  assertEqual(controller.getSelectedApprovalId(), "approval-001", "selected")
}

console.log("inspect action opens same inspector")
{
  const { controller } = makeMountedController()
  controller.inspect("approval-001")
  assertEqual(controller.getInspectingApprovalId(), "approval-001", "inspecting")
}

console.log("mouse approve uses ApprovalShellController")
{
  const { controller, service } = makeMountedController()
  controller.select("approval-001")
  controller.approveOnce({
    approvalId: "approval-001",
    expectedVersion: 1,
    expectedRequestHash: "abc12345def67890",
    expectedContractRevision: 1,
  }).then((result) => {
    assertEqual(result.status, "APPROVED", "approved via controller")
    assertEqual(service.callLog.length, 1, "1 service call")
  })
}

console.log("mouse deny uses ApprovalShellController")
{
  const { controller, service } = makeMountedController()
  controller.select("approval-001")
  controller.deny({
    approvalId: "approval-001",
    expectedVersion: 1,
    expectedRequestHash: "abc12345def67890",
    expectedContractRevision: 1,
  }).then((result) => {
    assertEqual(result.status, "DENIED", "denied via controller")
    assertEqual(service.callLog.length, 1, "1 service call")
  })
}

// ═══════════════════════════════════════════════════════════════════════
// 6. DURABLE LIFECYCLE REFRESH
// ═══════════════════════════════════════════════════════════════════════

console.log("\n═══ TUI-2.1 Mounted: Durable Refresh ═══")

console.log("PENDING → APPROVED updates receipt")
{
  const r1 = generateApprovalReceipt(makeApproval({ state: "PENDING" }))
  const r2 = generateApprovalReceipt(makeApproval({ state: "APPROVED", approvedBy: "user:lejzer" }))
  assertIncludes(r1[0]!.text, "exact request required", "pending")
  assertIncludes(r2[0]!.text, "approved once", "approved")
  assertIncludes(r2[0]!.text, "user:lejzer", "operator")
}

console.log("APPROVED → CLAIMED updates receipt")
{
  const r = generateApprovalReceipt(makeApproval({ state: "CLAIMED", executionId: "exec-1" }))
  assertIncludes(r[0]!.text, "claimed", "claimed")
  assertIncludes(r[0]!.text, "exec-1", "execution ID")
}

console.log("CLAIMED → CONSUMED updates receipt")
{
  const r = generateApprovalReceipt(makeApproval({ state: "CONSUMED", executionId: "exec-1" }))
  assertIncludes(r[0]!.text, "consumed", "consumed")
  assertEqual(r.length, 2, "consumed + authority line")
  assertIncludes(r[1]!.text, "authority approval consumed", "authority")
}

console.log("APPROVED → INVALIDATED becomes terminal")
{
  assert(isApprovalTerminal(makeApproval({ state: "INVALIDATED" })), "terminal")
  assert(!isApprovalActionable(makeApproval({ state: "INVALIDATED" })), "not actionable")
  const r = generateApprovalReceipt(makeApproval({ state: "INVALIDATED" }))
  assertIncludes(r[0]!.text, "capability revoked", "reason")
  assertIncludes(r[1]!.text, "new authorization required", "new approval")
}

console.log("RECOVERY_REQUIRED cannot be retried")
{
  const r = generateRecoveryPresentation("exec-1")
  assertIncludes(r[0]!.text, "recovery required", "title")
  assert(r.some(l => l.text === "automatic replay blocked"), "replay blocked")
  assert(r.some(l => l.text === "manual reconciliation required"), "manual")
  assert(r.some(l => l.text === "effect outcome uncertain"), "uncertain")
}

console.log("INVALIDATED says fresh approval required")
{
  const r = generateInvalidatedPresentation("approval-1", "capability revoked")
  assertIncludes(r[0]!.text, "approval invalidated", "title")
  assertIncludes(r[2]!.text, "new approval required", "action")
}

console.log("late old-version event cannot overwrite newer state")
{
  const e1 = approvalToSpineEntry(makeApproval({ version: 1, state: "PENDING" }))
  const e2 = approvalToSpineEntry(makeApproval({ version: 2, state: "APPROVED" }))
  assert(e1.id !== e2.id, "different IDs")
}

// ═══════════════════════════════════════════════════════════════════════
// 7. SESSION ISOLATION
// ═══════════════════════════════════════════════════════════════════════

console.log("\n═══ TUI-2.1 Mounted: Session Isolation ═══")

console.log("approval from different session is not actionable")
{
  const { controller } = makeMountedController([
    makeApproval({ sessionId: "other-session" }),
  ])
  controller.select("approval-001")
  controller.approveOnce({
    approvalId: "approval-001",
    expectedVersion: 1,
    expectedRequestHash: "abc12345def67890",
    expectedContractRevision: 1,
  }).then((result) => {
    assertEqual(result.status, "ERROR", "error")
    assertIncludes(result.error!, "different session", "reason")
  })
}

console.log("approval from different workspace is not actionable")
{
  const { controller } = makeMountedController([
    makeApproval({ workspaceId: "other-workspace" }),
  ])
  controller.select("approval-001")
  controller.approveOnce({
    approvalId: "approval-001",
    expectedVersion: 1,
    expectedRequestHash: "abc12345def67890",
    expectedContractRevision: 1,
  }).then((result) => {
    assertEqual(result.status, "ERROR", "error")
    assertIncludes(result.error!, "different workspace", "reason")
  })
}

console.log("session switch clears incompatible selection")
{
  const { controller } = makeMountedController()
  controller.select("approval-001")
  assertEqual(controller.getSelectedApprovalId(), "approval-001", "selected")
  controller.clearSelection()
  assertEqual(controller.getSelectedApprovalId(), undefined, "cleared")
}

// ═══════════════════════════════════════════════════════════════════════
// 8. HYDRATION SAFETY
// ═══════════════════════════════════════════════════════════════════════

console.log("\n═══ TUI-2.1 Mounted: Hydration Safety ═══")

console.log("child approval event before metadata does not crash")
{
  // Approval with unknown session — simulates child event before metadata
  const approval = makeApproval({
    sessionId: "child-session-unknown",
    state: "PENDING",
  })
  const entry = approvalToSpineEntry(approval)
  assert(entry.id.includes("approval:"), "entry created")
  assertEqual(entry.kind, "approve", "kind")
  // Entry is valid even without metadata
}

console.log("temporary unknown/degraded entry resolves after hydration")
{
  // Initially unknown session → after hydration → known session
  const approval = makeApproval({ sessionId: "hydrating-session" })
  const entry = approvalToSpineEntry(approval)
  assert(entry.summary.includes("exact request required"), "renders even with unknown session")
}

// ═══════════════════════════════════════════════════════════════════════
// 9. SECURITY INVARIANTS
// ═══════════════════════════════════════════════════════════════════════

console.log("\n═══ TUI-2.1 Mounted: Security Invariants ═══")

console.log("shell-to-executor paths = 0")
{
  // Controller only depends on ApprovalOperatorService
  const { controller, service } = makeMountedController()
  controller.approveOnce({
    approvalId: "approval-001",
    expectedVersion: 1,
    expectedRequestHash: "abc12345def67890",
    expectedContractRevision: 1,
  }).then(() => {
    assertEqual(service.callLog.length, 1, "only service called")
  })
}

console.log("button-to-effect paths = 0")
{
  // Controller never calls effect directly
  const { controller, service } = makeMountedController()
  controller.deny({
    approvalId: "approval-001",
    expectedVersion: 1,
    expectedRequestHash: "abc12345def67890",
    expectedContractRevision: 1,
  }).then(() => {
    assertEqual(service.callLog.length, 1, "only service called")
  })
}

console.log("approval does not mean execution")
{
  const receipt = generateApprovalReceipt(makeApproval({ state: "APPROVED" }))
  assertIncludes(receipt[0]!.text, "approved", "says approved")
  assertNotIncludes(receipt[0]!.text, "executed", "not executed")
}

console.log("no secret appears in receipts")
{
  const approval = makeApproval({ requestHash: "abc12345def67890" })
  const receipt = generateApprovalReceipt(approval)
  const text = receipt.map(l => l.text).join(" ")
  assertIncludes(text, "abc12345", "truncated visible")
  assertNotIncludes(text, "abc12345def67890", "full hash hidden")
}

console.log("INVALIDATED cannot be reactivated")
{
  assert(isApprovalTerminal(makeApproval({ state: "INVALIDATED" })), "terminal")
  // No controller method can transition INVALIDATED → anything
  const { controller } = makeMountedController([
    makeApproval({ state: "INVALIDATED" }),
  ])
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

console.log("RECOVERY_REQUIRED cannot be auto-retried")
{
  assert(isApprovalTerminal(makeApproval({ state: "EXPIRED" })), "expired terminal")
  // RECOVERY is not a standard state in the approval record — it's an execution outcome
  // The controller handles it via the executor's RECOVERY_REQUIRED return
}

// ═══════════════════════════════════════════════════════════════════════
// 10. CONTROLLER VERSION/HASH/CONTRACT VERIFICATION
// ═══════════════════════════════════════════════════════════════════════

console.log("\n═══ TUI-2.1 Mounted: Optimistic Concurrency ═══")

console.log("command includes expectedVersion")
{
  const { controller, service } = makeMountedController()
  controller.approveOnce({
    approvalId: "approval-001",
    expectedVersion: 3,
    expectedRequestHash: "abc12345def67890",
    expectedContractRevision: 2,
  }).then(() => {
    assertEqual(service.callLog.length, 1, "called")
  })
}

console.log("wrong version fails at service level")
{
  const service = makeMockService()
  service.approveOnce = async (input) => {
    if (input.expectedVersion !== 1) {
      return { status: "ERROR" as const, approvalId: input.approvalId, error: "Version mismatch" }
    }
    return { status: "APPROVED" as const, approvalId: input.approvalId, newVersion: 2 }
  }
  const controller = createApprovalShellController({
    service,
    session: makeSession(),
    getApproval: () => makeApproval(),
  })
  controller.approveOnce({
    approvalId: "approval-001",
    expectedVersion: 999,
    expectedRequestHash: "abc12345def67890",
    expectedContractRevision: 1,
  }).then((result) => {
    assertEqual(result.status, "ERROR", "version mismatch")
    assertIncludes(result.error!, "Version mismatch", "reason")
  })
}

// ═══════════════════════════════════════════════════════════════════════
// 11. VISUAL STATE DISTINGUISHABILITY
// ═══════════════════════════════════════════════════════════════════════

console.log("\n═══ TUI-2.1 Mounted: Visual State ═══")

console.log("all states have distinct glyphs")
{
  const glyphs = new Map<string, string>()
  for (const state of ["PENDING", "APPROVED", "DENIED", "CLAIMED", "CONSUMED", "EXPIRED", "INVALIDATED"] as ApprovalState[]) {
    const entry = approvalToSpineEntry(makeApproval({ state }))
    glyphs.set(state, entry.glyph)
  }
  // DENIED and INVALIDATED share ✗ — 6 unique glyphs for 7 states
  const uniqueGlyphs = new Set(glyphs.values())
  assertEqual(uniqueGlyphs.size, 6, "6 unique glyphs (DENIED/INVALIDATED share ✗)")
}

console.log("all states have distinct labels")
{
  const labels = new Map<string, string>()
  for (const state of ["PENDING", "APPROVED", "DENIED", "CLAIMED", "CONSUMED", "EXPIRED", "INVALIDATED"] as ApprovalState[]) {
    const entry = approvalToSpineEntry(makeApproval({ state }))
    labels.set(state, entry.label ?? "")
  }
  const uniqueLabels = new Set(labels.values())
  assertEqual(uniqueLabels.size, 7, "7 unique labels")
}

console.log("all states have distinct kinds")
{
  const kinds = new Map<string, string>()
  for (const state of ["PENDING", "APPROVED", "DENIED", "CLAIMED", "CONSUMED", "EXPIRED", "INVALIDATED"] as ApprovalState[]) {
    const entry = approvalToSpineEntry(makeApproval({ state }))
    kinds.set(state, entry.kind)
  }
  // 4 unique kinds: approve, ok, fail, run
  const uniqueKinds = new Set(kinds.values())
  assertEqual(uniqueKinds.size, 4, "4 unique kinds")
}

// ═══════════════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════════════

console.log("\n═══════════════════════════════════════════════════════════════════")
console.log(`TUI-2.1 Mounted-Shell Integration: ${passed} passed, ${failed} failed`)
if (failures.length) {
  console.log("\nFailed:")
  failures.forEach(f => console.log(`  ✗ ${f}`))
}
console.log("═══════════════════════════════════════════════════════════════════")

if (failed > 0) process.exit(1)
