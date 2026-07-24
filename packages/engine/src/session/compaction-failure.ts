/**
 * Recoverable compaction failure policy (P1).
 * Inspired by Grok `xai-grok-compaction` FailureKind + degenerate summary guards.
 * Pure helpers — no I/O.
 */

/** Whether a compaction LLM/call failure is worth retrying. */
export type FailureKind = "deterministic" | "transient"

/** Default max LLM attempts for a compaction pass (first try + one retry). */
export const DEFAULT_MAX_ATTEMPTS = 2

/** Delay between transient retries (ms). */
export const DEFAULT_RETRY_DELAY_MS = 3_000

/**
 * Minimum non-whitespace summary length. Below this the summary is treated as
 * degenerate and not applied. Grok full-replace uses ~500; Arcana allows short
 * structured bullets and short model stubs used in tests (e.g. "summary").
 */
export const MIN_SUMMARY_CHARS = 7

/**
 * Discard compaction if the result is not smaller than this ratio of the head.
 * 0.8 = require at least 20% reduction (Grok max_reduction_ratio).
 */
export const DEFAULT_MAX_REDUCTION_RATIO = 0.8

export function isContextLengthError(message: string): boolean {
  const m = message.toLowerCase()
  return (
    m.includes("too long for this model") ||
    m.includes("prompt is too long") ||
    m.includes("maximum prompt length") ||
    m.includes("maximum context length") ||
    m.includes("context_length_exceeded") ||
    m.includes("context overflow") ||
    m.includes("session too large to compact") ||
    m.includes("conversation history too large")
  )
}

/**
 * Classify an error message / optional HTTP-like status for the compact retry loop.
 * Deterministic failures should not be retried; transient may be.
 */
export function classifyCompactionFailure(input: {
  message?: string
  status?: number
  emptyResponse?: boolean
  timeout?: boolean
}): FailureKind {
  if (input.timeout || input.emptyResponse) return "transient"
  const message = input.message ?? ""
  if (isContextLengthError(message)) return "deterministic"

  const status = input.status
  if (status !== undefined) {
    if (status === 408 || status === 429) return "transient"
    if (status >= 500 && status < 600) return "transient"
    if (status >= 400 && status < 500) return "deterministic"
  }

  const m = message.toLowerCase()
  if (m.includes("rate limit") || m.includes("timeout") || m.includes("temporar") || m.includes("econnreset")) {
    return "transient"
  }
  if (m.includes("invalid_request") || m.includes("schema")) return "deterministic"

  // Unknown errors: allow one retry (transient bias for flaky providers).
  return "transient"
}

/**
 * True when summary text is missing, empty, tiny, or only structural placeholders.
 * Empty LLM output must soft-fail (N3) — never treat as a successful compact.
 */
export function isDegenerateSummary(text: string | undefined | null): boolean {
  if (text == null) return true
  const trimmed = text.trim()
  if (!trimmed) return true
  if (trimmed.length < MIN_SUMMARY_CHARS) return true

  // Strip common template placeholders and section headers; require residual content.
  const residual = trimmed
    .replace(/\(none\)/gi, "")
    .replace(/^#+\s.*$/gm, "")
    .replace(/^[-*]\s*$/gm, "")
    .replace(/\s+/g, " ")
    .trim()
  if (residual.length < 3) return true
  // Need at least one token of real alphanumerics
  if (!/[a-zA-Z0-9]{3,}/.test(residual)) return true
  return false
}

/** Only enforce reduction ratio when the head was large enough to matter. */
export const MIN_TOKENS_FOR_REDUCTION_CHECK = 2_000

/**
 * True when the compacted summary is acceptably smaller than the head.
 * If either estimate is missing/zero, or head is small, returns true (do not reject).
 */
export function isAcceptableReduction(input: {
  tokensBefore: number
  tokensAfter: number
  maxReductionRatio?: number
}): boolean {
  const { tokensBefore, tokensAfter } = input
  if (!(tokensBefore > 0) || !(tokensAfter >= 0)) return true
  // Short heads: reduction ratio is noise (tests / tiny sessions).
  if (tokensBefore < MIN_TOKENS_FOR_REDUCTION_CHECK) return true
  const ratio = input.maxReductionRatio ?? DEFAULT_MAX_REDUCTION_RATIO
  // Accept when after < before * ratio (strictly reduced enough)
  return tokensAfter < tokensBefore * ratio
}

/** Rough token estimate: ~4 chars per token (same as util/token elsewhere). */
export function estimateTokensFromText(text: string): number {
  if (!text) return 0
  return Math.ceil(text.length / 4)
}

/**
 * Outcome after a compaction attempt for the session loop.
 * - apply: summary is good; publish Compacted / continue prompt as usual
 * - soft_fail: auto mode should return "continue" without treating history as compacted
 * - hard_fail: manual mode / unrecoverable — return "stop"
 */
export type CompactionAttemptOutcome = "apply" | "soft_fail" | "hard_fail"

export function resolveCompactionOutcome(input: {
  auto: boolean
  /** Processor returned "compact" (summary call itself overflowed). */
  overflowDuringSummary?: boolean
  /** Processor message has an error. */
  hasError?: boolean
  summary?: string | null
  tokensBefore?: number
  tokensAfter?: number
}): CompactionAttemptOutcome {
  if (input.overflowDuringSummary || input.hasError) {
    return input.auto ? "soft_fail" : "hard_fail"
  }
  if (isDegenerateSummary(input.summary)) {
    return input.auto ? "soft_fail" : "hard_fail"
  }
  if (
    input.tokensBefore !== undefined &&
    input.tokensAfter !== undefined &&
    !isAcceptableReduction({
      tokensBefore: input.tokensBefore,
      tokensAfter: input.tokensAfter,
    })
  ) {
    return input.auto ? "soft_fail" : "hard_fail"
  }
  return "apply"
}
