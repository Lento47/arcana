import { describe, expect, test } from "bun:test"
import { normalizeAnthropicStyleUsage, normalizeGeminiStyleUsage, normalizeOpenAIStyleUsage, tokenEntriesFromProviderUsage } from "./token-provider"

describe("Arcana token provider normalization", () => {
  test("normalizes OpenAI-compatible cached and reasoning tokens", () => {
    const usage = normalizeOpenAIStyleUsage({
      model: "model-a",
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        prompt_tokens_details: { cached_tokens: 40 },
        output_tokens_details: { reasoning_tokens: 10 },
      },
    })

    expect(usage.input_uncached).toBe(60)
    expect(usage.input_cache_read).toBe(40)
    expect(usage.output_visible).toBe(40)
    expect(usage.output_reasoning).toBe(10)
  })

  test("normalizes Anthropic-compatible cache writes and reads", () => {
    const usage = normalizeAnthropicStyleUsage({
      model: "model-b",
      usage: {
        input_tokens: 100,
        cache_creation_input_tokens: 20,
        cache_read_input_tokens: 30,
        output_tokens: 40,
      },
    })

    expect(usage.input_uncached).toBe(50)
    expect(usage.input_cache_write).toBe(20)
    expect(usage.input_cache_read).toBe(30)
    expect(usage.output_visible).toBe(40)
  })

  test("normalizes Gemini-compatible thought signatures as opaque provider state", () => {
    const usage = normalizeGeminiStyleUsage({
      model: "model-c",
      usageMetadata: {
        promptTokenCount: 100,
        cachedContentTokenCount: 25,
        candidatesTokenCount: 50,
        thoughtsTokenCount: 15,
        toolUsePromptTokenCount: 5,
      },
      thought_signature_ref: "opaque://thought-signature/1",
    })

    expect(usage.input_uncached).toBe(75)
    expect(usage.input_cache_read).toBe(25)
    expect(usage.output_visible).toBe(35)
    expect(usage.output_reasoning).toBe(15)
    expect(usage.tool_schema).toBe(5)
    expect(usage.provider_state).toBe(1)
    expect(usage.opaque_provider_state_ref).toBe("opaque://thought-signature/1")
  })

  test("creates actual ledger entries from normalized usage", () => {
    const entries = tokenEntriesFromProviderUsage({
      action_id: "act_1",
      usage: {
        provider: "test",
        model: "test-model",
        input_uncached: 10,
        output_visible: 5,
      },
      created_at: "2026-01-01T00:00:00.000Z",
    })

    expect(entries).toHaveLength(2)
    expect(entries.map((entry) => entry.phase)).toEqual(["actual", "actual"])
    expect(entries.map((entry) => entry.token_class)).toEqual(["input_uncached", "output_visible"])
  })
})
