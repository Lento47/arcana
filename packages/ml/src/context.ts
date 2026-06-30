import { rerankCandidates } from "./rerank.js"
import { estimateTokens } from "./token.js"

export type ContextItemKind =
  | "request"
  | "system"
  | "message"
  | "memory"
  | "tool_output"
  | "file"
  | "summary"
  | "artifact"

export type ContextItem = {
  id: string
  kind: ContextItemKind
  content: string
  title?: string
  tags?: string[]
  priority?: number
  pinned?: boolean
  canSummarize?: boolean
  canDrop?: boolean
  metadata?: Record<string, unknown>
}

export type ContextPlanInput = {
  request: string
  items: ContextItem[]
  maxInputTokens: number
  reservedTokens?: number
  minRelevanceScore?: number
}

export type PlannedContextItem = ContextItem & {
  estimatedTokens: number
  relevanceScore: number
  decision: "include" | "summarize" | "drop"
  reasons: string[]
}

export type ContextPlan = {
  tokenBudget: number
  estimatedIncludedTokens: number
  included: PlannedContextItem[]
  summarize: PlannedContextItem[]
  drop: PlannedContextItem[]
  warnings: string[]
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(4))))
}

function priorityScore(item: ContextItem): number {
  if (item.pinned) return 1
  if (typeof item.priority === "number") return clampScore(item.priority)
  if (item.kind === "request" || item.kind === "system") return 0.95
  if (item.kind === "file" || item.kind === "tool_output") return 0.72
  if (item.kind === "memory") return 0.5
  return 0.4
}

// Per-kind summarization ratios. Tool outputs and memory summaries compress
// more aggressively; files and artifacts keep more detail because they often
// contain code or structured evidence.
function summarizeTokenEstimate(item: PlannedContextItem): number {
  const base = Math.max(32, Math.ceil(item.estimatedTokens * 0.28))
  switch (item.kind) {
    case "tool_output":
    case "memory":
    case "summary":
      return Math.max(24, Math.ceil(item.estimatedTokens * 0.18))
    case "file":
    case "artifact":
      return Math.max(48, Math.ceil(item.estimatedTokens * 0.35))
    default:
      return base
  }
}

function rankItems(request: string, items: ContextItem[]): PlannedContextItem[] {
  const ranked = rerankCandidates({
    query: request,
    candidates: items.map((item) => ({
      id: item.id,
      title: item.title,
      content: item.content,
      tags: item.tags,
      priorScore: priorityScore(item),
    })),
  })
  const scoreById = new Map(ranked.map((item) => [item.id, item.score]))

  return items
    .map((item) => {
      const estimatedTokens = estimateTokens(item.content)
      const relevanceScore = scoreById.get(item.id) ?? priorityScore(item)
      const reasons = [
        `kind=${item.kind}`,
        `tokens=${estimatedTokens}`,
        `relevance=${Math.round(relevanceScore * 100)}%`,
      ]
      if (item.pinned) reasons.push("pinned")
      if (typeof item.priority === "number") reasons.push(`priority=${Math.round(priorityScore(item) * 100)}%`)
      return {
        ...item,
        estimatedTokens,
        relevanceScore,
        decision: "drop" as const,
        reasons,
      }
    })
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.relevanceScore - a.relevanceScore || a.estimatedTokens - b.estimatedTokens)
}

function isRequiredContext(item: ContextItem): boolean {
  return item.kind === "request" || item.kind === "system" || item.canDrop === false
}

export function planContextPack(input: ContextPlanInput): ContextPlan {
  const reservedTokens = Math.max(0, Math.floor(input.reservedTokens ?? 0))
  const tokenBudget = Math.max(0, Math.floor(input.maxInputTokens) - reservedTokens)
  const minRelevanceScore = input.minRelevanceScore ?? 0.08
  const warnings: string[] = []
  const included: PlannedContextItem[] = []
  const summarize: PlannedContextItem[] = []
  const drop: PlannedContextItem[] = []
  let used = 0

  if (tokenBudget <= 0) warnings.push("No available input-token budget after reserves.")

  for (const item of rankItems(input.request, input.items)) {
    const mustPreserve = Boolean(item.pinned) || isRequiredContext(item)
    const tooLowSignal = !mustPreserve && item.relevanceScore < minRelevanceScore

    if (tooLowSignal && item.canDrop !== false) {
      drop.push({ ...item, decision: "drop", reasons: [...item.reasons, "below relevance threshold"] })
      continue
    }

    if (used + item.estimatedTokens <= tokenBudget) {
      included.push({ ...item, decision: "include", reasons: [...item.reasons, "fits budget"] })
      used += item.estimatedTokens
      continue
    }

    const canSummarize = (item.canSummarize ?? true) && item.kind !== "request" && item.kind !== "system"
    const summarizedTokens = canSummarize ? summarizeTokenEstimate(item) : item.estimatedTokens
    if (canSummarize && summarizedTokens + used <= tokenBudget) {
      summarize.push({
        ...item,
        estimatedTokens: summarizedTokens,
        decision: "summarize",
        reasons: [...item.reasons, `summarize to ~${summarizedTokens} tokens`],
      })
      used += summarizedTokens
      continue
    }

    if (mustPreserve) {
      included.push({ ...item, decision: "include", reasons: [...item.reasons, "preserved despite budget pressure"] })
      used += item.estimatedTokens
      warnings.push(`Required context item ${item.id} exceeds the remaining budget and was preserved.`)
      continue
    }

    drop.push({ ...item, decision: "drop", reasons: [...item.reasons, "does not fit budget"] })
  }

  if (used > tokenBudget) warnings.push(`Included context exceeds token budget by ${used - tokenBudget} estimated token(s).`)
  if (drop.length > 0) warnings.push(`${drop.length} context item(s) dropped to protect context budget.`)
  if (summarize.length > 0) warnings.push(`${summarize.length} context item(s) should be summarized before the LLM call.`)

  return {
    tokenBudget,
    estimatedIncludedTokens: used,
    included,
    summarize,
    drop,
    warnings,
  }
}

export function formatContextPlanForAudit(plan: ContextPlan): string {
  return [
    `budget=${plan.tokenBudget}`,
    `used=${plan.estimatedIncludedTokens}`,
    `include=${plan.included.length}`,
    `summarize=${plan.summarize.length}`,
    `drop=${plan.drop.length}`,
    `warnings=${plan.warnings.join(" | ") || "none"}`,
  ].join(" ")
}
