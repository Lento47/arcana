/**
 * D-7P: RunProof Integration Tests
 * Run with: bun run packages/core/src/crypto/run-d7p-tests.ts
 *
 * Tests the complete causal chain from signed envelope to RunProof.
 */

import {
  RunProofBuilder,
  verifyRunProofConsistency,
  checkRunProofAgreement,
  type DistributedRunProof,
  type RunProofEvent,
} from "./runproof"

let passed = 0
let failed = 0
const failures: string[] = []

function assert(condition: boolean, message: string) {
  if (condition) { passed++ } else { failed++; failures.push(message); console.log(`  ✗ ${message}`) }
}
function assertEqual<T>(actual: T, expected: T, message: string) {
  assert(actual === expected, `${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}

// ═══════════════════════════════════════════════════════════════════════
// Valid distributed read → RunProof COMPLETE
// ═══════════════════════════════════════════════════════════════════════

console.log("Valid distributed read → RunProof COMPLETE")
{
  const builder = new RunProofBuilder("node-local-01", "session-abc")

  const envelopeEvent = builder.appendEvent("DISTRIBUTED_ENVELOPE_RECEIVED", {
    envelopeHash: "abc123",
    envelopeSchema: "SIGNED_CAPABILITY_V1",
  })

  const verifyEvent = builder.appendEvent("DISTRIBUTED_VERIFICATION_PASSED", {
    issuerId: "trust-registry",
    issuerEpoch: 1,
  }, envelopeEvent.eventId)

  const grantEvent = builder.appendEvent("LOCAL_GRANT_DERIVED", {
    localGrantId: "local-001",
    effectiveExpiresAt: "2099-12-31T23:59:59.999Z",
  }, verifyEvent.eventId)

  const pdpEvent = builder.appendEvent("LOCAL_PDP_ALLOW", {
    reason: "derived grant permits exact action",
  }, grantEvent.eventId)

  const pepEvent = builder.appendEvent("PEP_RECHECK_PASSED", {
    workloadStable: true,
    nodeTrusted: true,
  }, pdpEvent.eventId)

  const effectEvent = builder.appendEvent("EFFECT_EXECUTED", {
    kind: "FILESYSTEM_READ",
    resource: "docs/security/PHASE-C-MILESTONE.md",
    bytesRead: 1024,
  }, pepEvent.eventId)

  const receiptEvent = builder.appendEvent("EFFECT_RECEIPT", {
    contentHash: "def456",
    receiptHash: "ghi789",
  }, effectEvent.eventId)

  const proof = builder.build()

  assertEqual(proof.traceHealth, "COMPLETE", "trace health is COMPLETE")
  assertEqual(proof.integrityStatus, "VALID", "integrity is VALID")
  assert(proof.events.length === 7, "7 events recorded")
  assert(proof.envelopeEventId !== undefined, "envelope event linked")
  assert(proof.verificationEventId !== undefined, "verification event linked")
  assert(proof.grantEventId !== undefined, "grant event linked")
  assert(proof.pdpEventId !== undefined, "PDP event linked")
  assert(proof.pepEventId !== undefined, "PEP event linked")
  assert(proof.effectEventId !== undefined, "effect event linked")
  assert(proof.receiptEventId !== undefined, "receipt event linked")
  assert(proof.evidenceHash.length === 64, "evidence hash computed")

  // Verify consistency
  const consistency = verifyRunProofConsistency(proof)
  assert(consistency.consistent === true, `RunProof consistent: ${!consistency.consistent ? consistency.reason : ""}`)

  // Verify agreement
  const agreement = checkRunProofAgreement(proof, {
    verificationPassed: true,
    pdpAllowed: true,
    effectExecuted: true,
  })
  assert(agreement.agreed === true, "RunProof agrees with expected outcome")
}

// ═══════════════════════════════════════════════════════════════════════
// Verification denied → no effect receipt
// ═══════════════════════════════════════════════════════════════════════

console.log("Distributed verification denied → no effect")
{
  const builder = new RunProofBuilder("node-local-01", "session-abc")

  builder.appendEvent("DISTRIBUTED_ENVELOPE_RECEIVED", { envelopeHash: "abc" })
  builder.appendEvent("DISTRIBUTED_VERIFICATION_FAILED", { reason: "INVALID_SIGNATURE" })

  const proof = builder.build()

  assertEqual(proof.traceHealth, "COMPLETE", "denied path is COMPLETE")
  assert(proof.effectEventId === undefined, "no effect event")
  assert(proof.receiptEventId === undefined, "no receipt event")

  const agreement = checkRunProofAgreement(proof, {
    verificationPassed: false,
    effectExecuted: false,
  })
  assert(agreement.agreed === true, "RunProof agrees: no verification pass, no effect")
}

// ═══════════════════════════════════════════════════════════════════════
// Local PDP denied → no effect receipt
// ═══════════════════════════════════════════════════════════════════════

console.log("Local PDP denied → no effect")
{
  const builder = new RunProofBuilder("node-local-01", "session-abc")

  builder.appendEvent("DISTRIBUTED_ENVELOPE_RECEIVED", { envelopeHash: "abc" })
  builder.appendEvent("DISTRIBUTED_VERIFICATION_PASSED", {})
  builder.appendEvent("LOCAL_GRANT_DERIVED", {})
  builder.appendEvent("LOCAL_PDP_DENY", { reason: "node quarantined" })

  const proof = builder.build()

  assertEqual(proof.traceHealth, "COMPLETE", "denied path is COMPLETE")
  assert(proof.effectEventId === undefined, "no effect event after PDP deny")
}

// ═══════════════════════════════════════════════════════════════════════
// PEP freshness failed → no effect
// ═══════════════════════════════════════════════════════════════════════

console.log("PEP freshness failed → no effect")
{
  const builder = new RunProofBuilder("node-local-01", "session-abc")

  builder.appendEvent("DISTRIBUTED_ENVELOPE_RECEIVED", { envelopeHash: "abc" })
  builder.appendEvent("DISTRIBUTED_VERIFICATION_PASSED", {})
  builder.appendEvent("LOCAL_GRANT_DERIVED", {})
  builder.appendEvent("LOCAL_PDP_ALLOW", {})
  builder.appendEvent("PEP_RECHECK_FAILED", { reason: "workload identity stale" })

  const proof = builder.build()

  assertEqual(proof.traceHealth, "COMPLETE", "PEP deny path is COMPLETE")
  assert(proof.effectEventId === undefined, "no effect after PEP failure")
}

// ═══════════════════════════════════════════════════════════════════════
// Effect succeeded, evidence append failed → trace DEGRADED
// ═══════════════════════════════════════════════════════════════════════

console.log("Effect succeeded, envelope event missing → trace DEGRADED")
{
  const builder = new RunProofBuilder("node-local-01", "session-abc")

  // Skip envelope event — simulate missing
  builder.appendEvent("DISTRIBUTED_VERIFICATION_PASSED", {})
  builder.appendEvent("LOCAL_GRANT_DERIVED", {})
  builder.appendEvent("LOCAL_PDP_ALLOW", {})
  builder.appendEvent("PEP_RECHECK_PASSED", {})
  builder.appendEvent("EFFECT_EXECUTED", { kind: "FILESYSTEM_READ" })
  builder.appendEvent("EFFECT_RECEIPT", { receiptHash: "abc" })

  const proof = builder.build()

  assertEqual(proof.traceHealth, "DEGRADED", "missing envelope event → DEGRADED")
}

// ═══════════════════════════════════════════════════════════════════════
// Derived grant event missing → trace DEGRADED
// ═══════════════════════════════════════════════════════════════════════

console.log("Derived grant event missing → trace DEGRADED")
{
  const builder = new RunProofBuilder("node-local-01", "session-abc")

  builder.appendEvent("DISTRIBUTED_ENVELOPE_RECEIVED", { envelopeHash: "abc" })
  builder.appendEvent("DISTRIBUTED_VERIFICATION_PASSED", {})
  // Skip grant derivation
  builder.appendEvent("LOCAL_PDP_ALLOW", {})
  builder.appendEvent("PEP_RECHECK_PASSED", {})
  builder.appendEvent("EFFECT_EXECUTED", { kind: "FILESYSTEM_READ" })
  builder.appendEvent("EFFECT_RECEIPT", { receiptHash: "abc" })

  const proof = builder.build()

  assertEqual(proof.traceHealth, "DEGRADED", "missing grant event → DEGRADED")
}

// ═══════════════════════════════════════════════════════════════════════
// Integrity hash mismatch → INVALID
// ═══════════════════════════════════════════════════════════════════════

console.log("Event integrity hash mismatch → INVALID")
{
  const builder = new RunProofBuilder("node-local-01", "session-abc")

  builder.appendEvent("DISTRIBUTED_ENVELOPE_RECEIVED", { envelopeHash: "abc" })
  builder.appendEvent("DISTRIBUTED_VERIFICATION_PASSED", {})

  const proof = builder.build()

  // Tamper with an event detail
  proof.events[0].detail.envelopeHash = "TAMPERED"

  const consistency = verifyRunProofConsistency(proof)
  assert(consistency.consistent === false, "tampered proof is inconsistent")
  assert(consistency.consistent === false && consistency.reason.includes("integrity"), "reason mentions integrity")
}

// ═══════════════════════════════════════════════════════════════════════
// Workload evidence differs → trace DEGRADED/INVALID
// ═══════════════════════════════════════════════════════════════════════

console.log("Missing receipt event with effect → DEGRADED")
{
  const builder = new RunProofBuilder("node-local-01", "session-abc")

  builder.appendEvent("DISTRIBUTED_ENVELOPE_RECEIVED", { envelopeHash: "abc" })
  builder.appendEvent("DISTRIBUTED_VERIFICATION_PASSED", {})
  builder.appendEvent("LOCAL_GRANT_DERIVED", {})
  builder.appendEvent("LOCAL_PDP_ALLOW", {})
  builder.appendEvent("PEP_RECHECK_PASSED", {})
  builder.appendEvent("EFFECT_EXECUTED", { kind: "FILESYSTEM_READ" })
  // Missing receipt

  const proof = builder.build()

  assertEqual(proof.traceHealth, "DEGRADED", "missing receipt → DEGRADED")
}

// ═══════════════════════════════════════════════════════════════════════
// RunProof agreement detection
// ═══════════════════════════════════════════════════════════════════════

console.log("RunProof agreement: correct expectations match")
{
  const builder = new RunProofBuilder("node-local-01", "session-abc")

  builder.appendEvent("DISTRIBUTED_ENVELOPE_RECEIVED", { envelopeHash: "abc" })
  builder.appendEvent("DISTRIBUTED_VERIFICATION_PASSED", {})
  builder.appendEvent("LOCAL_GRANT_DERIVED", {})
  builder.appendEvent("LOCAL_PDP_ALLOW", {})
  builder.appendEvent("PEP_RECHECK_PASSED", {})
  builder.appendEvent("EFFECT_EXECUTED", {})
  builder.appendEvent("EFFECT_RECEIPT", {})

  const proof = builder.build()

  const agree1 = checkRunProofAgreement(proof, { verificationPassed: true, pdpAllowed: true, effectExecuted: true })
  assert(agree1.agreed === true, "correct expectations agree")

  const agree2 = checkRunProofAgreement(proof, { verificationPassed: false })
  assert(agree2.agreed === false, "wrong verification expectation disagrees")

  const agree3 = checkRunProofAgreement(proof, { effectExecuted: false })
  assert(agree3.agreed === false, "wrong effect expectation disagrees")
}

// ═══════════════════════════════════════════════════════════════════════
// Causal parent linkage
// ═══════════════════════════════════════════════════════════════════════

console.log("Causal parent linkage verified")
{
  const builder = new RunProofBuilder("node-local-01", "session-abc")

  const e1 = builder.appendEvent("DISTRIBUTED_ENVELOPE_RECEIVED", {})
  const e2 = builder.appendEvent("DISTRIBUTED_VERIFICATION_PASSED", {}, e1.eventId)
  const e3 = builder.appendEvent("LOCAL_GRANT_DERIVED", {}, e2.eventId)

  assert(e2.causalParentId === e1.eventId, "e2 links to e1")
  assert(e3.causalParentId === e2.eventId, "e3 links to e2")

  const proof = builder.build()
  assertEqual(proof.integrityStatus, "VALID", "causal chain is valid")
}

// ═══════════════════════════════════════════════════════════════════════
// Broken causal parent → INVALID
// ═══════════════════════════════════════════════════════════════════════

console.log("Broken causal parent → INVALID")
{
  const builder = new RunProofBuilder("node-local-01", "session-abc")

  builder.appendEvent("DISTRIBUTED_ENVELOPE_RECEIVED", {})
  builder.appendEvent("DISTRIBUTED_VERIFICATION_PASSED", {}, "nonexistent-event-id")

  const proof = builder.build()
  assertEqual(proof.integrityStatus, "INVALID", "broken parent link → INVALID")
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
