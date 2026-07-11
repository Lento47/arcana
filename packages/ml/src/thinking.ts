import type { ExpectedDeliverable } from "./expectation.js"

export type ThinkingStyle = "quick" | "balanced" | "deep" | "staged"

export type StepPlan = {
  steps: string[]
  estimatedSteps: number
  requiresValidation: boolean
  requiresMultipleTools: boolean
  requiresClosure: boolean
}

export type ThinkingBudget = {
  style: ThinkingStyle
  reasoningTokens: number
  maxToolRounds: number
  maxSilentRevisions: number
  temperature: number
  reasons: string[]
}

export type ThinkingPlanInput = {
  request: string
  deliverable: ExpectedDeliverable
  qualityBar: "fast" | "solid" | "strict"
  evidenceNeed: "none" | "light" | "required"
  availableTools?: string[]
  priorTurnCount?: number
  hasToolHistory?: boolean
}

export type ThinkingPlan = {
  budget: ThinkingBudget
  steps: StepPlan
  promptAddendum: string
}

const DEPTH_MARKERS = [
  "step by step",
  "thorough",
  "deep dive",
  "exhaustive",
  "comprehensive",
  " meticulously",
  "explain every",
  "walk me through",
]

const BREADTH_MARKERS = [
  "compare",
  "evaluate",
  "tradeoffs",
  "alternatives",
  "options",
  "pros and cons",
  "which is better",
]

const STAGED_DELIVERABLES: ExpectedDeliverable[] = ["execution_plan", "repo_review", "debug_plan", "code_patch"]

function requestHas(text: string, patterns: string[]): boolean {
  const lower = text.toLowerCase()
  return patterns.some((pattern) => lower.includes(pattern))
}

function scoreDepth(input: ThinkingPlanInput): number {
  let score = 0
  if (input.qualityBar === "strict") score += 2
  if (input.qualityBar === "solid") score += 1
  if (input.evidenceNeed === "required") score += 2
  if (input.evidenceNeed === "light") score += 1
  if (requestHas(input.request, DEPTH_MARKERS)) score += 2
  if (requestHas(input.request, BREADTH_MARKERS)) score += 1
  if (STAGED_DELIVERABLES.includes(input.deliverable)) score += 1
  if ((input.availableTools?.length ?? 0) >= 4) score += 1
  if (input.hasToolHistory) score += 1
  if ((input.priorTurnCount ?? 0) > 6) score += 1
  return score
}

function chooseStyle(input: ThinkingPlanInput): ThinkingStyle {
  const depth = scoreDepth(input)
  if (input.qualityBar === "fast" && depth < 3) return "quick"
  if (depth >= 6) return "staged"
  if (depth >= 4) return "deep"
  return "balanced"
}

function budgetForStyle(style: ThinkingStyle): ThinkingBudget {
  switch (style) {
    case "quick":
      return {
        style,
        reasoningTokens: 512,
        maxToolRounds: 4,
        maxSilentRevisions: 0,
        temperature: 0.55,
        reasons: ["Fast mode: minimize latency and token spend."],
      }
    case "balanced":
      return {
        style,
        reasoningTokens: 1536,
        maxToolRounds: 8,
        maxSilentRevisions: 1,
        temperature: 0.45,
        reasons: ["Balanced mode: standard reasoning depth with one silent quality revision."],
      }
    case "deep":
      return {
        style,
        reasoningTokens: 4096,
        maxToolRounds: 12,
        maxSilentRevisions: 2,
        temperature: 0.35,
        reasons: ["Deep mode: more reasoning room, extra tool rounds, and stricter revision."],
      }
    case "staged":
      return {
        style,
        reasoningTokens: 6144,
        maxToolRounds: 16,
        maxSilentRevisions: 2,
        temperature: 0.3,
        reasons: ["Staged mode: complex tasks need phased planning and validation."],
      }
  }
}

function inferSteps(input: ThinkingPlanInput): StepPlan {
  const steps: string[] = []
  let requiresValidation = input.evidenceNeed !== "none"
  let requiresMultipleTools = (input.availableTools?.length ?? 0) > 2
  let requiresClosure = input.evidenceNeed !== "none" || STAGED_DELIVERABLES.includes(input.deliverable)

  if (input.deliverable === "debug_plan") {
    steps.push("Reproduce or locate the failure.")
    steps.push("Isolate the minimal cause.")
    steps.push("Propose a fix and a validation command.")
    requiresValidation = true
  } else if (input.deliverable === "code_patch") {
    steps.push("Identify the files and interfaces to change.")
    steps.push("Apply the minimal correct change.")
    steps.push("Run the relevant tests or checks.")
    requiresValidation = true
    requiresMultipleTools = true
    requiresClosure = true
  } else if (input.deliverable === "repo_review") {
    steps.push("Scan the relevant modules for risks.")
    steps.push("Rank findings by impact and confidence.")
    steps.push("Recommend fixes with evidence.")
    requiresValidation = true
    requiresClosure = true
  } else if (input.deliverable === "execution_plan") {
    steps.push("Clarify the goal, non-goals, and constraints.")
    steps.push("Break the work into ordered phases.")
    steps.push("Define success criteria and validation checks.")
    requiresClosure = true
  } else if (input.deliverable === "sql_advice") {
    steps.push("Inspect the query, schema, and workload.")
    steps.push("Identify anti-patterns and index opportunities.")
    steps.push("Recommend a measurable change.")
    requiresValidation = true
    requiresClosure = true
  } else {
    steps.push("Understand the user's request and constraints.")
    steps.push("Produce the requested output.")
    if (input.qualityBar === "strict") {
      steps.push("Self-check against constraints before responding.")
      requiresValidation = true
      requiresClosure = true
    }
  }

  if (requiresValidation) {
    steps.push("Validate the result with a command, test, or explicit assumption.")
  }
  if (requiresClosure) {
    steps.push("Finish with concise status, evidence, and any remaining risk.")
  }

  return {
    steps,
    estimatedSteps: steps.length,
    requiresValidation,
    requiresMultipleTools,
    requiresClosure,
  }
}

export function planThinking(input: ThinkingPlanInput): ThinkingPlan {
  const style = chooseStyle(input)
  const budget = budgetForStyle(style)
  const steps = inferSteps(input)

  if (steps.requiresMultipleTools)
    budget.reasons.push("Multiple tools available; allow extra rounds for tool chaining.")
  if (steps.requiresValidation)
    budget.reasons.push("Validation required; reserve reasoning for command/test output interpretation.")
  if (steps.requiresClosure)
    budget.reasons.push("Closure required; finish with evidence-backed status instead of open-ended analysis.")
  if (input.hasToolHistory) budget.reasons.push("Prior tool output exists; reason over the accumulated evidence.")

  const promptAddendum = [
    `<arcana-thinking-plan style="${style}">`,
    `reasoning_budget=${budget.reasoningTokens}`,
    `tool_rounds=${budget.maxToolRounds}`,
    `silent_revisions=${budget.maxSilentRevisions}`,
    `temperature=${budget.temperature}`,
    `validation=${steps.requiresValidation ? "required" : "optional"}`,
    `closure=${steps.requiresClosure ? "required" : "optional"}`,
    `steps=${steps.steps.join(" | ")}`,
    "instructions=use a private checklist; prefer concrete evidence over generic claims; avoid repeated loops; finish the requested work with status, evidence, and remaining risk; revise silently if the first draft misses constraints; ask the user only when ambiguity blocks correctness",
    `reasons=${budget.reasons.join(" | ")}`,
    "</arcana-thinking-plan>",
  ].join("\n")

  return { budget, steps, promptAddendum }
}

export function formatThinkingPlanForAudit(plan: ThinkingPlan): string {
  return [
    `style=${plan.budget.style}`,
    `reasoning_tokens=${plan.budget.reasoningTokens}`,
    `tool_rounds=${plan.budget.maxToolRounds}`,
    `silent_revisions=${plan.budget.maxSilentRevisions}`,
    `temperature=${plan.budget.temperature}`,
    `steps=${plan.steps.steps.length}`,
    `validation=${plan.steps.requiresValidation ? "required" : "optional"}`,
    `closure=${plan.steps.requiresClosure ? "required" : "optional"}`,
    `reasons=${plan.budget.reasons.join(" | ") || "none"}`,
  ].join(" ")
}
