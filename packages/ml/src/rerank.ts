export type RerankCandidate = {
  id: string
  title?: string
  content?: string
  tags?: string[]
  priorScore?: number
  metadata?: Record<string, unknown>
}

export type RerankInput = {
  query: string
  candidates: RerankCandidate[]
  limit?: number
}

export type RerankResult = RerankCandidate & {
  rank: number
  score: number
  reasons: string[]
}

function tokenize(text: string): string[] {
  return [...new Set(text.toLowerCase().match(/[a-z0-9_./-]+/g) ?? [])]
}

function overlapScore(queryTokens: string[], candidateTokens: string[]): number {
  if (!queryTokens.length || !candidateTokens.length) return 0
  const candidateSet = new Set(candidateTokens)
  const hits = queryTokens.filter((token) => candidateSet.has(token)).length
  return hits / queryTokens.length
}

function proximityBoost(query: string, candidate: RerankCandidate): number {
  const haystack = `${candidate.title ?? ""}\n${candidate.content ?? ""}`.toLowerCase()
  const needle = query.trim().toLowerCase()
  if (!needle) return 0
  if (haystack.includes(needle)) return 0.28
  const words = tokenize(needle)
  if (words.length >= 2 && words.every((word) => haystack.includes(word))) return 0.12
  return 0
}

export function rerankCandidates(input: RerankInput): RerankResult[] {
  const queryTokens = tokenize(input.query)
  const scored = input.candidates.map((candidate, index) => {
    const titleTokens = tokenize(candidate.title ?? "")
    const contentTokens = tokenize(candidate.content ?? "")
    const tagTokens = tokenize((candidate.tags ?? []).join(" "))
    const reasons: string[] = []

    const titleScore = overlapScore(queryTokens, titleTokens)
    const contentScore = overlapScore(queryTokens, contentTokens)
    const tagScore = overlapScore(queryTokens, tagTokens)
    const proximity = proximityBoost(input.query, candidate)
    const prior = Math.max(0, Math.min(1, candidate.priorScore ?? 0))

    if (titleScore > 0) reasons.push(`title overlap ${Math.round(titleScore * 100)}%`)
    if (contentScore > 0) reasons.push(`content overlap ${Math.round(contentScore * 100)}%`)
    if (tagScore > 0) reasons.push(`tag overlap ${Math.round(tagScore * 100)}%`)
    if (proximity > 0) reasons.push("exact or near-exact phrase match")
    if (prior > 0) reasons.push(`prior score ${Math.round(prior * 100)}%`)
    if (!reasons.length) reasons.push("no lexical signal matched")

    const raw = titleScore * 0.42 + contentScore * 0.28 + tagScore * 0.18 + proximity + prior * 0.12
    const score = Math.max(0, Math.min(1, Number(raw.toFixed(4))))
    return { ...candidate, rank: index + 1, score, reasons, _index: index }
  })

  return scored
    .sort((a, b) => b.score - a.score || a._index - b._index)
    .slice(0, input.limit ?? scored.length)
    .map(({ _index: _unused, ...result }, rank) => ({ ...result, rank: rank + 1 }))
}
