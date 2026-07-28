/**
 * Audit replay CLI: reconstruct recorded session history.
 *
 * This module handles argument parsing, formatting, and output writing.
 * All derivation logic lives in session/epistemic/audit-replay.ts.
 *
 * Invariant: Audit replay proves only what was recorded. It does not
 * prove that the historical conclusion remains correct today.
 */

import * as fs from "node:fs"
import * as path from "node:path"
import type Database from "better-sqlite3"
import type { CommandModule } from "yargs"

import {
  deriveAuditReplay,
  type AuditReplay,
  type AuditReplayEntry,
} from "../../session/epistemic/audit-replay.js"

// Re-export core types for test compatibility
export { deriveAuditReplay }
export type { AuditReplay, AuditReplayEntry }

// ────────────────────────────────────────────────────────────────
// Secret redaction
// ────────────────────────────────────────────────────────────────

export function isSecretValue(key: string): boolean {
  const k = key.toLowerCase()
  return (
    k.includes("key") ||
    k.includes("secret") ||
    k.includes("token") ||
    k.includes("password") ||
    k.includes("credential") ||
    k === "authorization"
  )
}

export function redactSecrets(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj
  if (typeof obj !== "object") return obj
  if (Array.isArray(obj)) return obj.map(redactSecrets)
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (isSecretValue(key)) {
      result[key] = "[REDACTED]"
    } else if (typeof value === "object" && value !== null) {
      result[key] = redactSecrets(value)
    } else {
      result[key] = value
    }
  }
  return result
}

// ────────────────────────────────────────────────────────────────
// Formatting
// ────────────────────────────────────────────────────────────────

function formatTimelineEntry(entry: AuditReplayEntry): string {
  const seq = String(entry.sequence).padStart(4, " ")
  const typePart = entry.type.replace(/\./g, " ").padEnd(22, " ")
  // Extract the detail portion after the type name
  const detail = entry.summary.replace(/^[^:]+:\s*/, "").trim()
  const prefix = entry.summary.includes(":") ? ` ${detail}` : ""
  return `${seq}  ${typePart}${prefix}`
}

export function formatTerminal(replay: AuditReplay): string {
  const lines: string[] = []

  lines.push("audit replay    session " + replay.sessionId)
  lines.push(`proof           ${replay.source.proofHash ? replay.source.proofHash.slice(0, 16) + "..." : "none"}`)
  lines.push(`export consistency  ${replay.verification.exportConsistency}`)
  lines.push(`source events       ${replay.verification.sourceEvents}`)
  lines.push(`global chain        ${replay.verification.globalChain}`)
  lines.push(`trace           ${replay.verification.traceHealth}`)
  lines.push(`lifecycle       ${replay.verification.lifecycle}`)
  lines.push("")

  for (const entry of replay.timeline) {
    lines.push(formatTimelineEntry(entry))
  }

  lines.push("")
  lines.push(`warnings         ${replay.reconstructionWarnings.length}`)

  const toolCalls = replay.timeline.filter(e => e.type === "tool.called")
  const toolReturns = replay.timeline.filter(e => e.type === "tool.returned")
  lines.push(`tools             ${toolCalls.length} called · ${toolReturns.length} returned`)

  const claimsCreated = replay.timeline.filter(e => e.type === "claim.created")
  const claimsTransitioned = replay.timeline.filter(e => e.type === "claim.transitioned")
  lines.push(`claims            ${claimsCreated.length} created · ${claimsTransitioned.length} transitions`)

  const obligationsCreated = replay.timeline.filter(e => e.type === "obligation.created")
  const obligationsResolved = replay.timeline.filter(e => e.type === "obligation.resolved")
  lines.push(`obligations       ${obligationsResolved.length}/${obligationsCreated.length} resolved`)

  if (replay.reconstructionWarnings.length > 0) {
    lines.push("")
    lines.push("warnings:")
    for (const w of replay.reconstructionWarnings) {
      lines.push(`  ${w.category}: ${w.message}`)
    }
  }

  lines.push("")
  lines.push("limitation:")
  lines.push("  " + replay.limitations[replay.limitations.length - 1])

  return lines.join("\n")
}

export function formatJSON(replay: AuditReplay): string {
  return JSON.stringify(replay, null, 2) + "\n"
}

export function formatMarkdown(replay: AuditReplay): string {
  const lines: string[] = []

  lines.push("# Audit Replay")
  lines.push("")
  lines.push(`- **Session**: \`${replay.sessionId}\``)
  lines.push(`- **Generated**: ${replay.generatedAt}`)
  lines.push(`- **Events**: ${replay.source.eventCount}`)
  lines.push("")
  lines.push("## Verification")
  lines.push("")
  lines.push(`- Export consistency: ${replay.verification.exportConsistency}`)
  lines.push(`- Source events: ${replay.verification.sourceEvents}`)
  lines.push(`- Global chain: ${replay.verification.globalChain}`)
  lines.push(`- Trace: ${replay.verification.traceHealth}`)
  lines.push(`- Lifecycle: ${replay.verification.lifecycle}`)
  lines.push("")
  lines.push("## Timeline")
  lines.push("")
  lines.push("```")
  for (const entry of replay.timeline) {
    lines.push(formatTimelineEntry(entry))
  }
  lines.push("```")
  lines.push("")

  if (replay.reconstructionWarnings.length > 0) {
    lines.push("## Warnings")
    lines.push("")
    for (const w of replay.reconstructionWarnings) {
      lines.push(`- **${w.category}**: ${w.message}`)
    }
    lines.push("")
  }

  lines.push("## Limitations")
  lines.push("")
  for (const lim of replay.limitations) {
    lines.push(`- ${lim}`)
  }

  return lines.join("\n") + "\n"
}

export function exportAuditReplay(replay: AuditReplay, format: "json" | "markdown"): string {
  return format === "json" ? formatJSON(replay) : formatMarkdown(replay)
}

// ────────────────────────────────────────────────────────────────
// Atomic output
// ────────────────────────────────────────────────────────────────

interface ReplayExportPaths {
  readonly jsonPath: string
  readonly mdPath: string
}

export function getReplayExportPaths(sessionId: string, outputDir?: string): ReplayExportPaths {
  const dir = outputDir ?? path.join(".arcana", "proofs")
  return {
    jsonPath: path.join(dir, `${sessionId}.audit-replay.v1.json`),
    mdPath: path.join(dir, `${sessionId}.audit-replay.v1.md`),
  }
}

export function writeReplayExport(replay: AuditReplay, outputDir?: string): ReplayExportPaths {
  const paths = getReplayExportPaths(replay.sessionId, outputDir)
  const dir = outputDir ?? path.join(".arcana", "proofs")
  fs.mkdirSync(dir, { recursive: true })

  // Atomic write for JSON
  const jsonTmp = paths.jsonPath + ".tmp"
  fs.writeFileSync(jsonTmp, formatJSON(replay))
  fs.renameSync(jsonTmp, paths.jsonPath)

  // Atomic write for Markdown
  const mdTmp = paths.mdPath + ".tmp"
  fs.writeFileSync(mdTmp, formatMarkdown(replay))
  fs.renameSync(mdTmp, paths.mdPath)

  return paths
}

// ────────────────────────────────────────────────────────────────
// ReplayCommand (yargs)
// ────────────────────────────────────────────────────────────────

export class ReplayCommand {
  command = "replay"
  describe = "Audit replay of recorded sessions"

  builder(yargs: any) {
    return yargs.command({
      command: "audit <session-id>",
      describe: "Reconstruct what was recorded for a session",
      builder: (y: any) => {
        y.positional("session-id", { describe: "Session ID", type: "string" })
        y.option("format", { describe: "Output format", choices: ["terminal", "json", "markdown"], default: "terminal" })
        y.option("output", { describe: "Export to .arcana/proofs/", type: "string" })
      },
      handler: async (argv: any) => {
        const sessionId = argv["session-id"] as string
        const format = argv.format as "terminal" | "json" | "markdown"
        const outputDir = argv.output as string | undefined

        const Database = (await import("better-sqlite3")).default
        const { getDatabasePath } = await import("@examples/infra-lib")
        const dbPath = getDatabasePath()
        const db = new Database(dbPath, { readonly: true })

        try {
          const replay = deriveAuditReplay(db, sessionId)

          if (format === "json") {
            console.log(formatJSON(replay))
          } else if (format === "markdown") {
            console.log(formatMarkdown(replay))
          } else {
            console.log(formatTerminal(replay))
          }

          if (outputDir) {
            const paths = writeReplayExport(replay, outputDir)
            console.error(`\nWrote: ${paths.jsonPath}`)
            console.error(`Wrote: ${paths.mdPath}`)
          }
        } finally {
          db.close()
        }
      },
    })
  }

  handler() {}
}
