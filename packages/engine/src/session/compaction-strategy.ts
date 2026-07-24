/**
 * Graduated severity for opportunistic pruning / budget plans.
 * Aligned with P0 proactive threshold (85%): level ≥ 2 means "at or past
 * the default auto-compact band".
 *
 * | Level | Approx usage | Intent |
 * |-------|--------------|--------|
 * | 0 | &lt; 60% | Healthy — keep everything |
 * | 1 | 60–85% | Soft prune tool dumps |
 * | 2 | 85–95% | Proactive compact band (default trigger) |
 * | 3 | 95–99% | Aggressive keep-last-N + summarize |
 * | 4 | ≥ 99% | Emergency shrink |
 */

export type CompactionLevel = 0 | 1 | 2 | 3 | 4

/** Ratio at which proactive auto-compact fires (matches overflow DEFAULT_THRESHOLD_PERCENT). */
export const PROACTIVE_COMPACT_RATIO = 0.85

export interface CompactionPlan {
  level: CompactionLevel
  keepSystemMessages: boolean
  keepUserMessages: boolean
  keepToolResults: boolean
  keepErrorMessages: boolean
  summarizeAssistantMessages: boolean
  summarizeToolOutputs: boolean
  dropToolOutputsOverChars: number
  keepLastNMessages: number
}

export function determineLevel(contextUsedTokens: number, contextLimit: number): CompactionLevel {
  if (!(contextLimit > 0)) return 0
  const ratio = contextUsedTokens / contextLimit
  if (ratio < 0.6) return 0
  if (ratio < PROACTIVE_COMPACT_RATIO) return 1
  if (ratio < 0.95) return 2
  if (ratio < 0.99) return 3
  return 4
}

/** True when usage is in the proactive auto-compact band or higher. */
export function isProactiveCompactBand(contextUsedTokens: number, contextLimit: number): boolean {
  return determineLevel(contextUsedTokens, contextLimit) >= 2
}

export function getPlan(level: CompactionLevel): CompactionPlan {
  switch (level) {
    case 0: return { level, keepSystemMessages: true, keepUserMessages: true, keepToolResults: true, keepErrorMessages: true, summarizeAssistantMessages: false, summarizeToolOutputs: false, dropToolOutputsOverChars: Infinity, keepLastNMessages: Infinity }
    case 1: return { level, keepSystemMessages: true, keepUserMessages: true, keepToolResults: false, keepErrorMessages: true, summarizeAssistantMessages: false, summarizeToolOutputs: false, dropToolOutputsOverChars: 2000, keepLastNMessages: Infinity }
    case 2: return { level, keepSystemMessages: true, keepUserMessages: true, keepToolResults: false, keepErrorMessages: true, summarizeAssistantMessages: false, summarizeToolOutputs: true, dropToolOutputsOverChars: 1000, keepLastNMessages: Infinity }
    case 3: return { level, keepSystemMessages: true, keepUserMessages: false, keepToolResults: false, keepErrorMessages: true, summarizeAssistantMessages: true, summarizeToolOutputs: true, dropToolOutputsOverChars: 500, keepLastNMessages: 50 }
    case 4: return { level, keepSystemMessages: true, keepUserMessages: false, keepToolResults: false, keepErrorMessages: true, summarizeAssistantMessages: true, summarizeToolOutputs: true, dropToolOutputsOverChars: 200, keepLastNMessages: 20 }
  }
}

export function dropLargeOutputs(messages: any[], maxChars: number): any[] {
  return messages.map((msg: any) => {
    if (msg.role === "tool" && typeof msg.content === "string" && msg.content.length > maxChars) {
      return { ...msg, content: msg.content.slice(0, maxChars) + "\n... [truncated]" }
    }
    return msg
  })
}
