export type SemanticRewriteMode = "compact" | "precise" | "llm_prompt" | "execution_plan"

export type SemanticRewriteInput = {
  request: string
  mode?: SemanticRewriteMode
  constraints?: string[]
  preserveTone?: boolean
}

export type SemanticRewriteResult = {
  original: string
  rewritten: string
  mode: SemanticRewriteMode
  detectedIntent: string
  constraints: string[]
  improvements: string[]
}

const INTENT_PATTERNS: Array<[string, RegExp]> = [
  ["code_change", /\b(fix|patch|edit|implement|refactor|bug|repo|code)\b/i],
  ["analysis", /\b(check|analyze|review|verify|compare|inspect)\b/i],
  ["database", /\b(sql|database|query|index|schema|postgres|mysql|sqlite|drizzle)\b/i],
  ["token_optimization", /\b(token|context|prompt|compress|summari[sz]e|budget)\b/i],
  ["automation", /\b(schedule|monitor|cron|watch|notify|recurring)\b/i],
]

function detectIntent(request: string): string {
  return INTENT_PATTERNS.find(([, pattern]) => pattern.test(request))?.[0] ?? "general"
}

function normalizeRequest(request: string): { text: string; improvements: string[] } {
  const improvements: string[] = []
  let text = request.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim()
  if (text !== request.trim()) improvements.push("normalized whitespace")

  const replacements: Array<[RegExp, string, string]> = [
    [/\bcan you\b/gi, "", "removed weak opener"],
    [/\bmaybe\b/gi, "", "removed uncertainty filler"],
    [/\bkind of\b/gi, "", "removed vague filler"],
    [/\bsort of\b/gi, "", "removed vague filler"],
    [/\bthing\b/gi, "component", "made vague noun more specific"],
  ]
  for (const [pattern, replacement, reason] of replacements) {
    const next = text.replace(pattern, replacement).replace(/[ \t]+/g, " ").trim()
    if (next !== text) improvements.push(reason)
    text = next
  }

  return { text, improvements: [...new Set(improvements)] }
}

function asExecutionPlan(text: string, constraints: string[]): string {
  const lines = [
    "Goal: " + text.replace(/[.!?]+$/, ""),
    "Scope: preserve user intent; do not make irreversible changes without approval.",
  ]
  if (constraints.length) lines.push("Constraints: " + constraints.join("; "))
  lines.push("Expected output: concise result, evidence, and next validation command.")
  return lines.join("\n")
}

function asPrompt(text: string, constraints: string[]): string {
  const clauses = [text.replace(/[.!?]+$/, "")]
  if (constraints.length) clauses.push(`Constraints: ${constraints.join("; ")}`)
  clauses.push("Return only actionable steps, assumptions, and validation checks.")
  return clauses.join(". ") + "."
}

export function rewriteSemantics(input: SemanticRewriteInput): SemanticRewriteResult {
  const mode = input.mode ?? "precise"
  const normalized = normalizeRequest(input.request)
  const constraints = input.constraints ?? []
  const detectedIntent = detectIntent(input.request)
  const improvements = [...normalized.improvements]

  let rewritten = normalized.text
  if (mode === "compact") {
    rewritten = normalized.text.replace(/\bplease\b/gi, "").replace(/[ \t]+/g, " ").trim()
    improvements.push("compressed request wording")
  } else if (mode === "llm_prompt") {
    rewritten = asPrompt(normalized.text, constraints)
    improvements.push("structured request as LLM-ready prompt")
  } else if (mode === "execution_plan") {
    rewritten = asExecutionPlan(normalized.text, constraints)
    improvements.push("structured request as execution plan")
  } else {
    if (!/[.!?]$/.test(rewritten)) rewritten += "."
    improvements.push("made request explicit and sentence-complete")
  }

  return {
    original: input.request,
    rewritten,
    mode,
    detectedIntent,
    constraints,
    improvements: [...new Set(improvements)],
  }
}
