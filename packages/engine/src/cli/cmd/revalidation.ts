/**
 * Live revalidation CLI: check whether historical claims and obligations
 * are still valid now.
 *
 * DIFFERENT FROM REPLAY:
 *   Replay:       Can the recorded operation produce the same bounded result?
 *   Revalidation: Are the historical claims and obligations still valid?
 */

import * as fs from "node:fs"
import * as path from "node:path"
import type Database from "better-sqlite3"

import {
  deriveRevalidation,
  type RevalidationResult,
} from "../../session/epistemic/live-revalidation.js"

export { deriveRevalidation }
export type { RevalidationResult }

// ────────────────────────────────────────────────────────────────
// Formatting
// ────────────────────────────────────────────────────────────────

export function formatRevalidationTerminal(result: RevalidationResult): string {
  const lines: string[] = []

  lines.push(`live revalidation  session ${result.sourceSessionId}`)
  lines.push(`revalidation id  ${result.revalidationId}`)
  lines.push(`status           ${result.status}`)
  lines.push(`started          ${result.startedAt}`)
  lines.push(`completed        ${result.completedAt}`)
  lines.push("")

  if (result.environmentDrift.length > 0) {
    lines.push("environment drift:")
    for (const d of result.environmentDrift) {
      lines.push(`  ${d.severity} ${d.identifier}: ${d.expected ?? "?"} → ${d.actual ?? "MISSING"}`)
    }
  } else {
    lines.push("environment drift: none detected")
  }

  if (result.artifactDrift.length > 0) {
    lines.push("artifact drift:")
    for (const d of result.artifactDrift) {
      lines.push(`  ${d.severity} ${d.identifier}`)
    }
  }

  lines.push("")

  if (result.obligationResults.length > 0) {
    lines.push(`obligations: ${result.obligationResults.length} revalidated`)
    for (const o of result.obligationResults) {
      lines.push(`  ${o.obligationId} ${o.revalidationStatus}${o.reason ? ` — ${o.reason}` : ""}`)
    }
  } else {
    lines.push("obligations: none")
  }

  if (result.claimTransitions.length > 0) {
    lines.push(`claims: ${result.claimTransitions.length} revalidated`)
    for (const c of result.claimTransitions) {
      lines.push(`  ${c.claimId} ${c.revalidationAction} [${c.historicalLevel}]${c.reason ? ` — ${c.reason}` : ""}`)
    }
  } else {
    lines.push("claims: none")
  }

  lines.push("")
  lines.push("limitations:")
  for (const lim of result.limitations) {
    lines.push(`  ${lim}`)
  }

  return lines.join("\n")
}

export function formatRevalidationJSON(result: RevalidationResult): string {
  return JSON.stringify(result, null, 2) + "\n"
}

export function formatRevalidationMarkdown(result: RevalidationResult): string {
  const lines: string[] = []

  lines.push("# Live Revalidation")
  lines.push("")
  lines.push(`- **Session**: \`${result.sourceSessionId}\``)
  lines.push(`- **Revalidation ID**: \`${result.revalidationId}\``)
  lines.push(`- **Status**: ${result.status}`)
  lines.push(`- **Started**: ${result.startedAt}`)
  lines.push(`- **Completed**: ${result.completedAt}`)
  lines.push("")

  if (result.environmentDrift.length > 0) {
    lines.push("## Environment Drift")
    lines.push("")
    for (const d of result.environmentDrift) {
      lines.push(`- **${d.severity}** \`${d.identifier}\`: ${d.expected ?? "?"} → ${d.actual ?? "MISSING"}`)
    }
    lines.push("")
  }

  if (result.obligationResults.length > 0) {
    lines.push("## Obligations")
    lines.push("")
    for (const o of result.obligationResults) {
      lines.push(`- **${o.revalidationStatus}** \`${o.obligationId}\`: ${o.description}${o.reason ? ` — ${o.reason}` : ""}`)
    }
    lines.push("")
  }

  if (result.claimTransitions.length > 0) {
    lines.push("## Claims")
    lines.push("")
    for (const c of result.claimTransitions) {
      lines.push(`- **${c.revalidationAction}** \`${c.claimId}\` [${c.historicalLevel}]${c.reason ? ` — ${c.reason}` : ""}`)
    }
    lines.push("")
  }

  lines.push("## Limitations")
  lines.push("")
  for (const lim of result.limitations) {
    lines.push(`- ${lim}`)
  }

  return lines.join("\n") + "\n"
}

// ────────────────────────────────────────────────────────────────
// Atomic output
// ────────────────────────────────────────────────────────────────

export function writeRevalidationExport(result: RevalidationResult, outputDir?: string): { jsonPath: string; mdPath: string } {
  const dir = outputDir ?? path.join(".arcana", "proofs")
  fs.mkdirSync(dir, { recursive: true })

  const jsonPath = path.join(dir, `${result.sourceSessionId}.revalidation.${result.revalidationId}.v1.json`)
  const mdPath = path.join(dir, `${result.sourceSessionId}.revalidation.${result.revalidationId}.v1.md`)

  const jsonTmp = jsonPath + ".tmp"
  fs.writeFileSync(jsonTmp, formatRevalidationJSON(result))
  fs.renameSync(jsonTmp, jsonPath)

  const mdTmp = mdPath + ".tmp"
  fs.writeFileSync(mdTmp, formatRevalidationMarkdown(result))
  fs.renameSync(mdTmp, mdPath)

  return { jsonPath, mdPath }
}

// ────────────────────────────────────────────────────────────────
// CLI command
// ────────────────────────────────────────────────────────────────

export class RevalidationCommand {
  command = "revalidate"
  describe = "Live revalidation of historical claims and obligations"

  builder(yargs: any) {
    return yargs.command({
      command: "run <session-id>",
      describe: "Check whether historical claims and obligations are still valid",
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
          const result = deriveRevalidation(db, sessionId)

          if (format === "json") {
            console.log(formatRevalidationJSON(result))
          } else if (format === "markdown") {
            console.log(formatRevalidationMarkdown(result))
          } else {
            console.log(formatRevalidationTerminal(result))
          }

          if (outputDir) {
            const paths = writeRevalidationExport(result, outputDir)
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
