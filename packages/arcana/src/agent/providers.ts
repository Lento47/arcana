// Provider resolution for arcana `run` — driven by shared models.dev cache.
// AI SDK handles baseURLs for known providers. Only need env var + default model.
//
// Unified with opencode: both read ~/.cache/arcana/models-dev.json (same cache file).
// No more split-brain on provider data.

import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fetchModelsDev, type ModelsDevProvider } from "./models-dev.js"
import { currentDir } from "../util/path.js"

export type ProviderProfile = {
  baseURL?: string   // only needed for unknown OpenAI-compatible providers
  envKey?: string
  defaultModel?: string
}

/** Minimal ID bridging — arcana id → models.dev id. Shrunk from Phase 2. */
const ALIASES: Record<string, string> = {
  kimi: "moonshotai",
  "z-ai": "zai",
  novita: "novita-ai",
  qwen: "alibaba",
}

const LOCAL_EXTRAS_PATH = join(currentDir(import.meta), "../..", "providers.arcana.json")
let localExtrasCache: Record<string, ModelsDevProvider> | null = null

async function loadLocalExtras(): Promise<Record<string, ModelsDevProvider>> {
  if (localExtrasCache) return localExtrasCache
  try {
    const raw = await readFile(LOCAL_EXTRAS_PATH, "utf8")
    localExtrasCache = (JSON.parse(raw) as any).provider ?? {}
  } catch { localExtrasCache = {} }
  return localExtrasCache ?? {}
}

export async function resolveProvider(provider: string): Promise<ProviderProfile> {
  const alias = ALIASES[provider] ?? provider
  const [all, localExtras] = await Promise.all([fetchModelsDev(), loadLocalExtras()])
  // Local extras win — providers.arcana.json routes arcana-proxy / licensed
  // Cloud paths. Preferring models.dev first made "cloudflare-workers-ai" resolve
  // to api.cloudflare.com with an unsubstituted ${CLOUDFLARE_ACCOUNT_ID}.
  const md = localExtras[provider] ?? all[alias] ?? all[provider]

  if (!md) throw new Error(`Unknown provider "${provider}". Check models.dev or providers.arcana.json.`)

  const envKey = md.env?.[0]
  const defaultModel = md.models ? Object.keys(md.models)[0] : undefined
  const baseURL = md.api
  if (typeof baseURL === "string" && baseURL.includes("${CLOUDFLARE_ACCOUNT_ID}") && !process.env.CLOUDFLARE_ACCOUNT_ID) {
    throw new Error(
      `Provider "${provider}" needs CLOUDFLARE_ACCOUNT_ID (Workers AI). ` +
        `Or use Arcana Proxy: ensure ~/.arcana/proxy_key exists and set provider to "arcana-proxy".`,
    )
  }
  return { baseURL, envKey, defaultModel }
}

/** Auto-detect which provider is configured via env vars. Reads models.dev to
  * find providers whose env key or BASE_URL is set. Priority: Arcana Proxy when
  * licensed, then *_BASE_URL (explicit user intent), then exact env key matches. */
export async function autoDetectProvider(): Promise<{ provider?: string; model?: string }> {
  const [all, localExtras] = await Promise.all([fetchModelsDev(), loadLocalExtras()])
  // Local extras override models.dev so licensed proxy catalog wins on name clash.
  const merged = { ...all, ...localExtras }

  const makeResult = (id: string, md: ModelsDevProvider) => ({
    provider: id,
    model: md.models ? Object.keys(md.models)[0] : undefined,
  })

  // Priority 0: licensed Arcana Proxy. providers.arcana.json used to attach
  // ARCANA_PROXY_KEY to cloudflare-* aliases; without this gate auto-detect
  // picked cloudflare-workers-ai and then models.dev resolved a raw CF URL.
  if (process.env.ARCANA_PROXY_KEY?.trim()) {
    const proxy = localExtras["arcana-proxy"] ?? merged["arcana-proxy"]
    if (proxy) return makeResult("arcana-proxy", proxy)
    return { provider: "arcana-proxy", model: undefined }
  }

  // Priority 1: *_BASE_URL signals explicit user intent. ANTHROPIC_BASE_URL
  // → anthropic regardless of what other env keys happen to be set.
  for (const [id, md] of Object.entries(merged)) {
    for (const [envKey, envVal] of Object.entries(process.env)) {
      if (!envKey.endsWith("_BASE_URL") || !envVal) continue
      const prefix = envKey.replace(/_BASE_URL$/i, "").toLowerCase()
      // Exact match first (ANTHROPIC_BASE_URL → anthropic), then prefix
      // match for aliased IDs (ANTHROPIC_BASE_URL → anthropic-beta).
      if (id.toLowerCase() === prefix || id.toLowerCase().startsWith(prefix + "-")) return makeResult(id, md)
    }
  }

  // Priority 2: exact env-key match (e.g. ANTHROPIC_API_KEY, OPENAI_API_KEY).
  // Skip cloudflare-workers-ai unless CLOUDFLARE_ACCOUNT_ID is also present —
  // models.dev lists CLOUDFLARE_ACCOUNT_ID first; a lone API key is not enough.
  for (const [id, md] of Object.entries(merged)) {
    for (const envKey of md.env ?? []) {
      if (!process.env[envKey]) continue
      if (id === "cloudflare-workers-ai" || id === "cloudflare-ai-gateway") {
        if (!process.env.CLOUDFLARE_ACCOUNT_ID?.trim()) continue
      }
      return makeResult(id, md)
    }
  }

  return {}
}
