/**
 * Provider identity registry (K10) — durable record of every external
 * provider (skill, MCP server) loaded into agent context, with drift
 * detection against the identity that was previously recorded.
 *
 * Contract: content-derived identity at load time; ANY hash change on a
 * subsequent load ⇒ drift ⇒ trust inheritance stops ⇒ re-approval required.
 * First sight of a provider records its baseline (grant-by-first-use);
 * `approveProvider` re-pins the baseline after an operator has reviewed
 * drifted content.
 *
 * Persistence: one JSON file (default under ~/.config/arcana/), written
 * atomically on every mutation. The file is small (one record per provider)
 * and loads are infrequent — simplicity over throughput.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import {
  computeProviderIdentity,
  detectIdentityDrift,
  type IdentityDrift,
  type ProviderIdentity,
  type ProviderKind,
} from "./supply-chain"

export interface ProviderRecord {
  identity: ProviderIdentity
  first_seen_at: number
  last_seen_at: number
  /** True when the most recent load changed hashes vs the approved baseline. */
  last_load_drifted: boolean
  /** Which hash fields changed on that load. */
  last_drift_fields: string[]
}

export interface ProviderLoadReport {
  identity: ProviderIdentity
  /** Drift against the previously recorded identity. Empty on first sight. */
  drift: IdentityDrift
  /** True when this provider was never seen before (baseline grant). */
  isNew: boolean
  /** Stable registry key: `${kind}:${providerId}`. */
  key: string
}

const REGISTRY_VERSION = 1

interface RegistryFile {
  version: number
  providers: Record<string, ProviderRecord>
}

let cache: Map<string, ProviderRecord> | null = null
let loadedFrom: string | null = null

export function defaultRegistryPath(): string {
  return join(homedir(), ".config", "arcana", "provider-identities.json")
}

export function providerKey(kind: ProviderKind, providerId: string): string {
  return `${kind}:${providerId}`
}

function hydrate(path: string): void {
  if (cache !== null && loadedFrom === path) return
  cache = new Map()
  loadedFrom = path
  if (!existsSync(path)) return
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as RegistryFile
    if (parsed.version !== REGISTRY_VERSION || !parsed.providers) return
    for (const [key, rec] of Object.entries(parsed.providers)) cache.set(key, rec)
  } catch {
    // Corrupt registry ⇒ start empty (fail-open on RECORDS, never on enforcement:
    // an unreadable baseline simply means every load looks like first sight).
    cache = new Map()
  }
}

/** Persist the registry atomically (tmp file + rename). */
export function saveProviderRegistry(path: string = defaultRegistryPath()): void {
  if (cache === null) return
  const file: RegistryFile = { version: REGISTRY_VERSION, providers: Object.fromEntries(cache) }
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.tmp`
  writeFileSync(tmp, JSON.stringify(file, null, 2), "utf8")
  renameSync(tmp, path)
}

export function getProviderRecord(key: string, path: string = defaultRegistryPath()): ProviderRecord | undefined {
  hydrate(path)
  return cache?.get(key)
}

export function allProviderRecords(path: string = defaultRegistryPath()): readonly ProviderRecord[] {
  hydrate(path)
  return [...(cache?.values() ?? [])]
}

/**
 * Record a provider load: compute the content-derived identity, compare it
 * against the previously recorded identity, and update the stored record.
 * Returns the drift report the caller MUST act on (drift ⇒ untrusted until
 * re-approved).
 */
export function recordProviderLoad(
  input: {
    kind: ProviderKind
    providerId: string
    version: string
    manifestJson: string
    schemaDeclarations: string
    description: string
  },
  path: string = defaultRegistryPath(),
): ProviderLoadReport {
  hydrate(path)
  const key = providerKey(input.kind, input.providerId)
  const identity = computeProviderIdentity({
    kind: input.kind,
    providerId: input.providerId,
    version: input.version,
    // NOTE: sourceDir deliberately NOT passed — hashing the directory PATH
    // would make identity move-sensitive. Content hashes only.
    manifestJson: input.manifestJson,
    schemaDeclarations: input.schemaDeclarations,
    description: input.description,
  })
  const now = Date.now()
  const previous = cache!.get(key)
  if (!previous) {
    cache!.set(key, { identity, first_seen_at: now, last_seen_at: now, last_load_drifted: false, last_drift_fields: [] })
    saveProviderRegistry(path)
    return { identity, drift: { drifted: false, changedFields: [] }, isNew: true, key }
  }
  const drift = detectIdentityDrift(previous.identity, identity)
  previous.identity = identity
  previous.last_seen_at = now
  previous.last_load_drifted = drift.drifted
  previous.last_drift_fields = drift.changedFields
  saveProviderRegistry(path)
  return { identity, drift, isNew: false, key }
}

/**
 * Re-pin a provider's approved baseline to its currently recorded identity.
 * Called after an operator reviews drifted content and accepts it. Subsequent
 * identical loads report no drift again.
 */
export function approveProvider(key: string, path: string = defaultRegistryPath()): boolean {
  hydrate(path)
  const rec = cache!.get(key)
  if (!rec) return false
  rec.first_seen_at = Date.now() // approval timestamp proxy
  rec.last_load_drifted = false
  rec.last_drift_fields = []
  saveProviderRegistry(path)
  return true
}

/** Observability: how many tracked providers are currently in drift state. */
export function driftSummary(path: string = defaultRegistryPath()): { total: number; drifted: number; keys: string[] } {
  const all = allProviderRecords(path)
  const map = new Map(all.map((r) => [providerKey(r.identity.kind, r.identity.provider_id), r]))
  const driftedKeys = [...map.entries()].filter(([, r]) => r.last_load_drifted).map(([k]) => k)
  return { total: all.length, drifted: driftedKeys.length, keys: driftedKeys }
}

export * as ProviderRegistry from "./provider-registry"
