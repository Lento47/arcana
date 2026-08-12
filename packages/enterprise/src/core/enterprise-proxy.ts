/**
 * Enterprise console API proxy.
 *
 * The console (SolidStart app) renders escalation/auditor screens that fetch
 * `/api/enterprise/*` from the engine. When the console is served standalone
 * (dev server or a separate deploy) those requests must be forwarded to the
 * engine's HTTP API. This module implements the forwarding: method, selected
 * headers, and query string are preserved, and the engine's response
 * (including its body stream) is returned as-is.
 *
 * Env: ARCANA_ENGINE_BASE_URL — origin of the engine HTTP API (no trailing
 * slash), e.g. https://engine.example.com. Default: http://localhost:4096
 * (the engine listener's preferred fallback port when no port is configured;
 * see packages/engine/src/server/server.ts startWithPortFallback).
 *
 * Fail closed: if no base URL is resolvable the proxy answers 503 JSON; if
 * the engine is unreachable it answers 502 JSON. It never answers a silent
 * empty 200.
 */

export const ENGINE_BASE_URL_ENV = "ARCANA_ENGINE_BASE_URL"
export const ENGINE_BASE_URL_DEFAULT = "http://localhost:4096"

const FORWARD_HEADERS = ["authorization", "content-type", "accept"] as const

export function resolveEngineBaseURL(
  env: Record<string, string | undefined> = process.env,
): string {
  const configured = env[ENGINE_BASE_URL_ENV]?.trim()
  return configured ? configured : ENGINE_BASE_URL_DEFAULT
}

export async function forwardToEngine(
  request: Request,
  baseURL?: string,
): Promise<Response> {
  const base = (baseURL ?? "").trim().replace(/\/+$/, "")
  if (!base) {
    return Response.json(
      {
        error: "engine_base_url_not_configured",
        detail: `set ${ENGINE_BASE_URL_ENV} to the engine HTTP origin`,
      },
      { status: 503 },
    )
  }

  const incoming = new URL(request.url)
  const headers = new Headers()
  for (const name of FORWARD_HEADERS) {
    const value = request.headers.get(name)
    if (value) headers.set(name, value)
  }

  const init: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers,
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body
    init.duplex = "half"
  }

  const target = `${base}${incoming.pathname}${incoming.search}`
  try {
    return await fetch(target, init)
  } catch (e) {
    return Response.json(
      {
        error: "engine_unreachable",
        engine: base,
        detail: e instanceof Error ? e.message : String(e),
      },
      { status: 502 },
    )
  }
}
