/**
 * Per-session tool overrides — the state behind the `/tools` dialog.
 *
 * Stored in KV as `tools_override_<sessionID>` → Record<toolId, boolean> where
 * the value is the DESIRED state (true = enabled). Only tools the user has
 * explicitly touched live in the map; everything else follows the agent's
 * default policy. When non-empty, the map is attached to the next prompt as
 * `tools`, which the engine converts into durable session permissions.
 *
 * Explicit `true` is only written when the user re-enables a tool they had
 * disabled (clearing the session-level deny). We never auto-allow anything.
 */

export function toolsOverrideKey(sessionID: string): string {
  return `tools_override_${sessionID}`
}

/** Effective enabled state: explicit override wins, otherwise default on. */
export function toolEnabled(overrides: Record<string, boolean> | undefined, toolId: string): boolean {
  return overrides?.[toolId] ?? true
}

/**
 * Next state for a toggle. Turning an untouched tool off writes `false`;
 * turning it back on writes `true` (so the engine clears the session deny).
 */
export function nextToolState(overrides: Record<string, boolean> | undefined, toolId: string): boolean {
  return !toolEnabled(overrides, toolId)
}

/** The payload map to attach to a prompt — only explicit overrides. */
export function toolsPayload(overrides: Record<string, boolean> | undefined): Record<string, boolean> | undefined {
  if (!overrides) return undefined
  const entries = Object.entries(overrides).filter(([, enabled]) => enabled !== undefined)
  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

/** Count of tools the user has explicitly disabled (for the dialog header). */
export function disabledToolCount(overrides: Record<string, boolean> | undefined): number {
  if (!overrides) return 0
  return Object.values(overrides).filter((enabled) => enabled === false).length
}
