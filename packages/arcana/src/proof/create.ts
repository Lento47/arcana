// SPDX-License-Identifier: MIT OR LicenseRef-arcana-Commercial
// Copyright (c) 2026 arcana contributors

import { randomUUID } from "node:crypto"
import { execFileSync } from "node:child_process"
import { RUNPROOF_SCHEMA_VERSION, type RunProof, type RunProofStatus, type TUICommandReflection } from "./types.js"

function tryGit(args: string[], cwd: string): string | undefined {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || undefined
  } catch {
    return undefined
  }
}

function currentRepoSnapshot(cwd: string): RunProof["repo"] {
  const commit = tryGit(["rev-parse", "HEAD"], cwd)
  const branch = tryGit(["rev-parse", "--abbrev-ref", "HEAD"], cwd)
  const status = tryGit(["status", "--porcelain"], cwd)

  return {
    path: cwd,
    commit,
    branch,
    dirty_before: Boolean(status),
  }
}

export function createRunProof(input: { user_intent: string; cwd?: string; command?: string }): RunProof {
  const now = new Date().toISOString()
  const id = `rp_${randomUUID()}`
  const cwd = input.cwd ?? process.cwd()

  const proof: RunProof = {
    id,
    schema_version: RUNPROOF_SCHEMA_VERSION,
    timestamp: now,
    repo: currentRepoSnapshot(cwd),
    user_intent: input.user_intent,
    lifecycle: {
      status: "created",
      started_at: now,
    },
    command_history: [],
    plan: {
      summary: "RunProof created. Plan capture pending.",
      steps: [],
      assumptions: [],
    },
    execution: {
      tool_calls: [],
      mcp_calls: [],
      file_reads: [],
      file_writes: [],
      shell_commands: [],
    },
    diffs: {
      proposed: [],
      applied: [],
      rejected: [],
    },
    verification: {
      diagnostics: [],
      tests: [],
      manual_checks: [],
    },
    risk: {
      level: "low",
      reasons: ["Initial proof object created before agent/tool execution."],
      required_approval: false,
    },
    rollback: {
      checkpoint_id: "none",
      strategy: "none",
    },
    unresolved: {
      unverified_assumptions: [],
      skipped_tests: [],
      known_limitations: [],
    },
    final_evidence: {
      completed: false,
      summary: "Run has not completed yet.",
      files_changed: [],
      commands_run: [],
      proof_score: 0,
      human_review_recommended: true,
    },
  }

  if (input.command) {
    recordCommand(proof, {
      command: input.command,
      source: "user",
      state_before: "created",
      state_after: "created",
      visible_in_tui: true,
      reversible: false,
      result_summary: "RunProof initialized from user command.",
    })
  }

  return proof
}

export function recordCommand(
  proof: RunProof,
  input: Omit<TUICommandReflection, "id" | "timestamp" | "runproof_id">,
): TUICommandReflection {
  const entry: TUICommandReflection = {
    id: `cmd_${randomUUID()}`,
    timestamp: new Date().toISOString(),
    runproof_id: proof.id,
    ...input,
  }

  proof.command_history.push(entry)
  proof.lifecycle.status = input.state_after
  return entry
}

export function completeRunProof(
  proof: RunProof,
  input: {
    status: Extract<RunProofStatus, "completed" | "failed" | "cancelled" | "rolled_back">
    summary: string
    files_changed?: string[]
    commands_run?: string[]
    proof_score?: number
    human_review_recommended?: boolean
  },
): RunProof {
  proof.lifecycle.status = input.status
  proof.lifecycle.ended_at = new Date().toISOString()
  proof.final_evidence = {
    completed: input.status === "completed",
    summary: input.summary,
    files_changed: input.files_changed ?? proof.final_evidence.files_changed,
    commands_run: input.commands_run ?? proof.final_evidence.commands_run,
    proof_score: input.proof_score ?? proof.final_evidence.proof_score,
    human_review_recommended: input.human_review_recommended ?? true,
  }
  return proof
}
