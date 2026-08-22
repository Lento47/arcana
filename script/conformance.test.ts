import { describe, expect, test } from "bun:test"
import {
  CONFORMANCE_SCHEMA_VERSION,
  CONFORMANCE_SUITES,
  createConformanceReport,
  parseConformanceArgs,
  type ConformanceSuiteResult,
} from "./conformance"

function result(id: string, status: "passed" | "failed"): ConformanceSuiteResult {
  return {
    id,
    name: id,
    status,
    exitCode: status === "passed" ? 0 : 1,
    signal: null,
    durationMs: 1,
    command: ["test"],
    cwd: ".",
    summary: [],
  }
}

describe("conformance evidence", () => {
  test("parses machine-readable output options", () => {
    expect(parseConformanceArgs(["--json", "--output", "evidence/report.json"])).toEqual({
      json: true,
      output: "evidence/report.json",
      help: false,
    })
    expect(() => parseConformanceArgs(["--output"])).toThrow("--output requires a file path")
    expect(() => parseConformanceArgs(["--unknown"])).toThrow("unknown argument")
  })

  test("keeps external reproduction and audit claims explicitly unassessed", () => {
    const suites = CONFORMANCE_SUITES.map((suite) => result(suite.id, "passed"))
    const report = createConformanceReport(suites)

    expect(report.schemaVersion).toBe(CONFORMANCE_SCHEMA_VERSION)
    expect(report.status).toBe("passed")
    expect(report.assurance.internalReproduction).toBe("passed")
    expect(report.assurance.crossRuntimeImplementation).toBe("passed")
    expect(report.assurance.externalReproduction).toBe("not_assessed")
    expect(report.assurance.independentAudit).toBe("not_assessed")
    expect(report.corpus.cryptoVectors).toBe(46)
    expect(report.corpus.adapterVectors).toBe(4)
  })

  test("fails the aggregate when any suite fails", () => {
    const suites = CONFORMANCE_SUITES.map((suite, index) => result(suite.id, index === 0 ? "failed" : "passed"))
    const report = createConformanceReport(suites)

    expect(report.status).toBe("failed")
    expect(report.assurance.internalReproduction).toBe("failed")
    expect(report.totals.failed).toBe(1)
  })
})
