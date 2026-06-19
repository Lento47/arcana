/**
 * Guardrails — privacy, security, and rate limiting for agent operations.
 * Applied transparently to all tool calls.
 */
import { appendFileSync, mkdirSync } from "node:fs"
import { join, dirname } from "node:path"
import { homedir } from "node:os"
import { PhaseGuard, type AgentPhase } from "./modes.js"

// ── Secret patterns ──────────────────────────────────────────
const SECRET_PATTERNS: Array<[string, RegExp]> = [
  ["OpenAI", /sk-[a-zA-Z0-9]{20,}/g],
  ["GitHub", /ghp_[a-zA-Z0-9]{36}/g],
  ["GitHub", /github_pat_[a-zA-Z0-9_]{36,}/g],
  ["Slack", /xox[bp]-[a-zA-Z0-9-]{10,}/g],
  ["AWS", /AKIA[0-9A-Z]{16}/g],
  ["Generic", /[a-zA-Z0-9+/]{40,}={0,2}/g],
  ["Bearer", /bearer [a-zA-Z0-9._\-]{20,}/gi],
  ["Password", /(password|passwd|pwd)\s*[:=]\s*\S+/gi],
]

const REDACTED = "`***REDACTED***`"

/** Strip secrets from text before sending to external APIs or logging to LLM context. */
export function redactSecrets(text: string): string {
  let result = text
  for (const [, pattern] of SECRET_PATTERNS) {
    result = result.replace(pattern, REDACTED)
  }
  return result
}

// ── Prompt injection detection ───────────────────────────────
const INJECTION_PATTERNS = [
  /ignore (all |the )?(previous|above) (instructions|prompt|context)/i,
  /system prompt override/i,
  /act as DAN/i,
  /you are now (DAN|a different|no longer)/i,
  /disregard (all |the )?prior (instructions|constraints)/i,
  /new system prompt/i,
  /\[system\]/i,
]

export function detectInjection(text: string): string | null {
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(text)) return `[prompt-injection-risk] matched: ${pattern.source.slice(0, 40)}`
  }
  return null
}

// ── Dangerous commands ───────────────────────────────────────
const BLOCKED_COMMANDS = [
  /^sudo\b/,
  /\brm\s+-rf\s+\/\b/,
  /\bmkfs\b/,
  /\bdd\s+if=/,
  /chmod\s+(-R\s+)?777\s+\//,
  /:\(\)\s*\{\s*:\|:&\s*\}\s*;:/,  // fork bomb
  /\bcurl\b.*\|\s*(ba)?sh\b/,        // curl pipe shell
  /\bwget\b.*\|\s*(ba)?sh\b/,
  /\bgit\s+push\s+--force\b.*\bmain\b/i,
]

export function checkDangerousCommand(cmd: string): string | null {
  for (const pattern of BLOCKED_COMMANDS) {
    if (pattern.test(cmd)) return `Blocked dangerous command: ${pattern.source.slice(0, 30)}`
  }
  return null
}

// ── Rate limiter ─────────────────────────────────────────────
const MAX_TOOLS = 50
const MAX_WEB_FETCH = 20

export class RateLimiter {
  toolCount = 0
  webFetchCount = 0

  /** Returns warning message if approaching limit, throws on hard limit. */
  check(toolName: string): string | null {
    this.toolCount++
    if (toolName === "web_fetch" || toolName === "web_search") this.webFetchCount++

    if (this.toolCount >= MAX_TOOLS) {
      throw new Error(`Rate limit: ${MAX_TOOLS} tool calls per session exceeded`)
    }
    if (this.webFetchCount >= MAX_WEB_FETCH) {
      throw new Error(`Rate limit: ${MAX_WEB_FETCH} web fetch calls per session exceeded`)
    }

    if (this.toolCount >= MAX_TOOLS * 0.8) return `⚠️ ${this.toolCount}/${MAX_TOOLS} tool calls used`
    if (this.webFetchCount >= MAX_WEB_FETCH * 0.8) return `⚠️ ${this.webFetchCount}/${MAX_WEB_FETCH} web fetches used`
    return null
  }
}

export { PhaseGuard, type AgentPhase }

export function checkPhaseGuard(toolName: string, phase?: AgentPhase): string | null {
  const guard = new PhaseGuard(phase)
  return guard.check(toolName)
}

// ── Audit log ────────────────────────────────────────────────
const auditPath = join(homedir(), ".arcana", "audit.jsonl")
let auditInit = false

export function auditLog(entry: { tool: string; args?: unknown; result?: string; session?: string; ts: string }): void {
  if (!auditInit) {
    mkdirSync(dirname(auditPath), { recursive: true })
    auditInit = true
  }
  try {
    appendFileSync(auditPath, JSON.stringify({ ...entry, args: redactSecrets(JSON.stringify(entry.args ?? {})) }) + "\n", "utf8")
  } catch { /* audit is best-effort, never block execution */ }
}
