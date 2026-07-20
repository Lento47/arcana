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
 */
export const bindAccessToken = (
  accessToken: string,
  email: string | undefined,
  server: string,
): Effect.Effect<BindResult> =>
  Effect.gen(function* () {
    let lastError = "all license servers unreachable"
    for (const base of LICENSE_SERVER_BASES) {
      try {
        const res = yield* Effect.promise(() =>
          fetch(`${base}/api/oauth/bind`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ accessToken, server, email }),
            signal: AbortSignal.timeout(10_000),
          }),
        )
        const text = yield* Effect.promise(() => res.text())
        let json: { ok?: boolean; proxyKey?: string; tier?: string; error?: string } | null = null
        try {
          json = text ? JSON.parse(text) : null
        } catch {
          lastError = `${base} returned non-JSON (HTTP ${res.status})`
          continue
        }
        if (json?.ok && json.proxyKey) {
          return {
            ok: true as const,
            proxyKey: json.proxyKey,
            tier: json.tier ?? "free",
          }
        }
        lastError = json?.error ?? `${base} returned ${res.status}`
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e)
      }
    }
    return { ok: false as const, error: lastError }
  })
