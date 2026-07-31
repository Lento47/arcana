/**
 * D-8A: Deterministic Local Proof Batching Tests
 * Run with: bun run packages/core/src/crypto/run-d8a-tests.ts
 */

import {
  buildProofBatch,
  computeMerkleRoot,
  computeBatchRoot,
  verifyBatchPayload,
  detectBatchGaps,
  type SequencedRunProof,
  type NodeProofBatchPayload,
  type ProofBatchPolicy,
} from "./proof-batching"

let passed = 0
let failed = 0
const failures: string[] = []

function assert(condition: boolean, message: string) {
  if (condition) { passed++ } else { failed++; failures.push(message); console.log(`  ✗ ${message}`) }
}
function assertEqual<T>(actual: T, expected: T, message: string) {
  assert(actual === expected, `${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}

// ─── Helpers ────────────────────────────────────────────────────────

function createProof(seq: number): SequencedRunProof {
  const hash = `proof-hash-${seq}`
  return {
    localSequence: seq,
    runProofHash: hash,
    evidenceHash: `evidence-${seq}`,
    traceHealth: "COMPLETE",
    timestamp: `2026-07-30T12:${String(seq).padStart(2, "0")}:00.000Z`,
  }
}

const CTX = {
  trustDomain: "arcana.local",
  nodeId: "node-local-01",
  nodeKeyEpoch: 1,
  policySequence: 5,
  policyDigest: "pd-abc",
  revocationSequence: 3,
  revocationDigest: "rd-xyz",
  emergencyEpoch: 0,
  issuedAt: "2026-07-30T12:00:00.000Z",
}

// ═══════════════════════════════════════════════════════════════════════
// Merkle Root
// ═══════════════════════════════════════════════════════════════════════

console.log("Merkle root: empty list")
{
  const root = computeMerkleRoot([])
  assert(root.length === 64, "empty Merkle root is 64 chars")
  // Deterministic
  assertEqual(computeMerkleRoot([]), root, "empty Merkle is deterministic")
}

console.log("Merkle root: single element")
{
  const root = computeMerkleRoot(["abc123"])
  assertEqual(root, "abc123", "single element Merkle is the element itself")
}

console.log("Merkle root: two elements")
{
  const root = computeMerkleRoot(["aaa", "bbb"])
  assert(root.length === 64, "two-element Merkle root is 64 chars")
  // Order matters
  const root2 = computeMerkleRoot(["bbb", "aaa"])
  assert(root !== root2, "order matters for Merkle root")
}

console.log("Merkle root: deterministic")
{
  const hashes = ["a", "b", "c", "d", "e"]
  const r1 = computeMerkleRoot(hashes)
  const r2 = computeMerkleRoot(hashes)
  assertEqual(r1, r2, "same input → same Merkle root")
}

console.log("Merkle root: odd count")
{
  const root = computeMerkleRoot(["a", "b", "c"])
  assert(root.length === 64, "odd count produces valid root")
}

// ═══════════════════════════════════════════════════════════════════════
// Batch Building
// ═══════════════════════════════════════════════════════════════════════

console.log("Build batch: valid sequence")
{
  const proofs = [createProof(1), createProof(2), createProof(3)]
  const result = buildProofBatch(proofs, CTX)

  assert(result.success, "batch builds successfully")
  if (result.success) {
    assertEqual(result.payload.firstLocalSequence, 1, "first sequence")
    assertEqual(result.payload.lastLocalSequence, 3, "last sequence")
    assertEqual(result.payload.runProofHashes.length, 3, "3 proof hashes")
    assert(result.batchRoot.length === 64, "batch root is 64 chars")
    assert(result.eventMerkleRoot.length === 64, "Merkle root is 64 chars")
    assertEqual(result.payload.trustDomain, "arcana.local", "trust domain preserved")
    assertEqual(result.payload.nodeId, "node-local-01", "node ID preserved")
    assertEqual(result.payload.policySequence, 5, "policy sequence preserved")
  }
}

console.log("Build batch: gap detection")
{
  const proofs = [createProof(1), createProof(3)] // missing seq 2
  const result = buildProofBatch(proofs, CTX)

  assert(!result.success, "gap rejected")
  assert(result.success === false && result.reason.includes("gap"), "reason mentions gap")
  assert(result.success === false && result.reason.includes("2"), "mentions missing sequence 2")
}

console.log("Build batch: duplicate sequence rejected")
{
  const proofs = [createProof(1), createProof(1)]
  const result = buildProofBatch(proofs, CTX)

  assert(!result.success, "duplicate rejected")
  assert(result.success === false && result.reason.includes("duplicate"), "reason mentions duplicate")
}

console.log("Build batch: empty input rejected")
{
  const result = buildProofBatch([], CTX)
  assert(!result.success, "empty input rejected")
}

console.log("Build batch: too many proofs rejected")
{
  const policy: ProofBatchPolicy = { maximumEvents: 1000, maximumBatchBytes: 256 * 1024, maximumRunProofs: 2, maximumBatchAgeMs: 5 * 60 * 1000 }
  const proofs = [createProof(1), createProof(2), createProof(3)]
  const result = buildProofBatch(proofs, CTX, policy)

  assert(!result.success, "too many proofs rejected")
  assert(result.success === false && result.reason.includes("too many"), "reason mentions too many")
}

console.log("Build batch: sequence discontinuity from previous batch")
{
  const proofs = [createProof(5), createProof(6)]
  const result = buildProofBatch(proofs, {
    ...CTX,
    lastBatchLastSequence: 3,
  })

  assert(!result.success, "discontinuity rejected")
  assert(result.success === false && result.reason.includes("discontinuity"), "reason mentions discontinuity")
}

console.log("Build batch: continuation from previous batch")
{
  const proofs = [createProof(4), createProof(5)]
  const result = buildProofBatch(proofs, {
    ...CTX,
    previousBatchRoot: "prev-batch-root-abc",
    lastBatchLastSequence: 3,
  })

  assert(result.success, "continuation builds successfully")
  if (result.success) {
    assertEqual(result.payload.previousBatchRoot, "prev-batch-root-abc", "previous batch root preserved")
    assertEqual(result.payload.firstLocalSequence, 4, "starts after previous batch")
  }
}

console.log("Build batch: discontinuity from previous batch")
{
  const proofs = [createProof(10), createProof(11)]
  const result = buildProofBatch(proofs, {
    ...CTX,
    lastBatchLastSequence: 3,
  })

  assert(!result.success, "discontinuity rejected")
  assert(result.success === false && result.reason.includes("discontinuity"), "reason mentions discontinuity")
}

// ═══════════════════════════════════════════════════════════════════════
// Determinism
// ═══════════════════════════════════════════════════════════════════════

console.log("Determinism: same input → same batch root")
{
  const proofs = [createProof(1), createProof(2), createProof(3)]
  const r1 = buildProofBatch(proofs, CTX)
  const r2 = buildProofBatch(proofs, CTX)

  assert(r1.success && r2.success, "both build")
  if (r1.success && r2.success) {
    assertEqual(r1.batchRoot, r2.batchRoot, "same batch root")
    assertEqual(r1.eventMerkleRoot, r2.eventMerkleRoot, "same Merkle root")
  }
}

console.log("Determinism: different input → different batch root")
{
  const proofs1 = [createProof(1), createProof(2)]
  const proofs2 = [createProof(4), createProof(5)]
  const r1 = buildProofBatch(proofs1, CTX)
  const r2 = buildProofBatch(proofs2, { ...CTX, lastBatchLastSequence: undefined })

  assert(r1.success && r2.success, "both build")
  if (r1.success && r2.success) {
    assert(r1.batchRoot !== r2.batchRoot, "different input → different batch root")
    assert(r1.eventMerkleRoot !== r2.eventMerkleRoot, "different input → different Merkle root")
  }
}

console.log("Determinism: unsorted input → same result")
{
  const sorted = [createProof(1), createProof(2), createProof(3)]
  const unsorted = [createProof(3), createProof(1), createProof(2)]
  const r1 = buildProofBatch(sorted, CTX)
  const r2 = buildProofBatch(unsorted, CTX)

  assert(r1.success && r2.success, "both build")
  if (r1.success && r2.success) {
    assertEqual(r1.batchRoot, r2.batchRoot, "unsorted → same batch root")
    assertEqual(r1.payload.firstLocalSequence, 1, "sorted internally")
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Verification
// ═══════════════════════════════════════════════════════════════════════

console.log("Verify: valid payload passes")
{
  const proofs = [createProof(1), createProof(2)]
  const result = buildProofBatch(proofs, CTX)
  assert(result.success, "builds")
  if (result.success) {
    const v = verifyBatchPayload(result.payload)
    assert(v.valid === true, "valid payload passes verification")
  }
}

console.log("Verify: Merkle root mismatch detected")
{
  const proofs = [createProof(1), createProof(2)]
  const result = buildProofBatch(proofs, CTX)
  assert(result.success, "builds")
  if (result.success) {
    const tampered = { ...result.payload, eventMerkleRoot: "tampered" }
    const v = verifyBatchPayload(tampered)
    assert(v.valid === false && v.reason.includes("Merkle"), "Merkle mismatch detected")
  }
}

console.log("Verify: proof count mismatch detected")
{
  const proofs = [createProof(1), createProof(2), createProof(3)]
  const result = buildProofBatch(proofs, CTX)
  assert(result.success, "builds")
  if (result.success) {
    // Remove one hash
    const tampered = { ...result.payload, runProofHashes: ["a", "b"] }
    const v = verifyBatchPayload(tampered)
    assert(v.valid === false && v.reason.includes("count"), "count mismatch detected")
  }
}

console.log("Verify: previous batch root mismatch detected")
{
  const proofs = [createProof(1)]
  const result = buildProofBatch(proofs, { ...CTX, previousBatchRoot: "correct" })
  assert(result.success, "builds")
  if (result.success) {
    const v = verifyBatchPayload(result.payload, "wrong-previous")
    assert(v.valid === false && v.reason.includes("previous"), "previous root mismatch detected")
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Gap Detection
// ═══════════════════════════════════════════════════════════════════════

console.log("Gap detection: no gaps")
{
  const batch1: NodeProofBatchPayload = {
    schemaVersion: 1, trustDomain: "td", nodeId: "n", nodeKeyEpoch: 1,
    firstLocalSequence: 1, lastLocalSequence: 3, eventMerkleRoot: "m",
    runProofHashes: ["a", "b", "c"], policySequence: 1, policyDigest: "p",
    revocationSequence: 1, revocationDigest: "r", emergencyEpoch: 0, issuedAt: "",
  }
  const batch2: NodeProofBatchPayload = {
    ...batch1, firstLocalSequence: 4, lastLocalSequence: 6,
    runProofHashes: ["d", "e", "f"], previousBatchRoot: "root1",
  }

  const gaps = detectBatchGaps([batch1, batch2])
  assert(!gaps.hasGaps, "no gaps")
  assertEqual(gaps.nextExpected, 7, "next expected is 7")
}

console.log("Gap detection: gap found")
{
  const batch1: NodeProofBatchPayload = {
    schemaVersion: 1, trustDomain: "td", nodeId: "n", nodeKeyEpoch: 1,
    firstLocalSequence: 1, lastLocalSequence: 3, eventMerkleRoot: "m",
    runProofHashes: ["a", "b", "c"], policySequence: 1, policyDigest: "p",
    revocationSequence: 1, revocationDigest: "r", emergencyEpoch: 0, issuedAt: "",
  }
  const batch2: NodeProofBatchPayload = {
    ...batch1, firstLocalSequence: 7, lastLocalSequence: 9,
    runProofHashes: ["g", "h", "i"],
  }

  const gaps = detectBatchGaps([batch1, batch2])
  assert(gaps.hasGaps, "gap found")
  assertEqual(gaps.gaps.length, 1, "one gap")
  assertEqual(gaps.gaps[0].from, 4, "gap from 4")
  assertEqual(gaps.gaps[0].to, 6, "gap to 6")
}

// ═══════════════════════════════════════════════════════════════════════
// Batch Root
// ═══════════════════════════════════════════════════════════════════════

console.log("Batch root: deterministic")
{
  const payload: NodeProofBatchPayload = {
    schemaVersion: 1, trustDomain: "td", nodeId: "n", nodeKeyEpoch: 1,
    firstLocalSequence: 1, lastLocalSequence: 2, eventMerkleRoot: "m",
    runProofHashes: ["a", "b"], policySequence: 1, policyDigest: "p",
    revocationSequence: 1, revocationDigest: "r", emergencyEpoch: 0,
    issuedAt: "2026-07-30T12:00:00.000Z",
  }

  const r1 = computeBatchRoot(payload)
  const r2 = computeBatchRoot(payload)
  assertEqual(r1, r2, "same payload → same root")
  assert(r1.length === 64, "root is 64 chars")
}

console.log("Batch root: different payload → different root")
{
  const p1: NodeProofBatchPayload = {
    schemaVersion: 1, trustDomain: "td", nodeId: "n", nodeKeyEpoch: 1,
    firstLocalSequence: 1, lastLocalSequence: 2, eventMerkleRoot: "m1",
    runProofHashes: ["a", "b"], policySequence: 1, policyDigest: "p",
    revocationSequence: 1, revocationDigest: "r", emergencyEpoch: 0, issuedAt: "",
  }
  const p2: NodeProofBatchPayload = {
    ...p1, eventMerkleRoot: "m2",
  }

  assert(computeBatchRoot(p1) !== computeBatchRoot(p2), "different Merkle → different root")
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
