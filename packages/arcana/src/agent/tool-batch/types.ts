/**
 * Shared tool-batch primitives (Phases 0–3).
 * Classification, planning, bounded dispatch, WorkItem budgets, synthesis.
 */

export type ToolCapability = "read" | "network" | "write" | "verify" | "shell" | "model" | "unknown"

export type ToolRisk = "low" | "medium" | "high" | "critical"

export type ToolCallSpec = {
  id: string
  name: string
  input: Record<string, unknown>
}

export type ClassifiedCall = ToolCallSpec & {
  capability: ToolCapability
  risk: ToolRisk
  readSet: string[]
  writeSet: string[]
}

export type WorkItemStatus = "pending" | "ready" | "running" | "completed" | "failed" | "cancelled"

/** Per-child budget (Phase 3). */
export type WorkBudget = {
  timeoutMs: number
  /** Truncate tool output before parent synthesis. */
  maxOutputChars: number
}

export type WorkItem = ClassifiedCall & {
  dependsOn: string[]
  budget: WorkBudget
  status: WorkItemStatus
  /** Correlates all items in one batch / multi-tool turn. */
  runId: string
  /** Parent tool call id (e.g. outer batch call) when nested. */
  parentId?: string
  result?: string
  error?: string
  startedAt?: number
  endedAt?: number
  waveIndex?: number
}

export type BatchConfig = {
  maxCalls: number
  readConcurrency: number
  networkConcurrency: number
  writeConcurrency: number
  defaultTimeoutMs: number
  /** Cap each child result before synthesis (Phase 3). */
  maxOutputChars: number
  /** Hard wall-clock for the whole batch run (Phase 3). */
  maxTotalTimeMs: number
  /** Cap synthesized parent message returned to the model. */
  maxSynthesisChars: number
  /** Nested tools allowed inside batch (machine allowlist). */
  allowlist: ReadonlySet<string>
}

export const DEFAULT_BATCH_CONFIG: BatchConfig = {
  maxCalls: 16,
  readConcurrency: 8,
  networkConcurrency: 4,
  writeConcurrency: 4,
  defaultTimeoutMs: 60_000,
  maxOutputChars: 2_000,
  maxTotalTimeMs: 120_000,
  maxSynthesisChars: 8_000,
  allowlist: new Set([
    "glob",
    "grep",
    "read",
    "web_fetch",
    "web_search",
    "git_status",
    "git_diff",
    "env_probe",
    "artifact_get",
    "memory_search",
  ]),
}

export type BatchResult = {
  id: string
  name: string
  ok: boolean
  output: string
  status: WorkItemStatus
  capability?: ToolCapability
  waveIndex?: number
  durationMs?: number
}

/** Projection of a finished batch for proof / TUI (Phase 3). */
export type BatchRunReport = {
  runId: string
  parentId?: string
  waves: number
  calls: number
  ok: number
  failed: number
  cancelled: number
  maxActive: number
  durationMs: number
  /** e.g. "wave 1 · 3 read · wave 2 · 1 network" */
  planSummary: string
  /** Focused text for the parent model context. */
  synthesis: string
  results: BatchResult[]
  items: WorkItem[]
}

export class BatchSizeError extends Error {
  readonly code = "BATCH_SIZE" as const
  constructor(
    readonly size: number,
    readonly max: number,
  ) {
    super(`Batch rejected: ${size} calls exceeds max ${max}`)
    this.name = "BatchSizeError"
  }
}

export class BatchToolDeniedError extends Error {
  readonly code = "BATCH_TOOL_DENIED" as const
  constructor(
    readonly tool: string,
    readonly reason: string,
  ) {
    super(`Batch sub-tool "${tool}" denied: ${reason}`)
    this.name = "BatchToolDeniedError"
  }
}

export class BatchBudgetError extends Error {
  readonly code = "BATCH_BUDGET" as const
  constructor(message: string) {
    super(message)
    this.name = "BatchBudgetError"
  }
}
