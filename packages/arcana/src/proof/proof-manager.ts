// SPDX-License-Identifier: MIT OR LicenseRef-arcana-Commercial
// Copyright (c) 2026 arcana contributors

import {
  completeRunProof,
  createRunProof,
  recordCommand,
} from "./create.js"
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
  RiskBlock,
  RunProof,
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
  store_target?: ProofStoreTarget
}

export type CommandReflectionInput = Omit<TUICommandReflection, "id" | "timestamp" | "runproof_id">

export type DiffInput = Omit<DiffRecord, "id" | "status">
export type FileReadInput = Omit<FileAccessRecord, "id" | "timestamp">
export type FileWriteInput = Omit<FileWriteRecord, "id" | "timestamp">
export type ToolCallInput = Omit<ToolCallRecord, "id" | "timestamp">
export type MCPCallInput = Omit<MCPCallRecord, "id" | "timestamp">
export type ShellCommandInput = Omit<ShellCommandRecord, "id" | "timestamp">

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

  updateRisk(risk: Partial<RiskBlock> & Pick<RiskBlock, "level">): RiskBlock {
    this.proof.risk = {
      ...this.proof.risk,
      ...risk,
      reasons: risk.reasons ?? this.proof.risk.reasons,
      required_approval: risk.required_approval ?? this.proof.risk.required_approval,
    }
    return this.proof.risk
  }

  addPlanStep(description: string, status: RunProof["plan"]["steps"][number]["status"] = "planned"): RunProof["plan"]["steps"][number] {
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
    return call
  }

  recordMCPCall(input: MCPCallInput): MCPCallRecord {
    const call = { id: id("mcp"), timestamp: now(), ...input }
    this.proof.execution.mcp_calls.push(call)
    return call
  }

  recordShellCommand(input: ShellCommandInput): ShellCommandRecord {
    const command = { id: id("shell"), timestamp: now(), ...input }
    this.proof.execution.shell_commands.push(command)
    this.proof.final_evidence.commands_run.push(input.command)
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
    return test
  }

  setTypecheck(result: CheckResult): void {
    this.proof.verification.typecheck = result
  }

  setLint(result: CheckResult): void {
    this.proof.verification.lint = result
  }

  setBuild(result: CheckResult): void {
    this.proof.verification.build = result
  }

  setVerifierReview(result: VerifierResult): void {
    this.proof.verification.verifier_review = result
    this.transitionState("verifying", "Verifier review recorded.", "verifier")
  }

  addManualCheck(input: Omit<ManualCheck, "id">): ManualCheck {
    const check = { id: id("manual"), ...input }
    this.proof.verification.manual_checks.push(check)
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
      human_review_recommended: input.evidence?.human_review_recommended ?? this.proof.final_evidence.human_review_recommended,
    })
    return this.proof
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
