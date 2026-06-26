// SPDX-License-Identifier: MIT OR LicenseRef-arcana-Commercial
// Copyright (c) 2026 arcana contributors

export const ARCANA_TOKEN_PROVIDER_REGIONS = ["us", "eu", "china", "global", "local", "self_hosted"] as const
export type ArcanaTokenProviderRegion = (typeof ARCANA_TOKEN_PROVIDER_REGIONS)[number]

export const ARCANA_TOKEN_USAGE_STYLES = [
  "openai-compatible",
  "anthropic-compatible",
  "gemini-compatible",
  "dashscope-native",
  "deepseek-cache",
  "minimax-native",
  "local-runtime",
  "unknown",
] as const
export type ArcanaTokenUsageStyle = (typeof ARCANA_TOKEN_USAGE_STYLES)[number]

export type ArcanaTokenProviderProfile = {
  readonly provider: string
  readonly region: ArcanaTokenProviderRegion
  readonly usage_style: ArcanaTokenUsageStyle
  readonly model_families: readonly string[]
  readonly gateway: boolean
  readonly local_capable: boolean
}

export function tokenProviderProfiles(): ArcanaTokenProviderProfile[] {
  return [
    { provider: "openai", region: "us", usage_style: "openai-compatible", model_families: ["gpt", "o", "codex"], gateway: false, local_capable: false },
    { provider: "anthropic", region: "us", usage_style: "anthropic-compatible", model_families: ["claude"], gateway: false, local_capable: false },
    { provider: "google", region: "us", usage_style: "gemini-compatible", model_families: ["gemini"], gateway: false, local_capable: false },
    { provider: "mistral", region: "eu", usage_style: "openai-compatible", model_families: ["mistral", "codestral", "mixtral"], gateway: false, local_capable: true },
    { provider: "cerebras", region: "us", usage_style: "openai-compatible", model_families: ["llama", "qwen", "gpt-oss"], gateway: false, local_capable: false },
    { provider: "groq", region: "us", usage_style: "openai-compatible", model_families: ["llama", "qwen", "gpt-oss"], gateway: false, local_capable: false },
    { provider: "openrouter", region: "global", usage_style: "openai-compatible", model_families: ["multi-provider"], gateway: true, local_capable: false },
    { provider: "cloudflare-ai-gateway", region: "global", usage_style: "openai-compatible", model_families: ["multi-provider"], gateway: true, local_capable: false },
    { provider: "deepseek", region: "china", usage_style: "deepseek-cache", model_families: ["deepseek-chat", "deepseek-reasoner"], gateway: false, local_capable: true },
    { provider: "dashscope", region: "china", usage_style: "dashscope-native", model_families: ["qwen", "qwen-coder", "qwen-long-context"], gateway: false, local_capable: true },
    { provider: "qwen", region: "china", usage_style: "dashscope-native", model_families: ["qwen", "qwen-coder", "qwen-long-context"], gateway: false, local_capable: true },
    { provider: "zhipu", region: "china", usage_style: "openai-compatible", model_families: ["glm"], gateway: false, local_capable: false },
    { provider: "moonshot", region: "china", usage_style: "openai-compatible", model_families: ["kimi"], gateway: false, local_capable: true },
    { provider: "baidu-qianfan", region: "china", usage_style: "openai-compatible", model_families: ["ernie"], gateway: false, local_capable: false },
    { provider: "minimax", region: "china", usage_style: "minimax-native", model_families: ["minimax"], gateway: false, local_capable: false },
    { provider: "tencent-hunyuan", region: "china", usage_style: "openai-compatible", model_families: ["hunyuan"], gateway: false, local_capable: false },
    { provider: "volcengine-ark", region: "china", usage_style: "openai-compatible", model_families: ["doubao", "deepseek", "qwen"], gateway: true, local_capable: false },
    { provider: "siliconflow", region: "china", usage_style: "openai-compatible", model_families: ["deepseek", "qwen", "glm", "yi", "baichuan"], gateway: true, local_capable: false },
    { provider: "ollama", region: "local", usage_style: "local-runtime", model_families: ["llama", "qwen", "deepseek", "mistral", "gemma", "phi"], gateway: false, local_capable: true },
    { provider: "vllm", region: "self_hosted", usage_style: "openai-compatible", model_families: ["llama", "qwen", "deepseek", "mistral", "gemma", "phi"], gateway: false, local_capable: true },
  ]
}

export function providersByRegion(region: ArcanaTokenProviderRegion): ArcanaTokenProviderProfile[] {
  return tokenProviderProfiles().filter((profile) => profile.region === region)
}

export function providerProfile(provider: string): ArcanaTokenProviderProfile | undefined {
  const normalized = provider.toLowerCase()
  return tokenProviderProfiles().find((profile) => profile.provider === normalized)
}

export function providersForModelFamily(modelFamily: string): ArcanaTokenProviderProfile[] {
  const normalized = modelFamily.toLowerCase()
  return tokenProviderProfiles().filter((profile) => profile.model_families.some((family) => family.toLowerCase() === normalized))
}

export function providerRequiresNativeNormalizer(provider: string): boolean {
  const profile = providerProfile(provider)
  if (!profile) return false
  return profile.usage_style !== "openai-compatible" && profile.usage_style !== "local-runtime"
}
