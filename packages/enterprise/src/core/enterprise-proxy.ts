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
 * slash), e.g. https://engine.example.com. Missing or blank fails closed
 * (503). Localhost is used only when NODE_ENV=development or
 * ARCANA_ENGINE_ALLOW_LOCAL=1.
 *
 * Fail closed: if no base URL is resolvable the proxy answers 503 JSON; if
 * the engine is unreachable it answers 502 JSON. It never answers a silent
 * empty 200.
 */

export const ENGINE_BASE_URL_ENV = "ARCANA_ENGINE_BASE_URL"
export const ENGINE_BASE_URL_DEFAULT = "http://localhost:4096"
export const CONSOLE_ORIGIN_ENV = "ARCANA_CONSOLE_ORIGIN"
export const ENGINE_ALLOW_LOCAL_ENV = "ARCANA_ENGINE_ALLOW_LOCAL"

const FORWARD_HEADERS = [
  "authorization",
  "content-type",
  "accept",
  "x-opencode-directory",
  "x-arcana-directory",
  "x-arcana-workspace",
] as const

export function resolveEngineBaseURL(
  env: Record<string, string | undefined> = process.env,
): string {
  const configured = env[ENGINE_BASE_URL_ENV]?.trim()
  if (configured) return configured
  const allowLocal = env[ENGINE_ALLOW_LOCAL_ENV] === "1" || env.NODE_ENV === "development"
  return allowLocal ? ENGINE_BASE_URL_DEFAULT : ""
}

/** Cookie is forwarded only for same-origin (no Origin) or an allowlisted console origin. */
export function shouldForwardCookie(
  origin: string | null,
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (!origin) return true
  const allow = env[CONSOLE_ORIGIN_ENV]?.trim()
  return Boolean(allow && origin === allow)
}

export async function forwardToEngine(
  request: Request,
  baseURL?: string,
  env: Record<string, string | undefined> = process.env,
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
  if (shouldForwardCookie(request.headers.get("origin"), env)) {
    const cookie = request.headers.get("cookie")
    if (cookie) headers.set("cookie", cookie)
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
