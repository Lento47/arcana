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

  test("unknown ARC_* wire code does not throw; falls back to ARC_INTERNAL", () => {
    const body = JSON.stringify({
      error: {
        code: "ARC_FUTURE_CODE_NOT_IN_ENGINE",
        type: "internal",
        message: "Proxy said something new",
        retryable: true,
      },
      internal: { provider: "arcana-proxy" },
    })
    const err = mapUpstreamToArcanaError({
      status: 500,
      bodyText: body,
      provider: "arcana-proxy",
    })
    expect(err.code).toBe("ARC_INTERNAL")
    expect(err.httpStatus).toBe(500)
    expect(err.message).toContain("Proxy said something new")
    expect(err.internal?.upstreamCode).toBe("ARC_FUTURE_CODE_NOT_IN_ENGINE")
  })

  test("buildArcanaError tolerates unknown codes without TypeError", async () => {
    const { buildArcanaError } = await import("../../src/error/arcana-error")
    const err = buildArcanaError("ARC_NOT_A_REAL_CODE" as any, {
      message: "fallback path",
    })
    expect(err.code).toBe("ARC_INTERNAL")
    expect(err.httpStatus).toBeNumber()
    expect(err.message).toBe("fallback path")
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

describe("free-tier error codes (regression: 'weekly session' false positive)", () => {
  // Bug fixed 2026-07-20: the old classifier
  //   msg.includes("free") && (msg.includes("exhaust") || msg.includes("weekly session"))
  // would flip any upstream body containing those substrings to ARC_FREE_EXHAUSTED,
  // producing a "free weekly session used up" toast on real upstream 5xx.
  // The fix trusts explicit wire codes only.
  test("explicit arc_free_session_expired maps to ARC_FREE_SESSION_EXPIRED", () => {
    const body = JSON.stringify({
      error: { code: "arc_free_session_expired", message: "60-min window elapsed" },
    })
    expect(mapUpstreamToArcanaError({ status: 429, bodyText: body }).code).toBe("ARC_FREE_SESSION_EXPIRED")
  })

  test("explicit arc_free_conversation_mismatch maps to ARC_FREE_CONVERSATION_MISMATCH", () => {
    const body = JSON.stringify({
      error: { code: "arc_free_conversation_mismatch", message: "different conversation" },
    })
    expect(mapUpstreamToArcanaError({ status: 429, bodyText: body }).code).toBe("ARC_FREE_CONVERSATION_MISMATCH")
  })

  test("explicit arc_free_turn_budget_reached maps to ARC_FREE_TURN_BUDGET_REACHED", () => {
    const body = JSON.stringify({
      error: { code: "arc_free_turn_budget_reached", message: "2-call cap hit" },
    })
    expect(mapUpstreamToArcanaError({ status: 429, bodyText: body }).code).toBe("ARC_FREE_TURN_BUDGET_REACHED")
  })

  test("explicit arc_free_exhausted still maps to ARC_FREE_EXHAUSTED (legacy backstop)", () => {
    const body = JSON.stringify({
      error: { code: "arc_free_exhausted", message: "fallback" },
    })
    expect(mapUpstreamToArcanaError({ status: 429, bodyText: body }).code).toBe("ARC_FREE_EXHAUSTED")
  })

  test("substring 'free' + 'weekly session' (no code) no longer maps to ARC_FREE_EXHAUSTED", () => {
    // Pre-fix this would map to ARC_FREE_EXHAUSTED. Post-fix it should NOT —
    // the classifier trusts explicit wire codes only.
    const body = JSON.stringify({
      error: { message: "Your free weekly session has been rate-limited upstream" },
    })
    const code = mapUpstreamToArcanaError({ status: 503, bodyText: body }).code
    expect(code).not.toBe("ARC_FREE_EXHAUSTED")
    expect(code).not.toMatch(/^ARC_FREE_/)
  })

  test("substring 'free trial exhausted' (no code) no longer maps to ARC_FREE_EXHAUSTED", () => {
    const body = JSON.stringify({
      error: { message: "Your free trial is exhausted; please upgrade" },
    })
    const code = mapUpstreamToArcanaError({ status: 402, bodyText: body }).code
    // Should be ARC_CREDITS_EXHAUSTED (matches 402 + insufficient-credit branch)
    // — NOT ARC_FREE_EXHAUSTED.
    expect(code).toBe("ARC_CREDITS_EXHAUSTED")
  })

  test("catalog entries exist for the 3 new free-tier codes", () => {
    expect(ARCANA_ERROR_CATALOG.ARC_FREE_SESSION_EXPIRED).toBeDefined()
    expect(ARCANA_ERROR_CATALOG.ARC_FREE_CONVERSATION_MISMATCH).toBeDefined()
    expect(ARCANA_ERROR_CATALOG.ARC_FREE_TURN_BUDGET_REACHED).toBeDefined()
    expect(ARCANA_ERROR_CATALOG.ARC_FREE_SESSION_EXPIRED.message).toContain("60-minute")
    expect(ARCANA_ERROR_CATALOG.ARC_FREE_CONVERSATION_MISMATCH.retryable).toBe(false)
    expect(ARCANA_ERROR_CATALOG.ARC_FREE_TURN_BUDGET_REACHED.retryable).toBe(true)
    expect(ARCANA_ERROR_CATALOG.ARC_FREE_SESSION_EXPIRED.httpStatus).toBe(429)
  })
})
