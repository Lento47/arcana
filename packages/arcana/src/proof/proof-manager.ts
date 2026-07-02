// SPDX-License-Identifier: MIT OR LicenseRef-arcana-Commercial
// Copyright (c) 2026 arcana contributors

import { analyzeTool, decideToolPolicy, formatPolicyDecision, formatToolSignalForAudit } from "@arcana/ml"
import type { PolicyDecision, RiskLevel as MlRiskLevel, ToolSignal as MlToolSignal } from "@arcana/ml"

import { completeRunProof, createRunProof, recordCommand, recordEvent } from "./create.js"
import { renderRunProofMarkdown, renderRunProofTerminal } from "./render.js"
import { saveRunProof, type ProofStoreTarget, type StoredRunProof } from "./store.js"
import type {
  CheckResult,
  CommandSource,
  ContextAccessRecord,
  DiagnosticResult,
  DiffRecord,
  FileAccessRecord,
  FileWriteRecord,
  FinalEvidence,
  MCPCallRecord,
  ManualCheck,
  PolicyGateDecision,
  RiskBlock,
  RiskLevel,
  RollbackBlock,
  RunProof,
  RunProofEvent,
  RunProofStatus,
  ShellCommandRecord,
  TestResult,
  ToolCallRecord,
  TUICommandReflection,
  VerificationStatus,
  VerifierResult,
} from "./types.js"

export type ProofManagerOptions = {
  user_intent: string
  cwd?: string
  command?: string
  contract?: Parameters<typeof createRunProof>[0]["contract"]
  store_target?: ProofStoreTarget
}

export type CommandReflectionInput = Omit<TUICommandReflection, "id" | "timestamp" | "runproof_id">
export type RunProofEventInput = Omit<RunProofEvent, "id" | "timestamp">

export type MlGateContext = {
  sandboxEnabled?: boolean
  userSovereignty?: {
    preferLocal?: boolean
    requireApprovalForWrites?: boolean
    requireApprovalForNetwork?: boolean
  }
}

export type DiffInput = Omit<DiffRecord, "id" | "status">
export type FileReadInput = Omit<FileAccessRecord, "id" | "timestamp">
export type FileWriteInput = Omit<FileWriteRecord, "id" | "timestamp">
export type ToolCallInput = Omit<ToolCallRecord, "id" | "timestamp">
export type MCPCallInput = Omit<MCPCallRecord, "id" | "timestamp">
export type ShellCommandInput = Omit<ShellCommandRecord, "id" | "timestamp">
export type ContextAccessInput = ContextAccessRecord

const riskRank: Record<RiskLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
}

function id(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`
}

function now(): string {
  return new Date().toISOString()
}

function clampProofScore(score: number): number {
  if (!Number.isFinite(score)) return 0
  return Math.max(0, Math.min(100, Math.round(score)))
}

function maxRisk(a: RiskLevel, b: RiskLevel): RiskLevel {
  return riskRank[a] >= riskRank[b] ? a : b
}

function uniq(items: string[]): string[] {
  return [...new Set(items)]
}

function checkPassed(check: CheckResult | undefined): boolean {
  return check?.status === "passed"
}

function mlRiskToRunProofRisk(risk: MlRiskLevel): RiskLevel {
  if (risk === "high") return "high"
  if (risk === "medium") return "medium"
  return "low"
}

function mlDecisionRequiresApproval(decision: PolicyDecision): boolean {
  return decision.action === "ask_approval" || decision.action === "escalate"
}

function mlSignalAuditReasons(signal: MlToolSignal, decision: PolicyDecision): string[] {
  return [
    `ML signal: ${formatToolSignalForAudit(signal)}`,
    `ML decision: ${formatPolicyDecision(decision)}`,
    ...(signal.reasons.length ? signal.reasons : []),
  ]
}

export function evaluateShellCommandPolicy(
  command: string,
  options: { approved?: boolean } = {},
  mlSignal?: MlToolSignal,
): PolicyGateDecision {
  const normalized = command.toLowerCase()
  let risk: RiskLevel = "medium"
  const reasons = ["Shell command execution can mutate repository or machine state."]

  if (
    /\b(rm\s+-rf|del\s+\/[fsq]|remove-item\b.*\b-recurse\b|git\s+reset\s+--hard|git\s+clean\s+-fd|drop\s+database|terraform\s+destroy)\b/.test(
      normalized,
    )
  ) {
    risk = "critical"
    reasons.push(
      "Command matches a destructive filesystem, git reset, database drop, or infrastructure destroy pattern.",
    )
  } else if (
    /\b(npm|pnpm|bun|yarn)\s+(install|add|remove|update|upgrade)\b|\b(pip|poetry|uv|cargo|go)\s+(install|add|get|update)\b/.test(
      normalized,
    )
  ) {
    risk = "high"
    reasons.push("Command can change dependency graph, lockfiles, or supply-chain inputs.")
  } else if (
    /\b(deploy|publish|release|migrate|migration|secret|credential|token|chmod|chown|sudo)\b/.test(normalized)
  ) {
    risk = "high"
    reasons.push("Command references deployment, migration, secrets, credentials, or elevated permission risk.")
  } else if (/\b(test|typecheck|lint|build|rg|grep|git\s+diff|git\s+status)\b/.test(normalized)) {
    risk = "low"
    reasons.splice(0, reasons.length, "Command appears read-only or verification-oriented.")
  }

  const requiredApproval = risk === "high" || risk === "critical"
  const decision: PolicyGateDecision = {
    action: "shell_command",
    command,
    risk,
    required_approval: requiredApproval,
    blocked: requiredApproval && !options.approved,
    reasons,
  }

  if (!mlSignal) return decision

  const mlDecision = decideToolPolicy(mlSignal)
  const combinedRisk = maxRisk(decision.risk, mlRiskToRunProofRisk(mlSignal.risk))
  const combinedRequiredApproval = decision.required_approval || mlDecisionRequiresApproval(mlDecision)
  return {
    ...decision,
    risk: combinedRisk,
    required_approval: combinedRequiredApproval,
    blocked: combinedRequiredApproval && !options.approved,
    reasons: uniq([...decision.reasons, ...mlSignalAuditReasons(mlSignal, mlDecision)]),
  }
}

export function evaluateFileMutationPolicy(
  path: string,
  options: { operation?: string; approved?: boolean } = {},
  mlSignal?: MlToolSignal,
): PolicyGateDecision {
  const normalized = path.replace(/\\/g, "/").toLowerCase()
  const operation = options.operation ?? "write"
  let risk: RiskLevel = "medium"
  const reasons = ["File mutation changes repository state and requires RunProof evidence."]

  if (
    /(^|\/)\.env(\.|$)|(^|\/)\.npmrc$|(^|\/)\.pypirc$|(^|\/)id_rsa$|secret|credential|private[_-]?key/.test(normalized)
  ) {
    risk = "critical"
    reasons.push("Target path appears to contain secrets, credentials, private keys, or environment configuration.")
  } else if (
    /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|cargo\.lock|poetry\.lock)$/.test(normalized) ||
    /(^|\/)(migrations?|database|db)\//.test(normalized) ||
    /(^|\/)(auth|security|permissions?)\//.test(normalized) ||
    /(auth|security|permission|middleware|policy)/.test(normalized)
  ) {
    risk = "high"
    reasons.push("Target path touches lockfiles, migrations, auth, security, permissions, or policy-sensitive code.")
  }

  const requiredApproval = risk === "high" || risk === "critical"
  const decision: PolicyGateDecision = {
    action: "file_mutation",
    path,
    operation,
    risk,
    required_approval: requiredApproval,
    blocked: requiredApproval && !options.approved,
    reasons,
  }

  if (!mlSignal) return decision

  const mlDecision = decideToolPolicy(mlSignal)
  const combinedRisk = maxRisk(decision.risk, mlRiskToRunProofRisk(mlSignal.risk))
  const combinedRequiredApproval = decision.required_approval || mlDecisionRequiresApproval(mlDecision)
  return {
    ...decision,
    risk: combinedRisk,
    required_approval: combinedRequiredApproval,
    blocked: combinedRequiredApproval && !options.approved,
    reasons: uniq([...decision.reasons, ...mlSignalAuditReasons(mlSignal, mlDecision)]),
  }
}

export class ProofManager {
  readonly proof: RunProof
  readonly store_target: ProofStoreTarget

  private constructor(proof: RunProof, storeTarget: ProofStoreTarget) {
    this.proof = proof
    this.store_target = storeTarget
  }

  static create(options: ProofManagerOptions): ProofManager {
    return new ProofManager(
      createRunProof({
        user_intent: options.user_intent,
        cwd: options.cwd,
        command: options.command,
        contract: options.contract,
      }),
      options.store_target ?? "repo",
    )
  }

  snapshot(): RunProof {
    return structuredClone(this.proof)
  }

  transitionState(status: RunProofStatus, summary?: string, source: CommandSource = "system"): TUICommandReflection {
    return this.recordCommand({
      command: `runproof.lifecycle ${status}`,
      source,
      state_before: this.proof.lifecycle.status,
      state_after: status,
      visible_in_tui: true,
      reversible: false,
      result_summary: summary,
    })
  }

  recordCommand(input: CommandReflectionInput): TUICommandReflection {
    return recordCommand(this.proof, input)
  }

  recordEvent(input: RunProofEventInput): RunProofEvent {
    return recordEvent(this.proof, input)
  }

  updateRisk(risk: Partial<RiskBlock> & Pick<RiskBlock, "level">): RiskBlock {
    this.proof.risk = {
      ...this.proof.risk,
      ...risk,
      reasons: risk.reasons ?? this.proof.risk.reasons,
      required_approval: risk.required_approval ?? this.proof.risk.required_approval,
    }
    this.proof.contract.risk_level = risk.level
    this.recordEvent({
      type: this.proof.risk.required_approval ? "approval.required" : "risk.evaluated",
      actor: "system",
      summary: this.proof.risk.reasons[0] ?? `Risk evaluated as ${risk.level}.`,
      risk: risk.level,
      status: this.proof.risk.required_approval ? "awaiting_approval" : this.proof.lifecycle.status,
      refs: { contract_id: this.proof.contract.id },
    })
    return this.proof.risk
  }

  gateShellCommand(
    command: string,
    options: {
      cwd?: string
      approved?: boolean
      sandboxEnabled?: boolean
      userSovereignty?: MlGateContext["userSovereignty"]
    } = {},
    mlContext?: MlGateContext,
  ): PolicyGateDecision {
    const mlSignal = analyzeTool({
      toolName: "shell",
      args: { command, cwd: options.cwd },
      sandboxEnabled: mlContext?.sandboxEnabled ?? options.sandboxEnabled ?? false,
      userSovereignty: mlContext?.userSovereignty ?? options.userSovereignty,
    })
    const decision = evaluateShellCommandPolicy(command, { approved: options.approved }, mlSignal)
    this.proof.risk = {
      ...this.proof.risk,
      level: maxRisk(this.proof.risk.level, decision.risk),
      reasons: uniq([...this.proof.risk.reasons, ...decision.reasons]),
      required_approval: this.proof.risk.required_approval || decision.required_approval,
    }
    this.proof.contract.risk_level = maxRisk(this.proof.contract.risk_level, decision.risk)
    if (decision.required_approval && !this.proof.contract.required_approvals.includes("shell command policy gate")) {
      this.proof.contract.required_approvals.push("shell command policy gate")
    }
    const mlDecision = decideToolPolicy(mlSignal)
    this.recordEvent({
      type: decision.required_approval ? "approval.required" : "risk.evaluated",
      actor: "system",
      summary: decision.blocked
        ? `Shell command blocked pending approval: ${command}`
        : `Shell command policy evaluated: ${command}`,
      risk: decision.risk,
      status: decision.blocked ? "awaiting_approval" : this.proof.lifecycle.status,
      refs: { command, cwd: options.cwd ?? this.proof.repo.path },
      data: {
        action: decision.action,
        required_approval: decision.required_approval,
        blocked: decision.blocked,
        approved: Boolean(options.approved),
        reasons: decision.reasons,
        ml_signal: {
          risk: mlSignal.risk,
          posture: mlSignal.executionPosture,
          labels: mlSignal.labels,
          confidence: mlSignal.confidence.value,
          reasons: mlSignal.reasons,
        },
        ml_decision: {
          action: mlDecision.action,
          posture: mlDecision.posture,
          confidence: mlDecision.confidence,
          reasons: mlDecision.reasons,
        },
      },
    })
    return decision
  }

  gateFileMutation(
    path: string,
    options: {
      operation?: string
      approved?: boolean
      sandboxEnabled?: boolean
      userSovereignty?: MlGateContext["userSovereignty"]
    } = {},
    mlContext?: MlGateContext,
  ): PolicyGateDecision {
    const mlSignal = analyzeTool({
      toolName: options.operation ?? "write",
      args: { path },
      sandboxEnabled: mlContext?.sandboxEnabled ?? options.sandboxEnabled ?? false,
      userSovereignty: mlContext?.userSovereignty ?? options.userSovereignty,
    })
    const decision = evaluateFileMutationPolicy(path, options, mlSignal)
    this.proof.risk = {
      ...this.proof.risk,
      level: maxRisk(this.proof.risk.level, decision.risk),
      reasons: uniq([...this.proof.risk.reasons, ...decision.reasons]),
      required_approval: this.proof.risk.required_approval || decision.required_approval,
    }
    this.proof.contract.risk_level = maxRisk(this.proof.contract.risk_level, decision.risk)
    if (decision.required_approval && !this.proof.contract.required_approvals.includes("file mutation policy gate")) {
      this.proof.contract.required_approvals.push("file mutation policy gate")
    }
    const mlDecision = decideToolPolicy(mlSignal)
    this.recordEvent({
      type: decision.required_approval ? "approval.required" : "risk.evaluated",
      actor: "system",
      summary: decision.blocked
        ? `File mutation blocked pending approval: ${path}`
        : `File mutation policy evaluated: ${path}`,
      risk: decision.risk,
      status: decision.blocked ? "awaiting_approval" : this.proof.lifecycle.status,
      refs: { path, operation: decision.operation ?? "write" },
      data: {
        action: decision.action,
        required_approval: decision.required_approval,
        blocked: decision.blocked,
        approved: Boolean(options.approved),
        reasons: decision.reasons,
        ml_signal: {
          risk: mlSignal.risk,
          posture: mlSignal.executionPosture,
          labels: mlSignal.labels,
          confidence: mlSignal.confidence.value,
          reasons: mlSignal.reasons,
        },
        ml_decision: {
          action: mlDecision.action,
          posture: mlDecision.posture,
          confidence: mlDecision.confidence,
          reasons: mlDecision.reasons,
        },
      },
    })
    return decision
  }

  recordMlSignal(input: {
    kind: "turn" | "tool"
    signal: unknown
    decision?: PolicyDecision
    summary?: string
    refs?: Record<string, string>
  }): RunProofEvent {
    const signal = input.signal as
      | MlToolSignal
      | {
          kind: "turn"
          intent?: string
          risk?: MlRiskLevel
          executionPosture?: string
          modelRoute?: { profile: string; reason: string }
          confidence?: { value: number }
          labels?: string[]
          reasons?: string[]
        }
    const summary =
      input.summary ??
      (input.kind === "turn"
        ? `ML turn signal: intent=${(signal as any).intent ?? "unknown"}`
        : `ML tool signal: ${(signal as any).toolName ?? "unknown"}`)
    return this.recordEvent({
      type: "ml.signal",
      actor: "system",
      summary,
      status: this.proof.lifecycle.status,
      refs: input.refs,
      data: {
        kind: input.kind,
        signal,
        decision: input.decision,
      },
    })
  }

  recordContextBudget(input: {
    estimated_tokens: number
    system_tokens: number
    tool_tokens: number
    message_count: number
    threshold: number
    action: "observe" | "compact" | "block"
    summary?: string
  }): RunProofEvent {
    return this.recordEvent({
      type: "context.budgeted",
      actor: "system",
      summary:
        input.summary ??
        `Context pressure observed: ${input.estimated_tokens} estimated tokens across ${input.message_count} messages.`,
      risk: input.estimated_tokens >= input.threshold * 1.5 ? "medium" : "low",
      status: this.proof.lifecycle.status,
      data: input,
    })
  }

  updateRollback(rollback: Partial<RollbackBlock> & Pick<RollbackBlock, "strategy">): RollbackBlock {
    this.proof.rollback = {
      ...this.proof.rollback,
      ...rollback,
      checkpoint_id: rollback.checkpoint_id ?? this.proof.rollback.checkpoint_id,
      restore_status: rollback.restore_status ?? this.proof.rollback.restore_status ?? "not_staged",
      approval_required: rollback.approval_required ?? this.proof.rollback.approval_required ?? true,
    }
    if (this.proof.rollback.strategy !== "none") {
      this.recordEvent({
        type: "rollback.available",
        actor: "system",
        summary: this.proof.rollback.restore_command
          ? `Rollback available via ${this.proof.rollback.restore_command}.`
          : `Rollback checkpoint available: ${this.proof.rollback.checkpoint_id}.`,
        status: this.proof.lifecycle.status,
        refs: { checkpoint_id: this.proof.rollback.checkpoint_id },
        data: { strategy: this.proof.rollback.strategy, valid_until: this.proof.rollback.valid_until },
      })
    }
    return this.proof.rollback
  }

  stageRollbackRestore(input: { actor?: CommandSource; summary?: string } = {}): RollbackBlock {
    const restoreCommand = this.proof.rollback.restore_command
    if (!restoreCommand) {
      throw new Error("Cannot stage rollback restore without a restore_command.")
    }

    this.proof.rollback = {
      ...this.proof.rollback,
      restore_status: "staged",
      staged_at: now(),
      approval_required: true,
    }
    if (!this.proof.contract.required_approvals.includes("rollback restore execution")) {
      this.proof.contract.required_approvals.push("rollback restore execution")
    }
    this.proof.risk = {
      ...this.proof.risk,
      level: maxRisk(this.proof.risk.level, "high"),
      reasons: uniq([
        ...this.proof.risk.reasons,
        "Rollback restore command is staged and requires explicit approval before execution.",
      ]),
      required_approval: true,
    }
    this.proof.contract.risk_level = maxRisk(this.proof.contract.risk_level, "high")
    this.recordEvent({
      type: "rollback.staged",
      actor: input.actor ?? "user",
      summary: input.summary ?? `Rollback restore staged pending approval: ${restoreCommand}`,
      risk: "high",
      status: "awaiting_approval",
      refs: {
        checkpoint_id: this.proof.rollback.checkpoint_id,
        restore_command: restoreCommand,
      },
      data: {
        approval_required: true,
        restore_status: this.proof.rollback.restore_status,
        staged_at: this.proof.rollback.staged_at,
      },
    })
    return this.proof.rollback
  }

  approveRollbackRestore(input: { actor?: CommandSource; approved_by?: string; summary?: string } = {}): RollbackBlock {
    const restoreCommand = this.proof.rollback.restore_command
    if (!restoreCommand) {
      throw new Error("Cannot approve rollback restore without a restore_command.")
    }
    if (this.proof.rollback.restore_status !== "staged") {
      throw new Error("Rollback restore must be staged before approval.")
    }

    this.proof.rollback = {
      ...this.proof.rollback,
      restore_status: "approved",
      approval_required: false,
      approved_at: now(),
      approved_by: input.approved_by ?? "operator",
    }
    this.recordEvent({
      type: "rollback.approved",
      actor: input.actor ?? "user",
      summary: input.summary ?? `Rollback restore approved but not executed: ${restoreCommand}`,
      risk: "high",
      status: this.proof.lifecycle.status,
      refs: {
        checkpoint_id: this.proof.rollback.checkpoint_id,
        restore_command: restoreCommand,
      },
      data: {
        restore_status: this.proof.rollback.restore_status,
        approved_at: this.proof.rollback.approved_at,
        approved_by: this.proof.rollback.approved_by,
        executed: false,
      },
    })
    return this.proof.rollback
  }

  recordRollbackRestoreExecution(input: {
    cwd: string
    status: VerificationStatus
    exit_code?: number
    stdout_summary?: string
    stderr_summary?: string
    actor?: CommandSource
    summary?: string
  }): RollbackBlock {
    const restoreCommand = this.proof.rollback.restore_command
    if (!restoreCommand) {
      throw new Error("Cannot record rollback restore execution without a restore_command.")
    }
    if (this.proof.rollback.restore_status !== "approved") {
      throw new Error("Rollback restore must be approved before execution can be recorded.")
    }

    const executedAt = now()
    const shell = this.recordShellCommand({
      command: restoreCommand,
      cwd: input.cwd,
      status: input.status,
      risk: "high",
      exit_code: input.exit_code,
      stdout_summary: input.stdout_summary,
      stderr_summary: input.stderr_summary,
    })
    this.proof.rollback = {
      ...this.proof.rollback,
      restore_status: input.status === "passed" ? "executed" : "approved",
      executed_at: executedAt,
      execution_status: input.status,
      execution_exit_code: input.exit_code,
    }
    if (input.status === "passed") {
      this.transitionState("rolled_back", "Rollback restore command completed.", input.actor ?? "system")
    }
    this.recordEvent({
      type: "rollback.executed",
      actor: input.actor ?? "system",
      summary: input.summary ?? `Rollback restore ${input.status}: ${restoreCommand}`,
      risk: "high",
      status: input.status,
      refs: {
        checkpoint_id: this.proof.rollback.checkpoint_id,
        restore_command: restoreCommand,
        shell_command_id: shell.id,
      },
      data: {
        exit_code: input.exit_code,
        restore_status: this.proof.rollback.restore_status,
        execution_status: input.status,
        executed_at: executedAt,
      },
    })
    return this.proof.rollback
  }

  addPlanStep(
    description: string,
    status: RunProof["plan"]["steps"][number]["status"] = "planned",
  ): RunProof["plan"]["steps"][number] {
    const step = { id: id("step"), description, status }
    this.proof.plan.steps.push(step)
    return step
  }

  updatePlanSummary(summary: string): void {
    this.proof.plan.summary = summary
  }

  addAssumption(text: string, verified = false): RunProof["plan"]["assumptions"][number] {
    const assumption = { text, verified }
    this.proof.plan.assumptions.push(assumption)
    if (!verified && !this.proof.unresolved.unverified_assumptions.includes(text)) {
      this.proof.unresolved.unverified_assumptions.push(text)
    }
    return assumption
  }

  addProposedDiff(input: DiffInput): DiffRecord {
    const diff: DiffRecord = { id: id("diff"), status: "proposed", ...input }
    this.proof.diffs.proposed.push(diff)
    this.recordEvent({
      type: "diff.created",
      actor: "agent",
      summary: `Proposed diff for ${input.path}: ${input.summary}`,
      status: "diff_proposed",
      refs: { diff_id: diff.id, path: input.path },
      data: { additions: input.additions, deletions: input.deletions },
    })
    this.transitionState("diff_proposed", `Proposed diff recorded for ${input.path}.`)
    return diff
  }

  approveDiff(diffId: string, options: { auto_approved?: boolean; summary?: string } = {}): DiffRecord {
    const idx = this.proof.diffs.proposed.findIndex((diff) => diff.id === diffId)
    if (idx < 0) throw new Error(`Diff not found in proposed set: ${diffId}`)

    const [diff] = this.proof.diffs.proposed.splice(idx, 1)
    const applied: DiffRecord = { ...diff!, status: "applied" }
    this.proof.diffs.applied.push(applied)
    this.proof.risk.auto_approved = options.auto_approved
    this.recordCommand({
      command: `diff.approve ${diffId}`,
      source: options.auto_approved ? "system" : "user",
      state_before: this.proof.lifecycle.status,
      state_after: "applying",
      visible_in_tui: true,
      reversible: true,
      result_summary: options.summary ?? `Approved diff for ${applied.path}.`,
    })
    return applied
  }

  rejectDiff(diffId: string, summary?: string): DiffRecord {
    const idx = this.proof.diffs.proposed.findIndex((diff) => diff.id === diffId)
    if (idx < 0) throw new Error(`Diff not found in proposed set: ${diffId}`)

    const [diff] = this.proof.diffs.proposed.splice(idx, 1)
    const rejected: DiffRecord = { ...diff!, status: "rejected" }
    this.proof.diffs.rejected.push(rejected)
    this.recordCommand({
      command: `diff.reject ${diffId}`,
      source: "user",
      state_before: this.proof.lifecycle.status,
      state_after: this.proof.lifecycle.status,
      visible_in_tui: true,
      reversible: false,
      result_summary: summary ?? `Rejected diff for ${rejected.path}.`,
    })
    return rejected
  }

  recordFileRead(input: FileReadInput): FileAccessRecord {
    const read = { id: id("read"), timestamp: now(), ...input }
    this.proof.execution.file_reads.push(read)
    return read
  }

  recordContextAccess(input: ContextAccessInput): RunProofEvent {
    if (input.path) {
      this.proof.execution.file_reads.push({
        id: id("read"),
        path: input.path,
        timestamp: now(),
        reason: input.summary,
        exists: input.exists,
        bytes_read: input.bytes_read,
      })
    }

    const refs: Record<string, string> = { tool: input.tool }
    if (input.path) refs.path = input.path
    if (input.pattern) refs.pattern = input.pattern

    return this.recordEvent({
      type: "context.accessed",
      actor: "agent",
      summary: input.summary,
      status: this.proof.lifecycle.status,
      refs,
      data: {
        tool: input.tool,
        exists: input.exists,
        bytes_read: input.bytes_read,
        result_count: input.result_count,
      },
    })
  }

  recordFileWrite(input: FileWriteInput): FileWriteRecord {
    if (input.mode === "applied" && !input.diff_id) {
      throw new Error("Applied file writes must reference an approved diff_id in proof mode.")
    }
    const write = { id: id("write"), timestamp: now(), ...input }
    this.proof.execution.file_writes.push(write)
    this.recordEvent({
      type: "file.written",
      actor: "agent",
      summary: `${input.mode} file write for ${input.path}: ${input.reason}`,
      status: this.proof.lifecycle.status,
      refs: { file_write_id: write.id, path: input.path },
      data: { mode: input.mode, diff_id: input.diff_id, bytes_written: input.bytes_written },
    })
    return write
  }

  recordToolCall(input: ToolCallInput): ToolCallRecord {
    const call = { id: id("tool"), timestamp: now(), ...input }
    this.proof.execution.tool_calls.push(call)
    this.recordEvent({
      type: "tool.requested",
      actor: "agent",
      summary: input.input_summary ? `${input.name}: ${input.input_summary}` : `Tool requested: ${input.name}`,
      risk: input.risk,
      status: input.status,
      refs: { tool_call_id: call.id, tool: input.name },
    })
    return call
  }

  recordMCPCall(input: MCPCallInput): MCPCallRecord {
    const call = { id: id("mcp"), timestamp: now(), ...input }
    this.proof.execution.mcp_calls.push(call)
    this.recordEvent({
      type: "tool.requested",
      actor: "agent",
      summary: input.input_summary ? `${input.name}: ${input.input_summary}` : `MCP tool requested: ${input.name}`,
      risk: input.risk,
      status: input.status,
      refs: { mcp_call_id: call.id, tool: input.name, server: input.server ?? "" },
    })
    return call
  }

  recordShellCommand(input: ShellCommandInput): ShellCommandRecord {
    const command = { id: id("shell"), timestamp: now(), ...input }
    this.proof.execution.shell_commands.push(command)
    this.proof.final_evidence.commands_run.push(input.command)
    this.recordEvent({
      type: "command.executed",
      actor: "agent",
      summary: input.command,
      risk: input.risk,
      status: input.status,
      refs: { shell_command_id: command.id, cwd: input.cwd },
      data: { exit_code: input.exit_code },
    })
    return command
  }

  addDiagnostic(input: Omit<DiagnosticResult, "id">): DiagnosticResult {
    const diagnostic = { id: id("diagnostic"), ...input }
    this.proof.verification.diagnostics.push(diagnostic)
    return diagnostic
  }

  addTestResult(input: Omit<TestResult, "id">): TestResult {
    const test = { id: id("test"), ...input }
    this.proof.verification.tests.push(test)
    this.recordEvent({
      type:
        input.status === "passed"
          ? "verification.passed"
          : input.status === "failed"
            ? "verification.failed"
            : "verification.started",
      actor: "verifier",
      summary: `test: ${input.command} - ${input.summary}`,
      status: input.status,
      refs: { test_id: test.id, command: input.command },
      data: { duration_ms: input.duration_ms, passed: input.passed, failed: input.failed, skipped: input.skipped },
    })
    return test
  }

  setTypecheck(result: CheckResult): void {
    this.proof.verification.typecheck = result
    this.recordVerificationEvent("typecheck", result)
  }

  setLint(result: CheckResult): void {
    this.proof.verification.lint = result
    this.recordVerificationEvent("lint", result)
  }

  setBuild(result: CheckResult): void {
    this.proof.verification.build = result
    this.recordVerificationEvent("build", result)
  }

  setVerifierReview(result: VerifierResult): void {
    this.proof.verification.verifier_review = result
    this.transitionState("verifying", "Verifier review recorded.", "verifier")
  }

  addManualCheck(input: Omit<ManualCheck, "id">): ManualCheck {
    const check = { id: id("manual"), ...input }
    this.proof.verification.manual_checks.push(check)
    this.recordEvent({
      type:
        input.status === "passed"
          ? "verification.passed"
          : input.status === "failed"
            ? "verification.failed"
            : "verification.started",
      actor: "verifier",
      summary: input.evidence ? `${input.description}: ${input.evidence}` : input.description,
      status: input.status,
      refs: { manual_check_id: check.id },
    })
    return check
  }

  addKnownLimitation(text: string): void {
    if (!this.proof.unresolved.known_limitations.includes(text)) this.proof.unresolved.known_limitations.push(text)
  }

  addSkippedTest(text: string): void {
    if (!this.proof.unresolved.skipped_tests.includes(text)) this.proof.unresolved.skipped_tests.push(text)
  }

  finalize(input: {
    status: "completed" | "failed" | "cancelled" | "rolled_back"
    summary: string
    evidence?: Partial<FinalEvidence>
  }): RunProof {
    let proofScore = input.evidence?.proof_score ?? this.proof.final_evidence.proof_score
    let humanReviewRecommended =
      input.evidence?.human_review_recommended ?? this.proof.final_evidence.human_review_recommended

    if (input.status === "completed" && this.proof.execution.file_writes.length > 0) {
      const hasVerificationEvidence =
        checkPassed(this.proof.verification.typecheck) ||
        checkPassed(this.proof.verification.lint) ||
        checkPassed(this.proof.verification.build) ||
        this.proof.verification.tests.some((test) => test.status === "passed") ||
        this.proof.verification.manual_checks.some((check) => check.status === "passed") ||
        this.proof.verification.verifier_review?.status === "passed"

      if (!hasVerificationEvidence) {
        const gap = "Completion has file write evidence but no passing verification evidence."
        this.addSkippedTest(gap)
        this.recordEvent({
          type: "verification.failed",
          actor: "verifier",
          summary: gap,
          status: "failed",
          data: { file_writes: this.proof.execution.file_writes.length },
        })
        proofScore = Math.min(clampProofScore(proofScore), 40)
        humanReviewRecommended = true
      }
    }

    completeRunProof(this.proof, {
      status: input.status,
      summary: input.summary,
      files_changed: input.evidence?.files_changed ?? this.proof.final_evidence.files_changed,
      commands_run: input.evidence?.commands_run ?? this.proof.final_evidence.commands_run,
      proof_score: clampProofScore(proofScore),
      human_review_recommended: humanReviewRecommended,
    })
    this.proof.contract.status =
      input.status === "completed"
        ? "completed"
        : input.status === "cancelled"
          ? "cancelled"
          : this.proof.contract.status
    return this.proof
  }

  private recordVerificationEvent(kind: "typecheck" | "lint" | "build", result: CheckResult): void {
    this.recordEvent({
      type:
        result.status === "passed"
          ? "verification.passed"
          : result.status === "failed"
            ? "verification.failed"
            : "verification.started",
      actor: "verifier",
      summary: `${kind}: ${result.summary}`,
      status: result.status,
      refs: { command: result.command },
      data: { duration_ms: result.duration_ms },
    })
  }

  renderTerminal(): string {
    return renderRunProofTerminal(this.proof)
  }

  renderMarkdown(): string {
    return renderRunProofMarkdown(this.proof)
  }

  async save(): Promise<StoredRunProof> {
    return saveRunProof(this.proof, {
      target: this.store_target,
      cwd: this.proof.repo.path,
      markdown: this.renderMarkdown(),
    })
  }
}
