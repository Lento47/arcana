export * as Token from "./token"

/**
 * Single canonical token estimator for the whole monorepo.
 * Code-aware: punctuation/structural characters are counted at ~2 chars per
 * token, regular text at ~4 (mirrors how BPE tokenizes source-heavy agent
 * traffic). Every budget/decision site must estimate through this function —
 * previously a flat chars/4 variant and this one diverged between trigger and
 * planner, causing over/under-truncation on code-heavy sessions.
 */
const CODE_CHARS = /[{}[\]();:|<>]/g

export const estimate = (input: string): number => {
  if (!input) return 0
  const codeChars = (input.match(CODE_CHARS) ?? []).length
  const regularChars = input.length - codeChars
  return Math.ceil(regularChars / 4) + Math.ceil(codeChars / 2)
}

const SIGNAL_RE = /(Error|FAIL|failed|exception|TODO|FIXME|panic|fatal)/i

export function importance(input: string, opts: { recency?: number; relevance?: number } = {}): number {
  const recency = opts.recency ?? 0.5
  const relevance = opts.relevance ?? 0.3
  const hasSignal = SIGNAL_RE.test(input) ? 1 : 0.5
  const isCodeHeader = /^(import|export|class|function|const|interface|type)\b/m.test(input) ? 0.8 : 0.2
  return recency * 0.4 + relevance * 0.3 + hasSignal * 0.2 + isCodeHeader * 0.1
}

export function causalImportance(input: string, answerDelta: number): number {
  return answerDelta > 0.1 ? 1 : importance(input)
}

export function overlap(a: string, b: string): number {
  const setA = new Set(a.slice(0, 2000).split(/\s+/))
  const setB = new Set(b.slice(0, 2000).split(/\s+/))
  let inter = 0
  for (const w of setA) if (setB.has(w)) inter++
  return inter / Math.max(1, setA.size)
}

export function mutualInfo(context: string, packed: string): number {
  const ctxTokens = estimate(context)
  const packedTokens = estimate(packed)
  if (ctxTokens === 0) return 0
  return packedTokens / ctxTokens
}
