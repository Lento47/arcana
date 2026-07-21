import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { Effect } from "effect"

/**
 * Arcana license-server hosts. Order matters: try the primary (`*.otnelhq.com`)
 * first, fall back to the Workers.dev deployment. The license server signs
 * responses with Ed25519; see L:\PROJECTS\arcana-license-server\src\index.ts.
 *
 * Per the repo-URL policy memory, `*.otnelhq.com` is the canonical site, but it
 * is unreachable from the build sandbox; callers MUST fall back to the
 * Workers.dev URL when the primary fails.
 */
const LICENSE_SERVER_BASES = [
  "https://api.arcana.otnelhq.com",
  "https://arcana-license-server.lejzerv.workers.dev",
] as const

/** Resolve ~/.arcana — overridable for tests. */
export function getArcanaHome(): string {
  return process.env.ARCANA_HOME ?? join(homedir(), ".arcana")
}

const PROXY_KEY_PATH = join(getArcanaHome(), "proxy_key")
const LICENSE_CACHE_PATH = join(getArcanaHome(), ".license-cache.json")

export function proxyKeyPresent(): boolean {
  if (process.env.ARCANA_PROXY_KEY?.trim()) return true
  return existsSync(PROXY_KEY_PATH) && readFileSync(PROXY_KEY_PATH, "utf8").trim().length > 0
}

export function writeProxyKey(key: string): void {
  const home = getArcanaHome()
  if (!existsSync(home)) mkdirSync(home, { recursive: true })
  writeFileSync(PROXY_KEY_PATH, key.trim(), "utf8")
  process.env.ARCANA_PROXY_KEY = key.trim()
}

export function writeLicenseCache(data: { tier: string; [k: string]: unknown }, ttlMs = 86_400_000): void {
  try {
    mkdirSync(dirname(LICENSE_CACHE_PATH), { recursive: true })
    writeFileSync(
      LICENSE_CACHE_PATH,
      JSON.stringify({ data, expiresAt: Date.now() + ttlMs }),
      "utf8",
    )
  } catch {
    // Cache is best-effort; the proxy_key is the source of truth.
  }
}

/** Outcome of a license-server OAuth bind call. */
export type BindResult =
  | { ok: true; proxyKey: string; tier: string }
  | { ok: false; error: string }

/**
 * Bind an Arcana console OAuth access_token to a fresh license on the
 * license-server Worker. Returns the proxy_key the engine should write
 * to `~/.arcana/proxy_key`. Falls through both license-server bases.
 *
 * The returned `error` is intentionally generic — never include the
 * upstream URL, HTTP status, or fetch error message, since the TUI
 * surfaces it to the user. Full cause is logged server-side.
 */
export const bindAccessToken = (
  accessToken: string,
  email: string | undefined,
  server: string,
): Effect.Effect<BindResult> =>
  Effect.gen(function* () {
    for (const base of LICENSE_SERVER_BASES) {
      // tryPromise converts fetch rejections into typed failures so the
      // Effect.gen catch below sees them. Effect.promise would die, which
      // surfaces upstream wording through the error middleware.
      const result = yield* Effect.tryPromise(() =>
        (async () => {
          const res = await fetch(`${base}/api/oauth/bind`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ accessToken, server, email }),
            signal: AbortSignal.timeout(10_000),
          })
          const text = await res.text()
          let json: { ok?: boolean; proxyKey?: string; tier?: string; error?: string } | null = null
          try {
            json = text ? JSON.parse(text) : null
          } catch {
            return null
          }
          return { status: res.status, json }
        })(),
      ).pipe(
        Effect.tapError((e) =>
          // Network errors (DNS, connection refused, timeout) — log so the
          // operator can see which base failed and why, without leaking
          // the detail to the TUI.
          Effect.logWarning("oauth-bind: network error", {
            base,
            error: e instanceof Error ? e.message : String(e),
          }),
        ),
        Effect.catch(() => Effect.succeed(null)),
      )
      if (!result) continue
      yield* Effect.logDebug("oauth-bind: response", { base, status: result.status, error: result.json?.error })
      if (result.json?.ok && result.json.proxyKey) {
        return {
          ok: true as const,
          proxyKey: result.json.proxyKey,
          tier: result.json.tier ?? "free",
        }
      }
    }
    return { ok: false as const, error: "Couldn't finish setting up your free account. Please try again." }
  })
