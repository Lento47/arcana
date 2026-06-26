// SPDX-License-Identifier: MIT OR LicenseRef-arcana-Commercial
// Copyright (c) 2026 arcana contributors

import type { ArcanaNormalizedProviderUsage } from "./token-provider"
import { normalizeOpenAIStyleUsage } from "./token-provider"

export const CHINESE_AI_PROVIDERS = [
  "deepseek",
  "dashscope",
  "qwen",
  "zhipu",
  "bigmodel",
  "moonshot",
  "kimi",
  "baidu-qianfan",
  "ernie",
  "minimax",
  "tencent-hunyuan",
  "volcengine-ark",
  "doubao",
  "siliconflow",
  "stepfun",
  "01-ai",
  "baichuan",
] as const

export type ArcanaChineseAIProvider = (typeof CHINESE_AI_PROVIDERS)[number]

export type ArcanaChineseProviderFamily = "openai-compatible" | "dashscope-native" | "deepseek-cache" | "minimax-native" | "generic-cn"

export type ArcanaChineseModelFamily =
  | "deepseek-chat"
  | "deepseek-reasoner"
  | "qwen"
  | "qwen-coder"
  | "qwen-long-context"
  | "glm"
  | "kimi"
  | "ernie"
  | "minimax"
  | "hunyuan"
  | "doubao"
  | "yi"
  | "baichuan"
  | "unknown"

export type ArcanaChineseProviderProfile = {
  readonly provider: ArcanaChineseAIProvider
  readonly family: ArcanaChineseProviderFamily
  readonly model_families: readonly ArcanaChineseModelFamily[]
  readonly sovereignty_note: string
}

export type OpenAICompatibleChineseUsage = {
  provider?: string
  model: string
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
    prompt_tokens_details?: { cached_tokens?: number }
    completion_tokens_details?: { reasoning_tokens?: number }
    output_tokens_details?: { reasoning_tokens?: number }
  }
  latency_ms?: number
}

export type DeepSeekUsage = OpenAICompatibleChineseUsage & {
  usage?: OpenAICompatibleChineseUsage["usage"] & {
    prompt_cache_hit_tokens?: number
    prompt_cache_miss_tokens?: number
  }
}

export type DashScopeUsage = {
  provider?: string
  model: string
  usage?: {
    input_tokens?: number
    output_tokens?: number
    total_tokens?: number
    cached_tokens?: number
    prompt_tokens_details?: { cached_tokens?: number }
    output_tokens_details?: { reasoning_tokens?: number }
  }
  latency_ms?: number
}

export type MiniMaxUsage = {
  provider?: string
  model: string
  usage?: {
    total_tokens?: number
    input_total_tokens?: number
    output_total_tokens?: number
    input_tokens?: number
    output_tokens?: number
    prompt_tokens?: number
    completion_tokens?: number
  }
  latency_ms?: number
}

export function chineseProviderProfiles(): ArcanaChineseProviderProfile[] {
  return [
    { provider: "deepseek", family: "deepseek-cache", model_families: ["deepseek-chat", "deepseek-reasoner"], sovereignty_note: "DeepSeek routes should expose cache-hit and reasoning accounting when available." },
    { provider: "dashscope", family: "dashscope-native", model_families: ["qwen", "qwen-coder", "qwen-long-context"], sovereignty_note: "DashScope/Qwen routes may use native input/output token fields or OpenAI-compatible fields." },
    { provider: "qwen", family: "dashscope-native", model_families: ["qwen", "qwen-coder", "qwen-long-context"], sovereignty_note: "Qwen model families should remain usable through native and OpenAI-compatible gateways." },
    { provider: "zhipu", family: "openai-compatible", model_families: ["glm"], sovereignty_note: "Zhipu/GLM routes are normalized through OpenAI-compatible usage when available." },
    { provider: "bigmodel", family: "openai-compatible", model_families: ["glm"], sovereignty_note: "BigModel routes are normalized without making GLM provider semantics kernel truth." },
    { provider: "moonshot", family: "openai-compatible", model_families: ["kimi"], sovereignty_note: "Moonshot/Kimi routes are normalized through OpenAI-compatible usage while preserving provider identity." },
    { provider: "kimi", family: "openai-compatible", model_families: ["kimi"], sovereignty_note: "Kimi long-context routes should be budgeted explicitly to avoid context-window waste." },
    { provider: "baidu-qianfan", family: "openai-compatible", model_families: ["ernie"], sovereignty_note: "Qianfan/ERNIE usage is normalized at adapter boundary." },
    { provider: "ernie", family: "openai-compatible", model_families: ["ernie"], sovereignty_note: "ERNIE model routes should remain provider-visible in RunProof." },
    { provider: "minimax", family: "minimax-native", model_families: ["minimax"], sovereignty_note: "MiniMax may expose input/output totals under native names; normalize before policy." },
    { provider: "tencent-hunyuan", family: "openai-compatible", model_families: ["hunyuan"], sovereignty_note: "Hunyuan usage is normalized through OpenAI-compatible fields when available." },
    { provider: "volcengine-ark", family: "openai-compatible", model_families: ["doubao", "deepseek-chat", "qwen"], sovereignty_note: "Volcengine Ark is treated as a gateway/provider route, not as the model family itself." },
    { provider: "doubao", family: "openai-compatible", model_families: ["doubao"], sovereignty_note: "Doubao routes should keep provider and model family separate for sovereignty." },
    { provider: "siliconflow", family: "openai-compatible", model_families: ["deepseek-chat", "qwen", "glm", "yi", "baichuan"], sovereignty_note: "SiliconFlow is a gateway; token accounting must preserve underlying model identity when known." },
    { provider: "stepfun", family: "openai-compatible", model_families: ["unknown"], sovereignty_note: "StepFun routes are normalized through OpenAI-compatible accounting until native fields are mapped." },
    { provider: "01-ai", family: "openai-compatible", model_families: ["yi"], sovereignty_note: "01.AI/Yi routes are normalized without hardcoding model policy." },
    { provider: "baichuan", family: "openai-compatible", model_families: ["baichuan"], sovereignty_note: "Baichuan routes remain first-class provider-visible routes." },
  ]
}

export function normalizeDeepSeekUsage(input: DeepSeekUsage): ArcanaNormalizedProviderUsage {
  const usage = input.usage ?? {}
  const cacheHit = usage.prompt_cache_hit_tokens ?? usage.prompt_tokens_details?.cached_tokens ?? 0
  const cacheMiss = usage.prompt_cache_miss_tokens
  const promptTotal = usage.prompt_tokens ?? ((cacheMiss ?? 0) + cacheHit)
  const reasoning = usage.completion_tokens_details?.reasoning_tokens ?? usage.output_tokens_details?.reasoning_tokens ?? 0
  return {
    provider: input.provider ?? "deepseek",
    model: input.model,
    input_uncached: Math.max(0, cacheMiss ?? promptTotal - cacheHit),
    input_cache_read: cacheHit,
    output_visible: Math.max(0, (usage.completion_tokens ?? 0) - reasoning),
    output_reasoning: reasoning,
    latency_ms: input.latency_ms,
  }
}

export function normalizeDashScopeUsage(input: DashScopeUsage): ArcanaNormalizedProviderUsage {
  const usage = input.usage ?? {}
  const cached = usage.cached_tokens ?? usage.prompt_tokens_details?.cached_tokens ?? 0
  const reasoning = usage.output_tokens_details?.reasoning_tokens ?? 0
  return {
    provider: input.provider ?? "dashscope",
    model: input.model,
    input_uncached: Math.max(0, (usage.input_tokens ?? 0) - cached),
    input_cache_read: cached,
    output_visible: Math.max(0, (usage.output_tokens ?? 0) - reasoning),
    output_reasoning: reasoning,
    latency_ms: input.latency_ms,
  }
}

export function normalizeMiniMaxUsage(input: MiniMaxUsage): ArcanaNormalizedProviderUsage {
  const usage = input.usage ?? {}
  const inputTokens = usage.input_total_tokens ?? usage.input_tokens ?? usage.prompt_tokens ?? 0
  const outputTokens = usage.output_total_tokens ?? usage.output_tokens ?? usage.completion_tokens ?? Math.max(0, (usage.total_tokens ?? 0) - inputTokens)
  return {
    provider: input.provider ?? "minimax",
    model: input.model,
    input_uncached: inputTokens,
    output_visible: outputTokens,
    latency_ms: input.latency_ms,
  }
}

export function normalizeChineseOpenAICompatibleUsage(provider: ArcanaChineseAIProvider, input: OpenAICompatibleChineseUsage): ArcanaNormalizedProviderUsage {
  return normalizeOpenAIStyleUsage({ provider, model: input.model, usage: input.usage, latency_ms: input.latency_ms })
}

export function inferChineseModelFamily(model: string): ArcanaChineseModelFamily {
  const value = model.toLowerCase()
  if (value.includes("deepseek-reasoner") || value.includes("deepseek-r1")) return "deepseek-reasoner"
  if (value.includes("deepseek")) return "deepseek-chat"
  if (value.includes("qwen") && (value.includes("coder") || value.includes("code"))) return "qwen-coder"
  if (value.includes("qwen") && (value.includes("long") || value.includes("128k") || value.includes("256k") || value.includes("1m"))) return "qwen-long-context"
  if (value.includes("qwen")) return "qwen"
  if (value.includes("glm") || value.includes("chatglm")) return "glm"
  if (value.includes("kimi") || value.includes("moonshot")) return "kimi"
  if (value.includes("ernie") || value.includes("wenxin")) return "ernie"
  if (value.includes("minimax") || value.includes("abab")) return "minimax"
  if (value.includes("hunyuan")) return "hunyuan"
  if (value.includes("doubao")) return "doubao"
  if (value.includes("yi-")) return "yi"
  if (value.includes("baichuan")) return "baichuan"
  return "unknown"
}
