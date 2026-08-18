// SPDX-License-Identifier: MIT OR LicenseRef-arcana-Commercial
// Copyright (c) 2026 arcana contributors

/**
 * Online enrichment for install inspect reports.
 * Runs before the desktop allow/deny/ask gate. Does not execute the install.
 */

import type { EffectInspectReport, InspectFinding, InspectSubject, RiskLevel } from "./inspect"

export type InspectFetch = (url: string, init?: RequestInit) => Promise<Response>

const NEW_PACKAGE_MS = 14 * 24 * 60 * 60 * 1000
const SCAN_TIMEOUT_MS = 4_000

function worse(a: RiskLevel, b: RiskLevel): RiskLevel {
  const order: Record<RiskLevel, number> = { low: 0, medium: 1, high: 2, critical: 3 }
  return order[a] >= order[b] ? a : b
}

function addFinding(report: EffectInspectReport, finding: InspectFinding) {
  if (report.findings.some((item) => item.code === finding.code && item.detail === finding.detail)) return
  report.findings.push(finding)
  report.risk = worse(report.risk, finding.severity)
}

function ecosystemFromCommand(command: string): string {
  if (/\b(pip|pip3|pipx|uv|poetry|conda|mamba)\b/i.test(command)) return "PyPI"
  if (/\bcargo\b/i.test(command)) return "crates.io"
  if (/\bgo\s+install\b/i.test(command)) return "Go"
  if (/\bgem\b|\bbundle\b/i.test(command)) return "RubyGems"
  return "npm"
}

function packagesOf(report: EffectInspectReport): string[] {
  return report.subjects.filter((item) => item.kind === "package").map((item) => item.value)
}

function commandOf(report: EffectInspectReport): string {
  return report.subjects.find((item) => item.kind === "command")?.value ?? ""
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return undefined
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

async function scanNpmRegistry(
  name: string,
  fetchImpl: InspectFetch,
  signal: AbortSignal,
): Promise<InspectFinding[]> {
  const url = `https://registry.npmjs.org/${encodeURIComponent(name)}`
  const response = await fetchImpl(url, { signal })
  if (response.status === 404) {
    return [{
      code: "PACKAGE_NOT_FOUND",
      severity: "high",
      title: "Package not in npm registry",
      detail: `${name} was not found. Confirm the exact published name before installing.`,
    }]
  }
  if (!response.ok) {
    return [{
      code: "REGISTRY_LOOKUP_FAILED",
      severity: "high",
      title: "Registry lookup failed",
      detail: `npm registry returned ${response.status} for ${name}.`,
    }]
  }
  const body = asRecord(await readJson(response))
  const findings: InspectFinding[] = []
  const license = typeof body.license === "string"
    ? body.license
    : asRecord(body.license).type
  const licenseText = typeof license === "string" ? license : ""
  if (!licenseText || /unlicensed|unknown|none/i.test(licenseText)) {
    findings.push({
      code: "UNLICENSED_PACKAGE",
      severity: "high",
      title: "Package license is missing or UNLICENSED",
      detail: `${name} license=${licenseText || "missing"}.`,
    })
  }
  const time = asRecord(body.time)
  const created = typeof time.created === "string" ? Date.parse(time.created) : Number.NaN
  if (Number.isFinite(created) && Date.now() - created < NEW_PACKAGE_MS) {
    findings.push({
      code: "NEW_PACKAGE",
      severity: "medium",
      title: "Very new package",
      detail: `${name} was first published ${new Date(created).toISOString().slice(0, 10)}.`,
    })
  }
  const description = typeof body.description === "string" ? body.description.trim() : ""
  if (description) {
    findings.push({
      code: "REGISTRY_IDENTITY",
      severity: "low",
      title: "Registry identity",
      detail: `${name}: ${description.slice(0, 180)}`,
    })
  }
  return findings
}

async function scanOsv(
  names: string[],
  ecosystem: string,
  fetchImpl: InspectFetch,
  signal: AbortSignal,
): Promise<InspectFinding[]> {
  if (names.length === 0) return []
  const response = await fetchImpl("https://api.osv.dev/v1/querybatch", {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal,
    body: JSON.stringify({
      queries: names.map((name) => ({ package: { name, ecosystem } })),
    }),
  })
  if (!response.ok) {
    return [{
      code: "OSV_LOOKUP_FAILED",
      severity: "high",
      title: "Vulnerability scan failed",
      detail: `OSV returned ${response.status}. Install was not auto-allowed.`,
    }]
  }
  const body = asRecord(await readJson(response))
  const results = Array.isArray(body.results) ? body.results : []
  const vulns: string[] = []
  for (const result of results) {
    const list = asRecord(result).vulns
    if (!Array.isArray(list)) continue
    for (const vuln of list) {
      const id = asRecord(vuln).id
      if (typeof id === "string" && id.trim()) vulns.push(id.trim())
    }
  }
  if (vulns.length === 0) {
    return [{
      code: "OSV_CLEAN",
      severity: "low",
      title: "No known OSV vulns on latest query",
      detail: `${names.join(", ")} had no listed vulnerabilities in this scan.`,
    }]
  }
  return [{
    code: "KNOWN_VULNS",
    severity: vulns.length >= 3 ? "critical" : "high",
    title: "Known vulnerabilities",
    detail: `${vulns.slice(0, 8).join(", ")}${vulns.length > 8 ? "…" : ""}`,
  }]
}

export async function enrichInspectOnline(
  report: EffectInspectReport,
  fetchImpl: InspectFetch = fetch,
): Promise<EffectInspectReport> {
  const names = packagesOf(report)
  if (names.length === 0) return report

  const next: EffectInspectReport = {
    ...report,
    findings: [...report.findings],
    subjects: [...report.subjects] as InspectSubject[],
    controls: [...report.controls],
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), SCAN_TIMEOUT_MS)
  try {
    const ecosystem = ecosystemFromCommand(commandOf(report))
    if (ecosystem === "npm") {
      for (const name of names.slice(0, 5)) {
        const findings = await scanNpmRegistry(name, fetchImpl, controller.signal)
        for (const finding of findings) addFinding(next, finding)
      }
    }
    const osv = await scanOsv(names.slice(0, 5), ecosystem, fetchImpl, controller.signal)
    for (const finding of osv) addFinding(next, finding)
  } catch (error) {
    addFinding(next, {
      code: "SCAN_UNAVAILABLE",
      severity: "high",
      title: "Online scan unavailable",
      detail: error instanceof Error ? error.message : "Registry/OSV lookup did not complete.",
    })
  } finally {
    clearTimeout(timer)
  }
  if (!next.controls.includes("osv_scan")) next.controls.push("osv_scan")
  if (next.verdict !== "block") next.verdict = "review"
  return next
}
