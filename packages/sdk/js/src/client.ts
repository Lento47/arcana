export * from "./gen/types.gen.js"

import { createClient } from "./gen/client/client.gen.js"
import { type Config } from "./gen/client/types.gen.js"
import { OpencodeClient } from "./gen/sdk.gen.js"
import { wrapClientError } from "./error-interceptor.js"
export { type Config as OpencodeClientConfig, OpencodeClient }
// Arcana-branded aliases
export { OpencodeClient as ArcanaClient, type Config as ArcanaClientConfig }

function pick(value: string | null, fallback?: string) {
  if (!value) return
  if (!fallback) return value
  if (value === fallback) return fallback
  if (value === encodeURIComponent(fallback)) return fallback
  return value
}

function rewrite(request: Request, directory?: string) {
  if (request.method !== "GET" && request.method !== "HEAD") return request

  const value = pick(request.headers.get("x-opencode-directory"), directory)
  if (!value) return request

  const url = new URL(request.url)
  if (!url.searchParams.has("directory")) {
    url.searchParams.set("directory", value)
  }

  const next = new Request(url, request)
  next.headers.delete("x-opencode-directory")
  return next
}

export function createOpencodeClient(config?: Config & { directory?: string; timeoutMs?: number }) {
  const timeoutMs = config?.timeoutMs ?? 30_000
  if (!config?.fetch) {
    const customFetch: any = (req: any, init?: any) => {
      const method = (req as any)?.method ?? "GET"
      // Only timeout mutating requests (POST/PATCH/PUT/DELETE).
      // GET/HEAD include SSE streaming and health checks — never time out.
      if (timeoutMs > 0 && method !== "GET" && method !== "HEAD") {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(new Error(`Request timed out after ${timeoutMs}ms`)), timeoutMs)
        const existingSignal: AbortSignal | undefined = init?.signal ?? (req as any)?.signal
        if (existingSignal) {
          if (existingSignal.aborted) {
            clearTimeout(timer)
          } else {
            existingSignal.addEventListener("abort", () => {
              clearTimeout(timer)
              controller.abort(existingSignal.reason)
            }, { once: true })
          }
        }
        return fetch(req, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer))
      }
      // @ts-ignore
      req.timeout = false
      return fetch(req, init)
    }
    config = {
      ...config,
      fetch: customFetch,
    }
  }

  if (config?.directory) {
    config.headers = {
      ...config.headers,
      "x-opencode-directory": encodeURIComponent(config.directory),
    }
  }

  const client = createClient(config)
  client.interceptors.request.use((request) => rewrite(request, config?.directory))
  client.interceptors.error.use(wrapClientError)
  return new OpencodeClient({ client })
}
