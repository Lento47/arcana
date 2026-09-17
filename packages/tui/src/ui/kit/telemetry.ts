import { contextTokenCount, type ContextTokenUsage } from "../../util/context-pressure"

/**
 * Per-turn context sizes for the header's burn sparkline: assistant turns
 * only, oldest → newest, zero/unknown turns dropped so a tool-only or failed
 * turn cannot paint a false trough. `limit` keeps the newest turns.
 */
export function burnSeries(
  messages: readonly { role?: string; tokens?: ContextTokenUsage }[],
  limit = 12,
): number[] {
  const out: number[] = []
  for (const message of messages) {
    if (message?.role !== "assistant" || !message.tokens) continue
    const count = contextTokenCount(message.tokens)
    if (!Number.isFinite(count) || count <= 0) continue
    out.push(count)
  }
  return limit > 0 ? out.slice(-limit) : out
}
