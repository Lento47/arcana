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

const GENERIC_PHRASES = [
  "it depends",
  "best practices",
  "robust solution",
  "scalable solution",
  "seamless experience",
  "user-friendly",
  "cutting-edge",
  "leverage",
  "streamline",
  "unlock the power",
  "game changer",
  "comprehensive approach",
  "tailored solution",
  "innovative",
  "synergy",
]

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
  return [...new Set(text.toLowerCase().match(/[a-z0-9_./-]+/g) ?? [])]
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

export function evaluateResponseQuality(input: QualityGateInput): QualityGateResult {
  const requestTokens = tokenize(input.request)
  const responseTokens = tokenize(input.response)
  const genericHits = phraseHits(input.response, GENERIC_PHRASES)
  const problems: string[] = []
  const revisionHints: string[] = []

  const genericityScore = clamp(genericHits.length / 5)
  const specificityScore = clamp(overlap(requestTokens, responseTokens) * 0.6 + (hasConcreteMarkers(input.response) ? 0.4 : 0))
  const actionabilityScore = actionability(input.response)
  const constraintFitScore = constraintFit(input.response, input.expectation)

  if (genericHits.length) {
    problems.push(`Generic phrases detected: ${genericHits.join(", ")}`)
    revisionHints.push("Replace generic phrases with concrete decisions, constraints, file names, commands, or measurable outcomes.")
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
  if (input.expectation?.qualityBar === "strict" && !hasConcreteMarkers(input.response)) {
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
  if (score < 0.45 && input.expectation?.interactionIntervention === "confirm") verdict = "ask_user"
  else if (score < (input.expectation?.qualityBar === "strict" ? 0.78 : 0.64)) verdict = "revise_silently"

  return {
    verdict,
    score,
    genericityScore,
    specificityScore,
    actionabilityScore,
    constraintFitScore,
    problems,
    revisionHints,
    interactionIntervention: verdict === "ask_user" ? "confirm" : verdict === "revise_silently" ? "silent" : "silent",
  }
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
