import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { Effect } from "effect"

import { makeCredentialStore, type CredentialStoreConfig } from "@arcana/credential-store"

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

const PROXY_KEY_PATH = join(getArcanaHome(), "proxy_key")
const CREDENTIAL_STORE_CONFIG: CredentialStoreConfig = {
  storePath: join(getArcanaHome(), "credential_store"),
  keyPath: join(getArcanaHome(), "credential_key"),
}

/** Migrate legacy plaintext proxy_key to the encrypted credential store. */
export function migrateLegacyKeyToSecureStore(): void {
  const legacyPath = PROXY_KEY_PATH
  // credential-store's migrateFromLegacy handles the read + write + delete
  // We use the synchronous makeCredentialStore for this
  try {
    const store = makeCredentialStore(CREDENTIAL_STORE_CONFIG)
    store.migrateFromLegacy(legacyPath)
  } catch {
    // non-fatal: if migration fails, keep legacy path working
  }
}

/**
 * Write proxy key via the encrypted credential store instead of plaintext file.
 * Remove global env mirror — keep ARCANA_PROXY_KEY as explicit override only
 * to avoid 97-reader refactor blast radius.
 */
export function writeProxyKey(key: string): void {
  const home = getArcanaHome()
  if (!existsSync(home)) mkdirSync(home, { recursive: true })
  try {
    const store = makeCredentialStore(CREDENTIAL_STORE_CONFIG)
    store.save(key.trim())
  } catch {
    // Fallback: write plaintext proxy_key if secure store fails
    writeFileSync(PROXY_KEY_PATH, key.trim(), "utf8")
  }
  // NO LONGER: process.env.ARCANA_PROXY_KEY = key.trim()
  // ARCANA_PROXY_KEY env override is honored by resolveProxyKey fallback chain only
}

/**
 * Write proxy key to plaintext legacy path (for backward compatibility).
 * Kept for 97-readers that read ~/.arcana/proxy_key directly.
 * Use credential-store.writeProxyKey() for new code.
 */
export function writeProxyKeyLegacy(key: string): void {
  const home = getArcanaHome()
  if (!existsSync(home)) mkdirSync(home, { recursive: true })
  try {
    writeFileSync(PROXY_KEY_PATH, key.trim(), "utf8")
    NodeJS.chmodSync?.(PROXY_KEY_PATH, 0o600)
  } catch {
    // non-fatal
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
