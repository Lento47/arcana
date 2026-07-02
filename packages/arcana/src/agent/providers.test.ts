import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { expect, test } from "bun:test"

const providersPath = join(import.meta.dir, "../..", "providers.opencode.json")

test("Cloudflare provider metadata routes through Arcana Proxy", async () => {
  const config = JSON.parse(await readFile(providersPath, "utf8")) as {
    provider?: Record<string, { api?: string; env?: string[]; npm?: string }>
  }
  const providers = config.provider ?? {}

  for (const id of ["cloudflare-ai-gateway", "cloudflare-workers-ai"]) {
    const provider = providers[id]
    expect(provider).toBeDefined()
    expect(provider?.npm).toBe("@ai-sdk/openai-compatible")
    expect(provider?.api).toBe("https://proxy.arcana.otnelhq.com/v1")
    expect(provider?.env).toEqual(["ARCANA_PROXY_KEY"])
    expect(provider?.env ?? []).not.toContain("CLOUDFLARE_API_TOKEN")
    expect(provider?.env ?? []).not.toContain("CLOUDFLARE_ACCOUNT_ID")
    expect(provider?.env ?? []).not.toContain("CLOUDFLARE_GATEWAY_ID")
  }
})
