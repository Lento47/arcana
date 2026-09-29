export * as Token from "./token"

/**
 * Single canonical token estimator for the whole monorepo.
 * Code-aware: punctuation/structural characters are counted at ~2 chars per
 * token, regular text at ~4 (mirrors how BPE tokenizes source-heavy agent
 * traffic). Every budget/decision site must estimate through this function —
 * previously a flat chars/4 variant and this one diverged between trigger and
 * planner, causing over/under-truncation on code-heavy sessions.
 *
 * Script-aware floor: CJK code points tokenize at ~1 token each (they are
 * carried whole in BPE vocabularies), emoji at 2+. Without the floor a
 * CJK-heavy payload was estimated at chars/4 — roughly 4x low — and context
 * compaction kept far more than intended. The floor can only raise an
 * estimate, never lower one, so it cannot cause context overflow.
 */
const CODE_CHARS = /[{}[\]();:|<>]/g
const CJK_CHARS = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu
const EMOJI_CHARS = /\p{Extended_Pictographic}/gu

export const estimate = (input: string): number => {
  if (!input) return 0
  const codeChars = (input.match(CODE_CHARS) ?? []).length
  const cjkChars = (input.match(CJK_CHARS) ?? []).length
  const emojiChars = (input.match(EMOJI_CHARS) ?? []).length
  const regularChars = Math.max(0, input.length - codeChars - cjkChars - emojiChars)
  return Math.ceil(regularChars / 4) + Math.ceil(codeChars / 2) + cjkChars + emojiChars * 2
}

/**
 * Token shape shared by assistant-message usage across engine, TUI, cockpit,
 * and ACP surfaces. `total` is the provider-reported inclusive total when the
 * provider supplies one; the remaining fields are non-overlapping buckets:
 * `input` is uncached input only, `output` is visible output only.
 */
export type ContextTokens = {
  total?: number
  input?: number
  output?: number
  reasoning?: number
  cache?: { read?: number; write?: number }
}

/** Sum of the non-overlapping context buckets (inclusive input + inclusive output). */
export function contextSum(tokens: ContextTokens): number {
  return (
    (tokens.input ?? 0) +
    (tokens.output ?? 0) +
    (tokens.reasoning ?? 0) +
    (tokens.cache?.read ?? 0) +
    (tokens.cache?.write ?? 0)
  )
}

/**
 * Canonical context-occupied count for every surface and every compaction
 * decision. Safety-first: the provider `total` is trusted only when it covers
 * the component sum. A `total` of 0, a stale proxy total, or a provider that
 * omits cache/reasoning from its total must never under-read context, because
 * under-reading skips compaction and overflows the model window. Over-reading
 * only compacts earlier, which is the safe direction.
 */
export function contextCount(tokens: ContextTokens): number {
  const sum = contextSum(tokens)
  const total = tokens.total
  if (total != null && Number.isFinite(total) && total > sum) return total
  return sum
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
