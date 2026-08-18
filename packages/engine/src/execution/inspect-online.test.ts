import { describe, expect, test } from "bun:test"
import { inspectEffect } from "./inspect"
import { enrichInspectOnline, type InspectFetch } from "./inspect-online"

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}

describe("enrichInspectOnline", () => {
  test("adds registry identity and OSV clean for a known package", async () => {
    const fetchImpl: InspectFetch = async (url) => {
      if (String(url).includes("registry.npmjs.org")) {
        return jsonResponse(200, {
          description: "Command Code coding agent",
          license: "MIT",
          time: { created: "2020-01-01T00:00:00.000Z" },
        })
      }
      return jsonResponse(200, { results: [{ vulns: [] }] })
    }
    const base = inspectEffect({ tool: "bash", args: { command: "npm install -g command-code" } })
    const report = await enrichInspectOnline(base, fetchImpl)
    expect(report.verdict).toBe("review")
    expect(report.findings.some((item) => item.code === "REGISTRY_IDENTITY")).toBe(true)
    expect(report.findings.some((item) => item.code === "OSV_CLEAN")).toBe(true)
  })

  test("flags missing registry package and unlicensed", async () => {
    const fetchImpl: InspectFetch = async (url) => {
      if (String(url).includes("registry.npmjs.org/missing-pkg")) return jsonResponse(404, {})
      if (String(url).includes("registry.npmjs.org")) {
        return jsonResponse(200, { license: "UNLICENSED", time: { created: new Date().toISOString() } })
      }
      return jsonResponse(200, { results: [{ vulns: [{ id: "GHSA-xxxx" }] }] })
    }
    const missing = inspectEffect({ tool: "bash", args: { command: "npm install missing-pkg" } })
    const missingReport = await enrichInspectOnline(missing, fetchImpl)
    expect(missingReport.findings.some((item) => item.code === "PACKAGE_NOT_FOUND")).toBe(true)

    const unlicensed = inspectEffect({ tool: "bash", args: { command: "npm install -g command-code" } })
    const unlicensedReport = await enrichInspectOnline(unlicensed, fetchImpl)
    expect(unlicensedReport.findings.some((item) => item.code === "UNLICENSED_PACKAGE")).toBe(true)
    expect(unlicensedReport.findings.some((item) => item.code === "KNOWN_VULNS")).toBe(true)
    expect(unlicensedReport.risk === "high" || unlicensedReport.risk === "critical").toBe(true)
  })

  test("does not auto-allow when the scan is down", async () => {
    const fetchImpl: InspectFetch = async () => {
      throw new Error("network down")
    }
    const base = inspectEffect({ tool: "bash", args: { command: "npm install -g command-code" } })
    const report = await enrichInspectOnline(base, fetchImpl)
    expect(report.verdict).toBe("review")
    expect(report.findings.some((item) => item.code === "SCAN_UNAVAILABLE")).toBe(true)
    expect(report.risk).toBe("high")
  })
})
