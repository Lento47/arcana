/**
 * Publish batch activity into the process-local slot that the TUI proof tape reads.
 * Key must match @arcana/core/tool/activity-hint TOOL_ACTIVITY_HINT_KEY.
 */
const TOOL_ACTIVITY_HINT_KEY = "arcana:toolActivityHint"

type Slot = { text: string; expiresAt: number; source?: string }

export function publishBatchActivity(text: string | undefined, ttlMs = 10_000): void {
  const g = globalThis as unknown as Record<string, Slot | undefined>
  if (!text?.trim()) {
    delete g[TOOL_ACTIVITY_HINT_KEY]
    return
  }
  g[TOOL_ACTIVITY_HINT_KEY] = {
    text: text.trim().slice(0, 48),
    expiresAt: Date.now() + Math.max(500, ttlMs),
    source: "batch",
  }
}
