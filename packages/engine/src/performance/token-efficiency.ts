export type ArcanaTokenEfficiencyInput = {
  readonly estimated_tokens?: number
  readonly actual_tokens?: number
  readonly cached_read_tokens?: number
  readonly cached_write_tokens?: number
  readonly uncached_input_tokens?: number
  readonly output_tokens?: number
  readonly reasoning_tokens?: number
  readonly latency_ms?: number
  readonly accepted_outcome?: boolean
}

export type ArcanaTokenEfficiency = {
  readonly actual_tokens: number
  readonly estimate_delta_tokens: number
  readonly cache_hit_ratio: number
  readonly output_ratio: number
  readonly reasoning_ratio: number
  readonly tokens_per_second: number
  readonly accepted_outcome: boolean
  readonly score: number
  readonly notes: readonly string[]
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))
const round = (value: number) => Math.round(value * 1000) / 1000

export function evaluateTokenEfficiency(input: ArcanaTokenEfficiencyInput): ArcanaTokenEfficiency {
  const actual = Math.max(0, input.actual_tokens ?? input.estimated_tokens ?? 0)
  const estimated = Math.max(0, input.estimated_tokens ?? actual)
  const cacheRead = Math.max(0, input.cached_read_tokens ?? 0)
  const cacheWrite = Math.max(0, input.cached_write_tokens ?? 0)
  const uncached = Math.max(0, input.uncached_input_tokens ?? Math.max(0, actual - cacheRead - cacheWrite))
  const output = Math.max(0, input.output_tokens ?? 0)
  const reasoning = Math.max(0, input.reasoning_tokens ?? 0)
  const latency = Math.max(0, input.latency_ms ?? 0)
  const inputTotal = cacheRead + cacheWrite + uncached
  const cacheHitRatio = inputTotal === 0 ? 0 : cacheRead / inputTotal
  const outputRatio = actual === 0 ? 0 : output / actual
  const reasoningRatio = actual === 0 ? 0 : reasoning / actual
  const tokensPerSecond = latency === 0 ? 0 : actual / (latency / 1000)
  const estimateDelta = actual - estimated

  const cacheScore = cacheHitRatio
  const estimateScore = actual === 0 ? 1 : clamp01(1 - Math.abs(estimateDelta) / Math.max(actual, estimated, 1))
  const outputScore = clamp01(1 - outputRatio * 0.5)
  const reasoningScore = clamp01(1 - reasoningRatio * 0.35)
  const outcomeScore = input.accepted_outcome === false ? 0 : 1
  const score = round((cacheScore * 0.25 + estimateScore * 0.25 + outputScore * 0.2 + reasoningScore * 0.15 + outcomeScore * 0.15) * 100)

  const notes = [
    cacheHitRatio < 0.1 && inputTotal > 0 ? "low_cache_reuse" : undefined,
    Math.abs(estimateDelta) > Math.max(100, estimated * 0.15) ? "estimate_actual_drift" : undefined,
    reasoningRatio > 0.35 ? "high_reasoning_pressure" : undefined,
    outputRatio > 0.5 ? "high_visible_output_pressure" : undefined,
    input.accepted_outcome === false ? "tokens_spent_without_accepted_outcome" : undefined,
  ].filter((note): note is string => Boolean(note))

  return {
    actual_tokens: actual,
    estimate_delta_tokens: estimateDelta,
    cache_hit_ratio: round(cacheHitRatio),
    output_ratio: round(outputRatio),
    reasoning_ratio: round(reasoningRatio),
    tokens_per_second: round(tokensPerSecond),
    accepted_outcome: input.accepted_outcome !== false,
    score,
    notes,
  }
}

export type ArcanaCandidateSearchPoint = {
  readonly quality: number
  readonly confidence: number
  readonly token_burn: number
}

export type ArcanaCandidateStopDecision = {
  readonly stop: boolean
  readonly reason: "none" | "max_candidates" | "decisive_winner" | "budget_tight" | "plateau"
}

export function shouldStopCandidateSearch(input: {
  readonly seen: readonly ArcanaCandidateSearchPoint[]
  readonly max_candidates: number
  readonly remaining_budget_tokens: number
  readonly min_quality_lead: number
  readonly min_confidence: number
  readonly marginal_gain_floor: number
}): ArcanaCandidateStopDecision {
  if (input.seen.length === 0) return { stop: false, reason: "none" }
  if (input.seen.length >= input.max_candidates) return { stop: true, reason: "max_candidates" }

  const ranked = [...input.seen].sort((a, b) => b.quality - a.quality)
  const best = ranked[0]
  const second = ranked[1]
  if (!best) return { stop: false, reason: "none" }

  const lead = second ? best.quality - second.quality : best.quality
  const decisiveWinner = best.confidence >= input.min_confidence && lead >= input.min_quality_lead
  if (decisiveWinner) return { stop: true, reason: "decisive_winner" }

  const medianBurn = percentile(input.seen.map((point) => point.token_burn), 50)
  if (input.remaining_budget_tokens < medianBurn) return { stop: true, reason: "budget_tight" }

  const recent = input.seen.slice(-3)
  const marginalGain = recent.length < 2 ? Number.POSITIVE_INFINITY : recent[recent.length - 1]!.quality - recent[0]!.quality
  if (marginalGain < input.marginal_gain_floor) return { stop: true, reason: "plateau" }

  return { stop: false, reason: "none" }
}

function percentile(values: readonly number[], rank: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((rank / 100) * sorted.length) - 1))
  return sorted[index] ?? 0
}
