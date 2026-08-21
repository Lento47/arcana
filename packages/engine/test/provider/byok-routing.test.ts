/**
 * BYOK proxy-routing regression tests.
 *
 * When ARCANA_PROXY_KEY is present, the engine used to (a) skip loading ALL
 * individually-saved provider keys and (b) inject the proxy key into every
 * @ai-sdk/openai-compatible request. For a user's own endpoint that meant
 * Arcana credentials were sent to a third-party host, which rejected them —
 * surfacing as the misleading ARC_AUTH_INVALID "license key was rejected".
 *
 * Contract now: Arcana-hosted baseURLs are license-metered; any other
 * explicit baseURL is user BYOK territory and routes direct with the
 * user's own key.
 */
import { describe, expect, test } from "bun:test"
import { isArcanaProxyBaseURL } from "../../src/provider/provider"

describe("isArcanaProxyBaseURL", () => {
  test("Arcana proxy hosts are metered", () => {
    expect(isArcanaProxyBaseURL("https://proxy-arcana.otnelhq.com/v1")).toBe(true)
    expect(isArcanaProxyBaseURL("https://arcana-proxy.lejzerv.workers.dev/v1")).toBe(true)
    expect(isArcanaProxyBaseURL("HTTPS://ARCANA-PROXY.LEJZERV.WORKERS.DEV/V1")).toBe(true)
  })

  test("user BYOK endpoints are direct", () => {
    expect(isArcanaProxyBaseURL("https://api.tokenrouter.com/v1")).toBe(false)
    expect(isArcanaProxyBaseURL("https://openrouter.ai/api/v1")).toBe(false)
    expect(isArcanaProxyBaseURL("http://localhost:11434/v1")).toBe(false)
  })

  test("absent/empty baseURL is not BYOK-direct", () => {
    expect(isArcanaProxyBaseURL(undefined)).toBe(false)
    expect(isArcanaProxyBaseURL("")).toBe(false)
  })

  test("lookalike hosts are not trusted — hostname must match exactly", () => {
    expect(isArcanaProxyBaseURL("https://evil.example.com/?u=proxy-arcana.otnelhq.com")).toBe(false)
    expect(isArcanaProxyBaseURL("https://proxy-arcana.otnelhq.com.evil.io/v1")).toBe(false)
    expect(isArcanaProxyBaseURL("not a url")).toBe(false)
  })
})
