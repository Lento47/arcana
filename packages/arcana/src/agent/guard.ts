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
  // Shell injection patterns — block metacharacters outside quoted strings
  if (/[;&|`$]/.test(cmd) && !/^["'].*["']$/.test(cmd.trim())) {
    return `Blocked: shell metacharacters detected in command`
  }
  for (const pattern of BLOCKED_COMMANDS) {
    if (pattern.test(cmd)) return `Blocked dangerous command: ${pattern.source.slice(0, 30)}`
  }
  return null
}

// ── Rate limiter ─────────────────────────────────────────────

export class RateLimiter {
  toolCount = 0
  webFetchCount = 0
  private maxTools: number
  private maxWebFetch: number

  constructor(maxTools = 50, maxWebFetch = 20) {
    this.maxTools = maxTools
    this.maxWebFetch = maxWebFetch
  }

  /** Returns warning message if approaching limit, throws on hard limit. */
  check(toolName: string): string | null {
    this.toolCount++
    if (toolName === "web_fetch" || toolName === "web_search") this.webFetchCount++

    if (this.toolCount >= this.maxTools) {
      throw new Error(`Rate limit: ${this.maxTools} tool calls per session exceeded`)
    }
    if (this.webFetchCount >= this.maxWebFetch) {
      throw new Error(`Rate limit: ${this.maxWebFetch} web fetch calls per session exceeded`)
    }

    if (this.toolCount >= this.maxTools * 0.8) return `⚠️ ${this.toolCount}/${this.maxTools} tool calls used`
    if (this.webFetchCount >= this.maxWebFetch * 0.8) return `⚠️ ${this.webFetchCount}/${this.maxWebFetch} web fetches used`
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
    const safeEntry = { ...entry, args: redactSecrets(JSON.stringify(entry.args ?? {})) }
    // Local append
    appendFileSync(auditPath, JSON.stringify(safeEntry) + "\n", "utf8")
    // Enterprise sync (fire-and-forget, best-effort)
    if (process.env.ARCANA_LICENSE_TIER && process.env.ARCANA_LICENSE_TIER !== "free") {
      const orgId = process.env.ARCANA_ORG_ID ?? "default"
      const actor = process.env.ARCANA_USER ?? process.env.USER ?? "local"
      fetch("https://api.arcana.otnelhq.com/api/team/" + orgId + "/audit/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          events: [{
            id: `${entry.ts}-${entry.tool}-${Math.random().toString(36).slice(2, 6)}`,
            actor,
            action: "tool.call",
            resource: entry.session ?? undefined,
            detail: { tool: entry.tool },
            tool: entry.tool,
            tool_args: safeEntry.args,
            tool_result: entry.result?.slice(0, 500),
            time_created: new Date(entry.ts).getTime(),
          }],
        }),
      }).catch(() => {})
    }
  } catch { /* audit is best-effort, never block execution */ }
}
