/**
 * Process-local tool activity hint for TUI proof tape / status.
 * Engine admission and agent batch update this; TUI polls getToolActivityHint().
 *
 * Storage is on globalThis under a fixed key so CLI packages that cannot
 * depend on @arcana/core can still publish the same process-local slot.
 */

export type ToolActivityHint = {
  text: string
  /** Unix ms after which the hint is considered stale. */
  expiresAt: number
  source?: "engine" | "batch" | "agent"
}

/** Shared with packages/arcana agent tool-batch activity bridge. */
export const TOOL_ACTIVITY_HINT_KEY = "arcana:toolActivityHint"

const DEFAULT_TTL_MS = 8_000

type GlobalSlot = typeof globalThis & {
  [TOOL_ACTIVITY_HINT_KEY]?: ToolActivityHint
}

function slot(): GlobalSlot {
  return globalThis as GlobalSlot
}

/** Publish a short pending string (e.g. "tools · 2 write" or "wave 1 · 3 read"). */
export function setToolActivityHint(
  text: string | undefined,
  opts: { ttlMs?: number; source?: ToolActivityHint["source"] } = {},
): void {
  const g = slot()
  if (!text?.trim()) {
    delete g[TOOL_ACTIVITY_HINT_KEY]
    return
  }
  const ttl = opts.ttlMs ?? DEFAULT_TTL_MS
  g[TOOL_ACTIVITY_HINT_KEY] = {
    text: text.trim().slice(0, 48),
    expiresAt: Date.now() + Math.max(1, ttl),
    source: opts.source,
  }
}

/** Read current hint if not expired. */
export function getToolActivityHint(): string | undefined {
  const g = slot()
  const current = g[TOOL_ACTIVITY_HINT_KEY]
  if (!current) return undefined
  if (Date.now() > current.expiresAt) {
    delete g[TOOL_ACTIVITY_HINT_KEY]
    return undefined
  }
  return current.text
}

export function clearToolActivityHint(): void {
  delete slot()[TOOL_ACTIVITY_HINT_KEY]
}

/** Test helper. */
export function peekToolActivityHintRaw(): ToolActivityHint | undefined {
  return slot()[TOOL_ACTIVITY_HINT_KEY]
}
