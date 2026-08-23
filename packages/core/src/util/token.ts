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
