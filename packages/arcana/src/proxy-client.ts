import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { getArcanaHome } from "./config.js"
import { makeCredentialStore, type CredentialStoreConfig } from "./credential-store"

/** Prefer working origins first. proxy-arcana.otnelhq.com is the canonical AI Gateway API. */
export const PROXY_BASES = [
  process.env.ARCANA_PROXY_URL?.replace(/\/$/, ""),
  "https://proxy-arcana.otnelhq.com",
  "https://arcana-proxy.lejzerv.workers.dev",
].filter(Boolean) as string[]

function credentialStoreConfig(): CredentialStoreConfig {
  return {
    storePath: join(getArcanaHome(), "credential_store"),
    keyPath: join(getArcanaHome(), "credential_key"),
  }
}

export async function resolveProxyKey(): Promise<string | null> {
  // Explicit environment configuration overrides persisted credentials.
  if (process.env.ARCANA_PROXY_KEY?.trim()) return process.env.ARCANA_PROXY_KEY.trim()

  // Prefer the encrypted portable store. File modes are enforced where the
  // host filesystem supports them; OS keychain integration is separate work.
  try {
    const store = makeCredentialStore(credentialStoreConfig())
    const stored = store.load()
    if (stored) return stored
  } catch {
    // non-fatal: fall through to legacy stores
  }

  // 2. Fall back to legacy proxy_key file
  try {
    const keyPath = join(getArcanaHome(), "proxy_key")
    if (existsSync(keyPath)) {
      const key = readFileSync(keyPath, "utf8").trim()
      if (key) {
        return key
      }
    }
  } catch {}

  return null
}

export type ProxyFetchResult = {
  ok: boolean
  status: number
  data: any
  base: string
}

export async function proxyFetch(
  path: string,
  opts: { method?: string; body?: unknown; timeoutMs?: number } = {},
): Promise<ProxyFetchResult> {
  const key = await resolveProxyKey()
  if (!key) {
    return { ok: false, status: 0, data: { error: "no_proxy_key" }, base: "" }
  }
  let last: ProxyFetchResult = {
    ok: false,
    status: 0,
    data: { error: "unreachable" },
    base: PROXY_BASES[0] ?? "",
  }
  const timeoutMs = opts.timeoutMs ?? 12_000
  for (const base of PROXY_BASES) {
    try {
      const res = await fetch(`${base}${path.startsWith("/") ? path : `/${path}`}`, {
        method: opts.method ?? "GET",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      })
      const text = await res.text()
      let data: any = {}
      try {
        data = text ? JSON.parse(text) : {}
      } catch {
        data = { raw: text.slice(0, 200) }
      }
      last = { ok: res.ok, status: res.status, data, base }
      if (res.status === 401 || res.status === 403) return last
      if (res.ok || res.status < 500) return last
    } catch (e) {
      last = {
        ok: false,
        status: 0,
        data: { error: "network", message: String(e) },
        base,
      }
    }
  }
  return last
}

export type AccountSnapshot = {
  licensed: boolean
  proxyBase?: string
  userId?: string
  tier?: string
  credits?: number
  dollars?: string
  usage?: Record<string, unknown>
  profile?: Record<string, unknown>
  error?: string
}

/** Live licensed-account snapshot from Arcana Proxy (health + balance + usage + profile). */
export async function fetchAccountSnapshot(): Promise<AccountSnapshot> {
  const key = await resolveProxyKey()
  if (!key) {
    return {
      licensed: false,
      error: "No proxy key. Run `arcana console login` or set ARCANA_PROXY_KEY / ~/.arcana/proxy_key.",
    }
  }

  const [health, balance, usage, profile] = await Promise.all([
    proxyFetch("/v1/health"),
    proxyFetch("/v1/balance"),
    proxyFetch("/v1/usage"),
    proxyFetch("/v1/profile"),
  ])

  if (!health.ok && !balance.ok) {
    return {
      licensed: false,
      proxyBase: health.base || balance.base,
      error:
        health.data?.message
        || health.data?.error
        || balance.data?.error
        || `Proxy unreachable (health ${health.status}, balance ${balance.status})`,
    }
  }

  const h = health.ok ? health.data : {}
  const b = balance.ok ? balance.data : {}
  const u = usage.ok ? usage.data : undefined
  const p = profile.ok ? profile.data : undefined

  return {
    licensed: true,
    proxyBase: health.base || balance.base,
    userId: String(h.user ?? b.userId ?? "unknown"),
    tier: String(h.tier ?? "unknown"),
    credits: typeof b.credits === "number" ? b.credits : Number(b.credits ?? NaN),
    dollars: typeof b.dollars === "string" ? b.dollars : b.dollars != null ? String(b.dollars) : undefined,
    usage: u && typeof u === "object" ? u : undefined,
    profile: p && typeof p === "object" ? p : undefined,
  }
}

/** Compact markdown for system prompt or tool output. */
export function formatAccountSnapshot(snap: AccountSnapshot): string {
  if (!snap.licensed) {
    return [
      "## Arcana account",
      "Status: not licensed / proxy key missing",
      snap.error ? `Detail: ${snap.error}` : "",
      "Fix: `arcana console login` then retry.",
    ]
      .filter(Boolean)
      .join("\n")
  }

  const lines = [
    "## Arcana account (live from proxy)",
    `User / subject: ${snap.userId}`,
    `Tier: ${snap.tier}`,
    `Credits: ${Number.isFinite(snap.credits) ? Math.round(snap.credits!) : "—"}` +
      (snap.dollars != null ? ` ($${snap.dollars})` : ""),
    snap.proxyBase ? `Proxy: ${snap.proxyBase}` : "",
  ]

  if (snap.usage) {
    const req = snap.usage.requests ?? snap.usage.count
    const limit = snap.usage.limit
    if (req != null || limit != null) {
      lines.push(`Usage today: ${req ?? "—"}` + (limit != null ? ` / ${limit}` : ""))
    }
  }

  if (snap.profile && (snap.profile as any).displayName) {
    lines.push(`Display name: ${(snap.profile as any).displayName}`)
  }

  lines.push(
    "",
    "This is the licensed Arcana Proxy account for this machine (from ~/.arcana/proxy_key).",
    "Local memory facts are separate — do not confuse site/login identity with unstored chat memory.",
  )
  return lines.filter((l) => l !== undefined).join("\n")
}

/** Free-tier usage snapshot. Returned by `GET /v1/free/usage` on Arcana Proxy.
 * Shape is whatever the proxy writes — we only assert the fields we consume. */
export type FreeUsageSnapshot = {
  state?: "eligible" | "active" | "expired" | "licensed"
  freeSessionId?: string
  activatedAt?: string
  expiresAt?: string
  resetAt?: string
  used?: number
  remaining?: number
  limit?: number
  tokensUsed?: number
  tokensLimit?: number
  tokensRemaining?: number
}

/** Live free-tier usage snapshot from Arcana Proxy. Returns `null` on any
 * failure (no key, network down, non-free tier, etc.) — callers should
 * treat `null` as "no free-usage display this turn". */
export async function fetchFreeUsage(): Promise<FreeUsageSnapshot | null> {
  const res = await proxyFetch("/v1/free/usage")
  if (!res.ok || !res.data || typeof res.data !== "object") return null
  return res.data as FreeUsageSnapshot
}

/** Format minutes remaining from a free-usage snapshot for display. */
export function formatFreeUsageRemaining(snap: FreeUsageSnapshot | null | undefined): string | undefined {
  if (!snap) return undefined
  if (snap.state === "licensed" || snap.state === "eligible") return undefined
  if (!snap.expiresAt) return undefined
  const expiresMs = Date.parse(snap.expiresAt)
  if (!Number.isFinite(expiresMs)) return undefined
  const minsLeft = Math.max(0, Math.round((expiresMs - Date.now()) / 60_000))
  if (minsLeft <= 0) return undefined
  return `${minsLeft}m of 60m`
}
