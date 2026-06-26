import { describe, expect, test } from "bun:test"
import { providerProfile, providerRequiresNativeNormalizer, providersByRegion, providersForModelFamily, tokenProviderProfiles } from "./token-model-registry"

describe("Arcana token model registry", () => {
  test("includes global, Chinese, local, and self-hosted routes", () => {
    const regions = new Set(tokenProviderProfiles().map((profile) => profile.region))

    expect(regions.has("us")).toBe(true)
    expect(regions.has("eu")).toBe(true)
    expect(regions.has("china")).toBe(true)
    expect(regions.has("global")).toBe(true)
    expect(regions.has("local")).toBe(true)
    expect(regions.has("self_hosted")).toBe(true)
  })

  test("finds Chinese providers by region", () => {
    const china = providersByRegion("china").map((profile) => profile.provider)

    expect(china).toContain("deepseek")
    expect(china).toContain("dashscope")
    expect(china).toContain("moonshot")
    expect(china).toContain("siliconflow")
  })

  test("finds model family providers", () => {
    const qwenProviders = providersForModelFamily("qwen").map((profile) => profile.provider)
    const claudeProviders = providersForModelFamily("claude").map((profile) => profile.provider)

    expect(qwenProviders).toContain("dashscope")
    expect(qwenProviders).toContain("ollama")
    expect(claudeProviders).toEqual(["anthropic"])
  })

  test("identifies providers that need native normalizers", () => {
    expect(providerRequiresNativeNormalizer("deepseek")).toBe(true)
    expect(providerRequiresNativeNormalizer("dashscope")).toBe(true)
    expect(providerRequiresNativeNormalizer("minimax")).toBe(true)
    expect(providerRequiresNativeNormalizer("moonshot")).toBe(false)
  })

  test("preserves gateway distinction", () => {
    expect(providerProfile("openrouter")?.gateway).toBe(true)
    expect(providerProfile("volcengine-ark")?.gateway).toBe(true)
    expect(providerProfile("deepseek")?.gateway).toBe(false)
  })
})
