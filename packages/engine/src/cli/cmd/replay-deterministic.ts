/**
 * Deterministic replay CLI command.
 *
 * Re-executes verifiable local commands under validated constraints.
 * Every command must pass the allowlist policy before execution.
 *
 * This module handles argument parsing, formatting, and output writing.
 * All replay logic lives in session/epistemic/deterministic-replay.ts.
 */

import * as fs from "node:fs"
import * as path from "node:path"

import {
  deriveDeterministicReplay,
  type DeterministicReplayResult,
} from "../../session/epistemic/deterministic-replay.js"

// Re-export core types
export { deriveDeterministicReplay }
export type { DeterministicReplayResult }

// ────────────────────────────────────────────────────────────────
// Formatting
// ────────────────────────────────────────────────────────────────

export function formatDeterministicTerminal(result: DeterministicReplayResult): string {
  const lines: string[] = []

  lines.push(`deterministic replay  session ${result.sourceSessionId}`)
  lines.push(`replay id        ${result.replayId}`)
  lines.push(`status           ${result.status}`)
  lines.push(`p2 eligible      ${result.p2Eligible ? "YES" : "NO"}`)
  lines.push(`environment      ${result.environmentCompatibility}`)
  lines.push(`attempted at     ${result.attemptedAt}`)
  lines.push("")

  for (const step of result.steps) {
    const seq = String(step.eventSequence).padStart(4, " ")
    const statusPart = step.status.padEnd(8, " ")
    const cmd = step.command ?? "(no command)"
    const reason = step.refusalReason ? ` — ${step.refusalReason}` : ""
    lines.push(`${seq}  ${statusPart} ${cmd}${reason}`)
  }

  if (result.steps.length === 0) {
    lines.push("  (no eligible tool.called events)")
  }

  lines.push("")
  lines.push(`steps: ${result.steps.length} total, ${result.steps.filter(s => s.status === "SUCCESS").length} success, ${result.steps.filter(s => s.status === "FAILED").length} failed, ${result.steps.filter(s => s.status === "REFUSED").length} refused`)

  if (result.refusalReasons.length > 0) {
    lines.push("")
    lines.push("refusal reasons:")
    for (const reason of result.refusalReasons) {
      lines.push(`  - ${reason}`)
    }
  }

  lines.push("")
  lines.push("limitation:")
  lines.push("  Historical commands re-executed under policy constraints.")
  lines.push("  Output comparison is deterministic only if the environment has not drifted.")
  lines.push("  A valid historical trace can describe a result that is no longer correct.")

  return lines.join("\n")
}

export function formatDeterministicJSON(result: DeterministicReplayResult): string {
  return JSON.stringify(result, null, 2) + "\n"
}

export function formatDeterministicMarkdown(result: DeterministicReplayResult): string {
  const lines: string[] = []

  lines.push("# Deterministic Replay")
  lines.push("")
  lines.push(`- **Session**: \`${result.sourceSessionId}\``)
  lines.push(`- **Replay ID**: \`${result.replayId}\``)
  lines.push(`- **Status**: ${result.status}`)
  lines.push(`- **P2 Eligible**: ${result.p2Eligible ? "YES" : "NO"}`)
  lines.push(`- **Environment**: ${result.environmentCompatibility}`)
  lines.push(`- **Attempted**: ${result.attemptedAt}`)
  lines.push("")
  lines.push("## Steps")
  lines.push("")
  for (const step of result.steps) {
    lines.push(`- **${step.status}** (seq ${step.eventSequence}): \`${step.command ?? "(no command)"}\``)
    if (step.refusalReason) {
      lines.push(`  - Reason: ${step.refusalReason}`)
    }
    if (step.exitCodeMatch !== undefined) {
      lines.push(`  - Exit code: ${step.exitCodeMatch ? "match" : "MISMATCH"} (original=${step.originalExitCode}, replay=${step.replayExitCode})`)
    }
    if (step.outputDigestMatch !== undefined) {
      lines.push(`  - Output: ${step.outputDigestMatch ? "match" : "MISMATCH"}`)
    }
  }

  if (result.refusalReasons.length > 0) {
    lines.push("")
    lines.push("## Refusal Reasons")
    lines.push("")
    for (const reason of result.refusalReasons) {
      lines.push(`- ${reason}`)
    }
  }

  lines.push("")
  lines.push("## Limitations")
  lines.push("")
  lines.push("- Historical commands re-executed under policy constraints.")
  lines.push("- Output comparison is deterministic only if the environment has not drifted.")
  lines.push("- A valid historical trace can describe a result that is no longer correct.")

  return lines.join("\n") + "\n"
}

// ────────────────────────────────────────────────────────────────
// Atomic output
// ────────────────────────────────────────────────────────────────

export interface DeterministicReplayExportPaths {
  readonly jsonPath: string
  readonly mdPath: string
}

export function getDeterministicReplayExportPaths(sessionId: string, replayId: string, outputDir?: string): DeterministicReplayExportPaths {
  const dir = outputDir ?? path.join(".arcana", "proofs")
  return {
    jsonPath: path.join(dir, `${sessionId}.deterministic-replay.${replayId}.v1.json`),
    mdPath: path.join(dir, `${sessionId}.deterministic-replay.${replayId}.v1.md`),
  }
}

export function writeDeterministicReplayExport(result: DeterministicReplayResult, outputDir?: string): DeterministicReplayExportPaths {
  const paths = getDeterministicReplayExportPaths(result.sourceSessionId, result.replayId, outputDir)
  const dir = outputDir ?? path.join(".arcana", "proofs")
  fs.mkdirSync(dir, { recursive: true })

  const jsonTmp = paths.jsonPath + ".tmp"
  fs.writeFileSync(jsonTmp, formatDeterministicJSON(result))
  fs.renameSync(jsonTmp, paths.jsonPath)

  const mdTmp = paths.mdPath + ".tmp"
  fs.writeFileSync(mdTmp, formatDeterministicMarkdown(result))
  fs.renameSync(mdTmp, paths.mdPath)

  return paths
}

// ────────────────────────────────────────────────────────────────
// ReplayDeterministicCommand (yargs)
// ────────────────────────────────────────────────────────────────

export class ReplayDeterministicCommand {
  command = "deterministic"
  describe = "Bounded deterministic replay of historical commands"

  builder(yargs: any) {
    return yargs.command({
      command: "run <session-id>",
      describe: "Re-execute eligible historical commands under policy constraints",
      builder: (y: any) => {
        y.positional("session-id", { describe: "Session ID to replay", type: "string" })
        y.option("format", { describe: "Output format", choices: ["terminal", "json", "markdown"], default: "terminal" })
        y.option("output", { describe: "Export to .arcana/proofs/", type: "string" })
        y.option("dry-run", { describe: "Check policy without executing", type: "boolean", default: false })
      },
      handler: async (argv: any) => {
        const sessionId = argv["session-id"] as string
        const format = argv.format as "terminal" | "json" | "markdown"
        const outputDir = argv.output as string | undefined
        const dryRun = argv["dry-run"] as boolean

        const { openReplayDatabase } = await import("./replay-db")
        const db = openReplayDatabase(true)

        try {
          const result = deriveDeterministicReplay(db, sessionId, { dryRun })

          if (format === "json") {
            console.log(formatDeterministicJSON(result))
          } else if (format === "markdown") {
            console.log(formatDeterministicMarkdown(result))
          } else {
            console.log(formatDeterministicTerminal(result))
          }

          if (outputDir) {
            const paths = writeDeterministicReplayExport(result, outputDir)
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
