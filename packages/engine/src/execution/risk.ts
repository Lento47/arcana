// SPDX-License-Identifier: MIT OR LicenseRef-arcana-Commercial
// Copyright (c) 2026 arcana contributors

import type { EngineActionKind, RequiredControl, RiskAssessment, RiskLevel } from "./action"

export type RiskInput = {
  kind: EngineActionKind
  name: string
  input?: unknown
  cwd?: string
}

const destructiveShellPatterns = [
  /\brm\s+-rf\b/,
  /\bgit\s+reset\s+--hard\b/,
  /\bgit\s+clean\s+-fd/,
  /\bchmod\s+-R\b/,
  /\bchown\s+-R\b/,
  /\bdd\s+if=/,
  /\bmkfs\b/,
]

const packageManagerPatterns = [
  /\bnpm\s+(install|update|audit\s+fix)\b/,
  /\bbun\s+(add|install|update)\b/,
  /\byarn\s+(add|install|upgrade)\b/,
  /\bpnpm\s+(add|install|update)\b/,
]

const networkPatterns = [
  /\bcurl\b/,
  /\bwget\b/,
  /\bnc\b/,
  /\bncat\b/,
  /\bssh\b/,
  /\bscp\b/,
]

function text(input: unknown): string {
  if (typeof input === "string") return input
  try {
    return JSON.stringify(input)
  } catch {
    return String(input)
  }
}

function result(level: RiskLevel, reasons: string[], required_controls: RequiredControl[]): RiskAssessment {
  return { level, reasons, required_controls }
}

export function assessActionRisk(input: RiskInput): RiskAssessment {
  const body = `${input.name} ${text(input.input)}`.toLowerCase()

  if (input.kind === "file_write") {
    return result("medium", ["Action mutates files and must pass through a diff gate."], ["diff", "checkpoint"])
  }

  if (input.kind === "shell") {
    if (destructiveShellPatterns.some((pattern) => pattern.test(body))) {
      return result(
        "critical",
        ["Shell command appears destructive or hard to reverse."],
        ["approval", "checkpoint", "sandbox", "human_review"],
      )
    }

    if (packageManagerPatterns.some((pattern) => pattern.test(body))) {
      return result(
        "high",
        ["Shell command changes dependency state or package manager outputs."],
        ["approval", "checkpoint", "verifier"],
      )
    }

    if (networkPatterns.some((pattern) => pattern.test(body))) {
      return result("medium", ["Shell command may access the network."], ["approval", "sandbox"])
    }

    return result("medium", ["Shell command can affect local runtime state."], ["approval"])
  }

  if (input.kind === "network" || input.kind === "mcp") {
    return result("medium", ["Action may cross a local trust boundary."], ["approval"])
  }

  if (input.kind === "model") {
    return result("low", ["Model call does not directly mutate local state."], [])
  }

  if (input.kind === "file_read") {
    if (body.includes(".env") || body.includes("secret") || body.includes("credential") || body.includes("token")) {
      return result("high", ["File read may expose secrets or credentials."], ["approval", "human_review"])
    }
    return result("low", ["Read-only file access."], [])
  }

  if (input.kind === "session") {
    return result("low", ["Session metadata operation."], [])
  }

  return result("low", ["Default low-risk action classification."], [])
}
