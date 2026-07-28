export function estimateTokens(text: string): number {
  if (!text) return 0
  const codeChars = (text.match(/[{}[\\]();:|<>]/g) || []).length
  const regularChars = text.length - codeChars
  return Math.ceil(regularChars / 4) + Math.ceil(codeChars / 2)
}

/** Minimal message shape needed for token estimation. */
interface TokenEstimateMessage {
  content: string | Array<string | { text?: string }>
}

export function estimateMessageTokens(msg: TokenEstimateMessage): number {
  let total = 0
  if (typeof msg.content === "string") total += estimateTokens(msg.content)
  if (Array.isArray(msg.content)) for (const part of msg.content) {
    if (typeof part === "string") total += estimateTokens(part)
    else if (part.text) total += estimateTokens(part.text)
  }
  return total
}

export function estimateMessagesTokens(messages: TokenEstimateMessage[]): number {
  return messages.reduce((sum, msg) => sum + estimateMessageTokens(msg), 0)
}

export interface MessageUsage {
  index: number
  role: string
  toolName?: string
  tokens: number
  chars: number
}

/** Message with role for measurement. */
interface MeasuredMessage extends TokenEstimateMessage {
  role: string
  name?: string
  toolName?: string
}

export function measureMessages(messages: MeasuredMessage[]): { total: number; perMessage: MessageUsage[] } {
  const perMessage = messages.map((msg, i) => ({
    index: i,
    role: msg.role || "unknown",
    toolName: msg.toolName || msg.name,
    tokens: estimateTokens(typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content)),
    chars: (typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content)).length,
  }))
  return { total: perMessage.reduce((s, m) => s + m.tokens, 0), perMessage }
}
