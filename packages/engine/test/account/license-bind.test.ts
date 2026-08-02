import { afterEach, describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { bindAccessToken } from "../../src/account/license-bind"

// Sanity guard: the TUI surfaces the `error` field directly. Assert the
// string never includes the upstream URL, fetch error wording, or HTTP
// status — all of which are Information Disclosure / Verbose Error Leakage.
describe("bindAccessToken — error safety", () => {
  const realFetch = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = realFetch
  })

  const run = <A>(eff: Effect.Effect<A>): Promise<A> => Effect.runPromise(eff)

  test("connection-refused error message is NOT surfaced", async () => {
    // All license-server bases reject — simulates the user's reported
    // `ConnectionRefused` from `https://api-arcana.otnelhq.com/api/...`.
    globalThis.fetch = (() => Promise.reject(new Error("Unable to connect. Is the computer able to access the url?"))) as unknown as typeof fetch

    const result = await run(bindAccessToken("fake-token", "u@example.com", "https://arcana.otnelhq.com"))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).not.toContain("Unable to connect")
      expect(result.error).not.toContain("arcana.otnelhq.com")
      expect(result.error).not.toContain("lejzerv.workers.dev")
      expect(result.error).not.toMatch(/https?:\/\//)
      expect(result.error).not.toMatch(/ECONN|ENOTFOUND|ETIMEDOUT|ConnectionRefused/i)
      expect(result.error).not.toMatch(/license/i)
    }
  })

  test("non-JSON upstream body is NOT surfaced verbatim", async () => {
    globalThis.fetch = (() =>
      Promise.resolve(
        new Response("502 Bad Gateway", { status: 502, headers: { "content-type": "text/plain" } }),
      )) as unknown as typeof fetch

    const result = await run(bindAccessToken("fake-token", undefined, "https://arcana.otnelhq.com"))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).not.toContain("502")
      expect(result.error).not.toContain("Bad Gateway")
      expect(result.error).not.toMatch(/https?:\/\//)
    }
  })

  test("upstream JSON error field is NOT surfaced verbatim", async () => {
    globalThis.fetch = (() =>
      Promise.resolve(
        new Response(JSON.stringify({ ok: false, error: "Internal server error: KMS unreachable" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )) as unknown as typeof fetch

    const result = await run(bindAccessToken("fake-token", undefined, "https://arcana.otnelhq.com"))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).not.toContain("KMS")
      expect(result.error).not.toContain("Internal server error")
    }
  })

  test("happy path returns proxy key + tier", async () => {
    globalThis.fetch = (() =>
      Promise.resolve(
        new Response(JSON.stringify({ ok: true, proxyKey: "pk_test_123", tier: "free" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )) as unknown as typeof fetch

    const result = await run(bindAccessToken("fake-token", "u@example.com", "https://arcana.otnelhq.com"))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.proxyKey).toBe("pk_test_123")
      expect(result.tier).toBe("free")
    }
  })
})
