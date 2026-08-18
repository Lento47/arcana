// SPDX-License-Identifier: MIT OR LicenseRef-arcana-Commercial
// Copyright (c) 2026 arcana contributors

/**
 * Local firewall inspect for a proposed effect.
 *
 * Pure and deterministic. Does not authorize. Does not execute.
 * Verdicts are attached to permission / approval metadata so the operator
 * (TUI or desktop) can review the exact payload. PDP/PEP still decide.
 */

import { assessActionRisk } from "./risk"
import {
  commandLooksLikeBlockedOpaque,
  commandLooksLikeInstall,
  commandLooksLikeOpaqueExec,
  extractInstallPackages,
} from "./install"
import type { EngineActionKind, RiskLevel } from "./action"
export type { RiskLevel } from "./action"

export type InspectVerdict = "benign" | "review" | "block"

export type InspectFinding = {
  code: string
  severity: RiskLevel
  title: string
  detail: string
}

export type InspectSubject = {
  kind: "package" | "url" | "command" | "path" | "repo"
  value: string
}

export type EffectInspectReport = {
  verdict: InspectVerdict
  risk: RiskLevel
  findings: InspectFinding[]
  subjects: InspectSubject[]
  controls: string[]
}

const GIT_REMOTE =
  /\bgit\s+(clone|remote\s+add|submodule\s+add)\b/i

const DOWNLOAD_EXECUTE =
  /(curl|wget|Invoke-WebRequest|iwr|irm)\b[\s\S]{0,160}(\|\s*(ba)?sh|\|\s*iex|Invoke-Expression)/i

const ENCODED_SHELL =
  /\b(powershell|pwsh)\b[\s\S]{0,80}-(enc|encodedcommand)\b/i

const PRIVILEGED =
  /\b(sudo\s+|doas\s+|chmod\s+777|chown\s+-R|docker\s+run[^\n]*--privileged)\b/i

const DESTRUCTIVE =
  /\b(rm\s+-rf|git\s+reset\s+--hard|git\s+clean\s+-fd|mkfs|dd\s+if=)\b/i

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function firstString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return undefined
}

function commandOf(tool: string, args: Record<string, unknown>): string {
  return firstString(args, ["command", "cmd", "script"]) ?? (tool === "shell" || tool === "bash" ? "" : "")
}

function urlOf(args: Record<string, unknown>): string | undefined {
  return firstString(args, ["url", "target", "uri", "href"])
}

function extractGitRemote(command: string): string | undefined {
  const match = command.match(/\b(?:git\s+clone|git\s+remote\s+add\s+\S+|git\s+submodule\s+add)\s+(\S+)/i)
  const value = match?.[1]
  if (!value || value.startsWith("-")) return undefined
  return value
}

function addFinding(
  findings: InspectFinding[],
  finding: InspectFinding,
) {
  if (findings.some((item) => item.code === finding.code && item.detail === finding.detail)) return
  findings.push(finding)
}

function worse(a: RiskLevel, b: RiskLevel): RiskLevel {
  const order: Record<RiskLevel, number> = { low: 0, medium: 1, high: 2, critical: 3 }
  return order[a] >= order[b] ? a : b
}

export function inspectEffect(input: { tool: string; args?: unknown }): EffectInspectReport {
  const args = asRecord(input.args)
  const tool = input.tool.trim() || "unknown"
  const command = commandOf(tool, args)
  const url = urlOf(args)
  const findings: InspectFinding[] = []
  const subjects: InspectSubject[] = []
  const controls = new Set<string>()

  if (command) subjects.push({ kind: "command", value: command })
  if (url) subjects.push({ kind: "url", value: url })

  const kind: EngineActionKind =
    tool === "mcp" ? "mcp"
    : tool === "webfetch" || tool === "websearch" || tool === "fetch" || tool === "search" ? "network"
    : tool === "bash" || tool === "shell" ? "shell"
    : tool === "read" || tool === "grep" || tool === "glob" ? "file_read"
    : tool === "edit" || tool === "write" || tool === "patch" ? "file_write"
    : "tool"

  const risk = assessActionRisk({ kind, name: tool, input: input.args ?? args })
  let level = risk.level
  for (const control of risk.required_controls) controls.add(control)

  if (DOWNLOAD_EXECUTE.test(command)) {
    addFinding(findings, {
      code: "DOWNLOAD_AND_EXECUTE",
      severity: "critical",
      title: "Download-and-execute cradle",
      detail: "Remote content is piped into a shell or Invoke-Expression.",
    })
    controls.add("approval")
    controls.add("human_review")
    controls.add("sandbox")
    level = "critical"
  }

  if (ENCODED_SHELL.test(command)) {
    addFinding(findings, {
      code: "ENCODED_SHELL",
      severity: "critical",
      title: "Encoded PowerShell",
      detail: "Encoded command hides the payload from review.",
    })
    controls.add("approval")
    controls.add("human_review")
    level = "critical"
  }

  if (DESTRUCTIVE.test(command)) {
    addFinding(findings, {
      code: "DESTRUCTIVE_SHELL",
      severity: "critical",
      title: "Destructive command",
      detail: "Command can delete or reset local state.",
    })
    controls.add("approval")
    controls.add("checkpoint")
    level = worse(level, "critical")
  }

  if (PRIVILEGED.test(command)) {
    addFinding(findings, {
      code: "PRIVILEGED_EXEC",
      severity: "high",
      title: "Privileged execution",
      detail: "sudo, world-writable chmod, or privileged container.",
    })
    controls.add("approval")
    controls.add("human_review")
    level = worse(level, "high")
  }

  if (commandLooksLikeBlockedOpaque(command)) {
    addFinding(findings, {
      code: "OPAQUE_DOWNLOAD_EXEC",
      severity: "critical",
      title: "Opaque download-and-execute",
      detail: "certutil/bitsadmin/msiexec/mshta/rundll32 pattern hides a remote payload.",
    })
    controls.add("approval")
    controls.add("human_review")
    level = "critical"
  } else if (commandLooksLikeOpaqueExec(command) && !commandLooksLikeInstall(command)) {
    addFinding(findings, {
      code: "OPAQUE_EXEC",
      severity: "high",
      title: "Opaque interpreter or wrapper",
      detail: "node -e / python -c / bash -c / cmd /c can hide an install or payload.",
    })
    controls.add("approval")
    controls.add("human_review")
    level = worse(level, "high")
  }

  if (commandLooksLikeInstall(command)) {
    const packages = extractInstallPackages(command)
    for (const name of packages) subjects.push({ kind: "package", value: name })
    addFinding(findings, {
      code: "PACKAGE_MUTATION",
      severity: "high",
      title: "Package install or update",
      detail: packages.length
        ? `Would change dependencies: ${packages.join(", ")}`
        : "Package manager would change dependency state.",
    })
    controls.add("approval")
    controls.add("verifier")
    controls.add("osv_scan")
    controls.add("sbom_scan")
    level = worse(level, "high")
  }

  if (GIT_REMOTE.test(command)) {
    const remote = extractGitRemote(command)
    if (remote) subjects.push({ kind: "repo", value: remote })
    addFinding(findings, {
      code: "REMOTE_REPO",
      severity: "high",
      title: "Remote repository fetch",
      detail: remote ? `Would pull ${remote}` : "Would clone or attach a remote repository.",
    })
    controls.add("approval")
    controls.add("human_review")
    level = worse(level, "high")
  }

  if (tool === "mcp" || (url && /mcp/i.test(url))) {
    addFinding(findings, {
      code: "REMOTE_MCP",
      severity: "high",
      title: "Remote MCP attach",
      detail: url
        ? `Untrusted MCP description from ${url}`
        : "MCP attach carries untrusted remote tool descriptions.",
    })
    controls.add("approval")
    controls.add("human_review")
    controls.add("provenance")
    level = worse(level, "high")
  }

  if (tool === "webfetch" || tool === "fetch") {
    addFinding(findings, {
      code: "NETWORK_FETCH",
      severity: "medium",
      title: "Network fetch",
      detail: url ? `Would fetch ${url}` : "Would fetch a remote URL.",
    })
    controls.add("approval")
    level = worse(level, "medium")
  }

  const verdict: InspectVerdict =
    findings.some((item) =>
      item.code === "DOWNLOAD_AND_EXECUTE"
      || item.code === "ENCODED_SHELL"
      || item.code === "OPAQUE_DOWNLOAD_EXEC",
    )
      ? "block"
      : findings.length > 0 || level === "high" || level === "critical"
        ? "review"
        : "benign"

  return {
    verdict,
    risk: level,
    findings,
    subjects,
    controls: [...controls],
  }
}

export function formatInspectSummary(report: EffectInspectReport): string {
  if (report.findings.length === 0) return `${report.verdict} · ${report.risk}`
  return report.findings.map((item) => `${item.severity} ${item.title}`).join(" · ")
}