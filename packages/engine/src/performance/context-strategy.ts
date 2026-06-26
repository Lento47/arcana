export type ArcanaContextStrategy =
  | "cache_prefix"
  | "targeted_retrieval"
  | "rerank_chunks"
  | "compact_context"
  | "summary_carry_forward"
  | "large_window_replay"

export type ArcanaContextPressure = "low" | "medium" | "high" | "critical"

export type ArcanaContextStrategyInput = {
  readonly pressure: ArcanaContextPressure
  readonly stable_prefix_available: boolean
  readonly retrieval_available: boolean
  readonly retrieved_chunks: number
  readonly noisy_retrieval: boolean
  readonly long_running_session: boolean
  readonly raw_transcript_required: boolean
  readonly sensitive_context: boolean
}

export type ArcanaContextStrategyDecision = {
  readonly strategy: ArcanaContextStrategy
  readonly security_note: "normal" | "minimize_sensitive_context" | "avoid_replay"
  readonly requires_provenance: boolean
  readonly reason: string
}

export function selectContextStrategy(input: ArcanaContextStrategyInput): ArcanaContextStrategyDecision {
  if (input.sensitive_context && input.raw_transcript_required) {
    return {
      strategy: "summary_carry_forward",
      security_note: "avoid_replay",
      requires_provenance: true,
      reason: "sensitive context should not default to raw transcript replay",
    }
  }

  if (input.raw_transcript_required && input.pressure !== "critical") {
    return {
      strategy: "large_window_replay",
      security_note: input.sensitive_context ? "minimize_sensitive_context" : "normal",
      requires_provenance: true,
      reason: "raw transcript fidelity requested and budget is not critical",
    }
  }

  if (input.stable_prefix_available && input.pressure === "low") {
    return {
      strategy: "cache_prefix",
      security_note: "normal",
      requires_provenance: false,
      reason: "stable prefix can be reused cheaply",
    }
  }

  if (input.retrieval_available && input.retrieved_chunks > 0 && !input.noisy_retrieval) {
    return {
      strategy: input.retrieved_chunks > 8 ? "rerank_chunks" : "targeted_retrieval",
      security_note: input.sensitive_context ? "minimize_sensitive_context" : "normal",
      requires_provenance: true,
      reason: "retrieved evidence can replace broad replay",
    }
  }

  if (input.long_running_session || input.pressure === "high" || input.pressure === "critical") {
    return {
      strategy: input.long_running_session ? "summary_carry_forward" : "compact_context",
      security_note: input.sensitive_context ? "minimize_sensitive_context" : "normal",
      requires_provenance: true,
      reason: "context should be compacted before spending more window",
    }
  }

  return {
    strategy: "targeted_retrieval",
    security_note: input.sensitive_context ? "minimize_sensitive_context" : "normal",
    requires_provenance: true,
    reason: "default to focused evidence over raw replay",
  }
}
