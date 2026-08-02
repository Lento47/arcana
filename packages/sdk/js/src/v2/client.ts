export * from "./gen/types.gen.js"
export type { FileSystemEntry as LocationFileSystemEntry } from "./gen/types.gen.js"

import { createClient } from "./gen/client/client.gen.js"
import { type Config } from "./gen/client/types.gen.js"
import { OpencodeClient } from "./gen/sdk.gen.js"
import { wrapClientError } from "../error-interceptor.js"
export { type Config as OpencodeClientConfig, OpencodeClient }
// Arcana-branded aliases
export { OpencodeClient as ArcanaClient, type Config as ArcanaClientConfig }

function pick(value: string | null, fallback?: string, encode?: (value: string) => string) {
  if (!value) return
  if (!fallback) return value
  if (value === fallback) return fallback
  if (encode && value === encode(fallback)) return fallback
  return value
}

function rewrite(request: Request, values: { directory?: string; workspace?: string }) {
  if (request.method !== "GET" && request.method !== "HEAD") return request

  const url = new URL(request.url)
  let changed = false

  for (const [name, legacyName, key] of [
    ["x-arcana-directory", "x-opencode-directory", "directory"],
    ["x-arcana-workspace", "x-opencode-workspace", "workspace"],
  ] as const) {
    const fallback = key === "directory" ? values.directory : values.workspace
    const encode = key === "directory" ? encodeURIComponent : undefined
    const value =
      pick(request.headers.get(name), fallback, encode) ?? pick(request.headers.get(legacyName), fallback, encode)
    if (!value) continue
    for (const query of url.pathname.startsWith("/api/") ? [key, `location[${key}]`] : [key]) {
      if (!url.searchParams.has(query)) {
        url.searchParams.set(query, value)
      }
    }
    changed = true
  }

  if (!changed) return request

  const next = new Request(url, request)
  next.headers.delete("x-arcana-directory")
  next.headers.delete("x-arcana-workspace")
  next.headers.delete("x-opencode-directory")
  next.headers.delete("x-opencode-workspace")
  return next
}

export function createOpencodeClient(
  config?: Config & { directory?: string; experimental_workspaceID?: string; timeoutMs?: number },
) {
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
            existingSignal.addEventListener(
              "abort",
              () => {
                clearTimeout(timer)
                controller.abort(existingSignal.reason)
              },
              { once: true },
            )
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
      "x-arcana-directory": encodeURIComponent(config.directory),
    }
  }

  if (config?.experimental_workspaceID) {
    config.headers = {
      ...config.headers,
      "x-arcana-workspace": config.experimental_workspaceID,
    }
  }

  const client = createClient(config)
  client.interceptors.request.use((request) =>
    rewrite(request, {
      directory: config?.directory,
      workspace: config?.experimental_workspaceID,
    }),
  )
  client.interceptors.response.use((response) => {
    const contentType = response.headers.get("content-type")
    if (contentType === "text/html")
      throw new Error("Request is not supported by this version of Arcana Server (Server responded with text/html)")

    return response
  })
  client.interceptors.error.use(wrapClientError)
  return new OpencodeClient({ client })
}
