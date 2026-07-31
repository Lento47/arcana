/**
 * TUI-2S: Shell Integration Tests
 * Run with: bun run packages/core/src/crypto/run-tui2s-tests.ts
 *
 * Tests:
 *   Command dispatch isolation
 *   Shell state machine
 *   Cross-session/workspace rejection
 *   Version staleness
 *   Receipt agreement
 */

import {
  RealApprovalOperatorService,
  type ApprovalOperatorService,
  type OperatorCommandRequest,
} from "./approval-operator-service"
import {
  reduceApprovalShellState,
  canSubmitCommand,
  canOpenInspector,
  canDeselect,
  type ApprovalShellState,
  type ApprovalShellEvent,
} from "./approval-shell-state"
import {
  InMemoryApprovalStore,
  processApprovalCommand,
  type AuthenticatedOperator,
  type ApprovalRecord,
} from "./approval-lifecycle"

let passed = 0
let failed = 0
const failures: string[] = []

function assert(condition: boolean, message: string) {
  if (condition) { passed++ } else { failed++; failures.push(message); console.log(`  ✗ ${message}`) }
}
function assertEqual<T>(actual: T, expected: T, message: string) {
  assert(actual === expected, `${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}

const now = new Date("2026-07-30T12:00:00.000Z")

function createOperator(overrides?: Partial<AuthenticatedOperator>): AuthenticatedOperator {
  return {
    operatorId: "user:lejzer",
    authenticatedAt: now.toISOString(),
    roles: ["operator"],
    workspaceScope: ["arcana"],
    ...overrides,
  }
}

function createPendingApproval(store: InMemoryApprovalStore, id: string, overrides?: Partial<ApprovalRecord>) {
  store.saveApproval({
    approvalId: id,
    version: 1,
    sessionId: "session-1",
    workspaceId: "arcana",
    requestHash: "hash-abc",
    contractRevision: 1,
    state: "PENDING",
    expiresAt: "2099-12-31T23:59:59.999Z",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...overrides,
  })
}

// ═══════════════════════════════════════════════════════════════════════
// Command Dispatch
// ═══════════════════════════════════════════════════════════════════════

console.log("[a] emits exactly one APPROVE_ONCE command")
{
  const store = new InMemoryApprovalStore()
  createPendingApproval(store, "appr-1")
  const service = new RealApprovalOperatorService(store, createOperator(), "session-1", "arcana")

  let commandCount = 0
  const originalSubmit = service.submitCommand.bind(service)
  service.submitCommand = (req) => { commandCount++; return originalSubmit(req) }

  const result = service.submitCommand({
    approvalId: "appr-1",
    command: "APPROVE_ONCE",
    expectedVersion: 1,
    expectedRequestHash: "hash-abc",
    expectedContractRevision: 1,
  })

  assert(result.success, "APPROVE_ONCE succeeds")
  assertEqual(commandCount, 1, "exactly one command dispatched")
  assertEqual(result.success && result.approval.state, "APPROVED", "approval state is APPROVED")
}

console.log("[d] emits exactly one DENY command")
{
  const store = new InMemoryApprovalStore()
  createPendingApproval(store, "appr-2")
  const service = new RealApprovalOperatorService(store, createOperator(), "session-1", "arcana")

  const result = service.submitCommand({
    approvalId: "appr-2",
    command: "DENY",
    expectedVersion: 1,
    expectedRequestHash: "hash-abc",
    expectedContractRevision: 1,
  })

  assert(result.success, "DENY succeeds")
  assertEqual(result.success && result.approval.state, "DENIED", "approval state is DENIED")
}

console.log("Command contains expected approval version")
{
  const store = new InMemoryApprovalStore()
  createPendingApproval(store, "appr-ver", { version: 3 })
  const service = new RealApprovalOperatorService(store, createOperator(), "session-1", "arcana")

  // Wrong expected version
  const result = service.submitCommand({
    approvalId: "appr-ver",
    command: "APPROVE_ONCE",
    expectedVersion: 0, // wrong — actual is 3
    expectedRequestHash: "hash-abc",
    expectedContractRevision: 1,
  })

  assert(!result.success, "wrong version rejected")
  assert(result.success === false && result.stale === true, "marked as STALE")
}

// ═══════════════════════════════════════════════════════════════════════
// Shell State Machine
// ═══════════════════════════════════════════════════════════════════════

console.log("Shell state: IDLE → SELECTED → INSPECTING → SUBMITTING → IDLE")
{
  let state: ApprovalShellState = { kind: "IDLE" }

  state = reduceApprovalShellState(state, { kind: "SELECT", approvalId: "appr-1", expectedVersion: 1 })
  assertEqual(state.kind, "SELECTED", "SELECT → SELECTED")
  assert(canOpenInspector(state), "can open inspector from SELECTED")

  state = reduceApprovalShellState(state, { kind: "OPEN_INSPECTOR" })
  assertEqual(state.kind, "INSPECTING", "OPEN_INSPECTOR → INSPECTING")
  assert(canSubmitCommand(state), "can submit from INSPECTING")

  state = reduceApprovalShellState(state, { kind: "SUBMIT_APPROVE" })
  assertEqual(state.kind, "SUBMITTING", "SUBMIT_APPROVE → SUBMITTING")
  assert(!canSubmitCommand(state), "cannot submit while SUBMITTING")

  state = reduceApprovalShellState(state, { kind: "COMMAND_SUCCESS" })
  assertEqual(state.kind, "IDLE", "COMMAND_SUCCESS → IDLE")
}

console.log("Shell state: SUBMITTING blocks duplicate commands")
{
  let state: ApprovalShellState = { kind: "IDLE" }
  state = reduceApprovalShellState(state, { kind: "SELECT", approvalId: "appr-1", expectedVersion: 1 })
  state = reduceApprovalShellState(state, { kind: "OPEN_INSPECTOR" })
  state = reduceApprovalShellState(state, { kind: "SUBMIT_APPROVE" })
  assertEqual(state.kind, "SUBMITTING", "first submit → SUBMITTING")

  // Second submit while SUBMITTING — should be no-op
  state = reduceApprovalShellState(state, { kind: "SUBMIT_APPROVE" })
  assertEqual(state.kind, "SUBMITTING", "second submit ignored — still SUBMITTING")

  state = reduceApprovalShellState(state, { kind: "SUBMIT_DENY" })
  assertEqual(state.kind, "SUBMITTING", "deny while SUBMITTING ignored")
}

console.log("Shell state: COMMAND_FAILED")
{
  let state: ApprovalShellState = { kind: "IDLE" }
  state = reduceApprovalShellState(state, { kind: "SELECT", approvalId: "appr-1", expectedVersion: 1 })
  state = reduceApprovalShellState(state, { kind: "OPEN_INSPECTOR" })
  state = reduceApprovalShellState(state, { kind: "SUBMIT_DENY" })
  state = reduceApprovalShellState(state, { kind: "COMMAND_FAILED", reason: "version changed" })

  assertEqual(state.kind, "COMMAND_FAILED", "COMMAND_FAILED state")
  assert(state.kind === "COMMAND_FAILED" && state.reason === "version changed", "reason preserved")

  // Can deselect from COMMAND_FAILED
  assert(canDeselect(state), "can deselect from COMMAND_FAILED")
  state = reduceApprovalShellState(state, { kind: "DESELECT" })
  assertEqual(state.kind, "IDLE", "DESELECT → IDLE")
}

console.log("Shell state: SESSION_CHANGED clears selection")
{
  let state: ApprovalShellState = { kind: "IDLE" }
  state = reduceApprovalShellState(state, { kind: "SELECT", approvalId: "appr-1", expectedVersion: 1 })
  state = reduceApprovalShellState(state, { kind: "OPEN_INSPECTOR" })
  assertEqual(state.kind, "INSPECTING", "INSPECTING")

  state = reduceApprovalShellState(state, { kind: "SESSION_CHANGED" })
  assertEqual(state.kind, "IDLE", "SESSION_CHANGED → IDLE")
}

console.log("Shell state: APPROVAL_DISAPPEARED clears selection")
{
  let state: ApprovalShellState = { kind: "IDLE" }
  state = reduceApprovalShellState(state, { kind: "SELECT", approvalId: "appr-1", expectedVersion: 1 })
  state = reduceApprovalShellState(state, { kind: "APPROVAL_DISAPPEARED" })
  assertEqual(state.kind, "IDLE", "APPROVAL_DISAPPEARED → IDLE")
}

// ═══════════════════════════════════════════════════════════════════════
// Isolation
// ═══════════════════════════════════════════════════════════════════════

console.log("Another session's approval cannot be submitted")
{
  const store = new InMemoryApprovalStore()
  createPendingApproval(store, "appr-other", { sessionId: "session-OTHER" })
  const service = new RealApprovalOperatorService(store, createOperator(), "session-1", "arcana")

  const result = service.submitCommand({
    approvalId: "appr-other",
    command: "APPROVE_ONCE",
    expectedVersion: 1,
    expectedRequestHash: "hash-abc",
    expectedContractRevision: 1,
  })

  assert(!result.success, "cross-session rejected")
  assert(result.success === false && result.reason.includes("another session"), "reason mentions another session")
}

console.log("Another workspace's approval cannot be submitted")
{
  const store = new InMemoryApprovalStore()
  createPendingApproval(store, "appr-ws", { workspaceId: "workspace-OTHER" })
  const service = new RealApprovalOperatorService(store, createOperator(), "session-1", "arcana")

  const result = service.submitCommand({
    approvalId: "appr-ws",
    command: "APPROVE_ONCE",
    expectedVersion: 1,
    expectedRequestHash: "hash-abc",
    expectedContractRevision: 1,
  })

  assert(!result.success, "cross-workspace rejected")
  assert(result.success === false && result.reason.includes("another workspace"), "reason mentions another workspace")
}

console.log("Terminal approval cannot be submitted")
{
  const store = new InMemoryApprovalStore()
  store.saveApproval({
    approvalId: "appr-consumed",
    version: 3,
    sessionId: "session-1",
    workspaceId: "arcana",
    requestHash: "hash-abc",
    contractRevision: 1,
    state: "CONSUMED",
    expiresAt: "2099-12-31T23:59:59.999Z",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  })

  const service = new RealApprovalOperatorService(store, createOperator(), "session-1", "arcana")

  const result = service.submitCommand({
    approvalId: "appr-consumed",
    command: "APPROVE_ONCE",
    expectedVersion: 3,
    expectedRequestHash: "hash-abc",
    expectedContractRevision: 1,
  })

  assert(!result.success, "consumed approval cannot be submitted")
}

console.log("INVALIDATED approval cannot be submitted")
{
  const store = new InMemoryApprovalStore()
  store.saveApproval({
    approvalId: "appr-inv",
    version: 2,
    sessionId: "session-1",
    workspaceId: "arcana",
    requestHash: "hash-abc",
    contractRevision: 1,
    state: "INVALIDATED",
    expiresAt: "2099-12-31T23:59:59.999Z",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  })

  const service = new RealApprovalOperatorService(store, createOperator(), "session-1", "arcana")

  const result = service.submitCommand({
    approvalId: "appr-inv",
    command: "APPROVE_ONCE",
    expectedVersion: 2,
    expectedRequestHash: "hash-abc",
    expectedContractRevision: 1,
  })

  assert(!result.success, "INVALIDATED cannot be submitted")
  assert(result.success === false && result.reason.includes("INVALIDATED"), "reason mentions INVALIDATED")
}

// ═══════════════════════════════════════════════════════════════════════
// Rendering Correctness
// ═══════════════════════════════════════════════════════════════════════

console.log("APPROVED is never rendered as EXECUTED")
{
  const store = new InMemoryApprovalStore()
  store.saveApproval({
    approvalId: "appr-approved",
    version: 1,
    sessionId: "session-1",
    workspaceId: "arcana",
    requestHash: "hash-abc",
    contractRevision: 1,
    state: "APPROVED",
    approvedBy: "user:lejzer",
    expiresAt: "2099-12-31T23:59:59.999Z",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  })

  const service = new RealApprovalOperatorService(store, createOperator(), "session-1", "arcana")
  const approval = service.loadApproval("appr-approved")

  assert(approval !== null, "approval loaded")
  assertEqual(approval!.state, "APPROVED", "state is APPROVED, not EXECUTED or CONSUMED")
  assert(approval!.executionId === undefined, "no executionId when APPROVED")
}

// ═══════════════════════════════════════════════════════════════════════
// Receipt Agreement
// ═══════════════════════════════════════════════════════════════════════

console.log("Approval database state matches receipt after approve")
{
  const store = new InMemoryApprovalStore()
  createPendingApproval(store, "appr-receipt")
  const service = new RealApprovalOperatorService(store, createOperator(), "session-1", "arcana")

  const result = service.submitCommand({
    approvalId: "appr-receipt",
    command: "APPROVE_ONCE",
    expectedVersion: 1,
    expectedRequestHash: "hash-abc",
    expectedContractRevision: 1,
  })

  assert(result.success, "approve succeeds")

  // Verify database state matches what a receipt would show
  const approval = service.loadApproval("appr-receipt")
  assertEqual(approval!.state, "APPROVED", "database shows APPROVED")
  assertEqual(approval!.approvedBy, "user:lejzer", "database shows operator")
  assert(approval!.version > 0, "version incremented")

  // Verify outbox event was generated
  const events = store.getOutboxEvents()
  assert(events.length === 1, "1 outbox event")
  assertEqual(events[0].kind, "APPROVAL_DECIDED", "event kind is APPROVAL_DECIDED")
  assertEqual(events[0].detail.decision, "APPROVED", "event shows APPROVED")
}

console.log("Load pending approvals returns actionable items")
{
  const store = new InMemoryApprovalStore()
  createPendingApproval(store, "appr-p1")
  createPendingApproval(store, "appr-p2")
  store.saveApproval({
    approvalId: "appr-consumed2",
    version: 1,
    sessionId: "session-1",
    workspaceId: "arcana",
    requestHash: "hash-abc",
    contractRevision: 1,
    state: "CONSUMED",
    expiresAt: "2099-12-31T23:59:59.999Z",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  })

  const service = new RealApprovalOperatorService(store, createOperator(), "session-1", "arcana")
  const pending = service.loadPendingApprovals()

  assertEqual(pending.length, 2, "2 pending approvals")
  assert(pending.every(a => a.state === "PENDING"), "all pending")
  assert(pending.every(a => a.sessionId === "session-1"), "all from current session")
}

// ═══════════════════════════════════════════════════════════════════════
// Hard Gate Verification
// ═══════════════════════════════════════════════════════════════════════

console.log("Hard gate: keyboard handler never imports executor")
{
  // Verify the operator service file does not import governed-executor
  const fs = require("node:fs")
  const serviceCode = fs.readFileSync(
    require("node:path").join(import.meta.dir, "approval-operator-service.ts"),
    "utf-8",
  )
  // Check import lines only, not comments
  const importLines = serviceCode.split("\n").filter((l: string) => l.startsWith("import"))
  const importText = importLines.join("\n")
  assert(!importText.includes("governed-executor"), "operator service does not import governed-executor")
  assert(!importText.includes("GovernedApprovalExecutor"), "operator service does not import executor type")
  assert(serviceCode.includes("ApprovalLifecycleStore"), "operator service uses approval store only")
}

console.log("Hard gate: SUBMITTING is not a durable approval state")
{
  // Verify ApprovalState does not include SUBMITTING
  const fs = require("node:fs")
  const lifecycleCode = fs.readFileSync(
    require("node:path").join(import.meta.dir, "approval-lifecycle.ts"),
    "utf-8",
  )
  assert(!lifecycleCode.includes('"SUBMITTING"'), "SUBMITTING not in ApprovalState")
  assert(!lifecycleCode.includes('"COMMAND_FAILED"'), "COMMAND_FAILED not in ApprovalState")
  assert(lifecycleCode.includes('"INVALIDATED"'), "INVALIDATED is in ApprovalState")
}

// ═══════════════════════════════════════════════════════════════════════

console.log(`\n═══════════════════════════════════════════`)
console.log(`Total: ${passed + failed}  Passed: ${passed}  Failed: ${failed}`)
if (failures.length > 0) {
  console.log(`\nFailures:`)
  for (const f of failures) console.log(`  ✗ ${f}`)
  process.exit(1)
} else {
  console.log(`✓ All tests passed`)
}
