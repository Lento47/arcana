import { describe, expect, test } from "bun:test"
import { selectContextStrategy } from "./context-strategy"

describe("context strategy selector", () => {
  test("uses cache prefix when pressure is low and prefix is stable", () => {
    const decision = selectContextStrategy({
      pressure: "low",
      stable_prefix_available: true,
      retrieval_available: false,
      retrieved_chunks: 0,
      noisy_retrieval: false,
      long_running_session: false,
      raw_transcript_required: false,
      sensitive_context: false,
    })

    expect(decision.strategy).toBe("cache_prefix")
    expect(decision.requires_provenance).toBe(false)
  })

  test("reranks many retrieved chunks instead of replaying raw context", () => {
    const decision = selectContextStrategy({
      pressure: "medium",
      stable_prefix_available: false,
      retrieval_available: true,
      retrieved_chunks: 12,
      noisy_retrieval: false,
      long_running_session: false,
      raw_transcript_required: false,
      sensitive_context: false,
    })

    expect(decision.strategy).toBe("rerank_chunks")
    expect(decision.requires_provenance).toBe(true)
  })

  test("avoids raw replay for sensitive context", () => {
    const decision = selectContextStrategy({
      pressure: "medium",
      stable_prefix_available: false,
      retrieval_available: false,
      retrieved_chunks: 0,
      noisy_retrieval: false,
      long_running_session: false,
      raw_transcript_required: true,
      sensitive_context: true,
    })

    expect(decision.strategy).toBe("summary_carry_forward")
    expect(decision.security_note).toBe("avoid_replay")
  })

  test("compacts when pressure is critical", () => {
    const decision = selectContextStrategy({
      pressure: "critical",
      stable_prefix_available: false,
      retrieval_available: false,
      retrieved_chunks: 0,
      noisy_retrieval: true,
      long_running_session: false,
      raw_transcript_required: false,
      sensitive_context: false,
    })

    expect(decision.strategy).toBe("compact_context")
  })
})
