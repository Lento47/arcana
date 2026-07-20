import { describe, expect, test } from "bun:test"
import { delegatedAgentConfig } from "./delegated.js"

describe("delegated agent config (M4)", () => {
  test("cron defaults to safeMode and caps tool rounds", () => {
    const cfg = delegatedAgentConfig("cron", {
      provider: "arcana",
      model: "test",
      apiKey: "k",
    })
    expect(cfg.safeMode).toBe(true)
    expect(cfg.godlike).toBe(false)
    expect(cfg.maxToolRounds).toBeLessThanOrEqual(8)
  })

  test("cron respects explicit safeMode false", () => {
    const cfg = delegatedAgentConfig("cron", {
      provider: "arcana",
      model: "test",
      apiKey: "k",
      safeMode: false,
    })
    expect(cfg.safeMode).toBe(false)
  })

  test("gateway never enables godlike unless both gateway and explicit", () => {
    const cfg = delegatedAgentConfig("gateway", {
      provider: "arcana",
      model: "test",
      apiKey: "k",
      godlike: true,
    })
    // Still false for gateway in our policy (godlike only if kind gateway AND true — wait we set true for gateway)
    // Policy: godlike only when kind === gateway && godlike === true
    expect(cfg.godlike).toBe(true)
  })

  test("gateway godlike false by default", () => {
    const cfg = delegatedAgentConfig("gateway", {
      provider: "arcana",
      model: "test",
      apiKey: "k",
    })
    expect(cfg.godlike).toBe(false)
    expect(cfg.maxToolRounds).toBeLessThanOrEqual(12)
  })
})
