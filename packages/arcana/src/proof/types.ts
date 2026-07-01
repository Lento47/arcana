// SPDX-License-Identifier: MIT OR LicenseRef-arcana-Commercial
// Copyright (c) 2026 arcana contributors

export const RUNPROOF_SCHEMA_VERSION = "0.2" as const

export type RunProofSchemaVersion = typeof RUNPROOF_SCHEMA_VERSION

export type RunProofStatus =
  | "created"
  | "planning"
  | "diff_proposed"
  | "awaiting_approval"
  | "applying"
  | "verifying"
  | "completed"
  | "failed"
  | "cancelled"
  | "rolled_back"

export type PlanStepStatus = "planned" | "executed" | "failed" | "skipped"
export type CommandSource = "user" | "agent" | "system" | "verifier"
export type RiskLevel = "low" | "medium" | "high" | "critical"
export type RollbackStrategy = "git_worktree" | "git_stash" | "fs_snapshot" | "none"
export type VerificationStatus = "passed" | "failed" | "skipped" | "not_run"
export type DiffStatus = "proposed" | "applied" | "rejected"
export type FileWriteMode = "proposed" | "applied" | "rejected"
export type ToolRisk = RiskLevel | "unknown"
export type ExecutionContractStatus = "draft" | "active" | "completed" | "cancelled"
export type PolicyGateAction = "shell_command" | "file_mutation"
export type RunProofEventType =
  | "plan.created"
  | "context.accessed"
  | "tool.requested"
  | "risk.evaluated"
  | "approval.required"
  | "command.executed"
  | "file.written"
  | "diff.created"
  | "verification.started"
  | "verification.passed"
  | "verification.failed"
  | "rollback.available"
  | "rollback.staged"
  | "rollback.approved"
  | "rollback.executed"
  | "sovereignty.routed"
  | "token.used"
  | "consensus.recorded"
  | "ml.signal"

export type ExecutionContract = {
  id: string
  created_at: string
  goal: string
  scope: string
  allowed_files: string[]
  allowed_commands: string[]
  risk_level: RiskLevel
  required_approvals: string[]
  expected_artifacts: string[]
  rollback_plan: string
  verification_steps: string[]
  status: ExecutionContractStatus
}

export type RunProofEvent = {
  id: string
  timestamp: string
  type: RunProofEventType
  actor: CommandSource
  summary: string
  risk?: ToolRisk
  status?: RunProofStatus | VerificationStatus | "running"
  refs?: Record<string, string>
  data?: Record<string, unknown>
}

export type PolicyGateDecision = {
  action: PolicyGateAction
  command?: string
  path?: string
  operation?: string
  risk: RiskLevel
  required_approval: boolean
  blocked: boolean
  reasons: string[]
}

export type ContextAccessRecord = {
  tool: "read" | "grep" | "glob"
  path?: string
  pattern?: string
  summary: string
  exists?: boolean
  bytes_read?: number
  result_count?: number
}

export type RepoSnapshot = {
  path: string
  commit?: string
  branch?: string
  dirty_before: boolean
}

export type RunProofLifecycle = {
  status: RunProofStatus
  started_at: string
  ended_at?: string
}

export type TUICommandReflection = {
  id: string
  timestamp: string
  command: string
  source: CommandSource
  runproof_id: string
  state_before: RunProofStatus
  state_after: RunProofStatus
  visible_in_tui: boolean
  reversible: boolean
  result_summary?: string
}

export type PlanStep = {
  id: string
  description: string
  status: PlanStepStatus
}

export type Assumption = {
  text: string
  verified: boolean
}

export type ToolCallRecord = {
  id: string
  name: string
  timestamp: string
  status: VerificationStatus | "running"
  risk: ToolRisk
  input_summary?: string
  output_summary?: string
  error?: string
}

export type MCPCallRecord = ToolCallRecord & {
  server?: string
  permission_profile?: string
}

export type FileAccessRecord = {
  id: string
  path: string
  timestamp: string
  reason: string
  exists?: boolean
  bytes_read?: number
}

export type FileWriteRecord = {
  id: string
  path: string
  timestamp: string
  mode: FileWriteMode
  reason: string
  diff_id?: string
  bytes_written?: number
}

export type ShellCommandRecord = {
  id: string
  command: string
  timestamp: string
  cwd: string
  status: VerificationStatus | "running"
  risk: ToolRisk
  exit_code?: number
  stdout_summary?: string
  stderr_summary?: string
}

export type DiffRecord = {
  id: string
  path: string
  status: DiffStatus
  additions: number
  deletions: number
  summary: string
  patch?: string
}

export type DiagnosticResult = {
  id: string
  source: string
  status: VerificationStatus
  summary: string
  details?: string
}

export type TestResult = {
  id: string
  command: string
  status: VerificationStatus
  passed?: number
  failed?: number
  skipped?: number
  duration_ms?: number
  summary: string
}

export type CheckResult = {
  command: string
  status: VerificationStatus
  summary: string
  duration_ms?: number
}

export type VerifierResult = {
  model?: string
  status: VerificationStatus
  summary: string
  concerns: string[]
}

export type ManualCheck = {
  id: string
  description: string
  status: VerificationStatus
  evidence?: string
}

export type VerificationBlock = {
  diagnostics: DiagnosticResult[]
  tests: TestResult[]
  typecheck?: CheckResult
  lint?: CheckResult
  build?: CheckResult
  verifier_review?: VerifierResult
  manual_checks: ManualCheck[]
}

export type RiskBlock = {
  level: RiskLevel
  reasons: string[]
  required_approval: boolean
  auto_approved?: boolean
}

export type RollbackBlock = {
  checkpoint_id: string
  strategy: RollbackStrategy
  restore_command?: string
  valid_until?: string
  restore_status?: "not_staged" | "staged" | "approved" | "executed" | "rejected"
  staged_at?: string
  approval_required?: boolean
  approved_at?: string
  approved_by?: string
  executed_at?: string
  execution_status?: VerificationStatus
  execution_exit_code?: number
}

export type FinalEvidence = {
  completed: boolean
  summary: string
  files_changed: string[]
  commands_run: string[]
  proof_score: number
  human_review_recommended: boolean
}

export type RunProof = {
  id: string
  schema_version: RunProofSchemaVersion
  timestamp: string
  repo: RepoSnapshot
  user_intent: string
  kernel?: {
    product: string
    runtime: string
    surface: string
    authorities: string[]
  }

  lifecycle: RunProofLifecycle
  contract: ExecutionContract
  events: RunProofEvent[]
  command_history: TUICommandReflection[]

  plan: {
    summary: string
    steps: PlanStep[]
    assumptions: Assumption[]
  }

  execution: {
    tool_calls: ToolCallRecord[]
    mcp_calls: MCPCallRecord[]
    file_reads: FileAccessRecord[]
    file_writes: FileWriteRecord[]
    shell_commands: ShellCommandRecord[]
  }

  diffs: {
    proposed: DiffRecord[]
    applied: DiffRecord[]
    rejected: DiffRecord[]
  }

  verification: VerificationBlock
  risk: RiskBlock
  rollback: RollbackBlock

  unresolved: {
    unverified_assumptions: string[]
    skipped_tests: string[]
    known_limitations: string[]
  }

  final_evidence: FinalEvidence
}
