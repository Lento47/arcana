import { createHash, createHmac, randomUUID } from "node:crypto"

import { z } from "zod"

import type { InferencePreparation, InferenceResponseEvaluation } from "./inference-optimizer.js"

export const LEARNING_SCHEMA_VERSION = "arcana.ml.learning-example.v1" as const
export const LEARNING_CONSENT_POLICY_VERSION = "arcana.ml.learning-consent.v1" as const
export const LEARNING_PROFILE_VERSION = "arcana.ml.calibration-profile.v1" as const
export const DEFAULT_LEARNING_RETENTION_DAYS = 30
export const MAX_LEARNING_TEXT_CHARACTERS = 32_768
export const LEARNING_CONSENT_DISCLOSURE =
  "Arcana may locally store structured optimizer signals and redacted request/response text for 30 days, use them to automatically activate non-security calibration profiles, and never upload them. Raw context bodies, tool arguments, tool outputs, secrets, and SECRET content are excluded."

export const LearningScopeTypeSchema = z.enum(["device", "workspace"])
export type LearningScopeType = z.infer<typeof LearningScopeTypeSchema>

export const LearningConsentActionSchema = z.enum(["grant", "revoke", "inherit"])
export type LearningConsentAction = z.infer<typeof LearningConsentActionSchema>

export const LearningProvenanceSchema = z.enum([
  "USER_INSTRUCTION",
  "MODEL_OUTPUT",
  "TOOL_OUTPUT",
  "TRUSTED_LOCAL_SOURCE",
  "UNTRUSTED_LOCAL_SOURCE",
  "ACTIVE_CONTRACT",
])
export type LearningProvenance = z.infer<typeof LearningProvenanceSchema>

export const LearningSensitivitySchema = z.enum(["PUBLIC", "INTERNAL", "PRIVATE", "SECRET"])
export type LearningSensitivity = z.infer<typeof LearningSensitivitySchema>

export const LearningConsentReceiptV1Schema = z.object({
  schemaVersion: z.literal(LEARNING_CONSENT_POLICY_VERSION),
  id: z.string().min(1),
  scopeType: LearningScopeTypeSchema,
  scopeRef: z.string().min(1),
  action: LearningConsentActionSchema,
  disclosureDigest: z.string().regex(/^[a-f0-9]{64}$/),
  retentionDays: z.number().int().min(1).max(DEFAULT_LEARNING_RETENTION_DAYS),
  source: z.enum(["cli", "tui", "api", "test"]),
  createdAt: z.iso.datetime(),
})
export type LearningConsentReceiptV1 = z.infer<typeof LearningConsentReceiptV1Schema>

export type LearningRedactionCategory =
  | "secret"
  | "private_key"
  | "email"
  | "ip_address"
  | "phone"
  | "street_address"
  | "absolute_path"
  | "truncated"
  | "secret_sensitivity"

export type RedactedLearningText = {
  content: string | null
  digest: string
  originalCharacters: number
  retainedCharacters: number
  sensitivity: LearningSensitivity
  redactions: Partial<Record<LearningRedactionCategory, number>>
  truncated: boolean
}

export const LearningContextFeatureV1Schema = z.object({
  itemRef: z.string().min(1),
  kind: z.enum(["system", "message", "memory", "tool_output", "file", "summary", "artifact"]),
  decision: z.enum(["include", "summarize", "drop", "blocked"]),
  score: z.number().min(0).max(1),
  priority: z.number().min(0).max(1).optional(),
  recency: z.number().min(0).max(1).optional(),
  originalTokens: z.number().int().nonnegative(),
  materializedTokens: z.number().int().nonnegative(),
  required: z.boolean(),
})
export type LearningContextFeatureV1 = z.infer<typeof LearningContextFeatureV1Schema>

export const LearningQualityFeaturesV1Schema = z.object({
  score: z.number().min(0).max(1),
  genericity: z.number().min(0).max(1),
  specificity: z.number().min(0).max(1),
  actionability: z.number().min(0).max(1),
  constraintFit: z.number().min(0).max(1),
  contractCoverage: z.number().min(0).max(1),
  evidenceGap: z.boolean(),
})
export type LearningQualityFeaturesV1 = z.infer<typeof LearningQualityFeaturesV1Schema>

const StoredLearningTextSchema = z.object({
  content: z.string().nullable(),
  digest: z.string().regex(/^[a-f0-9]{64}$/),
  originalCharacters: z.number().int().nonnegative(),
  retainedCharacters: z.number().int().nonnegative(),
  sensitivity: LearningSensitivitySchema,
  redactions: z.record(z.string(), z.number().int().nonnegative()),
  truncated: z.boolean(),
})

export const LearningExampleV1Schema = z.object({
  schemaVersion: z.literal(LEARNING_SCHEMA_VERSION),
  id: z.string().min(1),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  consentReceiptId: z.string().min(1),
  consentScopeType: LearningScopeTypeSchema,
  consentScopeRef: z.string().min(1),
  workspaceRef: z.string().min(1),
  sessionRef: z.string().min(1),
  messageRef: z.string().min(1),
  runtime: z.enum(["engine", "standalone"]),
  optimizerMode: z.enum(["observe", "optimize"]),
  phase: z.enum(["analysis", "editing", "verification", "final"]),
  intent: z.string().min(1),
  model: z.object({ provider: z.string().min(1), model: z.string().min(1) }),
  profileId: z.string().nullable(),
  request: StoredLearningTextSchema,
  draftResponse: StoredLearningTextSchema.nullable(),
  finalResponse: StoredLearningTextSchema,
  preparation: z.object({
    status: z.enum(["ready", "requires_compaction"]),
    candidateContextTokens: z.number().int().nonnegative(),
    packedContextTokens: z.number().int().nonnegative(),
    tokenSavings: z.number().int().nonnegative(),
    tokenSavingsRatio: z.number().min(0).max(1),
    availableInputTokens: z.number().int().nonnegative(),
    outputReserveTokens: z.number().int().nonnegative(),
    toolReserveTokens: z.number().int().nonnegative(),
    context: z.array(LearningContextFeatureV1Schema).max(2_048),
  }),
  response: z.object({
    initial: LearningQualityFeaturesV1Schema,
    final: LearningQualityFeaturesV1Schema,
    disposition: z.enum(["respond", "revise", "ask_user", "reject"]),
    revisions: z.number().int().min(0).max(8),
  }),
  usage: z.object({
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    toolTokens: z.number().int().nonnegative(),
    latencyMilliseconds: z.number().nonnegative(),
  }),
  evidenceTypes: z.array(z.string().min(1)).max(32),
})
export type LearningExampleV1 = z.infer<typeof LearningExampleV1Schema>

export const LearningLabelKindSchema = z.enum([
  "response_rating",
  "task_outcome",
  "revision_outcome",
  "budget_outcome",
  "context_outcome",
])
export type LearningLabelKind = z.infer<typeof LearningLabelKindSchema>

export const LearningLabelValueSchema = z.enum([
  "positive",
  "negative",
  "useful",
  "not_useful",
  "accepted",
  "rejected",
  "verified",
  "passed",
  "failed",
  "success",
  "failure",
  "improved",
  "not_improved",
  "within_budget",
  "exceeded_budget",
  "context_helpful",
  "context_harmful",
])
export type LearningLabelValue = z.infer<typeof LearningLabelValueSchema>

export const LearningLabelV1Schema = z.object({
  schemaVersion: z.literal(LEARNING_SCHEMA_VERSION),
  id: z.string().min(1),
  exampleId: z.string().min(1),
  kind: LearningLabelKindSchema,
  value: LearningLabelValueSchema,
  source: z.enum(["explicit_user", "runtime_evidence", "deterministic_derived"]),
  confidence: z.number().min(0).max(1),
  provenance: LearningProvenanceSchema,
  targetRef: z.string().optional(),
  createdAt: z.iso.datetime(),
})
export type LearningLabelV1 = z.infer<typeof LearningLabelV1Schema>

export const ResponseCalibrationWeightsSchema = z.object({
  specificity: z.number().min(0).max(1),
  actionability: z.number().min(0).max(1),
  constraintFit: z.number().min(0).max(1),
  nonGenericity: z.number().min(0).max(1),
  contractCoverage: z.number().min(0).max(1),
})
export type ResponseCalibrationWeights = z.infer<typeof ResponseCalibrationWeightsSchema>

export const TokenReserveCalibrationSchema = z.object({
  phase: z.enum(["analysis", "editing", "verification", "final"]),
  tools: z.boolean(),
  outputReserveTokens: z.number().int().nonnegative(),
  toolReserveTokens: z.number().int().nonnegative(),
  samples: z.number().int().positive(),
})
export type TokenReserveCalibration = z.infer<typeof TokenReserveCalibrationSchema>

export const InferenceCalibrationProfileV1Schema = z.object({
  schemaVersion: z.literal(LEARNING_PROFILE_VERSION),
  id: z.string().min(1),
  scopeType: LearningScopeTypeSchema,
  scopeRef: z.string().min(1),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  trainingDigest: z.string().regex(/^[a-f0-9]{64}$/),
  trainingExamples: z.number().int().positive(),
  response: z.object({
    weights: ResponseCalibrationWeightsSchema,
    threshold: z.number().min(0.2).max(0.95),
    evidencePenalty: z.number().min(0).max(0.5),
  }),
  tokenReserves: z.array(TokenReserveCalibrationSchema),
  evaluation: z.object({
    baselineBalancedAccuracy: z.number().min(0).max(1),
    candidateBalancedAccuracy: z.number().min(0).max(1),
    baselineLogLoss: z.number().nonnegative(),
    candidateLogLoss: z.number().nonnegative(),
    baselineFalseAllows: z.number().int().nonnegative(),
    candidateFalseAllows: z.number().int().nonnegative(),
    baselineFalseRevisionRate: z.number().min(0).max(1),
    candidateFalseRevisionRate: z.number().min(0).max(1),
    holdoutExamples: z.number().int().positive(),
  }),
})
export type InferenceCalibrationProfileV1 = z.infer<typeof InferenceCalibrationProfileV1Schema>

export const LearningDatasetManifestV1Schema = z.object({
  schemaVersion: z.literal(LEARNING_SCHEMA_VERSION),
  exportedAt: z.iso.datetime(),
  exampleCount: z.number().int().nonnegative(),
  labelCount: z.number().int().nonnegative(),
  includeContent: z.boolean(),
  scopeType: LearningScopeTypeSchema.optional(),
  scopeRef: z.string().optional(),
  jsonlSha256: z.string().regex(/^[a-f0-9]{64}$/),
  redactionCounts: z.record(z.string(), z.number().int().nonnegative()),
})
export type LearningDatasetManifestV1 = z.infer<typeof LearningDatasetManifestV1Schema>

export const DEFAULT_RESPONSE_CALIBRATION_WEIGHTS: ResponseCalibrationWeights = {
  specificity: 0.3,
  actionability: 0.22,
  constraintFit: 0.18,
  nonGenericity: 0.1,
  contractCoverage: 0.2,
}

const REDACTIONS: Array<{ category: LearningRedactionCategory; pattern: RegExp; replacement: string }> = [
  {
    category: "private_key",
    pattern:
      /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g,
    replacement: "<PRIVATE_KEY_REDACTED>",
  },
  {
    category: "secret",
    pattern: /\b(?:bearer\s+[a-z0-9._~+/=-]{12,}|(?:sk|rk|pk|ghp|github_pat|xox[baprs]|AIza)[-_a-z0-9]{12,})\b/gi,
    replacement: "<SECRET_REDACTED>",
  },
  {
    category: "secret",
    pattern:
      /\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|password|passwd)\s*[:=]\s*["']?[^\s,"']{4,}/gi,
    replacement: "<SECRET_REDACTED>",
  },
  {
    category: "email",
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    replacement: "<EMAIL_REDACTED>",
  },
  {
    category: "ip_address",
    pattern: /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g,
    replacement: "<IP_REDACTED>",
  },
  {
    category: "phone",
    pattern: /(?<!\w)(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}(?!\w)/g,
    replacement: "<PHONE_REDACTED>",
  },
  {
    category: "street_address",
    pattern: /\b\d{1,6}\s+[A-Za-z0-9.' -]{2,40}\s(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr)\b/gi,
    replacement: "<ADDRESS_REDACTED>",
  },
  {
    category: "absolute_path",
    pattern:
      /(?:\b[A-Za-z]:\\(?:[^\\\r\n<>:"|?*]+\\)*[^\\\r\n<>:"|?*]*|\/(?:Users|home|private|var|tmp|etc)\/(?:[^\s'"`]+))/g,
    replacement: "<ABSOLUTE_PATH_REDACTED>",
  },
]

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex")
}

export const LEARNING_CONSENT_DISCLOSURE_DIGEST = sha256(LEARNING_CONSENT_DISCLOSURE)

function increment(
  counts: Partial<Record<LearningRedactionCategory, number>>,
  category: LearningRedactionCategory,
  amount: number,
): void {
  if (amount > 0) counts[category] = (counts[category] ?? 0) + amount
}

export function redactLearningText(
  text: string,
  options: { sensitivity?: LearningSensitivity; maxCharacters?: number } = {},
): RedactedLearningText {
  const sensitivity = options.sensitivity ?? "PRIVATE"
  const originalCharacters = text.length
  if (sensitivity === "SECRET") {
    return {
      content: null,
      digest: sha256(text),
      originalCharacters,
      retainedCharacters: 0,
      sensitivity,
      redactions: { secret_sensitivity: 1 },
      truncated: false,
    }
  }

  const redactions: Partial<Record<LearningRedactionCategory, number>> = {}
  let content = text
  for (const rule of REDACTIONS) {
    let hits = 0
    content = content.replace(rule.pattern, () => {
      hits += 1
      return rule.replacement
    })
    increment(redactions, rule.category, hits)
  }

  const limit = Math.max(0, Math.floor(options.maxCharacters ?? MAX_LEARNING_TEXT_CHARACTERS))
  const truncated = content.length > limit
  if (truncated) {
    content = content.slice(0, limit)
    increment(redactions, "truncated", 1)
  }
  return {
    content,
    digest: sha256(text),
    originalCharacters,
    retainedCharacters: content.length,
    sensitivity,
    redactions,
    truncated,
  }
}

export function learningReference(secret: string, namespace: string, value: string): string {
  return createHmac("sha256", secret).update(`${namespace}\0${value}`, "utf8").digest("hex")
}

export function createLearningLabel(
  input: Omit<LearningLabelV1, "schemaVersion" | "id" | "createdAt"> & { id?: string; createdAt?: string },
): LearningLabelV1 {
  return LearningLabelV1Schema.parse({
    ...input,
    schemaVersion: LEARNING_SCHEMA_VERSION,
    id: input.id ?? randomUUID(),
    createdAt: input.createdAt ?? new Date().toISOString(),
  })
}

function learningQuality(evaluation: InferenceResponseEvaluation): LearningQualityFeaturesV1 {
  return {
    score: evaluation.score,
    genericity: evaluation.quality.genericityScore,
    specificity: evaluation.quality.specificityScore,
    actionability: evaluation.quality.actionabilityScore,
    constraintFit: evaluation.quality.constraintFitScore,
    contractCoverage: evaluation.contractCoverage,
    evidenceGap: evaluation.problems.some((problem) => problem.toLowerCase().includes("evidence")),
  }
}

export function createLearningExample(input: {
  workspaceRef: string
  sessionRef: string
  messageRef: string
  runtime: LearningExampleV1["runtime"]
  intent: string
  provider: string
  model: string
  request: string
  draftResponse?: string
  finalResponse: string
  preparation: InferencePreparation
  initialEvaluation: InferenceResponseEvaluation
  finalEvaluation?: InferenceResponseEvaluation
  revisions?: number
  usage: LearningExampleV1["usage"]
  evidenceTypes?: string[]
  sensitivity?: LearningSensitivity
  id?: string
  createdAt?: string
}): LearningExampleV1 {
  const createdAt = input.createdAt ?? new Date().toISOString()
  const finalEvaluation = input.finalEvaluation ?? input.initialEvaluation
  return LearningExampleV1Schema.parse({
    schemaVersion: LEARNING_SCHEMA_VERSION,
    id: input.id ?? randomUUID(),
    createdAt,
    // The persistence boundary replaces this provisional expiry using the
    // active consent receipt's retention period in the same transaction.
    expiresAt: new Date(new Date(createdAt).getTime() + DEFAULT_LEARNING_RETENTION_DAYS * 86_400_000).toISOString(),
    consentReceiptId: "pending-persistence-consent-check",
    consentScopeType: "device",
    consentScopeRef: "pending-persistence-consent-check",
    workspaceRef: input.workspaceRef,
    sessionRef: input.sessionRef,
    messageRef: input.messageRef,
    runtime: input.runtime,
    optimizerMode: input.preparation.mode,
    phase: input.preparation.phase,
    intent: input.intent,
    model: { provider: input.provider, model: input.model },
    profileId: input.preparation.calibrationProfileId,
    request: redactLearningText(input.request, { sensitivity: input.sensitivity }),
    draftResponse: input.draftResponse
      ? redactLearningText(input.draftResponse, { sensitivity: input.sensitivity })
      : null,
    finalResponse: redactLearningText(input.finalResponse, { sensitivity: input.sensitivity }),
    preparation: {
      status: input.preparation.status,
      candidateContextTokens: input.preparation.metrics.candidateContextTokens,
      packedContextTokens: input.preparation.metrics.packedContextTokens,
      tokenSavings: input.preparation.metrics.tokenSavings,
      tokenSavingsRatio: input.preparation.metrics.tokenSavingsRatio,
      availableInputTokens: input.preparation.tokenAllocation.availableInputTokens,
      outputReserveTokens: input.preparation.tokenAllocation.outputReserveTokens,
      toolReserveTokens: input.preparation.tokenAllocation.toolReserveTokens,
      context: input.preparation.context.map((item) => ({
        itemRef: item.id,
        kind: item.kind,
        decision: item.decision,
        score: item.score,
        originalTokens: item.originalTokens,
        materializedTokens: item.materializedTokens,
        required: item.decision === "blocked" || item.reasons.some((reason) => reason.includes("required")),
      })),
    },
    response: {
      initial: learningQuality(input.initialEvaluation),
      final: learningQuality(finalEvaluation),
      disposition: finalEvaluation.recommendedDisposition,
      revisions: input.revisions ?? 0,
    },
    usage: input.usage,
    evidenceTypes: input.evidenceTypes ?? [],
  })
}

type CalibrationRow = {
  example: LearningExampleV1
  label: 0 | 1
}

export type CalibrationResult =
  | { eligible: false; reasons: string[] }
  | { eligible: true; activate: boolean; reasons: string[]; profile: InferenceCalibrationProfileV1 }

export type CalibrationEvaluation = {
  examples: number
  positives: number
  negatives: number
  balancedAccuracy: number
  logLoss: number
  falseAllows: number
  falseRevisionRate: number
}

function authoritativeRows(examples: LearningExampleV1[], labels: LearningLabelV1[]): CalibrationRow[] {
  const byExample = new Map<string, LearningLabelV1[]>()
  for (const label of labels) {
    if (label.kind !== "response_rating" && label.kind !== "task_outcome") continue
    const current = byExample.get(label.exampleId) ?? []
    current.push(label)
    byExample.set(label.exampleId, current)
  }
  const rows: CalibrationRow[] = []
  for (const example of examples) {
    const candidates = (byExample.get(example.id) ?? []).sort((left, right) => {
      const sourceRank = (source: LearningLabelV1["source"]) =>
        source === "explicit_user" ? 2 : source === "runtime_evidence" ? 1 : 0
      return sourceRank(right.source) - sourceRank(left.source) || right.createdAt.localeCompare(left.createdAt)
    })
    const selected = candidates[0]
    if (!selected || selected.source === "deterministic_derived") continue
    const positive = ["positive", "useful", "accepted", "verified", "passed", "success"].includes(
      selected.value.toLowerCase(),
    )
    const negative = ["negative", "not_useful", "rejected", "failed", "failure"].includes(selected.value.toLowerCase())
    if (positive || negative) rows.push({ example, label: positive ? 1 : 0 })
  }
  return rows
}

function featureValues(features: LearningQualityFeaturesV1): number[] {
  return [
    features.specificity,
    features.actionability,
    features.constraintFit,
    1 - features.genericity,
    features.contractCoverage,
  ]
}

function weightedScore(features: LearningQualityFeaturesV1, weights: ResponseCalibrationWeights): number {
  const values = featureValues(features)
  const selected = [
    weights.specificity,
    weights.actionability,
    weights.constraintFit,
    weights.nonGenericity,
    weights.contractCoverage,
  ]
  return values.reduce((sum, value, index) => sum + value * (selected[index] ?? 0), 0)
}

function splitRows(rows: CalibrationRow[]): { train: CalibrationRow[]; holdout: CalibrationRow[] } {
  const groups = new Map<string, CalibrationRow[]>()
  for (const row of rows) {
    const group = groups.get(row.example.sessionRef) ?? []
    group.push(row)
    groups.set(row.example.sessionRef, group)
  }
  const train: CalibrationRow[] = []
  const holdout: CalibrationRow[] = []
  for (const [group, groupedRows] of groups) {
    const bucket = Number.parseInt(sha256(group).slice(0, 8), 16) % 5
    ;(bucket === 0 ? holdout : train).push(...groupedRows)
  }
  return { train, holdout }
}

function learnWeights(rows: CalibrationRow[]): ResponseCalibrationWeights {
  const positive = rows.filter((row) => row.label === 1)
  const negative = rows.filter((row) => row.label === 0)
  const differences = featureValues(rows[0]!.example.response.final).map((_, index) => {
    const positiveMean =
      positive.reduce((sum, row) => sum + featureValues(row.example.response.final)[index]!, 0) / positive.length
    const negativeMean =
      negative.reduce((sum, row) => sum + featureValues(row.example.response.final)[index]!, 0) / negative.length
    return Math.max(0.02, positiveMean - negativeMean)
  })
  const total = differences.reduce((sum, value) => sum + value, 0)
  const normalized = differences.map((value) => Number((value / total).toFixed(6)))
  return {
    specificity: normalized[0]!,
    actionability: normalized[1]!,
    constraintFit: normalized[2]!,
    nonGenericity: normalized[3]!,
    contractCoverage: normalized[4]!,
  }
}

function balancedAccuracy(rows: CalibrationRow[], weights: ResponseCalibrationWeights, threshold: number): number {
  const positives = rows.filter((row) => row.label === 1)
  const negatives = rows.filter((row) => row.label === 0)
  const truePositiveRate =
    positives.filter((row) => weightedScore(row.example.response.final, weights) >= threshold).length / positives.length
  const trueNegativeRate =
    negatives.filter((row) => weightedScore(row.example.response.final, weights) < threshold).length / negatives.length
  return (truePositiveRate + trueNegativeRate) / 2
}

function logLoss(rows: CalibrationRow[], weights: ResponseCalibrationWeights): number {
  const epsilon = 1e-6
  const total = rows.reduce((sum, row) => {
    const probability = Math.max(epsilon, Math.min(1 - epsilon, weightedScore(row.example.response.final, weights)))
    return sum - (row.label * Math.log(probability) + (1 - row.label) * Math.log(1 - probability))
  }, 0)
  return total / rows.length
}

function falseAllows(rows: CalibrationRow[], weights: ResponseCalibrationWeights, threshold: number): number {
  return rows.filter((row) => row.label === 0 && weightedScore(row.example.response.final, weights) >= threshold).length
}

function falseRevisionRate(rows: CalibrationRow[], weights: ResponseCalibrationWeights, threshold: number): number {
  const positives = rows.filter((row) => row.label === 1)
  return (
    positives.filter((row) => weightedScore(row.example.response.final, weights) < threshold).length / positives.length
  )
}

export function evaluateCalibrationProfile(input: {
  examples: LearningExampleV1[]
  labels: LearningLabelV1[]
  weights: ResponseCalibrationWeights
  threshold: number
}): CalibrationEvaluation {
  const rows = authoritativeRows(
    input.examples.map((example) => LearningExampleV1Schema.parse(example)),
    input.labels.map((label) => LearningLabelV1Schema.parse(label)),
  )
  const positives = rows.filter((row) => row.label === 1).length
  const negatives = rows.length - positives
  if (!positives || !negatives) {
    return {
      examples: rows.length,
      positives,
      negatives,
      balancedAccuracy: 0,
      logLoss: Number.POSITIVE_INFINITY,
      falseAllows: negatives,
      falseRevisionRate: positives ? 1 : 0,
    }
  }
  return {
    examples: rows.length,
    positives,
    negatives,
    balancedAccuracy: balancedAccuracy(rows, input.weights, input.threshold),
    logLoss: logLoss(rows, input.weights),
    falseAllows: falseAllows(rows, input.weights, input.threshold),
    falseRevisionRate: falseRevisionRate(rows, input.weights, input.threshold),
  }
}

function selectThreshold(rows: CalibrationRow[], weights: ResponseCalibrationWeights): number {
  let selected = 0.64
  let best = -1
  for (let value = 0.3; value <= 0.9; value += 0.01) {
    const threshold = Number(value.toFixed(2))
    const accuracy = balancedAccuracy(rows, weights, threshold)
    if (accuracy > best || (accuracy === best && Math.abs(threshold - 0.64) < Math.abs(selected - 0.64))) {
      selected = threshold
      best = accuracy
    }
  }
  return selected
}

function percentile(values: number[], fraction: number): number {
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0
}

function tokenCalibrations(examples: LearningExampleV1[]): TokenReserveCalibration[] {
  const successful = examples.filter((example) => example.response.final.score >= 0.64)
  const groups = new Map<string, LearningExampleV1[]>()
  for (const example of successful) {
    const tools = example.usage.toolTokens > 0
    const key = `${example.phase}:${tools ? "tools" : "no-tools"}`
    const group = groups.get(key) ?? []
    group.push(example)
    groups.set(key, group)
  }
  const calibrations: TokenReserveCalibration[] = []
  for (const group of groups.values()) {
    if (group.length < 100) continue
    const sample = group[0]!
    const tools = sample.usage.toolTokens > 0
    const output =
      Math.ceil(
        (percentile(
          group.map((item) => item.usage.outputTokens),
          0.99,
        ) *
          1.15) /
          128,
      ) * 128
    const tool = tools
      ? Math.min(
          8_192,
          Math.ceil(
            (percentile(
              group.map((item) => item.usage.toolTokens),
              0.99,
            ) *
              1.15) /
              128,
          ) * 128,
        )
      : 0
    calibrations.push({
      phase: sample.phase,
      tools,
      outputReserveTokens: Math.max(512, output),
      toolReserveTokens: tool,
      samples: group.length,
    })
  }
  return calibrations
}

export function calibrateInferenceProfile(input: {
  examples: LearningExampleV1[]
  labels: LearningLabelV1[]
  scopeType: LearningScopeType
  scopeRef: string
  now?: string
}): CalibrationResult {
  const parsedExamples = input.examples.map((example) => LearningExampleV1Schema.parse(example))
  const parsedLabels = input.labels.map((label) => LearningLabelV1Schema.parse(label))
  const rows = authoritativeRows(parsedExamples, parsedLabels)
  const positives = rows.filter((row) => row.label === 1).length
  const negatives = rows.length - positives
  const reasons: string[] = []
  if (rows.length < 50) reasons.push(`requires 50 authoritative labels; found ${rows.length}`)
  if (positives < 15) reasons.push(`requires 15 positive labels; found ${positives}`)
  if (negatives < 15) reasons.push(`requires 15 negative labels; found ${negatives}`)
  if (reasons.length) return { eligible: false, reasons }

  const { train, holdout } = splitRows(rows)
  const holdoutPositives = holdout.filter((row) => row.label === 1).length
  const holdoutNegatives = holdout.length - holdoutPositives
  if (holdoutPositives < 5 || holdoutNegatives < 5) {
    return {
      eligible: false,
      reasons: [
        `grouped holdout requires five labels per class; found ${holdoutPositives} positive and ${holdoutNegatives} negative`,
      ],
    }
  }

  const candidateWeights = learnWeights(train)
  const candidateThreshold = selectThreshold(train, candidateWeights)
  const baselineWeights = DEFAULT_RESPONSE_CALIBRATION_WEIGHTS
  const baselineThreshold = 0.64
  const baselineBalancedAccuracy = balancedAccuracy(holdout, baselineWeights, baselineThreshold)
  const candidateBalancedAccuracy = balancedAccuracy(holdout, candidateWeights, candidateThreshold)
  const baselineLogLoss = logLoss(holdout, baselineWeights)
  const candidateLogLoss = logLoss(holdout, candidateWeights)
  const baselineFalseAllows = falseAllows(holdout, baselineWeights, baselineThreshold)
  const candidateFalseAllows = falseAllows(holdout, candidateWeights, candidateThreshold)
  const baselineFalseRevisionRate = falseRevisionRate(holdout, baselineWeights, baselineThreshold)
  const candidateFalseRevisionRate = falseRevisionRate(holdout, candidateWeights, candidateThreshold)
  const activates =
    candidateBalancedAccuracy >= baselineBalancedAccuracy + 0.02 &&
    candidateLogLoss < baselineLogLoss &&
    candidateFalseAllows <= baselineFalseAllows &&
    candidateFalseRevisionRate <= baselineFalseRevisionRate + 0.01

  if (!activates) reasons.push("candidate did not satisfy every automatic-activation evaluation gate")
  const now = input.now ?? new Date().toISOString()
  const expiresAt =
    parsedExamples.map((example) => example.expiresAt).sort()[0] ??
    new Date(new Date(now).getTime() + DEFAULT_LEARNING_RETENTION_DAYS * 86_400_000).toISOString()
  const trainingDigest = sha256(
    rows
      .map((row) => `${row.example.id}:${row.label}`)
      .sort()
      .join("\n"),
  )
  const profileMaterial = `${input.scopeType}:${input.scopeRef}:${trainingDigest}:${candidateThreshold}`
  const profile = InferenceCalibrationProfileV1Schema.parse({
    schemaVersion: LEARNING_PROFILE_VERSION,
    id: `mlp_${sha256(profileMaterial).slice(0, 24)}`,
    scopeType: input.scopeType,
    scopeRef: input.scopeRef,
    createdAt: now,
    expiresAt,
    trainingDigest,
    trainingExamples: rows.length,
    response: {
      weights: candidateWeights,
      threshold: candidateThreshold,
      evidencePenalty: 0.2,
    },
    tokenReserves: tokenCalibrations(parsedExamples),
    evaluation: {
      baselineBalancedAccuracy,
      candidateBalancedAccuracy,
      baselineLogLoss,
      candidateLogLoss,
      baselineFalseAllows,
      candidateFalseAllows,
      baselineFalseRevisionRate,
      candidateFalseRevisionRate,
      holdoutExamples: holdout.length,
    },
  })
  return { eligible: true, activate: activates, reasons, profile }
}

export function profileDigest(profile: InferenceCalibrationProfileV1): string {
  return sha256(JSON.stringify(InferenceCalibrationProfileV1Schema.parse(profile)))
}
