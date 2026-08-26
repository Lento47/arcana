import { detectLocalOllama } from "@arcana/core/providers/ollama"
import { buildRequestBody, type PredictorSettings } from "./predict"

const PROXY_BASE_URL = "https://proxy-arcana.otnelhq.com/v1"
const OLLAMA_DEFAULT_MODEL = "qwen2.5:0.5b"

export interface PredictorEndpoint {
  baseURL: string
  apiKey?: string
  model?: string
}

async function readProxyKey(): Promise<string | undefined> {
  try {
    const os = await import("node:os")
    const fs = await import("node:fs/promises")
    const path = await import("node:path")
    const file = path.join(os.homedir(), ".arcana", "proxy_key")
    return (await fs.readFile(file, "utf8")).trim() || undefined
  } catch {
    return undefined
  }
}

/** Resolve an OpenAI-compatible endpoint for the configured source. Throws when unconfigured. */
export async function resolvePredictorEndpoint(
  settings: PredictorSettings,
): Promise<PredictorEndpoint> {
  switch (settings.source) {
    case "ollama": {
      const host = (settings.host ?? "http://localhost:11434").replace(/\/$/, "")
      return { baseURL: `${host}/v1`, model: settings.model ?? OLLAMA_DEFAULT_MODEL }
    }
    case "arcana-proxy": {
      const key =
        process.env.ARCANA_PROXY_KEY?.trim() ||
        process.env.ARCANA_PROXY_KEY_API?.trim() ||
        (await readProxyKey())
      if (!key) {
        throw new Error("arcana-proxy unavailable: set ARCANA_PROXY_KEY or ~/.arcana/proxy_key")
      }
      return { baseURL: PROXY_BASE_URL, apiKey: key, model: settings.model }
    }
    case "custom": {
      if (!settings.base_url) throw new Error("predictor source=custom requires base_url")
      return { baseURL: settings.base_url.replace(/\/$/, ""), apiKey: settings.api_key, model: settings.model }
    }
    case "openrouter": {
      const key =
        process.env.OPENROUTER_API_KEY?.trim() ||
        process.env.ARCHON_OPENROUTER_KEY?.trim() ||
        undefined
      if (!key) {
        throw new Error("openrouter unavailable: set OPENROUTER_API_KEY (or predictor api_key)")
      }
      return { baseURL: "https://openrouter.ai/api/v1", apiKey: key, model: settings.model }
    }
  }
}

const endpointCache = new Map<string, PredictorEndpoint>()

function cacheKey(settings: PredictorSettings): string {
  return [settings.source, settings.host ?? "", settings.base_url ?? "", settings.api_key ?? ""].join("|")
}

export async function resolveCached(settings: PredictorSettings): Promise<PredictorEndpoint> {
  const key = cacheKey(settings)
  let endpoint = endpointCache.get(key)
  if (!endpoint) {
    endpoint = await resolvePredictorEndpoint(settings)
    endpointCache.set(key, endpoint)
  }
  return endpoint
}

export class PredictorUnavailableError extends Error {}

/** One non-streaming chat completion. Returns raw assistant text. */
export async function requestPrediction(
  endpoint: PredictorEndpoint,
  prefix: string,
  maxTokens: number,
  signal?: AbortSignal,
): Promise<string> {
  if (!endpoint.model) throw new PredictorUnavailableError("predictor.model is not configured")
  const url = `${endpoint.baseURL.replace(/\/$/, "")}/chat/completions`
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (endpoint.apiKey) headers.Authorization = `Bearer ${endpoint.apiKey}`

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(buildRequestBody(prefix, endpoint.model, maxTokens)),
    signal,
  })

  if (!response.ok) {
    const body = await response.text().catch(() => "")
    throw new PredictorUnavailableError(`predictor request failed (${response.status}): ${body.slice(0, 200)}`)
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: unknown } }[]
  }
  const content = data.choices?.[0]?.message?.content
  return typeof content === "string" ? content : ""
}

export interface PredictorStatus {
  ok: boolean
  reason?: string
}

/** Cheap reachability/config probe — never throws. */
export async function predictorStatus(settings: PredictorSettings): Promise<PredictorStatus> {
  try {
    const endpoint = await resolvePredictorEndpoint(settings)
    if (settings.source === "ollama") {
      const host = (settings.host ?? "http://localhost:11434").replace(/\/$/, "")
      const port = host.replace(/^.*:(\d+).*$/, "$1") || undefined
      const ollama = await detectLocalOllama({ port })
      if (!ollama) return { ok: false, reason: `Ollama not reachable at ${host}` }
      const want = endpoint.model ?? ""
      if (want && !ollama.models.some((m) => m === want || m.startsWith(`${want}:`))) {
        return { ok: false, reason: `Ollama model "${want}" not pulled` }
      }
      return { ok: true }
    }
    if (!endpoint.model) return { ok: false, reason: "prompt.predictor.model is required for this source" }
    return { ok: true }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) }
  }
}
