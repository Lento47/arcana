// SPDX-License-Identifier: MIT OR LicenseRef-arcana-Commercial
// Copyright (c) 2026 arcana contributors

import type { RunProof, VerificationStatus } from "./types.js"
import { normalizeRunProof } from "./compat.js"

const mark = (status: VerificationStatus | "running") => {
  switch (status) {
    case "passed":
      return "✓"
    case "failed":
      return "✕"
    case "skipped":
      return "-"
    case "running":
      return "→"
    case "not_run":
      return "☐"
  }
}

const line = (label: string, value: string | number | boolean | undefined) => {
  if (value === undefined || value === "") return undefined
  return `${label.padEnd(18)} ${String(value)}`
}

const compactId = (id: string) => id.replace(/^rp_/, "").slice(0, 8)

function formatReplayTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toISOString()
}

function formatReplayRefs(refs: Record<string, string> | undefined): string {
  if (!refs || Object.keys(refs).length === 0) return ""
  return ` refs=${Object.entries(refs)
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}:${value}`)
    .join(",")}`
}

function policyGateEvents(proof: RunProof) {
  return proof.events.filter(
    (event) => event.data?.action === "shell_command" || event.data?.action === "file_mutation",
  )
}

export function renderRunProofTerminal(proof: RunProof): string {
  proof = normalizeRunProof(proof)
  const out: string[] = []
  out.push(`ARCANA RUNPROOF  •  ${compactId(proof.id)}  •  ${proof.risk.level.toUpperCase()} Risk`)
  out.push("")
  out.push("Intent")
  out.push(`  ${proof.user_intent}`)
  out.push("")
  out.push(`Status:  ${proof.lifecycle.status}`)
  out.push("")

  out.push("Execution Contract")
  out.push(`  Goal: ${proof.contract.goal}`)
  out.push(`  Scope: ${proof.contract.scope}`)
  out.push(`  Risk: ${proof.contract.risk_level}`)
  out.push(
    `  Approvals: ${proof.contract.required_approvals.length ? proof.contract.required_approvals.join(", ") : "none"}`,
  )
  out.push(`  Rollback: ${proof.contract.rollback_plan}`)
  out.push("")

  out.push("Plan")
  if (proof.plan.steps.length === 0) out.push("  ☐ plan capture pending")
  for (const step of proof.plan.steps) {
    const glyph =
      step.status === "executed" ? "✓" : step.status === "failed" ? "✕" : step.status === "skipped" ? "-" : "·"
    out.push(`  ${glyph} ${step.description}`)
  }
  out.push("")

  out.push("Context Access")
  if (proof.execution.file_reads.length === 0) out.push("  no context files recorded")
  for (const read of proof.execution.file_reads.slice(0, 12)) {
    out.push(`  ${read.path}${read.exists === false ? " (missing)" : ""} — ${read.reason}`)
  }
  if (proof.execution.file_reads.length > 12) out.push(`  ... ${proof.execution.file_reads.length - 12} more`)
  out.push("")

  out.push("File Writes")
  if (proof.execution.file_writes.length === 0) out.push("  no file writes recorded")
  for (const write of proof.execution.file_writes.slice(0, 12)) {
    out.push(`  ${write.mode}  ${write.path} — ${write.reason}`)
  }
  if (proof.execution.file_writes.length > 12) out.push(`  ... ${proof.execution.file_writes.length - 12} more`)
  out.push("")

  const proposed = proof.diffs.proposed.length
  const applied = proof.diffs.applied.length
  const rejected = proof.diffs.rejected.length
  out.push(`Diffs (${proposed + applied + rejected} files)`)
  if (proposed + applied + rejected === 0) out.push("  no diffs recorded")
  for (const diff of [...proof.diffs.proposed, ...proof.diffs.applied, ...proof.diffs.rejected]) {
    out.push(`  ${diff.path.padEnd(32)} +${diff.additions} -${diff.deletions}   ${diff.status}`)
  }
  out.push("")

  out.push("Verification")
  const checks = [
    proof.verification.typecheck ? `${mark(proof.verification.typecheck.status)} typecheck` : "☐ typecheck",
    proof.verification.lint ? `${mark(proof.verification.lint.status)} lint` : "☐ lint",
    proof.verification.build ? `${mark(proof.verification.build.status)} build` : "☐ build",
  ]
  out.push(`  ${checks.join("     ")}`)
  for (const test of proof.verification.tests) out.push(`  ${mark(test.status)} ${test.command} — ${test.summary}`)
  if (proof.verification.verifier_review) {
    out.push(
      `  ${mark(proof.verification.verifier_review.status)} verifier — ${proof.verification.verifier_review.summary}`,
    )
  }
  out.push("")

  out.push("Timeline")
  if (proof.events.length === 0) out.push("  no events recorded")
  for (const event of proof.events) out.push(`  [${event.type}] ${event.summary}`)
  out.push("")

  const gates = policyGateEvents(proof)
  out.push("Policy Gates")
  if (gates.length === 0) out.push("  no policy gates recorded")
  for (const gate of gates) {
    const blocked = gate.data?.blocked ? "blocked" : "allowed"
    out.push(`  ${blocked}  ${gate.risk ?? "unknown"}  ${gate.summary}`)
  }
  out.push("")

  out.push("Rollback")
  out.push(
    `  ${proof.rollback.strategy}${proof.rollback.restore_command ? `   → ${proof.rollback.restore_command}` : ""}`,
  )
  if (proof.rollback.restore_status) out.push(`  Status: ${proof.rollback.restore_status}`)
  if (proof.rollback.approval_required) out.push("  Approval required before restore execution")
  out.push("")

  out.push("Unresolved")
  const unresolved = [
    ...proof.unresolved.unverified_assumptions,
    ...proof.unresolved.skipped_tests,
    ...proof.unresolved.known_limitations,
  ]
  if (unresolved.length === 0) out.push("  none recorded")
  for (const item of unresolved) out.push(`  - ${item}`)
  out.push("")

  out.push("Final Evidence")
  out.push(`  ${proof.final_evidence.summary}`)
  out.push(`  Proof score: ${proof.final_evidence.proof_score}/100`)
  out.push(`  Human review recommended: ${proof.final_evidence.human_review_recommended ? "yes" : "no"}`)

  return out.join("\n")
}

export function renderRunProofMarkdown(proof: RunProof): string {
  proof = normalizeRunProof(proof)
  const lines: string[] = []
  lines.push(`# RunProof ${compactId(proof.id)}`)
  lines.push("")
  lines.push(`**Intent:** ${proof.user_intent}`)
  lines.push(`**Status:** ${proof.lifecycle.status}`)
  lines.push(`**Risk:** ${proof.risk.level}`)
  lines.push(`**Started:** ${proof.lifecycle.started_at}`)
  if (proof.lifecycle.ended_at) lines.push(`**Ended:** ${proof.lifecycle.ended_at}`)
  lines.push("")

  lines.push("## Repository")
  for (const entry of [
    line("Path", proof.repo.path),
    line("Branch", proof.repo.branch),
    line("Commit", proof.repo.commit),
    line("Dirty before", proof.repo.dirty_before),
  ].filter(Boolean))
    lines.push(`- ${entry}`)
  lines.push("")

  lines.push("## Execution Contract")
  lines.push(`- Goal: ${proof.contract.goal}`)
  lines.push(`- Scope: ${proof.contract.scope}`)
  lines.push(
    `- Allowed files: ${proof.contract.allowed_files.length ? proof.contract.allowed_files.join(", ") : "unspecified"}`,
  )
  lines.push(
    `- Allowed commands: ${proof.contract.allowed_commands.length ? proof.contract.allowed_commands.join(", ") : "unspecified"}`,
  )
  lines.push(`- Risk level: ${proof.contract.risk_level}`)
  lines.push(
    `- Required approvals: ${proof.contract.required_approvals.length ? proof.contract.required_approvals.join(", ") : "none"}`,
  )
  lines.push(`- Expected artifacts: ${proof.contract.expected_artifacts.join(", ")}`)
  lines.push(`- Rollback plan: ${proof.contract.rollback_plan}`)
  lines.push(`- Verification steps: ${proof.contract.verification_steps.join(", ")}`)
  lines.push("")

  lines.push("## Plan")
  lines.push(proof.plan.summary)
  lines.push("")
  if (proof.plan.steps.length === 0) lines.push("- [ ] Plan capture pending")
  for (const step of proof.plan.steps)
    lines.push(`- [${step.status === "executed" ? "x" : " "}] ${step.description} (${step.status})`)
  lines.push("")

  lines.push("## Context Access")
  if (proof.execution.file_reads.length === 0) lines.push("No context files recorded.")
  for (const read of proof.execution.file_reads) {
    lines.push(
      `- ${read.path}${read.exists === false ? " (missing)" : ""} — ${read.reason}${
        read.bytes_read === undefined ? "" : ` (${read.bytes_read} bytes)`
      }`,
    )
  }
  lines.push("")

  lines.push("## File Writes")
  if (proof.execution.file_writes.length === 0) lines.push("No file writes recorded.")
  for (const write of proof.execution.file_writes) {
    lines.push(
      `- ${write.mode} — ${write.path} — ${write.reason}${
        write.bytes_written === undefined ? "" : ` (${write.bytes_written} bytes)`
      }`,
    )
  }
  lines.push("")

  lines.push("## RunProof Timeline")
  if (proof.events.length === 0) lines.push("No timeline events recorded.")
  for (const event of proof.events) {
    lines.push(`- ${event.timestamp} — **${event.type}** — ${event.summary}`)
  }
  lines.push("")

  const gates = policyGateEvents(proof)
  lines.push("## Policy Gates")
  if (gates.length === 0) lines.push("No policy gates recorded.")
  for (const gate of gates) {
    lines.push(`- ${gate.data?.blocked ? "Blocked" : "Allowed"} — ${gate.risk ?? "unknown"} — ${gate.summary}`)
    const reasons = Array.isArray(gate.data?.reasons)
      ? gate.data.reasons.filter((item) => typeof item === "string")
      : []
    for (const reason of reasons) lines.push(`  - ${reason}`)
  }
  lines.push("")

  lines.push("## Command History")
  if (proof.command_history.length === 0) lines.push("No command reflections recorded.")
  for (const command of proof.command_history) {
    lines.push(`- \`${command.command}\` — ${command.source}, ${command.state_before} → ${command.state_after}`)
  }
  lines.push("")

  lines.push("## Diffs")
  const diffs = [...proof.diffs.proposed, ...proof.diffs.applied, ...proof.diffs.rejected]
  if (diffs.length === 0) lines.push("No diffs recorded.")
  for (const diff of diffs)
    lines.push(`- **${diff.path}**: +${diff.additions}/-${diff.deletions}, ${diff.status} — ${diff.summary}`)
  lines.push("")

  lines.push("## Verification")
  if (proof.verification.typecheck)
    lines.push(`- Typecheck: ${proof.verification.typecheck.status} — ${proof.verification.typecheck.summary}`)
  if (proof.verification.lint)
    lines.push(`- Lint: ${proof.verification.lint.status} — ${proof.verification.lint.summary}`)
  if (proof.verification.build)
    lines.push(`- Build: ${proof.verification.build.status} — ${proof.verification.build.summary}`)
  for (const test of proof.verification.tests)
    lines.push(`- Test: ${test.status} — \`${test.command}\` — ${test.summary}`)
  if (proof.verification.verifier_review)
    lines.push(
      `- Verifier: ${proof.verification.verifier_review.status} — ${proof.verification.verifier_review.summary}`,
    )
  lines.push("")

  lines.push("## Rollback")
  lines.push(`- Strategy: ${proof.rollback.strategy}`)
  lines.push(`- Checkpoint: ${proof.rollback.checkpoint_id}`)
  if (proof.rollback.restore_command) lines.push(`- Restore: \`${proof.rollback.restore_command}\``)
  if (proof.rollback.restore_status) lines.push(`- Restore status: ${proof.rollback.restore_status}`)
  if (proof.rollback.approval_required) lines.push("- Restore approval: required before execution")
  if (proof.rollback.staged_at) lines.push(`- Staged at: ${proof.rollback.staged_at}`)
  lines.push("")

  lines.push("## Final Evidence")
  lines.push(`- Completed: ${proof.final_evidence.completed}`)
  lines.push(`- Summary: ${proof.final_evidence.summary}`)
  lines.push(`- Proof score: ${proof.final_evidence.proof_score}/100`)
  lines.push(`- Human review recommended: ${proof.final_evidence.human_review_recommended}`)

  return `${lines.join("\n")}\n`
}

export function renderRunProofReplayLog(proof: RunProof): string {
  proof = normalizeRunProof(proof)
  const lines: string[] = []
  lines.push(`ARCANA RUNPROOF REPLAY ${proof.id}`)
  lines.push(`intent=${proof.user_intent}`)
  lines.push(`status=${proof.lifecycle.status}`)
  lines.push(`risk=${proof.risk.level}`)
  if (proof.repo.branch || proof.repo.commit) {
    lines.push(`repo=${proof.repo.branch ?? "unknown"}@${proof.repo.commit ?? "unknown"}`)
  }
  lines.push("")

  const timeline = [
    ...proof.events.map((event) => ({
      timestamp: event.timestamp,
      label: event.type,
      actor: event.actor,
      summary: event.summary,
      detail: [
        event.risk ? `risk=${event.risk}` : undefined,
        event.status ? `status=${event.status}` : undefined,
        formatReplayRefs(event.refs),
      ]
        .filter(Boolean)
        .join(" "),
    })),
    ...proof.command_history.map((command) => ({
      timestamp: command.timestamp,
      label: "command.reflected",
      actor: command.source,
      summary: command.command,
      detail: `state=${command.state_before}->${command.state_after} reversible=${command.reversible}`,
    })),
  ].sort((a, b) => a.timestamp.localeCompare(b.timestamp))

  if (timeline.length === 0) {
    lines.push("NO_EVENTS")
  } else {
    for (const entry of timeline) {
      lines.push(
        `${formatReplayTime(entry.timestamp)} ${entry.label} actor=${entry.actor} ${entry.summary}${
          entry.detail ? ` ${entry.detail}` : ""
        }`,
      )
    }
  }

  lines.push("")
  lines.push(`rollback.strategy=${proof.rollback.strategy}`)
  lines.push(`rollback.checkpoint=${proof.rollback.checkpoint_id}`)
  if (proof.rollback.restore_command) lines.push(`rollback.restore=${proof.rollback.restore_command}`)
  if (proof.rollback.restore_status) lines.push(`rollback.restore_status=${proof.rollback.restore_status}`)
  if (proof.rollback.approval_required) lines.push("rollback.approval_required=true")
  lines.push(`proof.score=${proof.final_evidence.proof_score}`)
  lines.push(`human_review_recommended=${proof.final_evidence.human_review_recommended}`)

  return `${lines.join("\n")}\n`
}
