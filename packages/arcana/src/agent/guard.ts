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

// ── Git PII redaction ────────────────────────────────────────
/**
 * Matches email addresses in angle brackets — the canonical git format for
 * author/committer metadata in `git log`, `git blame`, `git show`, etc.
 *
 * Examples:
 *   `Author: Name <user@example.com>`  →  `Author: Name <REDACTED>`
 *   `(Name <user@example.com> date)`   →  `(Name <REDACTED> date)`
 *   `Name <user@users.noreply.github.com>`  →  left as-is (already private)
 */
const GIT_EMAIL_IN_BRACKETS = /<([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})>/g

/** Preserve GitHub private noreply emails — already anonymized by GitHub. */
const NOREPLY_DOMAIN = /@users\.noreply\.github\.com$/i

/** Preserve system / bot emails. */
const BOT_EMAIL = /^(bot|noreply|no-reply|support|admin|info)@/i

const GIT_PII_REDACTED = "<REDACTED>"

/**
 * Strip personal email addresses from git tool output (git log, git blame,
 * git show, etc.) while preserving privacy-safe noreply addresses.
 *
 * Designed to run alongside `redactSecrets()` in the tool output pipeline
 * (see AgentRunner.executeAuthorizedTool). Only redacts addresses inside
 * angle brackets to avoid false positives on non-git text.
 */
export function redactGitEmails(text: string): string {
  return text.replace(GIT_EMAIL_IN_BRACKETS, (match, email: string) => {
    // Preserve GitHub private noreply emails — already privacy-safe
    if (NOREPLY_DOMAIN.test(email)) return match
    // Preserve system/bot emails that carry no personal information
    if (BOT_EMAIL.test(email)) return match
    return GIT_PII_REDACTED
  })
}

// ── General PII redaction ─────────────────────────────────────

/** IPv4 address — redacts to `<IPV4>` */
const IPV4 = /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g

/** IPv6 address (simplified) — redacts to `<IPV6>` */
const IPV6 = /\b(?:[0-9a-fA-F]{1,4}:){1,7}(?::[0-9a-fA-F]{1,4}){1,7}\b|\b::[0-9a-fA-F]{1,4}\b/g

/** US phone number patterns: requires explicit formatting to avoid false positives on version/build numbers.
 * Matches: (555) 555-5555, 555-555-5555, 555.555.5555, +1 555 555 5555
 * Does NOT match: bare 10-digit numbers like build IDs or version strings. */
const PHONE_US = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g

/** Physical street address — requires a street type suffix to avoid false positives.
 * Matches: 123 Main Street, 456 Oak Ave, 789 Pine Blvd
 * Does NOT match: "3 files changed", "42 items", etc. */
const STREET_ADDRESS = /\b\d{1,5}\s+[A-Z][a-zA-Z]+\s+(?:Street|St|Avenue|Ave|Boulevard|Blvd|Road|Rd|Drive|Dr|Lane|Ln|Court|Ct|Place|Pl|Way|Circle|Cir)\b/g

const PII_REDACTED_IP = "<IP_REDACTED>"
const PII_REDACTED_PHONE = "<PHONE_REDACTED>"
const PII_REDACTED_ADDRESS = "<ADDRESS_REDACTED>"

/**
 * Strip common PII from tool output: IP addresses, phone numbers,
 * and physical street addresses. Applied alongside redactSecrets()
 * and redactGitEmails() in the tool output pipeline.
 *
 * Does NOT redact names (see redactGitAuthorNames for git-specific name redaction)
 * or email addresses (see redactGitEmails).
 */
export function redactPII(text: string): string {
  return text
    .replace(IPV4, PII_REDACTED_IP)
    .replace(IPV6, PII_REDACTED_IP)
    .replace(PHONE_US, PII_REDACTED_PHONE)
    .replace(STREET_ADDRESS, PII_REDACTED_ADDRESS)
}

// ── Git author name redaction ────────────────────────────────

/**
 * Matches git author/committer lines:
 *   `Author: Real Name <email@domain>`
 *   `Committer: Real Name <email@domain>`
 *
 * The name portion is personal PII. This redacts the name while preserving
 * the email (which redactGitEmails handles separately) and the role prefix.
 */
const GIT_AUTHOR_LINE = /^(Author|Committer):\s+([^<]+?)(?=\s*<)/m

/**
 * Matches parenthesized author in git blame output:
 *   `abc1234 (Real Name 2026-07-20) code here`
 *   `abc1234 (Real Name <email> 2026-07-20) code here`
 */
const GIT_BLAME_AUTHOR = /\(([A-Za-z][A-Za-z .'-]+)\s+(?:<[^>]+>\s+)?\d{4}-\d{2}-\d{2}/g

const GIT_NAME_REDACTED = "<NAME_REDACTED>"

/**
 * Strip personal names from git author/committer metadata.
 * Redacts the name in:
 *   - `Author: Real Name <email>` → `Author: <NAME_REDACTED> <email>`
 *   - `Committer: Real Name <email>` → `Committer: <NAME_REDACTED> <email>`
 *   - `abc1234 (Real Name 2026-07-20)` → `abc1234 (<NAME_REDACTED> 2026-07-20)`
 *
 * Preserves system accounts (e.g., "GitHub", "dependabot[bot]").
 * Designed to run after redactGitEmails() in the pipeline.
 */
export function redactGitAuthorNames(text: string): string {
  return text
    .replace(GIT_AUTHOR_LINE, (_, role: string, name: string) => {
      const trimmed = name.trim()
      // Preserve system/bot accounts
      if (/^(github|dependabot|bot|actions|noreply)/i.test(trimmed)) return `${role}: ${trimmed}`
      return `${role}: ${GIT_NAME_REDACTED}`
    })
    .replace(GIT_BLAME_AUTHOR, (match, name: string) => {
      const trimmed = name.trim()
      if (/^(github|dependabot|bot|actions|noreply)/i.test(trimmed)) return match
      return match.replace(trimmed, GIT_NAME_REDACTED)
    })
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
    fetch("https://api-arcana.otnelhq.com/api/team/" + orgId + "/audit/events", {
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
