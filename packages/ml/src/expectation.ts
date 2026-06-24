export type ExpectedDeliverable =
  | "direct_answer"
  | "code_patch"
  | "repo_review"
  | "debug_plan"
  | "execution_plan"
  | "sql_advice"
  | "design_direction"
  | "unknown"

export type QualityBar = "fast" | "solid" | "strict"
export type EvidenceNeed = "none" | "light" | "required"
export type InteractionIntervention = "silent" | "nudge" | "confirm"

export type ExpectationInput = {
  request: string
  explicitConstraints?: string[]
  priorFeedback?: string[]
  interactionMode?: "fast" | "balanced" | "strict"
  allowClarifyingQuestion?: boolean
}

export type ExpectationContract = {
  deliverable: ExpectedDeliverable
  qualityBar: QualityBar
  evidenceNeed: EvidenceNeed
  interactionIntervention: InteractionIntervention
  constraints: string[]
  mustAvoid: string[]
  shouldInclude: string[]
  assumptions: string[]
  promptHints: string[]
}

function has(text: string, pattern: RegExp): boolean {
  return pattern.test(text)
}

function unique(items: string[]): string[] {
  return [...new Set(items.filter(Boolean))]
}

function detectDeliverable(text: string): ExpectedDeliverable {
  if (has(text, /\b(sql|database|query|index|schema|postgres|mysql|sqlite|drizzle)\b/i)) return "sql_advice"
  if (has(text, /\b(patch|implement|edit|change|fix code|commit|pr)\b/i)) return "code_patch"
  if (has(text, /\b(repo|repository|codebase|review|audit|check|inspect)\b/i)) return "repo_review"
  if (has(text, /\b(error|bug|failing|broken|stack trace|debug|timeout|crash)\b/i)) return "debug_plan"
  if (has(text, /\b(plan|architecture|roadmap|pipeline|workflow|strategy)\b/i)) return "execution_plan"
  if (has(text, /\b(design|brand|layout|ui|ux|visual|style)\b/i)) return "design_direction"
  if (text.trim()) return "direct_answer"
  return "unknown"
}

function detectQualityBar(text: string, mode: ExpectationInput["interactionMode"]): QualityBar {
  if (mode === "strict") return "strict"
  if (mode === "fast") return "fast"
  if (has(text, /\b(no generic|not generic|avoid ai slop|avoid slop|garbage|production|enterprise|serious|exact|precise|verify|evidence|not fluff|no fluff)\b/i)) return "strict"
  if (has(text, /\b(quick|simple|rough|draft|fast)\b/i)) return "fast"
  return "solid"
}

function detectEvidenceNeed(text: string, deliverable: ExpectedDeliverable): EvidenceNeed {
  if (has(text, /\b(cite|citation|source|evidence|prove|verify|are you sure|test|validation|run|confirm)\b/i)) return "required"
  if (["repo_review", "code_patch", "debug_plan", "sql_advice"].includes(deliverable)) return "light"
  return "none"
}

function shouldConfirm(input: ExpectationInput, deliverable: ExpectedDeliverable, qualityBar: QualityBar): boolean {
  if (input.allowClarifyingQuestion === false) return false
  const text = input.request.trim()
  if (!text) return true
  const tooShort = text.split(/\s+/).length <= 4
  return qualityBar === "strict" && tooShort && deliverable === "unknown"
}

export function inferExpectationContract(input: ExpectationInput): ExpectationContract {
  const text = input.request
  const deliverable = detectDeliverable(text)
  const qualityBar = detectQualityBar(text, input.interactionMode)
  const evidenceNeed = detectEvidenceNeed(text, deliverable)
  const constraints = unique([...(input.explicitConstraints ?? []), ...(input.priorFeedback ?? [])])
  const mustAvoid = [
    "generic filler",
    "unsupported claims",
    "unrequested scope expansion",
    "overwriting the user's intent",
  ]
  const shouldInclude = ["specific output", "clear assumptions"]
  const assumptions: string[] = []
  const promptHints: string[] = [
    "Preserve the user's original goal; improve wording only as an internal planning aid.",
    "Prefer concrete nouns, file names, commands, metrics, and validation checks over generic advice.",
  ]

  if (qualityBar === "strict") {
    mustAvoid.push("AI slop", "marketing-sounding language", "vague best-practice lists", "performative enthusiasm")
    shouldInclude.push("evidence-backed reasoning", "tradeoffs", "validation path")
    promptHints.push("Reject generic output; revise silently until the response is specific, constrained, and useful.")
  }

  if (evidenceNeed !== "none") {
    shouldInclude.push("evidence or validation command")
    promptHints.push("Do not claim something is done or true without a check, citation, file reference, or explicit assumption.")
  }

  if (deliverable === "code_patch") shouldInclude.push("minimal patch", "risk notes", "test command")
  if (deliverable === "repo_review") shouldInclude.push("ranked findings", "impact", "recommended fix")
  if (deliverable === "sql_advice") shouldInclude.push("query shape", "index reasoning", "measure-before-after guidance")
  if (deliverable === "execution_plan") shouldInclude.push("phased steps", "non-goals", "success criteria")

  if (constraints.length) promptHints.push(`User constraints: ${constraints.join("; ")}`)

  return {
    deliverable,
    qualityBar,
    evidenceNeed,
    interactionIntervention: shouldConfirm(input, deliverable, qualityBar) ? "confirm" : "silent",
    constraints,
    mustAvoid: unique(mustAvoid),
    shouldInclude: unique(shouldInclude),
    assumptions,
    promptHints: unique(promptHints),
  }
}

export function formatExpectationContractForPrompt(contract: ExpectationContract): string {
  return [
    "<arcana-expectation-contract>",
    `deliverable=${contract.deliverable}`,
    `quality_bar=${contract.qualityBar}`,
    `evidence_need=${contract.evidenceNeed}`,
    `interaction_intervention=${contract.interactionIntervention}`,
    `must_avoid=${contract.mustAvoid.join("; ")}`,
    `should_include=${contract.shouldInclude.join("; ")}`,
    `hints=${contract.promptHints.join(" | ")}`,
    "</arcana-expectation-contract>",
  ].join("\n")
}
