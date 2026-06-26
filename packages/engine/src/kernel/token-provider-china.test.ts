import { describe, expect, test } from "bun:test"
import {
  chineseProviderProfiles,
  inferChineseModelFamily,
  normalizeChineseOpenAICompatibleUsage,
  normalizeDashScopeUsage,
  normalizeDeepSeekUsage,
  normalizeMiniMaxUsage,
} from "./token-provider-china"

describe("Arcana Chinese provider normalization", () => {
  test("registry includes major Chinese provider and gateway families", () => {
    const providers = chineseProviderProfiles().map((profile) => profile.provider)

    expect(providers).toContain("deepseek")
    expect(providers).toContain("dashscope")
    expect(providers).toContain("qwen")
    expect(providers).toContain("zhipu")
    expect(providers).toContain("moonshot")
    expect(providers).toContain("kimi")
    expect(providers).toContain("baidu-qianfan")
    expect(providers).toContain("minimax")
    expect(providers).toContain("tencent-hunyuan")
    expect(providers).toContain("volcengine-ark")
    expect(providers).toContain("siliconflow")
    expect(providers).toContain("01-ai")
    expect(providers).toContain("baichuan")
  })

  test("normalizes DeepSeek cache hit and miss tokens", () => {
    const usage = normalizeDeepSeekUsage({
      model: "deepseek-chat",
      usage: {
        prompt_tokens: 120,
        completion_tokens: 40,
        prompt_cache_hit_tokens: 70,
        prompt_cache_miss_tokens: 50,
      },
    })

    expect(usage.provider).toBe("deepseek")
    expect(usage.input_cache_read).toBe(70)
    expect(usage.input_uncached).toBe(50)
    expect(usage.output_visible).toBe(40)
  })

  test("normalizes DeepSeek reasoning tokens", () => {
    const usage = normalizeDeepSeekUsage({
      model: "deepseek-reasoner",
      usage: {
        prompt_tokens: 100,
        completion_tokens: 60,
        completion_tokens_details: { reasoning_tokens: 25 },
      },
    })

    expect(usage.output_reasoning).toBe(25)
    expect(usage.output_visible).toBe(35)
  })

  test("normalizes DashScope/Qwen native token fields", () => {
    const usage = normalizeDashScopeUsage({
      model: "qwen-plus",
      usage: {
        input_tokens: 200,
        output_tokens: 50,
        cached_tokens: 80,
      },
    })

    expect(usage.provider).toBe("dashscope")
    expect(usage.input_uncached).toBe(120)
    expect(usage.input_cache_read).toBe(80)
    expect(usage.output_visible).toBe(50)
  })

  test("normalizes MiniMax native token totals", () => {
    const usage = normalizeMiniMaxUsage({
      model: "abab6.5s-chat",
      usage: {
        input_total_tokens: 90,
        output_total_tokens: 35,
        total_tokens: 125,
      },
    })

    expect(usage.provider).toBe("minimax")
    expect(usage.input_uncached).toBe(90)
    expect(usage.output_visible).toBe(35)
  })

  test("normalizes Chinese OpenAI-compatible providers with identity preserved", () => {
    const usage = normalizeChineseOpenAICompatibleUsage("moonshot", {
      model: "moonshot-v1-128k",
      usage: {
        prompt_tokens: 100,
        completion_tokens: 20,
      },
    })

    expect(usage.provider).toBe("moonshot")
    expect(usage.input_uncached).toBe(100)
    expect(usage.output_visible).toBe(20)
  })

  test("infers Chinese model families for routing and accounting", () => {
    expect(inferChineseModelFamily("deepseek-reasoner")).toBe("deepseek-reasoner")
    expect(inferChineseModelFamily("deepseek-chat")).toBe("deepseek-chat")
    expect(inferChineseModelFamily("qwen2.5-coder-32b")).toBe("qwen-coder")
    expect(inferChineseModelFamily("qwen-long-128k")).toBe("qwen-long-context")
    expect(inferChineseModelFamily("glm-4-plus")).toBe("glm")
    expect(inferChineseModelFamily("kimi-k2")).toBe("kimi")
    expect(inferChineseModelFamily("ernie-4.0")).toBe("ernie")
    expect(inferChineseModelFamily("hunyuan-turbo")).toBe("hunyuan")
    expect(inferChineseModelFamily("doubao-pro")).toBe("doubao")
    expect(inferChineseModelFamily("yi-large")).toBe("yi")
    expect(inferChineseModelFamily("baichuan4")).toBe("baichuan")
  })
})
