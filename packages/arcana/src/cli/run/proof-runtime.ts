// SPDX-License-Identifier: MIT OR LicenseRef-arcana-Commercial
// Copyright (c) 2026 arcana contributors

import { execFileSync } from "node:child_process"

import type { PolicyDecision, ToolSignal as MlToolSignal, TurnSignal as MlTurnSignal } from "@arcana/ml"
import {
  ProofManager,
  type RiskLevel,
  type RunProofStatus,
  type StoredRunProof,
  type VerificationStatus,
} from "../../proof/index.js"

const ARCANA_SLASH_OBJECTIVES: Record<string, string> = {
  contract:
    "Compile the task into an execution contract first: goal, scope, allowed work, risk, approvals, artifacts, rollback, and verification.",
  actions:
    "Execute the task as an auditable action timeline: plan, inspected context, tool requests, decisions, commands, diffs, checks, and evidence.",
  diffgate:
    "Treat file changes as gated mutations: identify intended diffs, risk, required review, verification gates, and rollback before accepting changes.",
  verify:
    "Prioritize verification: define evidence requirements, run or request checks, report failures, and avoid claiming completion without proof.",
  sovereignty:
    "Prioritize provider and model accountability: expose route, model choice, data boundary, fallback behavior, cost, latency, and privacy implications.",
  consensus:
    "Prepare a consensus work packet for the task: gather proposals, critiques, votes, agreement, disagreement, and durable evidence when recorded participants are available.",
}

export type ProofRuntimeOptions = {
  enabled: boolean
  prompt?: string
  command: string
  cwd?: string
}

export type ProofRuntime = {
  manager?: ProofManager
  enabled: boolean
  activeProofPath(): string | undefined
  recordArcanaSlashTask(input: ArcanaSlashTask): Promise<void>
  recordModelRoute(input: {
    provider: string
    model: string
    route: "local" | "cloud"
    reason: string
    data_left_local: boolean
    selection_source?: "cli" | "config" | "autodetect"
    fallback_provider?: string
    fallback_model?: string
    data_boundary?: "local" | "cloud"
    estimated_cost_usd?: number
    latency_ms?: number
  }): Promise<void>
  recordUserCommand(command: string, summary?: string): Promise<void>
  recordSystemTransition(status: RunProofStatus, summary?: string): Promise<void>
  gateShellCommand(
    command: string,
    options?: {
      cwd?: string
      approved?: boolean
      sandboxEnabled?: boolean
      userSovereignty?: {
        requireApprovalForWrites?: boolean
        requireApprovalForNetwork?: boolean
        preferLocal?: boolean
      }
    },
  ): Promise<{
    blocked: boolean
    risk: string
    reasons: string[]
  }>
  gateFileMutation(
    path: string,
    options?: {
      operation?: string
      approved?: boolean
      sandboxEnabled?: boolean
      userSovereignty?: {
        requireApprovalForWrites?: boolean
        requireApprovalForNetwork?: boolean
        preferLocal?: boolean
      }
      guardRules?: readonly string[]
    },
  ): Promise<{
    blocked: boolean
    risk: string
    reasons: string[]
  }>
  recordMlSignal(input: {
    kind: "turn" | "tool"
    signal: MlTurnSignal | MlToolSignal
    decision?: PolicyDecision
    summary?: string
    refs?: Record<string, string>
  }): Promise<void>
  recordContextBudget(input: {
    estimated_tokens: number
    system_tokens: number
    tool_tokens: number
    message_count: number
    threshold: number
    action: "observe" | "compact" | "block"
    summary?: string
  }): Promise<void>
  recordContextAccess(input: {
    tool: "read" | "grep" | "glob"
    path?: string
    pattern?: string
    summary: string
    exists?: boolean
    bytes_read?: number
    result_count?: number
  }): Promise<void>
  recordToolBatch?(input: {
    run_id: string
    plan_summary: string
    waves: number
    calls: number
    ok: number
    failed: number
    cancelled: number
    max_active: number
    duration_ms: number
    summary?: string
  }): Promise<void>
  recordFileWrite(input: {
    path: string
    mode: "proposed" | "applied" | "rejected"
    reason: string
    diff_id?: string
    bytes_written?: number
  }): Promise<void>
  recordShellCommand(input: {
    command: string
    cwd: string
    status: "passed" | "failed" | "skipped" | "not_run"
    risk: RiskLevel | "unknown"
    exit_code?: number
    stdout_summary?: string
    stderr_summary?: string
  }): Promise<void>
  recordCheck(input: {
    kind: "typecheck" | "lint" | "build"
    command: string
    status: VerificationStatus
    summary: string
    duration_ms?: number
  }): Promise<void>
  recordTestResult(input: {
    command: string
    status: VerificationStatus
    summary: string
    passed?: number
    failed?: number
    skipped?: number
    duration_ms?: number
  }): Promise<void>
  recordConsensus(input: {
    council_id?: string
    prompt: string
    models: string[]
    rounds: number
    vote_mode: string
    status: "completed" | "failed"
    winner_model?: string
    vote_tally?: Record<string, number>
    cost_tokens?: { input: number; output: number }
    errored?: string[]
    transcript?: string
  }): Promise<void>
  recordAgentTurn(input: {
    input_summary: string
    output_summary: string
    tool_calls?: number
    input_tokens?: number
    output_tokens?: number
  }): Promise<void>
  finalizeCompleted(summary: string, proof_score?: number): Promise<void>
  finalizeFailed(error: unknown): Promise<void>
}

export type ArcanaSlashTask = {
  command: string
  task: string
  objective: string
}

function commandForPrompt(prompt: string | undefined): string {
  return prompt ? `arcana run --proof ${JSON.stringify(prompt)}` : "arcana run --proof"
}

export function parseArcanaSlashTask(input: string): ArcanaSlashTask | undefined {
  if (!input.startsWith("/")) return
  const firstLineEnd = input.indexOf("\n")
  const firstLine = firstLineEnd === -1 ? input : input.slice(0, firstLineEnd)
  const restOfInput = firstLineEnd === -1 ? "" : input.slice(firstLineEnd + 1)
  const [head = "", ...firstLineArgs] = firstLine.split(" ")
  const command = head.slice(1)
  const objective = ARCANA_SLASH_OBJECTIVES[command]
  if (!objective) return
  const task = (firstLineArgs.join(" ") + (restOfInput ? "\n" + restOfInput : "")).trim()
  if (!task) return
  return { command, task, objective }
}

function tryGit(args: string[], cwd: string): string | undefined {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || undefined
  } catch {
    return undefined
  }
}

function recordInitialRollback(manager: ProofManager, cwd: string): void {
  const commit = tryGit(["rev-parse", "HEAD"], cwd)
  if (!commit) return

  const status = tryGit(["status", "--porcelain"], cwd)
  const shortCommit = commit.slice(0, 12)
  const dirtySuffix = status ? "-dirty" : ""

  manager.updateRollback({
    strategy: "git_worktree",
    checkpoint_id: `${shortCommit}${dirtySuffix}`,
    restore_command: `git restore --source ${commit} --staged --worktree .`,
  })

  if (status) {
    manager.addKnownLimitation(
      "Rollback checkpoint restores tracked files only; pre-existing dirty or untracked files are not fully captured.",
    )
  }
}

function assessInitialRisk(input: { prompt?: string; command: string }): {
  level: RiskLevel
  reasons: string[]
  required_approval: boolean
} {
  const text = `${input.prompt ?? ""} ${input.command}`.toLowerCase()
  const reasons = ["Agent execution can inspect context, call tools, and mutate repository state."]

  if (
    /\b(prod|production|deploy|secret|credential|payment|billing|database|migration|drop|delete|remove|rm\s+-rf)\b/.test(
      text,
    )
  ) {
    return {
      level: "critical",
      reasons: [
        ...reasons,
        "Prompt or command references production, secrets, destructive operations, billing, or database migration risk.",
      ],
      required_approval: true,
    }
  }

  if (/\b(auth|security|permission|dependency|install|upgrade|lockfile|package|token)\b/.test(text)) {
    return {
      level: "high",
      reasons: [
        ...reasons,
        "Prompt or command references security, auth, permissions, dependency, or token-sensitive work.",
      ],
      required_approval: true,
    }
  }

  return {
    level: "medium",
    reasons,
    required_approval: false,
  }
}

function assessArcanaSlashTaskRisk(task: ArcanaSlashTask): {
  level: RiskLevel
  reasons: string[]
  required_approval: boolean
} {
  const text = `${task.command} ${task.task}`.toLowerCase()
  const reasons = [`Arcana /${task.command} task objective: ${task.objective}`]

  if (/\b(rm\s+-rf|delete|drop|truncate|destroy|wipe|reset\s+--hard|force-push|revoke|rotate\s+secret|prod(?:uction)?\s+deploy)\b/.test(text)) {
    return {
      level: "critical",
      reasons: [...reasons, "Task references destructive, production, credential, or irreversible operations."],
      required_approval: true,
    }
  }

  if (/\b(auth|security|permission|dependency|install|upgrade|lockfile|package|token|secret|credential|payment|billing|database|migration|deploy|production|prod)\b/.test(text)) {
    return {
      level: "high",
      reasons: [
        ...reasons,
        "Task references security, dependencies, data, deployment, billing, or credential-sensitive work.",
      ],
      required_approval: true,
    }
  }

  return {
    level: "medium",
    reasons: [...reasons, "Arcana slash tasks are governed execution requests and should produce evidence."],
    required_approval: false,
  }
}

function appendUnique(list: string[], value: string): void {
  if (!list.includes(value)) list.push(value)
}

async function saveAndPrint(manager: ProofManager): Promise<StoredRunProof> {
  const stored = await manager.save()
  process.stderr.write(`\n${manager.renderTerminal()}\n`)
  process.stderr.write(`\nProof JSON: ${stored.json_path}\n`)
  if (stored.markdown_path) process.stderr.write(`Proof Markdown: ${stored.markdown_path}\n`)
  process.stderr.write(`Proof Replay: ${stored.replay_path}\n`)
  return stored
}

export async function createProofRuntime(options: ProofRuntimeOptions): Promise<ProofRuntime> {
  const manager = options.enabled
    ? ProofManager.create({
        user_intent: options.prompt ?? "Interactive Arcana session",
        command: options.command || commandForPrompt(options.prompt),
        cwd: options.cwd,
      })
    : undefined
  let activePath: string | undefined

  if (manager) {
    manager.transitionState("planning", "Proof capture initialized; command execution entering planning state.")
    manager.updateRisk(
      assessInitialRisk({ prompt: options.prompt, command: options.command || commandForPrompt(options.prompt) }),
    )
    recordInitialRollback(manager, options.cwd ?? process.cwd())
  }

  async function saveSnapshot(): Promise<void> {
    if (!manager) return
    const stored = await manager.save()
    activePath = stored.json_path
    process.env.ARCANA_ACTIVE_RUNPROOF_PATH = activePath
  }
  await saveSnapshot()

  async function recordArcanaSlashTask(input: ArcanaSlashTask): Promise<void> {
    if (!manager) return
    const risk = assessArcanaSlashTaskRisk(input)
    manager.proof.contract.goal = input.task
    manager.proof.contract.scope = `Arcana /${input.command} governed task submitted by the operator.`
    manager.proof.contract.risk_level = risk.level
    appendUnique(manager.proof.contract.expected_artifacts, "RunProof evidence for Arcana slash task objective")
    appendUnique(manager.proof.contract.verification_steps, "Record evidence before claiming the Arcana task is complete.")
    if (risk.required_approval) appendUnique(manager.proof.contract.required_approvals, `Arcana /${input.command} task approval`)
    manager.updatePlanSummary(`/${input.command}: ${input.objective}`)
    manager.addPlanStep(input.objective)
    manager.updateRisk(risk)
    manager.recordEvent({
      type: "plan.created",
      actor: "user",
      summary: `Arcana /${input.command} task accepted: ${input.objective}`,
      risk: risk.level,
      status: risk.required_approval ? "awaiting_approval" : manager.proof.lifecycle.status,
      refs: { command: `/${input.command}`, contract_id: manager.proof.contract.id },
      data: {
        task: input.task,
        objective: input.objective,
        required_approval: risk.required_approval,
        reasons: risk.reasons,
      },
    })
    await saveSnapshot()
  }

  return {
    manager,
    enabled: Boolean(manager),
    activeProofPath: () => activePath,

    recordArcanaSlashTask,

    async recordModelRoute(input) {
      if (!manager) return
      manager.recordEvent({
        type: "sovereignty.routed",
        actor: "system",
        summary: `Provider route selected: ${input.model} via ${input.provider}.`,
        status: manager.proof.lifecycle.status,
        refs: { provider: input.provider, model: input.model },
        data: {
          provider: input.provider,
          model: input.model,
          route: input.route,
          reason: input.reason,
          data_left_local: input.data_left_local,
          selection_source: input.selection_source,
          fallback_provider: input.fallback_provider,
          fallback_model: input.fallback_model,
          data_boundary: input.data_boundary ?? input.route,
          estimated_cost_usd: input.estimated_cost_usd,
          latency_ms: input.latency_ms,
        },
      })
      await saveSnapshot()
    },

    async recordUserCommand(command, summary = "User command accepted.") {
      if (!manager) return
      manager.recordCommand({
        command,
        source: "user",
        state_before: manager.proof.lifecycle.status,
        state_after: "planning",
        visible_in_tui: true,
        reversible: false,
        result_summary: summary,
      })
      const arcanaTask = parseArcanaSlashTask(command)
      if (arcanaTask) await recordArcanaSlashTask(arcanaTask)
      await saveSnapshot()
    },

    async recordSystemTransition(status, summary) {
      if (!manager) return
      manager.transitionState(status, summary)
      await saveSnapshot()
    },

    async gateShellCommand(command, options = {}) {
      if (!manager) return { blocked: false, risk: "unknown", reasons: [] }
      const decision = manager.gateShellCommand(command, options, {
        sandboxEnabled: options.sandboxEnabled,
        userSovereignty: options.userSovereignty,
      })
      await saveSnapshot()
      return decision
    },

    async gateFileMutation(path, options = {}) {
      if (!manager) return { blocked: false, risk: "unknown", reasons: [] }
      const decision = manager.gateFileMutation(path, options, {
        sandboxEnabled: options.sandboxEnabled,
        userSovereignty: options.userSovereignty,
      })
      await saveSnapshot()
      return decision
    },

    async recordMlSignal(input) {
      if (!manager) return
      manager.recordMlSignal(input)
      await saveSnapshot()
    },

    async recordContextBudget(input) {
      if (!manager) return
      manager.recordContextBudget(input)
      await saveSnapshot()
    },

    async recordContextAccess(input) {
      if (!manager) return
      manager.recordContextAccess(input)
      await saveSnapshot()
    },

    async recordToolBatch(input) {
      if (!manager) return
      manager.recordToolBatch(input)
      await saveSnapshot()
    },

    async recordFileWrite(input) {
      if (!manager) return
      manager.recordFileWrite(input)
      await saveSnapshot()
    },

    async recordShellCommand(input) {
      if (!manager) return
      // The command has already been executed (or attempted) by the agent, so
      // classify it post-hoc with approval=true. We still evaluate policy to
      // capture the real risk level for the evidence record.
      const decision = manager.gateShellCommand(input.command, { cwd: input.cwd, approved: true })
      const risk = input.risk === "unknown" ? decision.risk : input.risk
      manager.recordShellCommand({ ...input, risk })
      await saveSnapshot()
    },

    async recordCheck(input) {
      if (!manager) return
      const result = {
        command: input.command,
        status: input.status,
        summary: input.summary,
        duration_ms: input.duration_ms,
      }
      if (input.kind === "typecheck") manager.setTypecheck(result)
      else if (input.kind === "lint") manager.setLint(result)
      else manager.setBuild(result)
      await saveSnapshot()
    },

    async recordTestResult(input) {
      if (!manager) return
      manager.addTestResult({
        command: input.command,
        status: input.status,
        summary: input.summary,
        passed: input.passed,
        failed: input.failed,
        skipped: input.skipped,
        duration_ms: input.duration_ms,
      })
      await saveSnapshot()
    },

    async recordConsensus(input) {
      if (!manager) return
      manager.recordEvent({
        type: "consensus.recorded",
        actor: "agent",
        summary:
          input.status === "completed"
            ? `Consensus completed${input.winner_model ? ` with winner ${input.winner_model}` : ""}.`
            : "Consensus failed before reaching a reliable result.",
        status: input.status === "completed" ? manager.proof.lifecycle.status : "failed",
        refs: {
          ...(input.council_id ? { council_id: input.council_id } : {}),
          ...(input.winner_model ? { winner_model: input.winner_model } : {}),
        },
        data: {
          prompt: input.prompt,
          models: input.models,
          rounds: input.rounds,
          vote_mode: input.vote_mode,
          status: input.status,
          vote_tally: input.vote_tally ?? {},
          cost_tokens: input.cost_tokens ?? { input: 0, output: 0 },
          errored: input.errored ?? [],
          transcript: input.transcript,
        },
      })
      await saveSnapshot()
    },

    async recordAgentTurn(input) {
      if (!manager) return
      manager.recordToolCall({
        name: "agent.run_turn",
        status: "passed",
        risk: "unknown",
        input_summary: input.input_summary,
        output_summary: input.output_summary,
      })
      manager.recordCommand({
        command: "agent.run_turn",
        source: "agent",
        state_before: manager.proof.lifecycle.status,
        state_after: "verifying",
        visible_in_tui: true,
        reversible: false,
        result_summary: `${input.tool_calls ?? 0} tool call(s), ${input.input_tokens ?? 0} input tokens, ${input.output_tokens ?? 0} output tokens.`,
      })
      manager.recordEvent({
        type: "token.used",
        actor: "agent",
        summary: `Agent turn used ${input.input_tokens ?? 0} input tokens and ${input.output_tokens ?? 0} output tokens.`,
        status: manager.proof.lifecycle.status,
        data: {
          input_tokens: input.input_tokens ?? 0,
          output_tokens: input.output_tokens ?? 0,
          total_tokens: (input.input_tokens ?? 0) + (input.output_tokens ?? 0),
          tool_calls: input.tool_calls ?? 0,
        },
      })
      await saveSnapshot()
    },

    async finalizeCompleted(summary, proof_score = 25) {
      if (!manager) return
      manager.recordCommand({
        command: "runproof.finalize",
        source: "system",
        state_before: manager.proof.lifecycle.status,
        state_after: "completed",
        visible_in_tui: true,
        reversible: false,
        result_summary: summary,
      })
      manager.finalize({
        status: "completed",
        summary,
        evidence: {
          proof_score,
          human_review_recommended: true,
          commands_run: manager.proof.command_history.map((entry) => entry.command),
        },
      })
      const stored = await saveAndPrint(manager)
      activePath = stored.json_path
      process.env.ARCANA_ACTIVE_RUNPROOF_PATH = activePath
    },

    async finalizeFailed(error) {
      if (!manager) return
      const summary = error instanceof Error ? error.message : String(error)
      manager.recordCommand({
        command: "runproof.finalize_failed",
        source: "system",
        state_before: manager.proof.lifecycle.status,
        state_after: "failed",
        visible_in_tui: true,
        reversible: false,
        result_summary: summary,
      })
      manager.finalize({
        status: "failed",
        summary,
        evidence: {
          proof_score: 10,
          human_review_recommended: true,
          commands_run: manager.proof.command_history.map((entry) => entry.command),
        },
      })
      const stored = await saveAndPrint(manager)
      activePath = stored.json_path
      process.env.ARCANA_ACTIVE_RUNPROOF_PATH = activePath
    },
  }
}
