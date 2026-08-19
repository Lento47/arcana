/**
 * D1 — Zod-driven RunProof view layer (audit D1 row, High).
 *
 * Previously app.tsx carried 19 hand-written RunProof*View interfaces plus
 * ~500 lines of hand-rolled proofString/proofNumber/asRecord normalizers —
 * every new proof field meant editing the interface AND the normalizer AND
 * the derived extractors by hand, with drift risk between them.
 *
 * Now the view types are derived from Zod schemas (repo standard, zod v4
 * catalog: 4.1.8) and normalization is one schema parse with the same
 * lenient coercion semantics as the old normalizers:
 *
 *   - string: non-empty when trimmed → the ORIGINAL value (untrimmed); else
 *     undefined (proofString)
 *   - number: finite → value; else undefined (proofNumber)
 *   - boolean: → value; else undefined (proofBoolean)
 *   - string[]: input array filtered to strings; else [] (asStringArray)
 *   - record arrays: input array filtered to non-null objects, each coerced
 *     leniently; per-item junk dropped, never a whole-array failure
 *   - top-level parse NEVER throws: non-object input falls back to an
 *     all-optional empty view with present empty arrays
 *
 * The mutation path in app.tsx (stage/approve rollback restore) keeps the
 * identity-preserving `asRecord` guard and the zod-backed accessors, both
 * re-exported here so app.tsx holds no hand-rolled normalization.
 */
import { z } from "zod"

// ---------------------------------------------------------------------------
// Lenient coercion primitives (exact old semantics)
// ---------------------------------------------------------------------------

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)

const optionalString = z.preprocess(
  (value) => (typeof value === "string" && value.trim() ? value : undefined),
  z.string().optional(),
)

const optionalNumber = z.preprocess(
  (value) => (typeof value === "number" && Number.isFinite(value) ? value : undefined),
  z.number().optional(),
)

const optionalBoolean = z.preprocess(
  (value) => (typeof value === "boolean" ? value : undefined),
  z.boolean().optional(),
)

const stringArray = z.preprocess(
  (value) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []),
  z.array(z.string()),
)

/** Optional record: non-null object → itself; else undefined. */
const optionalRecord = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (isPlainRecord(value) ? value : undefined), schema.optional())

/** Record array: input array filtered to non-null objects; else []. */
const recordArray = <T extends z.ZodTypeAny>(item: T) =>
  z.preprocess(
    (value) => (Array.isArray(value) ? value.filter(isPlainRecord) : []),
    z.array(item),
  )

/** String-valued record for event refs (old: filter entries to strings). */
const stringRecord = z.preprocess(
  (value) =>
    isPlainRecord(value)
      ? Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
      : undefined,
  z.record(z.string(), z.string()).optional(),
)

/** Unknown-valued record for event data (old: asRecord). */
const unknownRecord = z.preprocess(
  (value) => (isPlainRecord(value) ? value : undefined),
  z.record(z.string(), z.unknown()).optional(),
)

// ---------------------------------------------------------------------------
// View schemas (types derived via z.infer)
// ---------------------------------------------------------------------------

export const runProofContractViewSchema = z.object({
  goal: optionalString,
  scope: optionalString,
  allowed_files: stringArray,
  allowed_commands: stringArray,
  risk_level: optionalString,
  required_approvals: stringArray,
  expected_artifacts: stringArray,
  rollback_plan: optionalString,
  verification_steps: stringArray,
  status: optionalString,
})
export type RunProofContractView = z.infer<typeof runProofContractViewSchema>

export const runProofEventViewSchema = z.object({
  timestamp: optionalString,
  type: optionalString,
  actor: optionalString,
  summary: optionalString,
  risk: optionalString,
  status: optionalString,
  refs: stringRecord,
  data: unknownRecord,
})
export type RunProofEventView = z.infer<typeof runProofEventViewSchema>

export const runProofLifecycleViewSchema = z.object({
  status: optionalString,
  started_at: optionalString,
  ended_at: optionalString,
})
export type RunProofLifecycleView = z.infer<typeof runProofLifecycleViewSchema>

export const runProofRiskViewSchema = z.object({
  level: optionalString,
  reasons: stringArray,
  required_approval: optionalBoolean,
})
export type RunProofRiskView = z.infer<typeof runProofRiskViewSchema>

export const runProofRollbackViewSchema = z.object({
  checkpoint_id: optionalString,
  strategy: optionalString,
  restore_command: optionalString,
  valid_until: optionalString,
  restore_status: optionalString,
  staged_at: optionalString,
  approval_required: optionalBoolean,
  approved_at: optionalString,
  approved_by: optionalString,
  executed_at: optionalString,
  execution_status: optionalString,
  execution_exit_code: optionalNumber,
})
export type RunProofRollbackView = z.infer<typeof runProofRollbackViewSchema>

export const runProofFinalEvidenceViewSchema = z.object({
  completed: optionalBoolean,
  summary: optionalString,
  proof_score: optionalNumber,
  human_review_recommended: optionalBoolean,
})
export type RunProofFinalEvidenceView = z.infer<typeof runProofFinalEvidenceViewSchema>

export const runProofDiffViewSchema = z.object({
  id: optionalString,
  path: optionalString,
  status: optionalString,
  additions: optionalNumber,
  deletions: optionalNumber,
  summary: optionalString,
})
export type RunProofDiffView = z.infer<typeof runProofDiffViewSchema>

export const runProofFileReadViewSchema = z.object({
  id: optionalString,
  path: optionalString,
  reason: optionalString,
  exists: optionalBoolean,
  bytes_read: optionalNumber,
})
export type RunProofFileReadView = z.infer<typeof runProofFileReadViewSchema>

export const runProofFileWriteViewSchema = z.object({
  id: optionalString,
  path: optionalString,
  mode: optionalString,
  reason: optionalString,
  bytes_written: optionalNumber,
})
export type RunProofFileWriteView = z.infer<typeof runProofFileWriteViewSchema>

export const runProofShellCommandViewSchema = z.object({
  id: optionalString,
  command: optionalString,
  cwd: optionalString,
  status: optionalString,
  risk: optionalString,
  exit_code: optionalNumber,
  stdout_summary: optionalString,
  stderr_summary: optionalString,
})
export type RunProofShellCommandView = z.infer<typeof runProofShellCommandViewSchema>

export const runProofCheckViewSchema = z.object({
  id: optionalString,
  command: optionalString,
  source: optionalString,
  description: optionalString,
  status: optionalString,
  summary: optionalString,
  evidence: optionalString,
  passed: optionalNumber,
  failed: optionalNumber,
  skipped: optionalNumber,
  duration_ms: optionalNumber,
})
export type RunProofCheckView = z.infer<typeof runProofCheckViewSchema>

export const runProofVerifierReviewViewSchema = z.object({
  model: optionalString,
  status: optionalString,
  summary: optionalString,
  concerns: stringArray,
})
export type RunProofVerifierReviewView = z.infer<typeof runProofVerifierReviewViewSchema>

export const runProofVerificationViewSchema = z.object({
  diagnostics: recordArray(runProofCheckViewSchema),
  tests: recordArray(runProofCheckViewSchema),
  manual_checks: recordArray(runProofCheckViewSchema),
  typecheck: optionalRecord(runProofCheckViewSchema),
  lint: optionalRecord(runProofCheckViewSchema),
  build: optionalRecord(runProofCheckViewSchema),
  verifier_review: optionalRecord(runProofVerifierReviewViewSchema),
})
export type RunProofVerificationView = z.infer<typeof runProofVerificationViewSchema>

export const runProofSovereigntyViewSchema = z.object({
  provider: optionalString,
  model: optionalString,
  route: optionalString,
  reason: optionalString,
  data_left_local: optionalBoolean,
  selection_source: optionalString,
  fallback_provider: optionalString,
  fallback_model: optionalString,
  data_boundary: optionalString,
  estimated_cost_usd: optionalNumber,
  latency_ms: optionalNumber,
  timestamp: optionalString,
  summary: optionalString,
})
export type RunProofSovereigntyView = z.infer<typeof runProofSovereigntyViewSchema>

export const runProofTokenUsageViewSchema = z.object({
  input_tokens: z.number(),
  output_tokens: z.number(),
  total_tokens: z.number(),
  tool_calls: z.number(),
  turns: z.number(),
})
export type RunProofTokenUsageView = z.infer<typeof runProofTokenUsageViewSchema>

export const runProofContextBudgetViewSchema = z.object({
  estimated_tokens: z.number(),
  system_tokens: z.number(),
  tool_tokens: z.number(),
  message_count: z.number(),
  threshold: z.number(),
  action: z.string(),
  risk: optionalString,
  status: optionalString,
  summary: optionalString,
  timestamp: optionalString,
})
export type RunProofContextBudgetView = z.infer<typeof runProofContextBudgetViewSchema>

export const runProofConsensusViewSchema = z.object({
  council_id: optionalString,
  prompt: optionalString,
  models: stringArray,
  rounds: optionalNumber,
  vote_mode: optionalString,
  status: optionalString,
  winner_model: optionalString,
  vote_tally: z.record(z.string(), z.number()),
  cost_tokens: optionalRecord(z.object({ input: z.number(), output: z.number() })),
  errored: stringArray,
  transcript: optionalString,
  timestamp: optionalString,
  summary: optionalString,
})
export type RunProofConsensusView = z.infer<typeof runProofConsensusViewSchema>

export const runProofMLEvidenceViewSchema = z.object({
  kind: z.union([z.literal("turn"), z.literal("tool")]).optional(),
  timestamp: optionalString,
  summary: optionalString,
  intent: optionalString,
  tool: optionalString,
  risk: optionalString,
  posture: optionalString,
  confidence: optionalNumber,
  labels: stringArray,
  reasons: stringArray,
  route: optionalString,
  route_reason: optionalString,
  decision_action: optionalString,
  decision_posture: optionalString,
  decision_confidence: optionalNumber,
  decision_reasons: stringArray,
  guard_rules: stringArray,
})
export type RunProofMLEvidenceView = z.infer<typeof runProofMLEvidenceViewSchema>

export const runProofRawViewSchema = z.object({
  id: optionalString,
  user_intent: optionalString,
  timestamp: optionalString,
  lifecycle: optionalRecord(runProofLifecycleViewSchema),
  contract: optionalRecord(runProofContractViewSchema),
  events: recordArray(runProofEventViewSchema),
  risk: optionalRecord(runProofRiskViewSchema),
  rollback: optionalRecord(runProofRollbackViewSchema),
  final_evidence: optionalRecord(runProofFinalEvidenceViewSchema),
  diffs: optionalRecord(
    z.object({
      proposed: recordArray(runProofDiffViewSchema),
      applied: recordArray(runProofDiffViewSchema),
      rejected: recordArray(runProofDiffViewSchema),
    }),
  ),
  execution: optionalRecord(
    z.object({
      file_reads: recordArray(runProofFileReadViewSchema),
      file_writes: recordArray(runProofFileWriteViewSchema),
      shell_commands: recordArray(runProofShellCommandViewSchema),
    }),
  ),
  verification: optionalRecord(runProofVerificationViewSchema),
})
export type RunProofRawView = z.infer<typeof runProofRawViewSchema>

export const runProofViewSchema = runProofRawViewSchema.extend({
  sovereignty: runProofSovereigntyViewSchema.optional(),
  token_usage: runProofTokenUsageViewSchema.optional(),
  consensus: z.array(runProofConsensusViewSchema).optional(),
  ml_evidence: z.array(runProofMLEvidenceViewSchema).optional(),
})
export type RunProofView = z.infer<typeof runProofViewSchema>

// ---------------------------------------------------------------------------
// Typed payload parse (the old normalizers never threw; keep that guarantee)
// ---------------------------------------------------------------------------

/**
 * Parse an unknown payload against a lenient schema and return the parsed
 * data — or an empty typed object when the input cannot be an object at all.
 * Mirrors the old hand-rolled normalizers' "never throws" guarantee while
 * keeping the parsed data fully typed.
 */
function parsePayload<T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value)
  return result.success ? result.data : ({} as z.infer<T>)
}

// ---------------------------------------------------------------------------
// Event-derived extractors (schema-validated payloads, old fallback logic)
// ---------------------------------------------------------------------------

const sovereigntyRoutedDataSchema = z.object({
  provider: optionalString,
  model: optionalString,
  route: optionalString,
  reason: optionalString,
  data_left_local: optionalBoolean,
  selection_source: optionalString,
  fallback_provider: optionalString,
  fallback_model: optionalString,
  data_boundary: optionalString,
  estimated_cost_usd: optionalNumber,
  latency_ms: optionalNumber,
})

const tokenUsedDataSchema = z.object({
  input_tokens: optionalNumber,
  output_tokens: optionalNumber,
  total_tokens: optionalNumber,
  tool_calls: optionalNumber,
})

const consensusRecordedDataSchema = z.object({
  council_id: optionalString,
  prompt: optionalString,
  models: stringArray,
  rounds: optionalNumber,
  vote_mode: optionalString,
  status: optionalString,
  winner_model: optionalString,
  vote_tally: z.preprocess(
    (value) =>
      isPlainRecord(value)
        ? Object.fromEntries(
            Object.entries(value).filter((entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1])),
          )
        : undefined,
    z.record(z.string(), z.number()).optional(),
  ),
  cost_tokens: optionalRecord(z.object({ input: z.number(), output: z.number() })),
  errored: stringArray,
  transcript: optionalString,
})

const mlSignalDataSchema = z.preprocess(
  // Old semantics: `event.data ?? {}` — a non-object payload becomes an empty
  // record, so extraction can NEVER throw on malformed ml.signal data.
  (value) => (isPlainRecord(value) ? value : {}),
  z.object({
    kind: optionalString,
    signal: z.preprocess(
      (value) => (isPlainRecord(value) ? value : {}),
      z.object({
        intent: optionalString,
        toolName: optionalString,
        risk: optionalString,
        executionPosture: optionalString,
        confidence: z.preprocess(
          (value) => {
            if (typeof value === "number" && Number.isFinite(value)) return value
            if (isPlainRecord(value) && typeof value.value === "number" && Number.isFinite(value.value)) return value.value
            return undefined
          },
          z.number().optional(),
        ),
        labels: stringArray,
        reasons: stringArray,
        guardRules: stringArray,
        modelRoute: optionalRecord(z.object({ profile: optionalString, reason: optionalString })),
      }),
    ),
    decision: optionalRecord(
      z.object({
        action: optionalString,
        posture: optionalString,
        confidence: optionalNumber,
        reasons: stringArray,
      }),
    ),
  }),
)

const contextBudgetedDataSchema = z.object({
  estimated_tokens: optionalNumber,
  system_tokens: optionalNumber,
  tool_tokens: optionalNumber,
  message_count: optionalNumber,
  threshold: optionalNumber,
  action: optionalString,
})

export function sovereigntyFromEvents(events: RunProofEventView[]): RunProofSovereigntyView | undefined {
  const event = events.findLast((item) => item.type === "sovereignty.routed")
  if (!event) return undefined
  const data = parsePayload(sovereigntyRoutedDataSchema, event.data)
  return {
    provider: data.provider ?? event.refs?.provider,
    model: data.model ?? event.refs?.model,
    route: data.route,
    reason: data.reason,
    data_left_local: data.data_left_local,
    selection_source: data.selection_source,
    fallback_provider: data.fallback_provider,
    fallback_model: data.fallback_model,
    data_boundary: data.data_boundary,
    estimated_cost_usd: data.estimated_cost_usd,
    latency_ms: data.latency_ms,
    timestamp: event.timestamp,
    summary: event.summary,
  }
}

export function tokenUsageFromEvents(events: RunProofEventView[]): RunProofTokenUsageView | undefined {
  const usage = events.filter((item) => item.type === "token.used")
  if (usage.length === 0) return undefined

  return usage.reduce<RunProofTokenUsageView>(
    (total, event) => {
      const data = parsePayload(tokenUsedDataSchema, event.data)
      total.input_tokens += data.input_tokens ?? 0
      total.output_tokens += data.output_tokens ?? 0
      total.total_tokens += data.total_tokens ?? 0
      total.tool_calls += data.tool_calls ?? 0
      total.turns += 1
      return total
    },
    { input_tokens: 0, output_tokens: 0, total_tokens: 0, tool_calls: 0, turns: 0 },
  )
}

export function consensusFromEvents(events: RunProofEventView[]): RunProofConsensusView[] {
  return events
    .filter((event) => event.type === "consensus.recorded")
    .map((event) => {
      const data = parsePayload(consensusRecordedDataSchema, event.data)
      return {
        council_id: data.council_id ?? event.refs?.council_id,
        prompt: data.prompt,
        models: data.models,
        rounds: data.rounds,
        vote_mode: data.vote_mode,
        status: data.status ?? event.status,
        winner_model: data.winner_model ?? event.refs?.winner_model,
        vote_tally: data.vote_tally ?? {},
        cost_tokens: data.cost_tokens
          ? { input: data.cost_tokens.input ?? 0, output: data.cost_tokens.output ?? 0 }
          : undefined,
        errored: data.errored,
        transcript: data.transcript,
        timestamp: event.timestamp,
        summary: event.summary,
      }
    })
}

export function mlEvidenceFromEvents(events: RunProofEventView[]): RunProofMLEvidenceView[] {
  return events
    .filter((event) => event.type === "ml.signal")
    .map((event) => {
      const data = parsePayload(mlSignalDataSchema, event.data)
      const signal = data.signal
      return {
        kind: data.kind === "tool" ? "tool" : "turn",
        timestamp: event.timestamp,
        summary: event.summary,
        intent: signal.intent,
        tool: signal.toolName,
        risk: signal.risk,
        posture: signal.executionPosture,
        confidence: signal.confidence,
        labels: signal.labels,
        reasons: signal.reasons,
        route: signal.modelRoute?.profile,
        route_reason: signal.modelRoute?.reason,
        decision_action: data.decision?.action,
        decision_posture: data.decision?.posture,
        decision_confidence: data.decision?.confidence,
        decision_reasons: data.decision?.reasons ?? [],
        guard_rules: signal.guardRules ?? [],
      }
    })
}

export function contextBudgetsFromEvents(events: RunProofEventView[]): RunProofContextBudgetView[] {
  return events.flatMap((event): RunProofContextBudgetView[] => {
    if (event.type !== "context.budgeted") return []
    const data = parsePayload(contextBudgetedDataSchema, event.data)
    return [
      {
        estimated_tokens: data.estimated_tokens ?? 0,
        system_tokens: data.system_tokens ?? 0,
        tool_tokens: data.tool_tokens ?? 0,
        message_count: data.message_count ?? 0,
        threshold: data.threshold ?? 0,
        action: data.action ?? "observe",
        risk: event.risk,
        status: event.status,
        summary: event.summary,
        timestamp: event.timestamp,
      },
    ]
  })
}

// ---------------------------------------------------------------------------
// normalizeProofView — the single entry point (never throws)
// ---------------------------------------------------------------------------

export function normalizeProofView(value: unknown): RunProofView {
  const raw = parsePayload(runProofRawViewSchema, value)
  const events = raw.events ?? []
  return {
    id: raw.id,
    user_intent: raw.user_intent,
    timestamp: raw.timestamp,
    lifecycle: raw.lifecycle,
    contract: raw.contract,
    risk: raw.risk,
    rollback: raw.rollback,
    final_evidence: raw.final_evidence,
    diffs: raw.diffs ?? { proposed: [], applied: [], rejected: [] },
    execution: raw.execution ?? { file_reads: [], file_writes: [], shell_commands: [] },
    verification: raw.verification ?? {
      diagnostics: [],
      tests: [],
      manual_checks: [],
      typecheck: undefined,
      lint: undefined,
      build: undefined,
      verifier_review: undefined,
    },
    events,
    sovereignty: sovereigntyFromEvents(events),
    token_usage: tokenUsageFromEvents(events),
    consensus: consensusFromEvents(events),
    ml_evidence: mlEvidenceFromEvents(events),
  }
}

// ---------------------------------------------------------------------------
// Exported accessors for the app.tsx mutation path (stage/approve rollback)
// ---------------------------------------------------------------------------

/** Identity-preserving guard (the mutation path mutates the returned record). */
export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : undefined
}

export function proofString(value: unknown): string | undefined {
  return optionalString.safeParse(value).data
}

export function proofNumber(value: unknown): number | undefined {
  return optionalNumber.safeParse(value).data
}

export function proofBoolean(value: unknown): boolean | undefined {
  return optionalBoolean.safeParse(value).data
}

export function asStringArray(value: unknown): string[] {
  return stringArray.safeParse(value).data ?? []
}
