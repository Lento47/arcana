/**
 * Custom provider URL auto-derive (Option B).
 *
 * The "Other → Custom provider" flow must accept either a short slug or a
 * full base URL. URLs derive the id from the hostname and carry the baseURL
 * through to global-config registration so no hand-editing arcana.json.
 */
import { describe, expect, test, afterEach } from "bun:test"
import {
  customProviderConfigBlock,
  deriveProviderIDFromHost,
  discoverModelIDs,
  invalidProviderIDMessage,
  parseCustomProviderInput,
} from "../src/component/dialog-provider"

describe("deriveProviderIDFromHost", () => {
  test("drops api/www/gateway/v1 prefixes and the TLD", () => {
    expect(deriveProviderIDFromHost("api.tokenrouter.com")).toBe("tokenrouter")
    expect(deriveProviderIDFromHost("www.example.org")).toBe("example")
    expect(deriveProviderIDFromHost("gateway.groq.cloud")).toBe("groq")
    expect(deriveProviderIDFromHost("v1.mistral.ai")).toBe("mistral")
  })

  test("handles bare domains and single labels", () => {
    expect(deriveProviderIDFromHost("openrouter.ai")).toBe("openrouter")
    expect(deriveProviderIDFromHost("x.ai")).toBe("x")
    expect(deriveProviderIDFromHost("localhost")).toBe("localhost")
  })

  test("keeps mid-path brand labels", () => {
    expect(deriveProviderIDFromHost("inference.tokenrouter.io")).toBe("tokenrouter")
  })

  test("slugifies unusual characters", () => {
    expect(deriveProviderIDFromHost("api.my-provider.co")).toBe("my-provider")
  })

  test("suffixes collisions instead of failing", () => {
    const existing = new Set(["tokenrouter"])
    expect(deriveProviderIDFromHost("api.tokenrouter.com", existing)).toBe("tokenrouter-2")
    const both = new Set(["tokenrouter", "tokenrouter-2"])
    expect(deriveProviderIDFromHost("api.tokenrouter.com", both)).toBe("tokenrouter-3")
  })

  test("returns undefined for empty hostnames", () => {
    expect(deriveProviderIDFromHost("")).toBeUndefined()
  })
})

describe("parseCustomProviderInput", () => {
  test("slugs pass through unchanged", () => {
    expect(parseCustomProviderInput("tokenrouter")).toEqual({ id: "tokenrouter" })
  })

  test("slugs are case-folded", () => {
    expect(parseCustomProviderInput("TokenRouter")).toEqual({ id: "tokenrouter" })
  })

  test("strips @ai-sdk/ prefix (legacy behavior preserved)", () => {
    expect(parseCustomProviderInput("@ai-sdk/openai")).toEqual({ id: "openai" })
  })

  test("URLs yield id + normalized baseURL", () => {
    expect(parseCustomProviderInput("https://api.tokenrouter.com/v1")).toEqual({
      id: "tokenrouter",
      baseURL: "https://api.tokenrouter.com/v1",
    })
  })

  test("URL without version path keeps origin only", () => {
    expect(parseCustomProviderInput("https://openrouter.ai/api")).toEqual({
      id: "openrouter",
      baseURL: "https://openrouter.ai/api",
    })
  })

  test("trailing slashes are trimmed from baseURL", () => {
    expect(parseCustomProviderInput("https://api.tokenrouter.com/v1/")?.baseURL).toBe(
      "https://api.tokenrouter.com/v1",
    )
  })

  test("URL ids respect existing providers via collision suffix", () => {
    const existing = new Set(["deepseek"])
    expect(parseCustomProviderInput("https://api.deepseek.com/v1", existing)).toEqual({
      id: "deepseek-2",
      baseURL: "https://api.deepseek.com/v1",
    })
  })

  test("garbage returns undefined", () => {
    expect(parseCustomProviderInput("")).toBeUndefined()
    expect(parseCustomProviderInput("   ")).toBeUndefined()
    expect(parseCustomProviderInput("not a url!!")).toBeUndefined()
  })
})

describe("invalidProviderIDMessage", () => {
  test("URL input gets a derive-failure hint", () => {
    const msg = invalidProviderIDMessage("https://bad url with spaces.com/v1")
    expect(msg).toContain("Couldn't derive a provider id")
    expect(msg).toContain("tokenrouter")
  })

  test("slug input names the offending characters", () => {
    const msg = invalidProviderIDMessage("my provider!")
    expect(msg).toContain('found space, "!"')
    expect(msg).toContain("Example: tokenrouter")
  })

  test("clean-but-empty edge lists no characters", () => {
    expect(invalidProviderIDMessage("!")).toContain('found "!"')
  })
})

describe("customProviderConfigBlock", () => {
  test("includes models when discovery found some", () => {
    const block = customProviderConfigBlock("https://api.tokenrouter.com/v1", ["m1", "m2"])
    expect(block).toEqual({
      npm: "@ai-sdk/openai-compatible",
      name: "Tokenrouter",
      options: { baseURL: "https://api.tokenrouter.com/v1" },
      models: { m1: {}, m2: {} },
    })
  })

  test("omits models key when discovery found none", () => {
    const block = customProviderConfigBlock("https://api.tokenrouter.com/v1", [])
    expect(block).not.toHaveProperty("models")
    expect(block.options.baseURL).toBe("https://api.tokenrouter.com/v1")
  })
})

describe("discoverModelIDs", () => {
  const originalFetch = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  function serve(responses: Map<string, { status?: number; body?: unknown }>) {
    // @ts-expect-error test double
    globalThis.fetch = async (url: string) => {
      const hit = responses.get(url)
      if (!hit) throw new Error(`unexpected fetch: ${url}`)
      return new Response(hit.body === undefined ? "" : JSON.stringify(hit.body), {
        status: hit.status ?? 200,
      })
    }
  }

  test("reads OpenAI-style data[].id from <baseURL>/models", async () => {
    serve(new Map([["https://api.x.com/v1/models", { body: { data: [{ id: "m-a" }, { id: "m-b" }] } }]]))
    expect(await discoverModelIDs("https://api.x.com/v1", "sk-test")).toEqual(["m-a", "m-b"])
  })

  test("falls back to <origin>/v1/models when baseURL lacks /v1", async () => {
    serve(new Map([["https://api.x.com/v1/models", { body: { data: [{ id: "m-c" }] } }]]))
    expect(await discoverModelIDs("https://api.x.com", "sk-test")).toEqual(["m-c"])
  })

  test("returns empty on HTTP errors rather than throwing", async () => {
    serve(new Map([["https://api.x.com/v1/models", { status: 401 }]]))
    expect(await discoverModelIDs("https://api.x.com/v1", "bad-key")).toEqual([])
  })

  test("filters non-string and empty ids", async () => {
    serve(new Map([["https://api.x.com/v1/models", { body: { data: [{ id: "ok" }, {}, { id: "" }, "junk"] } }]]))
    expect(await discoverModelIDs("https://api.x.com/v1", "sk-test")).toEqual(["ok"])
  })
})
