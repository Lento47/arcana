import { describe, expect, test } from "bun:test"
import {
  mapUpstreamToArcanaError,
  formatUserFacing,
  ARCANA_ERROR_CATALOG,
  type ArcanaErrorCode,
} from "../../src/error"

describe("mapUpstreamToArcanaError", () => {
  test("maps Azure unsupported operation to ARC_MODEL_UNSUPPORTED", () => {
    const body = JSON.stringify({
      error: {
        message: "The requested operation is unsupported. (tid: 2026072013300452960501457515420)",
        type: "",
        param: "",
        code: null,
      },
    })
    const err = mapUpstreamToArcanaError({
      status: 400,
      bodyText: body,
      provider: "aihubmix",
      model: "gpt-4o-mini",
    })
    expect(err.code).toBe("ARC_MODEL_UNSUPPORTED")
    expect(err.type).toBe("model")
    expect(err.message).not.toMatch(/tid:|aihubmix|Azure/i)
    expect(err.internal?.tid).toBe("2026072013300452960501457515420")
    expect(err.internal?.provider).toBe("aihubmix")
  })

  test("maps aihubmix recharge to ARC_PROVIDER_BALANCE not credits", () => {
    const body = JSON.stringify({
      error: {
        message: "Your account balance is insufficient. Please recharge your account to continue using the API.",
        type: "Aihubmix_api_error",
      },
    })
    const err = mapUpstreamToArcanaError({ status: 400, bodyText: body, provider: "aihubmix" })
    expect(err.code).toBe("ARC_PROVIDER_BALANCE")
    expect(err.code).not.toBe("ARC_CREDITS_EXHAUSTED")
  })

  test("maps proxy insufficient_balance to ARC_CREDITS_EXHAUSTED", () => {
    const body = JSON.stringify({
      error: "insufficient_balance",
      message: "Add credits",
      balance: 2,
      required: 10,
    })
    const err = mapUpstreamToArcanaError({ status: 402, bodyText: body, source: "arcana-proxy" })
    expect(err.code).toBe("ARC_CREDITS_EXHAUSTED")
    expect(err.message).toContain("have 2")
    expect(err.message).toContain("need 10")
  })

  test("maps no endpoints to ARC_MODEL_NOT_FOUND", () => {
    const body = JSON.stringify({
      error: { message: "No endpoints found for anthropic/claude-3.5-sonnet.", code: 404 },
    })
    const err = mapUpstreamToArcanaError({ status: 404, bodyText: body, provider: "openrouter" })
    expect(err.code).toBe("ARC_MODEL_NOT_FOUND")
  })

  test("passes through existing ARC_ envelope", () => {
    const body = JSON.stringify({
      error: {
        code: "ARC_RATE_LIMITED",
        type: "rate_limit",
        message: "Too many requests — Arcana is slowing this account briefly.",
        recovery: ["Wait"],
        retryable: true,
      },
      internal: { provider: "proxy" },
    })
    const err = mapUpstreamToArcanaError({ status: 429, bodyText: body })
    expect(err.code).toBe("ARC_RATE_LIMITED")
    expect(err.message).toContain("Too many requests")
  })

  test("formatUserFacing never includes tid", () => {
    const err = mapUpstreamToArcanaError({
      status: 400,
      bodyText: '{"error":{"message":"unsupported (tid: 1234567890123)"}}',
      provider: "aihubmix",
    })
    const text = formatUserFacing(err)
    expect(text).toContain("ARC_MODEL_UNSUPPORTED")
    expect(text).not.toMatch(/tid:/)
    expect(text).toMatch(/Next steps/)
  })

  test("catalog covers every code", () => {
    const codes = Object.keys(ARCANA_ERROR_CATALOG) as ArcanaErrorCode[]
    expect(codes.length).toBeGreaterThanOrEqual(14)
    for (const c of codes) {
      expect(ARCANA_ERROR_CATALOG[c].message.length).toBeGreaterThan(10)
      expect(ARCANA_ERROR_CATALOG[c].recovery.length).toBeGreaterThan(0)
    }
  })
})
