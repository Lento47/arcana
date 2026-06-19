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
