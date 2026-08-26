import { describe, expect, test } from "bun:test"
import { providerOptions } from "../src/component/dialog-provider"
import { normalizeCustomProviderID } from "../src/component/dialog-provider"

const SAMPLE = [
  { id: "arcana", name: "Arcana" },
  { id: "anthropic", name: "Anthropic" },
  { id: "openai", name: "OpenAI" },
  { id: "opencode-go", name: "OpenCode Go" },
  { id: "github-copilot", name: "GitHub Copilot" },
  { id: "google", name: "Google" },
  { id: "x", name: "x" }, // not in PROVIDER_PRIORITY → "Providers" category
]

describe("providerOptions — arcana oauth", () => {
  test("free user (no proxy key) sees the OAuth option first", () => {
    const opts = providerOptions(SAMPLE, { showArcanaOauth: true })
    expect(opts[0]?.type).toBe("arcana-oauth")
    const arcana = opts.find((o) => o.type === "provider" && o.providerID === "arcana")
    expect(arcana).toBeDefined()
  })

  test("licensed user (proxy key present) does not see the OAuth option", () => {
    const opts = providerOptions(SAMPLE, { showArcanaOauth: false })
    expect(opts.some((o) => o.type === "arcana-oauth")).toBe(false)
  })

  test("default (no opts) hides the OAuth option — preserves legacy callers", () => {
    const opts = providerOptions(SAMPLE)
    expect(opts.some((o) => o.type === "arcana-oauth")).toBe(false)
  })

  test("OAuth option is the first row, before arcana itself", () => {
    const opts = providerOptions(SAMPLE, { showArcanaOauth: true })
    const oauthIndex = opts.findIndex((o) => o.type === "arcana-oauth")
    const arcanaIndex = opts.findIndex((o) => o.type === "provider" && o.providerID === "arcana")
    expect(oauthIndex).toBeLessThan(arcanaIndex)
    expect(oauthIndex).toBe(0)
  })

  test("OAuth option is in the 'Popular' category so it sits above 'Providers'", () => {
    const opts = providerOptions(SAMPLE, { showArcanaOauth: true })
    const oauth = opts.find((o) => o.type === "arcana-oauth")
    expect(oauth?.category).toBe("Popular")
  })

  test("OAuth option copy matches the design: free, unlock more", () => {
    const opts = providerOptions(SAMPLE, { showArcanaOauth: true })
    const oauth = opts.find((o) => o.type === "arcana-oauth")
    expect(oauth?.title).toBe("Sign in with arcana")
    expect(oauth?.description).toContain("Free")
    expect(oauth?.description).toContain("unlock more models")
  })

  test("opencode-go row is branded Arcana Plan regardless of server-provided name", () => {
    const opts = providerOptions(SAMPLE)
    const go = opts.find((o) => o.type === "provider" && o.providerID === "opencode-go")
    expect(go?.title).toBe("Arcana Plan")
    expect(go?.description).toBe("Low cost plan for everyone")
  })

  test("other rows are still present and ordered", () => {
    const opts = providerOptions(SAMPLE, { showArcanaOauth: true })
    expect(opts.some((o) => o.type === "custom")).toBe(true)
    const providers = opts.filter((o) => o.type === "provider")
    expect(providers.length).toBe(SAMPLE.length)
  })
})

describe("normalizeCustomProviderID", () => {
  test("strips @ai-sdk/ prefix and trims whitespace", () => {
    expect(normalizeCustomProviderID("  @ai-sdk/anthropic  ")).toBe("anthropic")
  })
  test("rejects empty and invalid ids", () => {
    expect(normalizeCustomProviderID("")).toBeUndefined()
    expect(normalizeCustomProviderID("UPPER")).toBeUndefined()
    expect(normalizeCustomProviderID("-leading")).toBeUndefined()
  })
  test("accepts valid lowercase/hyphen/underscore ids", () => {
    expect(normalizeCustomProviderID("my-provider_v2")).toBe("my-provider_v2")
    expect(normalizeCustomProviderID("42")).toBe("42")
  })
})
