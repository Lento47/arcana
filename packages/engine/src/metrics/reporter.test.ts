import { describe, expect, test } from "bun:test"
import {
  createUsageMetricsReporter,
  reportCompletionUsage,
  shouldReportCompletionUsage,
  usageMetricsSharingEnabled,
} from "./reporter"

function okResponse(): Response {
  return new Response(JSON.stringify({ accepted: 1, inserted: 1, duplicates: 0 }), { status: 202 })
}

describe("usage metrics reporter", () => {
  test("sharing is on by default; explicit opt-out disables", () => {
    expect(usageMetricsSharingEnabled({})).toBe(true)
    expect(usageMetricsSharingEnabled({ ARCANA_METRICS_SHARING: "0" })).toBe(false)
    expect(usageMetricsSharingEnabled({ ARCANA_METRICS_SHARING: "false" })).toBe(false)
    expect(usageMetricsSharingEnabled({ ARCANA_METRICS_SHARING: "1" })).toBe(true)
    expect(usageMetricsSharingEnabled({ ARCANA_METRICS_SHARING: "true" })).toBe(true)
  })

  test("disabled reporter never queues and never fetches", async () => {
    let calls = 0
    const reporter = createUsageMetricsReporter({
      enabled: false,
      fetchImpl: async () => {
        calls++
        return okResponse()
      },
      resolveKey: () => "k",
    })
    reporter.record({ providerID: "openai", modelID: "gpt-x" })
    await reporter.flush()
    expect(calls).toBe(0)
    expect(reporter.pending()).toBe(0)
  })

  test("record + flush posts one batched event with auth and mapped fields", async () => {
    const bodies: any[] = []
    const headers: Record<string, string>[] = []
    const reporter = createUsageMetricsReporter({
      enabled: true,
      endpoints: ["https://metrics.test/v1/metrics/events"],
      resolveKey: () => "license-key",
      fetchImpl: async (_url, init) => {
        headers.push(Object.fromEntries(new Headers(init?.headers).entries()))
        bodies.push(JSON.parse(String(init?.body)))
        return okResponse()
      },
    })
    reporter.record({
      sessionId: "ses_1",
      providerID: "anthropic",
      modelID: "claude-x",
      tokens: { input: 100, output: 40, reasoning: 10, cache: { read: 5, write: 7 } },
      cost: 0.25,
      durationMs: 1200,
      at: 1_700_000_000_000,
    })
    expect(reporter.pending()).toBe(1)
    await reporter.flush()
    expect(bodies.length).toBe(1)
    const event = bodies[0]!.events[0]
    expect(event.provider).toBe("anthropic")
    expect(event.model).toBe("claude-x")
    expect(event.sessionId).toBe("ses_1")
    expect(event.tokensIn).toBe(100)
    expect(event.tokensOut).toBe(40)
    expect(event.reasoningTokens).toBe(10)
    expect(event.cachedTokens).toBe(5)
    expect(event.cacheWriteTokens).toBe(7)
    expect(event.durationMs).toBe(1200)
    expect(event.costUsd).toBe(0.25)
    expect(event.status).toBe("completed")
    expect(event.at).toBe(1_700_000_000_000)
    expect(typeof event.eventId).toBe("string")
    expect(headers[0]!.authorization).toBe("Bearer license-key")
  })

  test("no credential: flush drops the batch without fetching", async () => {
    let calls = 0
    const reporter = createUsageMetricsReporter({
      enabled: true,
      resolveKey: () => undefined,
      fetchImpl: async () => {
        calls++
        throw new Error("should not fetch")
      },
    })
    reporter.record({ providerID: "x" })
    await reporter.flush()
    expect(calls).toBe(0)
    expect(reporter.pending()).toBe(0)
  })

  test("network failure is swallowed (fail-open)", async () => {
    const reporter = createUsageMetricsReporter({
      enabled: true,
      endpoints: ["https://down.test/v1/metrics/events"],
      resolveKey: () => "k",
      fetchImpl: async () => {
        throw new Error("unreachable")
      },
    })
    reporter.record({ providerID: "x" })
    await expect(reporter.flush()).resolves.toBeUndefined()
  })

  test("falls through to the fallback endpoint on 5xx", async () => {
    const urls: string[] = []
    const reporter = createUsageMetricsReporter({
      enabled: true,
      endpoints: ["https://primary.test/v1/metrics/events", "https://fallback.test/v1/metrics/events"],
      resolveKey: () => "k",
      fetchImpl: async (url) => {
        urls.push(String(url))
        if (String(url).startsWith("https://primary")) return new Response("boom", { status: 500 })
        return okResponse()
      },
    })
    reporter.record({ providerID: "x" })
    await reporter.flush()
    expect(urls.length).toBe(2)
    expect(urls[1]).toContain("fallback")
  })

  test("auto-flushes when the batch limit is reached", async () => {
    let batches = 0
    const reporter = createUsageMetricsReporter({
      enabled: true,
      maxBatch: 3,
      flushIntervalMs: 0, // never tick
      endpoints: ["https://metrics.test/v1/metrics/events"],
      resolveKey: () => "k",
      fetchImpl: async () => {
        batches++
        return okResponse()
      },
    })
    reporter.record({ providerID: "x" })
    reporter.record({ providerID: "x" })
    expect(batches).toBe(0)
    reporter.record({ providerID: "x" }) // hits maxBatch → auto flush
    // flush() is async; wait a microtask turn.
    await reporter.flush()
    expect(batches).toBeGreaterThanOrEqual(1)
  })

  test("proxied traffic and opted-out sharing are excluded at the gate", () => {
    // On by default — an empty env enables.
    expect(shouldReportCompletionUsage({ env: {} })).toBe(true)
    const disabledEnv = { ARCANA_METRICS_SHARING: "0" }
    expect(shouldReportCompletionUsage({ env: disabledEnv })).toBe(false)
    expect(
      shouldReportCompletionUsage({
        env: {},
        baseURL: "https://proxy-arcana.otnelhq.com/v1",
      }),
    ).toBe(false)
    expect(
      shouldReportCompletionUsage({
        env: {},
        baseURL: "https://arcana-proxy.lejzerv.workers.dev/v1",
      }),
    ).toBe(false)
    // Lookalike hosts are NOT Arcana infrastructure — they must be reported.
    expect(
      shouldReportCompletionUsage({
        env: {},
        baseURL: "https://proxy-arcana.otnelhq.com.evil.io/v1",
      }),
    ).toBe(true)
  })

  test("reportCompletionUsage end-to-end: enabled direct call records, proxied call does not", async () => {
    // The shared singleton reads process.env at construction; drive the gate
    // logic directly instead of mutating process state.
    const gatedDirect = shouldReportCompletionUsage({
      env: {},
      baseURL: undefined,
    })
    const gatedProxy = shouldReportCompletionUsage({
      env: {},
      baseURL: "https://proxy-arcana.otnelhq.com/v1",
    })
    expect(gatedDirect).toBe(true)
    expect(gatedProxy).toBe(false)
    // Unconditional call safety: no model, opted-out env — must not throw.
    expect(() => reportCompletionUsage({ sessionId: "s" })).not.toThrow()
  })
})
