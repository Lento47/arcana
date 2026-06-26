import { describe, expect, test } from "bun:test"
import {
  completionGatesSatisfied,
  createVerificationRun,
  createVerifierRecord,
  defaultRequiredChecks,
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

  test("verifierGatesSatisfied returns true only for passed", () => {
    const run = createVerificationRun("mut_1", [])
    expect(verifierGatesSatisfied(run)).toBe(false)

    const passed: ArcanaVerificationRun = {
      ...run,
      verdict: "passed",
      evidence: [makeEvidence()],
    }
    expect(verifierGatesSatisfied(passed)).toBe(true)

    const failed: ArcanaVerificationRun = { ...run, verdict: "failed" }
    expect(verifierGatesSatisfied(failed)).toBe(false)

    const noEvidence: ArcanaVerificationRun = {
      ...run,
      verdict: "passed",
      evidence: [],
    }
    expect(verifierGatesSatisfied(noEvidence)).toBe(true) // passed with no evidence still passes the gate
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
})
