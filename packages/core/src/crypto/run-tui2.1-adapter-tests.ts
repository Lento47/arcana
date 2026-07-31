/**
 * TUI-2.1: Approval Spine Adapter Tests
 * Run with: bun run packages/core/src/crypto/run-tui2.1-adapter-tests.ts
 *
 * Tests the mapping from ApprovalRecord to SpineEntry.
 */

import {
  approvalToSpineEntry,
  isApprovalActionable,
  isApprovalTerminal,
  generateApprovalReceipt,
  generateRecoveryPresentation,
  generateInvalidatedPresentation,
} from "../../../../packages/tui/src/shell/command-spine/approval-spine-adapter"
import type { ApprovalRecord, ApprovalState } from "./approval-lifecycle"

let passed = 0
let failed = 0
const failures: string[] = []

function assert(condition: boolean, message: string) {
  if (condition) { passed++ } else { failed++; failures.push(message); console.log(`  ✗ ${message}`) }
}
function assertEqual<T>(actual: T, expected: T, message: string) {
  assert(actual === expected, `${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}

const now = new Date("2026-07-30T12:00:00.000Z").toISOString()

function createApproval(state: ApprovalState, overrides?: Partial<ApprovalRecord>): ApprovalRecord {
  return {
    approvalId: "appr-test",
    version: 1,
    sessionId: "session-1",
    workspaceId: "arcana",
    requestHash: "abc123def456",
    contractRevision: 1,
    state,
    approvedBy: state !== "PENDING" ? "user:lejzer" : undefined,
    executionId: ["CLAIMED", "CONSUMED"].includes(state) ? "exec-001" : undefined,
    expiresAt: "2099-12-31T23:59:59.999Z",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Approval → SpineEntry mapping
// ═══════════════════════════════════════════════════════════════════════

console.log("PENDING approval renders as actionable")
{
  const approval = createApproval("PENDING")
  const entry = approvalToSpineEntry(approval)

  assertEqual(entry.kind, "approve", "kind is approve")
  assert(entry.summary.includes("exact request required"), "summary mentions request required")
  assert(entry.collapsible === true, "collapsible")
  assert(entry.expandedByDefault === true, "expanded by default (actionable)")
  assert(entry.source?.kind === "approve", "source kind is approve")
}

console.log("APPROVED renders authorized, not executed")
{
  const approval = createApproval("APPROVED")
  const entry = approvalToSpineEntry(approval)

  assertEqual(entry.kind, "ok", "kind is ok")
  assert(entry.summary.includes("approved once"), "summary mentions approved")
  assert(entry.summary.includes("user:lejzer"), "summary mentions operator")
  assert(!entry.summary.includes("executed"), "does NOT say executed")
  assert(!entry.summary.includes("CONSUMED"), "does NOT say consumed")
  assert(entry.expandedByDefault === false, "not expanded (not actionable)")
}

console.log("CLAIMED renders execution in progress")
{
  const approval = createApproval("CLAIMED")
  const entry = approvalToSpineEntry(approval)

  assertEqual(entry.kind, "run", "kind is run")
  assert(entry.summary.includes("claimed"), "summary mentions claimed")
  assert(entry.summary.includes("exec-001"), "summary includes execution ID")
  assert(!entry.summary.includes("succeeded"), "does NOT say succeeded")
}

console.log("CONSUMED renders terminal success")
{
  const approval = createApproval("CONSUMED")
  const entry = approvalToSpineEntry(approval)

  assertEqual(entry.kind, "ok", "kind is ok")
  assert(entry.summary.includes("consumed"), "summary mentions consumed")
  assert(entry.summary.includes("exec-001"), "summary includes execution ID")
}

console.log("INVALIDATED renders terminal failure")
{
  const approval = createApproval("INVALIDATED")
  const entry = approvalToSpineEntry(approval)

  assertEqual(entry.kind, "fail", "kind is fail")
  assert(entry.summary.includes("invalidated"), "summary mentions invalidated")
  assert(entry.summary.includes("new authorization required"), "mentions new auth required")
}

console.log("DENIED renders terminal failure")
{
  const approval = createApproval("DENIED")
  const entry = approvalToSpineEntry(approval)

  assertEqual(entry.kind, "fail", "kind is fail")
  assert(entry.summary.includes("denied"), "summary mentions denied")
}

console.log("EXPIRED renders muted")
{
  const approval = createApproval("EXPIRED")
  const entry = approvalToSpineEntry(approval)

  assertEqual(entry.kind, "fail", "kind is fail")
  assert(entry.summary.includes("expired"), "summary mentions expired")
}

console.log("Body contains all canonical fields")
{
  const approval = createApproval("PENDING")
  const entry = approvalToSpineEntry(approval)

  assert(entry.body !== undefined, "body exists")
  assert(entry.body!.includes("appr-test"), "body includes approval ID")
  assert(entry.body!.includes("session-1"), "body includes session")
  assert(entry.body!.includes("arcana"), "body includes workspace")
  assert(entry.body!.includes("abc123def456"), "body includes request hash")
  assert(entry.body!.includes("1"), "body includes contract revision")
}

// ═══════════════════════════════════════════════════════════════════════
// Actionability
// ═══════════════════════════════════════════════════════════════════════

console.log("Actionability: only PENDING is actionable")
{
  assert(isApprovalActionable(createApproval("PENDING")), "PENDING is actionable")
  assert(!isApprovalActionable(createApproval("APPROVED")), "APPROVED is not actionable")
  assert(!isApprovalActionable(createApproval("CLAIMED")), "CLAIMED is not actionable")
  assert(!isApprovalActionable(createApproval("CONSUMED")), "CONSUMED is not actionable")
  assert(!isApprovalActionable(createApproval("DENIED")), "DENIED is not actionable")
  assert(!isApprovalActionable(createApproval("INVALIDATED")), "INVALIDATED is not actionable")
  assert(!isApprovalActionable(createApproval("EXPIRED")), "EXPIRED is not actionable")
}

console.log("Terminal states")
{
  assert(!isApprovalTerminal(createApproval("PENDING")), "PENDING is not terminal")
  assert(!isApprovalTerminal(createApproval("APPROVED")), "APPROVED is not terminal")
  assert(!isApprovalTerminal(createApproval("CLAIMED")), "CLAIMED is not terminal")
  assert(isApprovalTerminal(createApproval("CONSUMED")), "CONSUMED is terminal")
  assert(isApprovalTerminal(createApproval("DENIED")), "DENIED is terminal")
  assert(isApprovalTerminal(createApproval("INVALIDATED")), "INVALIDATED is terminal")
  assert(isApprovalTerminal(createApproval("EXPIRED")), "EXPIRED is terminal")
}

// ═══════════════════════════════════════════════════════════════════════
// Receipt generation
// ═══════════════════════════════════════════════════════════════════════

console.log("Receipt: CONSUMED shows success")
{
  const receipt = generateApprovalReceipt(createApproval("CONSUMED"))
  assert(receipt.length >= 1, "CONSUMED has at least one line")
  assert(receipt[0].glyph === "✓", "first line has success glyph")
  assert(receipt[0].tone === "success", "first line has success tone")
  assert(receipt.some(l => l.text.includes("consumed")), "mentions consumed")
}

console.log("Receipt: INVALIDATED shows error")
{
  const receipt = generateApprovalReceipt(createApproval("INVALIDATED"))
  assert(receipt.some(l => l.glyph === "×"), "has INVALIDATED glyph")
  assert(receipt.some(l => l.text.includes("invalidated")), "mentions invalidated")
  assert(receipt.some(l => l.text.includes("new authorization")), "mentions new auth")
  assert(receipt.every(l => l.tone === "error" || l.tone === "muted"), "all lines error/muted")
}

console.log("Receipt: DENIED shows error")
{
  const receipt = generateApprovalReceipt(createApproval("DENIED"))
  assert(receipt.some(l => l.glyph === "✗"), "has DENIED glyph")
  assert(receipt.some(l => l.text.includes("denied")), "mentions denied")
}

console.log("Recovery presentation is persistent and clear")
{
  const presentation = generateRecoveryPresentation("exec-001")
  assert(presentation.length >= 4, "multiple lines")
  assert(presentation[0].glyph === "!", "first line has ! glyph")
  assert(presentation[0].text.includes("recovery required"), "mentions recovery required")
  assert(presentation.some(l => l.text.includes("uncertain")), "mentions uncertain")
  assert(presentation.some(l => l.text.includes("blocked")), "mentions blocked")
  assert(presentation.some(l => l.text.includes("exec-001")), "includes execution ID")
  assert(presentation.some(l => l.text.includes("manual")), "mentions manual")
}

console.log("Invalidated presentation shows reason")
{
  const presentation = generateInvalidatedPresentation("appr-1", "capability revoked")
  assert(presentation.length >= 3, "multiple lines")
  assert(presentation[0].glyph === "×", "first line has × glyph")
  assert(presentation.some(l => l.text.includes("capability revoked")), "includes reason")
  assert(presentation.some(l => l.text.includes("new approval required")), "mentions new approval")
}

// ═══════════════════════════════════════════════════════════════════════
// Security state discrimination
// ═══════════════════════════════════════════════════════════════════════

console.log("APPROVED ≠ EXECUTED: distinct rendering")
{
  const approved = approvalToSpineEntry(createApproval("APPROVED"))
  const consumed = approvalToSpineEntry(createApproval("CONSUMED"))

  assert(approved.kind !== consumed.kind || approved.summary !== consumed.summary,
    "APPROVED and CONSUMED render differently")
  assert(!approved.summary.includes("executed"), "APPROVED does not say executed")
  assert(consumed.summary.includes("consumed"), "CONSUMED says consumed")
}

console.log("CLAIMED ≠ SUCCEEDED: distinct rendering")
{
  const claimed = approvalToSpineEntry(createApproval("CLAIMED"))
  const consumed = approvalToSpineEntry(createApproval("CONSUMED"))

  assert(claimed.summary.includes("claimed"), "CLAIMED says claimed")
  assert(consumed.summary.includes("consumed"), "CONSUMED says consumed")
  assert(!claimed.summary.includes("consumed"), "CLAIMED does not say consumed")
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
