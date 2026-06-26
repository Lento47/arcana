import { describe, expect, test } from "bun:test"
import {
  completionGatesSatisfied,
  createVerificationRun,
  createVerifierRecord,
  defaultRequiredChecks,
  forgeRequiredChecks,
  securityRequiredChecks,
  verifierGatesSatisfied,
  type ArcanaVerificationEvidence,
  type ArcanaVerifierLimitation,
  type ArcanaVerificationRun,
} from "./verifier"

function makeEvidence(
  overrides: Partial<ArcanaVerificationEvidence> = {},
): ArcanaVerificationEvidence {
  return {
    kind: "test_output",
    summary: "All tests pass",
    passed: true,
    timestamp: new Date().toISOString(),
    ...overrides,
  }
}

describe("verifier authority", () => {
  test("creates a verification run in pending state", () => {
    const run = createVerificationRun("mut_1", defaultRequiredChecks())
    expect(run.verdict).toBe("pending")
    expect(run.evidence).toEqual([])
    expect(run.failures).toEqual([])
    expect(run.retries).toBe(0)
    expect(run.required_checks).toEqual(defaultRequiredChecks())
  })

  test("verifierGatesSatisfied requires passed verdict and evidence", () => {
    const run = createVerificationRun("mut_1", [])
    expect(verifierGatesSatisfied(run)).toBe(false)

    const passed: ArcanaVerificationRun = {
      ...run,
      verdict: "passed",
      evidence: [makeEvidence()],
    }
    expect(verifierGatesSatisfied(passed)).toBe(true)

    const failed: ArcanaVerificationRun = { ...run, verdict: "failed", evidence: [makeEvidence()] }
    expect(verifierGatesSatisfied(failed)).toBe(false)

    const noEvidence: ArcanaVerificationRun = {
      ...run,
      verdict: "passed",
      evidence: [],
    }
    expect(verifierGatesSatisfied(noEvidence)).toBe(false)
  })

  test("verifier gate fails when any evidence fails", () => {
    const run: ArcanaVerificationRun = {
      ...createVerificationRun("mut_1", []),
      verdict: "passed",
      evidence: [makeEvidence(), makeEvidence({ kind: "typecheck_output", passed: false })],
    }

    expect(verifierGatesSatisfied(run)).toBe(false)
  })

  test("skipped verdict requires explicit justification evidence", () => {
    const skippedWithoutJustification: ArcanaVerificationRun = {
      ...createVerificationRun("mut_skip", []),
      verdict: "skipped",
      evidence: [makeEvidence({ kind: "test_output" })],
    }
    expect(verifierGatesSatisfied(skippedWithoutJustification)).toBe(false)

    const skippedWithJustification: ArcanaVerificationRun = {
      ...skippedWithoutJustification,
      evidence: [makeEvidence({ kind: "manual_confirmation", detail: "User explicitly skipped local build on unsupported platform." })],
    }
    expect(verifierGatesSatisfied(skippedWithJustification)).toBe(true)
  })

  test("completionGatesSatisfied requires all checks executed", () => {
    const run = createVerificationRun("mut_1", defaultRequiredChecks())

    // Not complete — no evidence
    expect(completionGatesSatisfied(run, defaultRequiredChecks())).toBe(false)

    // Add passed evidence for all required checks
    const withEvidence: ArcanaVerificationRun = {
      ...run,
      verdict: "passed",
      evidence: defaultRequiredChecks().map((kind) =>
        makeEvidence({ kind: kind as ArcanaVerificationEvidence["kind"] }),
      ),
    }
    expect(completionGatesSatisfied(withEvidence, defaultRequiredChecks())).toBe(true)
  })

  test("completion fails when a required check has no evidence", () => {
    const run: ArcanaVerificationRun = {
      ...createVerificationRun("mut_2", defaultRequiredChecks()),
      verdict: "passed",
      evidence: [makeEvidence({ kind: "test_output" }), makeEvidence({ kind: "lint_output" })],
      // missing typecheck_output and git_diff
    }
    expect(completionGatesSatisfied(run, defaultRequiredChecks())).toBe(false)
  })

  test("createVerifierRecord includes completion gate status", () => {
    const run = createVerificationRun("mut_3", [])
    const limitations: ArcanaVerifierLimitation[] = []
    const record = createVerifierRecord(run, limitations)
    expect(record.completion_gate_passed).toBe(false)
    expect(record.run.verdict).toBe("pending")
  })

  test("known limitations carry doubt forward", () => {
    const run: ArcanaVerificationRun = {
      ...createVerificationRun("mut_4", defaultRequiredChecks()),
      verdict: "passed",
      evidence: defaultRequiredChecks().map((kind) =>
        makeEvidence({ kind: kind as ArcanaVerificationEvidence["kind"] }),
      ),
    }
    const limitations: ArcanaVerifierLimitation[] = [
      {
        check: "test_output",
        description: "Tests pass but coverage is below threshold",
        severity: "warning",
      },
    ]
    const record = createVerifierRecord(run, limitations)
    expect(record.completion_gate_passed).toBe(true)
    expect(record.limitations.length).toBe(1)
    expect(record.limitations[0]!.severity).toBe("warning")
  })

  test("verdict 'failed' with evidence still fails gate", () => {
    const run: ArcanaVerificationRun = {
      ...createVerificationRun("mut_5", defaultRequiredChecks()),
      verdict: "failed",
      failures: ["test_output: 2 tests failed"],
      evidence: defaultRequiredChecks().map((kind) =>
        makeEvidence({
          kind: kind as ArcanaVerificationEvidence["kind"],
          passed: kind !== "test_output",
        }),
      ),
    }
    expect(verifierGatesSatisfied(run)).toBe(false)
  })

  test("security and forge required checks extend normal completion evidence", () => {
    expect(securityRequiredChecks()).toContain("security_scan")
    expect(securityRequiredChecks()).toContain("manual_confirmation")
    expect(forgeRequiredChecks()).toContain("benchmark")
    expect(forgeRequiredChecks()).toContain("candidate_evaluation")
  })
})
