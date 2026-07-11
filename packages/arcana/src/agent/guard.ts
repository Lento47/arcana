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
  ["Generic", /[a-zA-Z0-9+/]{60,}={0,2}/g],
  ["Bearer", /bearer [a-zA-Z0-9._-]{20,}/gi],
  ["Password", /(password|passwd|pwd)\s*[:=]\s*\S+/gi],
]

const REDACTED = "`***REDACTED***`"
const GENERIC_IDX = SECRET_PATTERNS.findIndex(([name]) => name === "Generic")

/** Shannon entropy — low for predictable strings (hex SHAs ~3.0), high for random keys. */
function entropy(s: string): number {
  const freq = new Map<string, number>()
  for (const ch of s) freq.set(ch, (freq.get(ch) ?? 0) + 1)
  let h = 0
  for (const count of freq.values()) {
    const p = count / s.length
    h -= p * Math.log2(p)
  }
  return h
}

/** Strip secrets from text before sending to external APIs or logging to LLM context. */
export function redactSecrets(text: string): string {
  let result = text
  for (let i = 0; i < SECRET_PATTERNS.length; i++) {
    const [name, pattern] = SECRET_PATTERNS[i]!
    if (i === GENERIC_IDX) {
      // Generic pattern: only redact high-entropy matches to avoid
      // corrupting git SHAs, JWT segments, and other non-secret hex strings.
      result = result.replace(pattern, (match) => {
        if (/^[0-9a-fA-F]+$/.test(match)) return match // pure hex → skip
        if (entropy(match) <= 3.5) return match         // low entropy → skip
        return REDACTED
      })
    } else {
      result = result.replace(pattern, REDACTED)
    }
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
  // Catastrophic recursive-force delete of root/home. The previous pattern
  // (`rm -rf \/\b`) FAILED OPEN on the exact `rm -rf /` — `\b` needs a word
  // char after `/`, but at end-of-line there is none, so it never matched.
  // Match both flag orders (-rf / -fr, incl. -Rfv etc.) and root, root-glob, or ~.
  /\brm\s+-[a-z]*r[a-z]*f[a-z]*\s+(\/|~)(\*|\s|$)/i,
  /\brm\s+-[a-z]*f[a-z]*r[a-z]*\s+(\/|~)(\*|\s|$)/i,
  /\bmkfs\b/,
  /\bdd\s+if=/,
  /chmod\s+(-R\s+)?777\s+\//,
  /:\(\)\s*\{\s*:\|:&\s*\}\s*;:/,  // fork bomb
  /\bcurl\b.*\|\s*(ba)?sh\b/,        // curl pipe shell
  /\bwget\b.*\|\s*(ba)?sh\b/,
  /\bgit\s+push\s+--force\b.*\bmain\b/i,
]

const DESTRUCTIVE_TARGETS = /^(\/|~|~\/\*|[A-Za-z]:\\)/

/** Token-level rm/Remove-Item guard — catches separate flags and PowerShell. */
function checkRmRf(cmd: string): string | null {
  const tokens = cmd.trim().split(/\s+/)
  const cmd0 = tokens[0]?.toLowerCase()
  if (!cmd0) return null

  if (cmd0 === "rm" || cmd0.endsWith("/rm") || cmd0.endsWith("\\rm")) {
    let hasRecursive = false
    let hasForce = false
    let target = ""
    for (let i = 1; i < tokens.length; i++) {
      const t = tokens[i]!
      if (t === "-r" || t === "-R" || t === "--recursive") { hasRecursive = true; continue }
      if (t === "-f" || t === "--force") { hasForce = true; continue }
      // Combined flags: -rf, -fr, -Rfv, etc.
      if (/^-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*$/i.test(t)) return `Blocked dangerous command: rm -rf ${target || "(root)"}`
      if (/^-[a-zA-Z]*f[a-zA-Z]*r[a-zA-Z]*$/i.test(t)) return `Blocked dangerous command: rm -rf ${target || "(root)"}`
      if (!t.startsWith("-")) { target = t; break }
    }
    if (hasRecursive && hasForce && DESTRUCTIVE_TARGETS.test(target)) {
      return `Blocked dangerous command: rm -rf ${target}`
    }
  }

  // PowerShell: Remove-Item -Recurse -Force <destructive target>
  if (cmd0 === "remove-item") {
    let hasRecurse = false
    let hasForce = false
    let target = ""
    for (let i = 1; i < tokens.length; i++) {
      const t = tokens[i]!
      if (t.toLowerCase() === "-recurse") { hasRecurse = true; continue }
      if (t.toLowerCase() === "-force") { hasForce = true; continue }
      if (!t.startsWith("-")) { target = t; break }
    }
    if (hasRecurse && hasForce && DESTRUCTIVE_TARGETS.test(target)) {
      return `Blocked dangerous command: Remove-Item -Recurse -Force ${target}`
    }
  }

  return null
}

export function checkDangerousCommand(cmd: string): string | null {
  // Token-level rm/Remove-Item guard — catches separate flags and PowerShell
  const rmRf = checkRmRf(cmd)
  if (rmRf) return rmRf

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
