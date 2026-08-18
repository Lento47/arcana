import { describe, expect, test } from "bun:test"
import { projectInsightCard } from "../src/shell/command-spine/spine-insight"
import type { SpineReportData } from "../src/shell/command-spine/spine-types"

const report = (overrides: Partial<SpineReportData> = {}): SpineReportData => ({
  title: "Architecture review",
  summary: "Three checks, one concern.",
  scorecard: [
    { label: "Authz", status: "pass" },
    { label: "Secrets", status: "warn" },
    { label: "Supply chain", status: "fail" },
  ],
  concerns: [{ severity: "HIGH", title: "Unsigned artifact", detail: "no signature" }],
  body: "",
  ...overrides,
})

describe("projectInsightCard", () => {
  test("report/scorecard yields a card with title, metrics, and severity", () => {
    const card = projectInsightCard({ report: report() })
    expect(card).toBeDefined()
    expect(card!.title).toBe("Architecture review")
    expect(card!.summary).toContain("Three checks")
    expect(card!.source).toBe("report")
    expect(card!.severity).toBe("HIGH")
    expect(card!.metrics.length).toBeGreaterThan(0)
    expect(card!.metrics.some((m) => m.label === "Authz" && m.tone === "pass")).toBe(true)
    expect(card!.metrics.some((m) => m.label === "Supply chain" && m.tone === "fail")).toBe(true)
  })

  test("table yields a card; empty table yields none", () => {
    const card = projectInsightCard({
      table: {
        headers: ["name", "status"],
        rows: [["pep", "ok"], ["pdp", "fail"]],
      },
    })
    expect(card).toBeDefined()
    expect(card!.source).toBe("table")
    expect(card!.title).toBe("name")
    expect(card!.metrics.some((m) => m.label === "rows" && m.value === "2")).toBe(true)
    expect(card!.severity).toBe("HIGH")

    expect(projectInsightCard({ table: { headers: [], rows: [] } })).toBeUndefined()
  })

  test("receipt stats yield a card", () => {
    const card = projectInsightCard({
      receipt: {
        label: "tests",
        status: "ok",
        stats: { passed: 12, failed: 1, duration: "1.2s" },
      },
    })
    expect(card).toBeDefined()
    expect(card!.source).toBe("receipt")
    expect(card!.title).toBe("tests")
    expect(card!.metrics.some((m) => m.label === "passed" && m.value === "12")).toBe(true)
    expect(card!.severity).toBe("HIGH")
  })

  test("fail scorecard without concerns is HIGH, not NONE", () => {
    const card = projectInsightCard({ scorecard: [{ label: "Authz", status: "fail" }] })
    expect(card).toBeDefined()
    expect(card!.severity).toBe("HIGH")
    expect(card!.metrics.some((m) => m.label === "Authz" && m.tone === "fail")).toBe(true)
  })

  test("warn-only scorecard without concerns is MEDIUM", () => {
    const card = projectInsightCard({ scorecard: [{ label: "Secrets", status: "warn" }] })
    expect(card!.severity).toBe("MEDIUM")
  })

  test("empty / non-visual input yields no card", () => {
    expect(projectInsightCard({})).toBeUndefined()
    expect(projectInsightCard({ report: null, scorecard: [], table: null, receipt: null })).toBeUndefined()
    expect(projectInsightCard({
      receipt: { label: "run", status: "ok" },
    })).toBeUndefined()
  })
})
