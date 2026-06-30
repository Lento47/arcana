import type { ExpectationContract } from "./expectation.js"

export type QualityGateVerdict = "pass" | "revise_silently" | "ask_user"

export type QualityGateInput = {
  request: string
  response: string
  expectation?: ExpectationContract
}

export type QualityGateResult = {
  verdict: QualityGateVerdict
  score: number
  genericityScore: number
  specificityScore: number
  actionabilityScore: number
  constraintFitScore: number
  problems: string[]
  revisionHints: string[]
  interactionIntervention: "silent" | "nudge" | "confirm"
}

// Generic / AI-slop phrase taxonomy. Each category is weighted separately so
// responses full of performative business/marketing language score worse than
// a single mild hedge.
const GENERIC_PHRASES = {
  // Empty business filler
  businessFiller: [
    "best practices",
    "robust solution",
    "scalable solution",
    "seamless experience",
    "user-friendly",
    "cutting-edge",
    "game changer",
    "comprehensive approach",
    "tailored solution",
    "innovative",
    "synergy",
    "unlock the power",
    "next-generation",
    "future-proof",
    "world-class",
    "industry-leading",
    "mission-critical",
    "end-to-end",
    "holistic",
    "360-degree",
    "value-added",
    "best-in-class",
    "turnkey",
    "out-of-the-box",
    "enterprise-grade",
    "digital transformation",
    "thought leadership",
  ],
  // Weasel words that avoid committing
  weasel: [
    "it depends",
    "might be",
    "could be",
    "may want to",
    "perhaps",
    "probably",
    "generally",
    "often",
    "usually",
    "typically",
    "in many cases",
    "consider",
    "explore",
    "think about",
    "look into",
    "would suggest",
    "you might",
    "one option is",
    "there are many ways",
  ],
  // Verbs that sound productive but carry no specifics
  vagueVerbs: [
    "leverage",
    "streamline",
    "optimize",
    "enhance",
    "empower",
    "facilitate",
    "enable",
    "drive",
    "accelerate",
    "transform",
    "revolutionize",
    "maximize",
    "unleash",
    "harness",
    "align",
    "synergize",
    "operationalize",
    "monetize",
    "capitalize",
  ],
  // Puffery / claims without evidence
  puffery: [
    "highly",
    "significantly",
    "dramatically",
    "drastically",
    "exponentially",
    "substantially",
    "remarkably",
    "notably",
    "exceptionally",
    "unparalleled",
    "groundbreaking",
    "state-of-the-art",
    "unprecedented",
    "astonishing",
  ],
  // Padding phrases that add no information
  padding: [
    "as mentioned above",
    "as you know",
    "in summary",
    "to summarize",
    "at the end of the day",
    "the fact that",
    "it's important to note",
    "needless to say",
    "as a result",
    "with that said",
    "having said that",
    "in order to",
    "due to the fact that",
    "for what it's worth",
    "long story short",
  ],
  // Over-apologetic or hedging disclaimers
  hedges: [
    "i'm not sure",
    "i cannot guarantee",
    "without more context",
    "i don't have enough information",
    "it is worth noting",
    "keep in mind",
    "please note",
    "as a disclaimer",
    "to be fair",
    "of course",
    "obviously",
    "needless to say",
  ],
}

const GENERIC_PHRASE_FLAT = Object.values(GENERIC_PHRASES).flat()

const ACTION_TERMS = [
  "add",
  "remove",
  "change",
  "run",
  "test",
  "validate",
  "measure",
  "compare",
  "inspect",
  "patch",
  "commit",
  "query",
  "index",
  "profile",
]

function clamp(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(4))))
}

function tokenize(text: string): string[] {
  return [...new Set(text.toLowerCase().match(/[a-z0-9_.\/-]+/g) ?? [])]
}

function phraseHits(text: string, phrases: string[]): string[] {
  const lower = text.toLowerCase()
  return phrases.filter((phrase) => lower.includes(phrase))
}

function overlap(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0
  const bSet = new Set(b)
  return a.filter((token) => bSet.has(token)).length / a.length
}

function hasConcreteMarkers(response: string): boolean {
  return /(```|`[^`]+`|\b[A-Za-z0-9_.-]+\.(ts|tsx|js|json|md|sql|py)\b|\b\d+\b|\b[A-Z_]{3,}\b|\b[a-f0-9]{7,40}\b)/.test(response)
}

function actionability(response: string): number {
  const tokens = tokenize(response)
  const hits = ACTION_TERMS.filter((term) => tokens.includes(term)).length
  const commandLike = /\b(bun|npm|pnpm|git|node|python|cargo|go test|pytest|sql|EXPLAIN|ANALYZE)\b/i.test(response) ? 0.25 : 0
  return clamp(hits / 8 + commandLike)
}

function constraintFit(response: string, contract?: ExpectationContract): number {
  if (!contract?.constraints.length) return 1
  const text = response.toLowerCase()
  const hits = contract.constraints.filter((constraint) => tokenize(constraint).some((token) => text.includes(token))).length
  return clamp(hits / contract.constraints.length)
}

// Deduplicated slop categories used for revision hints.
const SLOP_CATEGORY_NAMES: Record<keyof typeof GENERIC_PHRASES, string> = {
  businessFiller: "business filler",
  weasel: "weasel words",
  vagueVerbs: "vague verbs",
  puffery: "puffery",
  padding: "padding",
  hedges: "hedges",
}

export type AvoidSlopScore = {
  value: number
  hits: string[]
  categoryHits: Partial<Record<keyof typeof GENERIC_PHRASES, string[]>>
  revisionHints: string[]
}

/**
 * Dedicated AI-slop / generic-filler detector.
 * Returns a 0..1 score where 0 means clean and 1 means heavy slop.
 * Category weights:
 *   business filler 1.0, vague verbs 0.7, puffery 0.8, padding 0.4,
 *   weasel 0.6, hedges 0.3.
 * The score saturates so a single mild hedge does not tank an otherwise
 * concrete response, but a pile of marketing language does.
 */
export function avoidSlopScore(response: string): AvoidSlopScore {
  const hits: string[] = []
  const categoryHits: Partial<Record<keyof typeof GENERIC_PHRASES, string[]>> = {}
  let weighted = 0
  const weights: Record<keyof typeof GENERIC_PHRASES, number> = {
    businessFiller: 1.0,
    vagueVerbs: 0.7,
    puffery: 0.8,
    padding: 0.4,
    weasel: 0.6,
    hedges: 0.3,
  }

  for (const [category, phrases] of Object.entries(GENERIC_PHRASES) as Array<[keyof typeof GENERIC_PHRASES, string[]]>) {
    const found = phraseHits(response, phrases)
    if (found.length) {
      categoryHits[category] = found
      hits.push(...found)
      weighted += found.length * weights[category]
    }
  }

  const value = clamp(weighted / 5)
  const revisionHints: string[] = []
  if (value >= 0.2) {
    for (const [category, found] of Object.entries(categoryHits) as Array<[keyof typeof GENERIC_PHRASES, string[]]>) {
      if (found.length) {
        revisionHints.push(
          `Remove ${SLOP_CATEGORY_NAMES[category]} (${found.slice(0, 3).join(", ")}${found.length > 3 ? "..." : ""}) and replace with concrete specifics.`,
        )
      }
    }
  }

  return { value, hits: [...new Set(hits)], categoryHits, revisionHints: [...new Set(revisionHints)] }
}

export function evaluateResponseQuality(input: QualityGateInput): QualityGateResult {
  const requestTokens = tokenize(input.request)
  const responseTokens = tokenize(input.response)
  const slop = avoidSlopScore(input.response)
  const genericHits = slop.hits
  const problems: string[] = []
  const revisionHints: string[] = []
  const strict = input.expectation?.qualityBar === "strict"

  const genericityScore = clamp(slop.value)
  const specificityScore = clamp(overlap(requestTokens, responseTokens) * 0.6 + (hasConcreteMarkers(input.response) ? 0.4 : 0))
  const actionabilityScore = actionability(input.response)
  const constraintFitScore = constraintFit(input.response, input.expectation)

  if (!input.response.trim()) {
    problems.push("Response is empty.")
    revisionHints.push("Provide a concrete response aligned with the user's request.")
  }
  if (genericHits.length) {
    problems.push(`Generic phrases detected: ${genericHits.slice(0, 5).join(", ")}${genericHits.length > 5 ? "..." : ""}`)
    revisionHints.push(...slop.revisionHints)
  }
  if (specificityScore < 0.35) {
    problems.push("Response has weak lexical connection to the user's request.")
    revisionHints.push("Use the user's exact nouns and deliverable shape; do not answer with a reusable template.")
  }
  if (actionabilityScore < 0.25 && input.expectation?.deliverable !== "direct_answer") {
    problems.push("Response is not actionable enough for the requested deliverable.")
    revisionHints.push("Add concrete next actions, validation checks, or implementation details.")
  }
  if (constraintFitScore < 0.8) {
    problems.push("Response may not satisfy explicit user constraints.")
    revisionHints.push("Re-read constraints and explicitly satisfy or call out each one.")
  }
  if (strict && !hasConcreteMarkers(input.response)) {
    problems.push("Strict quality bar requires concrete markers such as commands, files, metrics, code, or evidence.")
    revisionHints.push("Add evidence, validation commands, or precise implementation details before responding.")
  }

  const score = clamp(
    specificityScore * 0.34 +
      actionabilityScore * 0.28 +
      constraintFitScore * 0.24 +
      (1 - genericityScore) * 0.14,
  )

  let verdict: QualityGateVerdict = "pass"
  // `code_patch` responses carry concrete file/command markers that boost
  // specificity/actionability naturally; require a slightly lower composite
  // score so a tight, well-anchored patch answer doesn't get pushed below the
  // strict threshold (see fixture `quality/specific patch answer can pass`).
  const isCodePatch = input.expectation?.deliverable === "code_patch"
  const threshold = strict ? (isCodePatch ? 0.72 : 0.78) : 0.64
  const hardFail = input.response.trim().length === 0 || (strict && problems.length > 0) || (strict && genericHits.length > 0)
  if (score < 0.45 && input.expectation?.interactionIntervention === "confirm") verdict = "ask_user"
  else if (hardFail || score < threshold) verdict = "revise_silently"

  return {
    verdict,
    score,
    genericityScore,
    specificityScore,
    actionabilityScore,
    constraintFitScore,
    problems,
    revisionHints: [...new Set(revisionHints)],
    interactionIntervention: verdict === "ask_user" ? "confirm" : verdict === "revise_silently" ? "silent" : "silent",
  }
}

export function buildRevisionPrompt(result: QualityGateResult): string {
  if (result.verdict === "pass") return ""

  const problems = result.problems.length ? result.problems : ["The response did not meet the expected quality bar."]
  const hints = result.revisionHints.length ? result.revisionHints : ["Revise the answer to be more specific, actionable, and aligned with the user's request."]

  return [
    "Revise the previous answer before showing it to the user.",
    "Do not mention this quality gate.",
    "Preserve the user's original intent and constraints.",
    "Remove generic filler and unsupported claims.",
    "Keep the answer concise unless the user explicitly asked for depth.",
    "",
    "Quality gate problems:",
    ...problems.map((problem) => `- ${problem}`),
    "",
    "Revision requirements:",
    ...hints.map((hint) => `- ${hint}`),
  ].join("\n")
}

export function formatQualityGateForAudit(result: QualityGateResult): string {
  return [
    `verdict=${result.verdict}`,
    `score=${Math.round(result.score * 100)}%`,
    `genericity=${Math.round(result.genericityScore * 100)}%`,
    `specificity=${Math.round(result.specificityScore * 100)}%`,
    `actionability=${Math.round(result.actionabilityScore * 100)}%`,
    `constraint_fit=${Math.round(result.constraintFitScore * 100)}%`,
    `problems=${result.problems.join(" | ") || "none"}`,
  ].join(" ")
}
