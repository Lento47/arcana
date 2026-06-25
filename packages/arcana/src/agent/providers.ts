// Provider resolution for arcana `run` — driven by shared models.dev cache.
// AI SDK handles baseURLs for known providers. Only need env var + default model.
//
// Unified with opencode: both read ~/.cache/arcana/models-dev.json (same cache file).
// No more split-brain on provider data.

import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fetchModelsDev, type ModelsDevProvider } from "./models-dev.js"

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

const LOCAL_EXTRAS_PATH = join(import.meta.dir, "../..", "providers.opencode.json")
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
  const md = all[alias] ?? localExtras[provider]

  if (!md) throw new Error(`Unknown provider "${provider}". Check models.dev or providers.opencode.json.`)

  const envKey = md.env?.[0]
  const defaultModel = md.models ? Object.keys(md.models)[0] : undefined
  return { baseURL: md.api, envKey, defaultModel }
}

/** Auto-detect which provider is configured via env vars. Reads models.dev to
  * find providers whose env key or BASE_URL is set. Priority: *_BASE_URL first
  * (explicit user intent), then exact env key matches. No hardcoded names. */
export async function autoDetectProvider(): Promise<{ provider?: string; model?: string }> {
  const [all, localExtras] = await Promise.all([fetchModelsDev(), loadLocalExtras()])
  const merged = { ...all, ...localExtras }

  const makeResult = (id: string, md: ModelsDevProvider) => ({
    provider: id,
    model: md.models ? Object.keys(md.models)[0] : undefined,
  })

  // Priority 1: *_BASE_URL signals explicit user intent. ANTHROPIC_BASE_URL
  // → anthropic regardless of what other env keys happen to be set.
  for (const [id, md] of Object.entries(merged)) {
    for (const [envKey, envVal] of Object.entries(process.env)) {
      if (!envKey.endsWith("_BASE_URL") || !envVal) continue
      const prefix = envKey.replace(/_BASE_URL$/i, "").toLowerCase()
      if (id.toLowerCase().startsWith(prefix)) return makeResult(id, md)
    }
  }

  // Priority 2: exact env-key match (e.g. ANTHROPIC_API_KEY, OPENAI_API_KEY).
  for (const [id, md] of Object.entries(merged)) {
    for (const envKey of md.env ?? []) {
      if (process.env[envKey]) return makeResult(id, md)
    }
  }

  return {}
}
