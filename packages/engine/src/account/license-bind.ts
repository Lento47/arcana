import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { Effect } from "effect"

import { makeCredentialStore, type CredentialStoreConfig } from "arcana-ai/credential-store"

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
  "https://api-arcana.otnelhq.com",
  "https://arcana-license-server.lejzerv.workers.dev",
] as const

/** Resolve ~/.arcana — overridable for tests. */
export function getArcanaHome(): string {
  return process.env.ARCANA_HOME ?? join(homedir(), ".arcana")
}

function proxyKeyPath(): string {
  return join(getArcanaHome(), "proxy_key")
}

function licenseCachePath(): string {
  return join(getArcanaHome(), ".license-cache.json")
}

function credentialStoreConfig(): CredentialStoreConfig {
  return {
    storePath: join(getArcanaHome(), "credential_store"),
    keyPath: join(getArcanaHome(), "credential_key"),
  }
}

export function readProxyKey(): string | null {
  const override = process.env.ARCANA_PROXY_KEY?.trim()
  if (override) return override
  try {
    const stored = makeCredentialStore(credentialStoreConfig()).load()?.trim()
    if (stored) return stored
  } catch {
    // Fall through to the legacy read path during migration.
  }
  try {
    const legacyPath = proxyKeyPath()
    if (!existsSync(legacyPath)) return null
    return readFileSync(legacyPath, "utf8").trim() || null
  } catch {
    return null
  }
}

export function proxyKeyPresent(): boolean {
  return readProxyKey() !== null
}

/** Migrate legacy plaintext proxy_key to the encrypted credential store. */
export function migrateLegacyKeyToSecureStore(): void {
  const legacyPath = proxyKeyPath()
  // credential-store's migrateFromLegacy handles the read + write + delete
  // We use the synchronous makeCredentialStore for this
  try {
    const store = makeCredentialStore(credentialStoreConfig())
    store.migrateFromLegacy(legacyPath)
  } catch {
    // non-fatal: if migration fails, keep legacy path working
  }
}

/**
 * Write proxy key via the encrypted credential store instead of plaintext file.
 * Existing provider readers use the process environment, so the in-memory
 * mirror is updated only after durable storage succeeds.
 */
export function writeProxyKey(key: string): void {
  const value = key.trim()
  if (!value) throw new Error("Proxy key cannot be empty")
  const home = getArcanaHome()
  if (!existsSync(home)) mkdirSync(home, { recursive: true })
  const store = makeCredentialStore(credentialStoreConfig())
  store.save(value)
  // Existing provider readers consume the process-local environment. Persist
  // securely first, then update memory so a failed save never grants a
  // non-durable credential to the running engine.
  process.env.ARCANA_PROXY_KEY = value
}

export function writeLicenseCache(data: { tier: string; [k: string]: unknown }, ttlMs = 86_400_000): void {
  try {
    const cachePath = licenseCachePath()
    mkdirSync(dirname(cachePath), { recursive: true })
    writeFileSync(
      cachePath,
      JSON.stringify({ data, expiresAt: Date.now() + ttlMs }),
      { encoding: "utf8", mode: 0o600 },
    )
    chmodSync(cachePath, 0o600)
  } catch {
    // Cache is best-effort; the persisted proxy credential is authoritative.
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
