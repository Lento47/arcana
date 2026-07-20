import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { afterEach, expect, test } from "bun:test"
import { currentDir } from "../util/path.js"
import { autoDetectProvider, resolveProvider } from "./providers.js"

const providersPath = join(currentDir(import.meta), "../..", "providers.arcana.json")

const saved: Record<string, string | undefined> = {}

function setEnv(key: string, value: string | undefined) {
  if (!(key in saved)) saved[key] = process.env[key]
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}

afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  for (const key of Object.keys(saved)) delete saved[key]
})

test("arcana-proxy is the licensed route; Cloudflare direct needs CF credentials", async () => {
  const config = JSON.parse(await readFile(providersPath, "utf8")) as {
    provider?: Record<string, { api?: string; env?: string[]; npm?: string }>
  }
  const providers = config.provider ?? {}

  const proxy = providers["arcana-proxy"]
  expect(proxy).toBeDefined()
  expect(proxy?.api).toMatch(/arcana-proxy\.lejzerv\.workers\.dev\/v1|proxy\.arcana\.otnelhq\.com\/v1/)
  expect(proxy?.env).toEqual(["ARCANA_PROXY_KEY"])

  for (const id of ["cloudflare-ai-gateway", "cloudflare-workers-ai"]) {
    const provider = providers[id]
    expect(provider).toBeDefined()
    expect(provider?.npm).toBe("@ai-sdk/openai-compatible")
    expect(provider?.env ?? []).toContain("CLOUDFLARE_ACCOUNT_ID")
    expect(provider?.env ?? []).not.toContain("ARCANA_PROXY_KEY")
    expect(provider?.api ?? "").not.toBe("https://proxy.arcana.otnelhq.com/v1")
  }
})

test("autoDetect prefers arcana-proxy when ARCANA_PROXY_KEY is set", async () => {
  setEnv("ARCANA_PROXY_KEY", "license_test_key")
  setEnv("OPENAI_API_KEY", "sk-test")
  setEnv("CLOUDFLARE_API_KEY", "cf-test")
  setEnv("CLOUDFLARE_ACCOUNT_ID", undefined)

  const detected = await autoDetectProvider()
  expect(detected.provider).toBe("arcana-proxy")
})

test("resolveProvider uses local arcana-proxy api, not models.dev CF url", async () => {
  setEnv("ARCANA_PROXY_KEY", "license_test_key")
  setEnv("CLOUDFLARE_ACCOUNT_ID", undefined)

  const profile = await resolveProvider("arcana-proxy")
  expect(profile.baseURL).toMatch(/arcana-proxy\.lejzerv\.workers\.dev\/v1|proxy\.arcana\.otnelhq\.com\/v1/)
  expect(profile.envKey).toBe("ARCANA_PROXY_KEY")
})

test("resolveProvider refuses unsubstituted Cloudflare account placeholder", async () => {
  setEnv("CLOUDFLARE_ACCOUNT_ID", undefined)
  setEnv("CLOUDFLARE_API_KEY", "cf-test")

  await expect(resolveProvider("cloudflare-workers-ai")).rejects.toThrow(/CLOUDFLARE_ACCOUNT_ID/)
})
