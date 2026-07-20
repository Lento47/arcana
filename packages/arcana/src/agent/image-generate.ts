/**
 * Image generation via Arcana Proxy (`POST /v1/images/generations`).
 * Saves results under ~/.arcana/artifacts/images/.
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { getArcanaHome } from "../config.js"
import { proxyFetch } from "../proxy-client.js"

export type ImageGenerateInput = {
  prompt: string
  model?: string
  /** Named (landscape|portrait|square) or explicit ratio (16:9, 1:1, …) */
  aspect_ratio?: string
  n?: number
  size?: string
  quality?: string
}

export type SavedImage = {
  path: string
  media_type?: string
  revised_prompt?: string
  url?: string
}

export type ImageGenerateResult = {
  ok: boolean
  model?: string
  provider?: string
  images: SavedImage[]
  usage?: Record<string, unknown>
  error?: string
  message?: string
  credits?: number
}

const ASPECT_ALIASES: Record<string, string> = {
  landscape: "16:9",
  portrait: "9:16",
  square: "1:1",
  wide: "16:9",
  tall: "9:16",
}

export function normalizeAspectRatio(raw?: string): string | undefined {
  if (!raw) return undefined
  const t = raw.trim()
  if (!t) return undefined
  return ASPECT_ALIASES[t.toLowerCase()] ?? t
}

function mediaExt(mediaType?: string): string {
  if (!mediaType) return "png"
  if (mediaType.includes("jpeg") || mediaType.includes("jpg")) return "jpg"
  if (mediaType.includes("webp")) return "webp"
  if (mediaType.includes("svg")) return "svg"
  return "png"
}

function slugPrompt(prompt: string): string {
  return prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "image"
}

export function imagesDir(): string {
  return join(getArcanaHome(), "artifacts", "images")
}

export function saveB64Image(
  b64: string,
  opts: { media_type?: string; index?: number; prompt?: string } = {},
): string {
  const dir = imagesDir()
  mkdirSync(dir, { recursive: true })
  const ext = mediaExt(opts.media_type)
  const ts = new Date().toISOString().replace(/[:.]/g, "-")
  const slug = slugPrompt(opts.prompt ?? "image")
  const idx = opts.index != null ? `-${opts.index + 1}` : ""
  const path = join(dir, `${ts}${idx}-${slug}.${ext}`)
  // Strip data-URL prefix if present
  const pure = b64.includes(",") ? b64.slice(b64.indexOf(",") + 1) : b64
  writeFileSync(path, Buffer.from(pure, "base64"))
  return path
}

async function downloadToFile(url: string, opts: { index?: number; prompt?: string } = {}): Promise<string> {
  const dir = imagesDir()
  mkdirSync(dir, { recursive: true })
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) })
  if (!res.ok) throw new Error(`download failed: ${res.status}`)
  const ct = res.headers.get("content-type") ?? "image/png"
  const ext = mediaExt(ct)
  const ts = new Date().toISOString().replace(/[:.]/g, "-")
  const slug = slugPrompt(opts.prompt ?? "image")
  const idx = opts.index != null ? `-${opts.index + 1}` : ""
  const path = join(dir, `${ts}${idx}-${slug}.${ext}`)
  const buf = Buffer.from(await res.arrayBuffer())
  writeFileSync(path, buf)
  return path
}

/** Call proxy image API and persist images to disk. */
export async function generateAndSaveImages(input: ImageGenerateInput): Promise<ImageGenerateResult> {
  const prompt = String(input.prompt ?? "").trim()
  if (!prompt) return { ok: false, images: [], error: "prompt_required", message: "prompt is required" }

  const body: Record<string, unknown> = {
    prompt,
    model: input.model?.trim() || "openai/gpt-5-image",
    n: Math.min(Math.max(Number(input.n ?? 1) || 1, 1), 4),
    response_format: "b64_json",
  }
  const ar = normalizeAspectRatio(input.aspect_ratio)
  if (ar) body.aspect_ratio = ar
  if (input.size) body.size = input.size
  if (input.quality) body.quality = input.quality

  const res = await proxyFetch("/v1/images/generations", {
    method: "POST",
    body,
    timeoutMs: 150_000,
  })

  if (!res.ok) {
    const err = res.data?.error ?? "image_generation_failed"
    const message =
      res.data?.message
      || (typeof res.data?.error === "string" ? res.data.error : undefined)
      || `HTTP ${res.status}`
    return {
      ok: false,
      images: [],
      error: typeof err === "string" ? err : "image_generation_failed",
      message: String(message),
      credits: res.data?.required,
    }
  }

  const items: any[] = Array.isArray(res.data?.data) ? res.data.data : []
  const saved: SavedImage[] = []

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    try {
      if (item?.b64_json) {
        const path = saveB64Image(String(item.b64_json), {
          media_type: item.media_type,
          index: i,
          prompt,
        })
        saved.push({
          path,
          media_type: item.media_type,
          revised_prompt: item.revised_prompt,
          url: item.url,
        })
      } else if (item?.url) {
        const path = await downloadToFile(String(item.url), { index: i, prompt })
        saved.push({
          path,
          media_type: item.media_type,
          revised_prompt: item.revised_prompt,
          url: String(item.url),
        })
      }
    } catch (e) {
      // Keep going; report partial failure below
      saved.push({
        path: "",
        url: item?.url,
        revised_prompt: item?.revised_prompt,
      })
    }
  }

  const okSaved = saved.filter((s) => s.path)
  if (!okSaved.length) {
    return {
      ok: false,
      images: [],
      error: "empty_image_response",
      message: "Proxy returned no savable images",
      model: res.data?.model,
      provider: res.data?.provider,
    }
  }

  return {
    ok: true,
    images: okSaved,
    model: res.data?.model,
    provider: res.data?.provider,
    usage: res.data?.usage && typeof res.data.usage === "object" ? res.data.usage : undefined,
  }
}

/** Human-readable tool result for the agent. */
export function formatImageGenerateResult(result: ImageGenerateResult): string {
  if (!result.ok) {
    const lines = [
      `Image generation failed: ${result.error ?? "unknown"}`,
      result.message ? `Detail: ${result.message}` : "",
      result.error === "insufficient_credits"
        ? "Top up credits or try a free-tier image model if available."
        : result.error === "no_proxy_key" || result.message?.includes("proxy key")
          ? "Run `arcana console login` or set ARCANA_PROXY_KEY."
          : "",
    ]
    return lines.filter(Boolean).join("\n")
  }
  const lines = [
    `Generated ${result.images.length} image(s)`,
    result.model ? `Model: ${result.model}` : "",
    result.provider ? `Provider: ${result.provider}` : "",
    ...result.images.map((img, i) => `  [${i + 1}] ${img.path}`),
    result.usage && typeof (result.usage as any).cost === "number"
      ? `Usage cost: $${(result.usage as any).cost}`
      : "",
    "Open the path(s) above to view. Files live under ~/.arcana/artifacts/images/.",
  ]
  return lines.filter(Boolean).join("\n")
}
