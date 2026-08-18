// SPDX-License-Identifier: MIT OR LicenseRef-arcana-Commercial
// Copyright (c) 2026 arcana contributors

/**
 * Effect classifier for the governance firewall.
 *
 * Arcana's firewall (`inspectEffect` in packages/engine) is deterministic:
 * it catches known installers, opaque execs, and download-exec cradles with
 * explicit patterns. This module is the machine layer on top of it:
 *
 *   - reuses the Signal Engine (`analyzeTool`) for tool-level risk signals,
 *   - scores command/path features that the pattern list does not model
 *     (chained download-exec, command-substitution cradles, encoded
 *     payloads piped to interpreters, system-path writes),
 *   - returns a verdict, risk, confidence, labels, reasons and findings.
 *
 * The scoring function is deterministic today so it can run on the hot
 * permission path with zero latency and full fixture coverage. The interface
 * is the seam where a learned model (trained on the eval fixtures) can be
 * swapped in later without touching the firewall or the permission layer.
 */

import { analyzeTool } from "./signals.js"
import type { ToolSignal } from "./types.js"

export type EffectClassVerdict = "benign" | "review" | "block"
export type EffectClassRisk = "low" | "medium" | "high" | "critical"

export type EffectClassFinding = {
  code: string
  severity: EffectClassRisk
  title: string
  detail: string
}

export type EffectClassInput = {
  tool: string
  args?: Record<string, unknown>
  command?: string
  path?: string
  /** Deterministic firewall report when available. */
  firewall?: {
    verdict: EffectClassVerdict
    risk: EffectClassRisk
    findings: EffectClassFinding[]
  }
}

export type EffectClassResult = {
  verdict: EffectClassVerdict
  risk: EffectClassRisk
  confidence: number
  labels: string[]
  reasons: string[]
  findings: EffectClassFinding[]
}

const CHAINED_DOWNLOAD_EXEC =
  /(?:npm|pnpm|yarn|bun|pip|pip3|uv|cargo|go|gem|composer|apt|apt-get|dnf|yum|brew|git)\b[^\n]*?(?:&&|\|\||;|\|)[^\n]*?(?:curl|wget|iwr|irm|Invoke-WebRequest)\b[^\n]*?(?:\||iex|sh\b|bash\b|powershell\b)/i

const CMD_SUBSTITUTION_DOWNLOAD =
  /\$\((?:curl|wget|iwr|irm)\b[^\n]*?\)|\$\((?:curl|wget|iwr|irm)\b[^\n]*?\|\s*(?:ba?sh|sh|iex)/i

const ENCODED_PAYLOAD_PIPE =
  /(?:base64\s*-\s*d|fromhex|xxd\s*-r|certutil\s+-decode|ConvertFrom-HexString|urlencode)[^\n]*?(?:\||iex|\|\s*(?:ba?sh|sh|pwsh|powershell))/i

const REMOTE_FETCH_EXEC =
  /(?:curl|wget|iwr|irm)\b[^\n]*?(?:https?:\/\/[^\s|]+[^\n]*?(?:\||iex|\|\s*(?:ba?sh|sh|pwsh|powershell)|-o\s+\S+\.(?:exe|sh|ps1|bat|cmd))|-o\s+\S+\.(?:exe|sh|ps1|bat|cmd)[^\n]*?https?:\/\/)/i

const SYSTEM_PATH_WRITE =
  /(?:^|[/\\])(?:etc|usr|windows|system32|program\s+files|lib|opt|sbin|bin)(?:[/\\]|$)/i

const SECRET_ADJACENT =
  /(?:\.env(?:\.|$)|id_rsa|id_ed25519|credentials|secrets|api[_-]?key|password|token)/i

function clampScore(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(2))))
}

function finding(
  code: string,
  severity: EffectClassRisk,
  title: string,
  detail: string,
): EffectClassFinding {
  return { code, severity, title, detail }
}

function verdictFromScore(score: number): EffectClassVerdict {
  // Epsilon guards binary floating-point sums that land just under a
  // threshold (e.g. 0.05 + 0.45 === 0.49999999999999994).
  if (score >= 0.8 - 1e-9) return "block"
  if (score >= 0.5 - 1e-9) return "review"
  return "benign"
}

function riskFromScore(score: number): EffectClassRisk {
  if (score >= 0.8 - 1e-9) return "critical"
  if (score >= 0.55 - 1e-9) return "high"
  if (score >= 0.25 - 1e-9) return "medium"
  return "low"
}

function commandOf(input: EffectClassInput): string {
  return (input.command ?? (typeof input.args?.command === "string" ? input.args.command : "")).trim()
}

function pathOf(input: EffectClassInput): string {
  if (input.path) return input.path
  for (const key of ["filePath", "filepath", "path", "target"]) {
    const value = input.args?.[key]
    if (typeof value === "string") return value
  }
  return ""
}

/**
 * Classify an effect. `firewall` (the deterministic inspect report) is used
 * only to avoid duplicating already-detected findings; escalation is handled
 * by `mergeClassifier` so the firewall can never be downgraded.
 */
export function classifyEffect(input: EffectClassInput): EffectClassResult {
  const tool = input.tool.trim() || "unknown"
  const args = input.args ?? {}
  const command = commandOf(input)
  const path = pathOf(input)
  const text = `${tool} ${JSON.stringify(args)} ${command} ${path}`.toLowerCase()
  const signal: ToolSignal = analyzeTool({ toolName: tool, args })

  const labels = [...signal.labels]
  const reasons = [...signal.reasons]
  const findings: EffectClassFinding[] = []
  let score = 0

  // Signal-engine posture: approval postures are strong escalation signals,
  // but medium risk alone (write-capable tools) stays below the review bar so
  // ordinary benign edits remain allowed by default.
  if (signal.executionPosture === "approval") {
    score += 0.35
    reasons.push("Signal engine posture requires approval for this tool class.")
  } else if (signal.risk === "high") {
    score += 0.25
    reasons.push("Signal engine classified the tool as high risk.")
  } else if (signal.risk === "medium") {
    score += 0.05
  }

  if (CHAINED_DOWNLOAD_EXEC.test(text)) {
    score += 0.8
    labels.push("chained-download-exec")
    reasons.push("Package/install command chains into a remote download-execute.")
    findings.push(
      finding(
        "ML_CHAINED_DOWNLOAD_EXEC",
        "critical",
        "Chained download-and-execute",
        "A package or install command is chained into a remote fetch piped to an interpreter.",
      ),
    )
  }

  if (CMD_SUBSTITUTION_DOWNLOAD.test(text)) {
    score += 0.8
    labels.push("substitution-download-exec")
    reasons.push("Command substitution hides a remote download-execute.")
    findings.push(
      finding(
        "ML_CMD_SUBSTITUTION_DOWNLOAD",
        "critical",
        "Command-substitution download-exec",
        "A command substitution embeds a remote fetch piped to an interpreter.",
      ),
    )
  }

  if (ENCODED_PAYLOAD_PIPE.test(text)) {
    score += 0.8
    labels.push("encoded-payload")
    reasons.push("Encoded payload is decoded and piped into an interpreter.")
    findings.push(
      finding(
        "ML_ENCODED_PAYLOAD_PIPE",
        "critical",
        "Encoded payload to interpreter",
        "Obfuscated content is decoded and executed by a shell or interpreter.",
      ),
    )
  }

  if (REMOTE_FETCH_EXEC.test(text)) {
    score += 0.5
    labels.push("remote-fetch-exec")
    reasons.push("Remote fetch may be executed or materialized as an executable.")
    findings.push(
      finding(
        "ML_REMOTE_FETCH_EXEC",
        "high",
        "Remote fetch with execution intent",
        "A remote artifact is fetched into a shell, interpreter, or executable file.",
      ),
    )
  }

  if (SYSTEM_PATH_WRITE.test(path) && (signal.labels.includes("write-capable") || /write|edit|patch/.test(tool))) {
    score += 0.45
    labels.push("system-path-write")
    reasons.push("Write targets a system directory outside the workspace.")
    findings.push(
      finding(
        "ML_SYSTEM_PATH_WRITE",
        "high",
        "System-path write",
        "A write targets a system directory (etc, usr, windows, system32, bin, opt).",
      ),
    )
  }

  if (SECRET_ADJACENT.test(text) && signal.labels.includes("write-capable")) {
    score += 0.2
    labels.push("secret-adjacent-write")
    reasons.push("Write may touch credentials or secret material.")
    if (!findings.some((item) => item.code === "ML_SECRET_ADJACENT_WRITE")) {
      findings.push(
        finding(
          "ML_SECRET_ADJACENT_WRITE",
          "medium",
          "Secret-adjacent write",
          "The write target or command references credentials or secret material.",
        ),
      )
    }
  }

  // Firewall-detected findings already escalate; do not double-count them.
  const firewallCodes = new Set((input.firewall?.findings ?? []).map((item) => item.code))
  const uniqueFindings = findings.filter((item) => !firewallCodes.has(item.code))

  return {
    verdict: verdictFromScore(score),
    risk: riskFromScore(score),
    confidence: clampScore(0.55 + Math.min(uniqueFindings.length, 3) * 0.12 + (signal.confidence.value - 0.55) * 0.25),
    labels,
    reasons,
    findings: uniqueFindings,
  }
}

/**
 * Escalation-only merge: the deterministic firewall is authoritative.
 * The ML layer can upgrade benign -> review -> block, never downgrade.
 */
export function mergeClassifier(
  firewall: EffectClassInput["firewall"],
  ml: EffectClassResult,
): { verdict: EffectClassVerdict; risk: EffectClassRisk; findings: EffectClassFinding[] } {
  if (!firewall) {
    return { verdict: ml.verdict, risk: ml.risk, findings: ml.findings }
  }

  const riskOrder: Record<EffectClassRisk, number> = { low: 0, medium: 1, high: 2, critical: 3 }
  const verdict: EffectClassVerdict =
    firewall.verdict === "block" || ml.verdict === "block"
      ? "block"
      : firewall.verdict === "review" || ml.verdict === "review"
        ? "review"
        : "benign"
  const risk = riskOrder[firewall.risk] >= riskOrder[ml.risk] ? firewall.risk : ml.risk
  const existing = new Set(firewall.findings.map((item) => `${item.code}:${item.detail}`))
  const findings = [
    ...firewall.findings,
    ...ml.findings.filter((item) => !existing.has(`${item.code}:${item.detail}`)),
  ]
  return { verdict, risk, findings }
}

export function formatClassifierForAudit(result: EffectClassResult): string {
  return [
    `verdict=${result.verdict}`,
    `risk=${result.risk}`,
    `confidence=${Math.round(result.confidence * 100)}%`,
    `labels=${result.labels.join(",") || "none"}`,
    `reasons=${result.reasons.join(" | ") || "none"}`,
    `findings=${result.findings.map((item) => item.code).join(",") || "none"}`,
  ].join(" ")
}
