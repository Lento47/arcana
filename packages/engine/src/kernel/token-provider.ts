// SPDX-License-Identifier: MIT OR LicenseRef-arcana-Commercial
// Copyright (c) 2026 arcana contributors

import type { ArcanaTokenClass, ArcanaTokenLedgerEntry } from "./token-ledger"
import { createTokenLedgerEntry } from "./token-ledger"

export type ArcanaNormalizedProviderUsage = {
  provider: string
  model: string
  input_uncached?: number
  input_cache_read?: number
  input_cache_write?: number
  output_visible?: number
  output_reasoning?: number
  tool_schema?: number
  tool_result?: number
  retrieval_context?: number
  summary?: number
  embedding?: number
  provider_state?: number
  latency_ms?: number
  opaque_provider_state_ref?: string
}

export type ArcanaProviderUsageAdapter<ProviderUsage = unknown> = {
  id: string
  normalize(input: ProviderUsage): ArcanaNormalizedProviderUsage
}

const TOKEN_FIELDS: readonly ArcanaTokenClass[] = [
  "input_uncached",
  "input_cache_read",
  "input_cache_write",
  "output_visible",
  "output_reasoning",
  "tool_schema",
  "tool_result",
  "retrieval_context",
  "summary",
  "embedding",
  "provider_state",
]

export function tokenEntriesFromProviderUsage(input: {
  action_id: string
  run_id?: string
  pipeline_id?: string
  candidate_id?: string
  usage: ArcanaNormalizedProviderUsage
  created_at?: string
}): ArcanaTokenLedgerEntry[] {
  return TOKEN_FIELDS.flatMap((tokenClass) => {
    const tokens = input.usage[tokenClass]
    if (!tokens || tokens <= 0) return []
    return [
      createTokenLedgerEntry({
        action_id: input.action_id,
        run_id: input.run_id,
        pipeline_id: input.pipeline_id,
        candidate_id: input.candidate_id,
        provider: input.usage.provider,
        model: input.usage.model,
        phase: "actual",
        token_class: tokenClass,
        actual_tokens: tokens,
        latency_ms: input.usage.latency_ms,
        opaque_provider_state_ref: tokenClass === "provider_state" ? input.usage.opaque_provider_state_ref : undefined,
        created_at: input.created_at,
      }),
    ]
  })
}

export function normalizeOpenAIStyleUsage(input: {
  provider?: string
  model: string
  usage?: {
    input_tokens?: number
    output_tokens?: number
    prompt_tokens?: number
    completion_tokens?: number
    prompt_tokens_details?: { cached_tokens?: number }
    output_tokens_details?: { reasoning_tokens?: number }
  }
  latency_ms?: number
}): ArcanaNormalizedProviderUsage {
  const usage = input.usage ?? {}
  const inputTotal = usage.input_tokens ?? usage.prompt_tokens ?? 0
  const cached = usage.prompt_tokens_details?.cached_tokens ?? 0
  const outputTotal = usage.output_tokens ?? usage.completion_tokens ?? 0
  const reasoning = usage.output_tokens_details?.reasoning_tokens ?? 0

  return {
    provider: input.provider ?? "openai-compatible",
    model: input.model,
    input_uncached: Math.max(0, inputTotal - cached),
    input_cache_read: cached,
    output_visible: Math.max(0, outputTotal - reasoning),
    output_reasoning: reasoning,
    latency_ms: input.latency_ms,
  }
}

export function normalizeAnthropicStyleUsage(input: {
  provider?: string
  model: string
  usage?: {
    input_tokens?: number
    output_tokens?: number
    cache_creation_input_tokens?: number
    cache_read_input_tokens?: number
  }
  latency_ms?: number
}): ArcanaNormalizedProviderUsage {
  const usage = input.usage ?? {}
  const cacheWrite = usage.cache_creation_input_tokens ?? 0
  const cacheRead = usage.cache_read_input_tokens ?? 0
  const inputTotal = usage.input_tokens ?? 0

  return {
    provider: input.provider ?? "anthropic-compatible",
    model: input.model,
    input_uncached: Math.max(0, inputTotal - cacheWrite - cacheRead),
    input_cache_write: cacheWrite,
    input_cache_read: cacheRead,
    output_visible: usage.output_tokens ?? 0,
    latency_ms: input.latency_ms,
  }
}

export function normalizeGeminiStyleUsage(input: {
  provider?: string
  model: string
  usageMetadata?: {
    promptTokenCount?: number
    candidatesTokenCount?: number
    cachedContentTokenCount?: number
    thoughtsTokenCount?: number
    toolUsePromptTokenCount?: number
  }
  thought_signature_ref?: string
  latency_ms?: number
}): ArcanaNormalizedProviderUsage {
  const usage = input.usageMetadata ?? {}
  const prompt = usage.promptTokenCount ?? 0
  const cached = usage.cachedContentTokenCount ?? 0
  const thoughts = usage.thoughtsTokenCount ?? 0

  return {
    provider: input.provider ?? "gemini-compatible",
    model: input.model,
    input_uncached: Math.max(0, prompt - cached),
    input_cache_read: cached,
    output_visible: Math.max(0, (usage.candidatesTokenCount ?? 0) - thoughts),
    output_reasoning: thoughts,
    tool_schema: usage.toolUsePromptTokenCount ?? 0,
    provider_state: input.thought_signature_ref ? 1 : 0,
    opaque_provider_state_ref: input.thought_signature_ref,
    latency_ms: input.latency_ms,
  }
}
