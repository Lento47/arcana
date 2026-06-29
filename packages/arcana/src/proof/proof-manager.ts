// SPDX-License-Identifier: MIT OR LicenseRef-arcana-Commercial
// Copyright (c) 2026 arcana contributors

import { completeRunProof, createRunProof, recordCommand, recordEvent } from "./create.js"
import { renderRunProofMarkdown, renderRunProofTerminal } from "./render.js"
import { saveRunProof, type ProofStoreTarget, type StoredRunProof } from "./store.js"
import type {
  CheckResult,
  CommandSource,
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

export type DiffInput = Omit<DiffRecord, "id" | "status">
export type FileReadInput = Omit<FileAccessRecord, "id" | "timestamp">
export type FileWriteInput = Omit<FileWriteRecord, "id" | "timestamp">
export type ToolCallInput = Omit<ToolCallRecord, "id" | "timestamp">
export type MCPCallInput = Omit<MCPCallRecord, "id" | "timestamp">
export type ShellCommandInput = Omit<ShellCommandRecord, "id" | "timestamp">

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

export function evaluateShellCommandPolicy(command: string, options: { approved?: boolean } = {}): PolicyGateDecision {
  const normalized = command.toLowerCase()
  let risk: RiskLevel = "medium"
  const reasons = ["Shell command execution can mutate repository or machine state."]

  if (/\b(rm\s+-rf|del\s+\/[fsq]|remove-item\b.*\b-recurse\b|git\s+reset\s+--hard|git\s+clean\s+-fd|drop\s+database|terraform\s+destroy)\b/.test(normalized)) {
    risk = "critical"
    reasons.push("Command matches a destructive filesystem, git reset, database drop, or infrastructure destroy pattern.")
  } else if (/\b(npm|pnpm|bun|yarn)\s+(install|add|remove|update|upgrade)\b|\b(pip|poetry|uv|cargo|go)\s+(install|add|get|update)\b/.test(normalized)) {
    risk = "high"
    reasons.push("Command can change dependency graph, lockfiles, or supply-chain inputs.")
  } else if (/\b(deploy|publish|release|migrate|migration|secret|credential|token|chmod|chown|sudo)\b/.test(normalized)) {
    risk = "high"
    reasons.push("Command references deployment, migration, secrets, credentials, or elevated permission risk.")
  } else if (/\b(test|typecheck|lint|build|rg|grep|git\s+diff|git\s+status)\b/.test(normalized)) {
    risk = "low"
    reasons.splice(0, reasons.length, "Command appears read-only or verification-oriented.")
  }

  const requiredApproval = risk === "high" || risk === "critical"
  return {
    action: "shell_command",
    command,
    risk,
    required_approval: requiredApproval,
    blocked: requiredApproval && !options.approved,
    reasons,
  }
}

export function evaluateFileMutationPolicy(
  path: string,
  options: { operation?: string; approved?: boolean } = {},
): PolicyGateDecision {
  const normalized = path.replace(/\\/g, "/").toLowerCase()
  const operation = options.operation ?? "write"
  let risk: RiskLevel = "medium"
  const reasons = ["File mutation changes repository state and requires RunProof evidence."]

  if (/(^|\/)\.env(\.|$)|(^|\/)\.npmrc$|(^|\/)\.pypirc$|(^|\/)id_rsa$|secret|credential|private[_-]?key/.test(normalized)) {
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
  return {
    action: "file_mutation",
    path,
    operation,
    risk,
    required_approval: requiredApproval,
    blocked: requiredApproval && !options.approved,
    reasons,
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

  gateShellCommand(command: string, options: { cwd?: string; approved?: boolean } = {}): PolicyGateDecision {
    const decision = evaluateShellCommandPolicy(command, { approved: options.approved })
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
      },
    })
    return decision
  }

  gateFileMutation(path: string, options: { operation?: string; approved?: boolean } = {}): PolicyGateDecision {
    const decision = evaluateFileMutationPolicy(path, options)
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
      },
    })
    return decision
  }

  updateRollback(rollback: Partial<RollbackBlock> & Pick<RollbackBlock, "strategy">): RollbackBlock {
    this.proof.rollback = {
      ...this.proof.rollback,
      ...rollback,
      checkpoint_id: rollback.checkpoint_id ?? this.proof.rollback.checkpoint_id,
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

  recordFileWrite(input: FileWriteInput): FileWriteRecord {
    if (input.mode === "applied" && !input.diff_id) {
      throw new Error("Applied file writes must reference an approved diff_id in proof mode.")
    }
    const write = { id: id("write"), timestamp: now(), ...input }
    this.proof.execution.file_writes.push(write)
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
    completeRunProof(this.proof, {
      status: input.status,
      summary: input.summary,
      files_changed: input.evidence?.files_changed ?? this.proof.final_evidence.files_changed,
      commands_run: input.evidence?.commands_run ?? this.proof.final_evidence.commands_run,
      proof_score: clampProofScore(input.evidence?.proof_score ?? this.proof.final_evidence.proof_score),
      human_review_recommended:
        input.evidence?.human_review_recommended ?? this.proof.final_evidence.human_review_recommended,
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
      markdown: this.renderMarkdown(),
    })
  }
}
