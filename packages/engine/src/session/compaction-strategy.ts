export type CompactionLevel = 0 | 1 | 2 | 3 | 4

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
  const ratio = contextUsedTokens / contextLimit
  if (ratio < 0.6) return 0
  if (ratio < 0.8) return 1
  if (ratio < 0.95) return 2
  if (ratio < 0.99) return 3
  return 4
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
