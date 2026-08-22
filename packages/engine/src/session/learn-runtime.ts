/**
 * Run post-session learning through extractAndMerge so LEARNED.md is actually used.
 */
import type { SessionCompletionReason } from "./epistemic/completion-reason"
import { isSuccessfulCompletion } from "./epistemic/completion-reason"
import {
  extractAndMerge,
  type LearningExtraction,
  type RunStatus,
} from "./learning"

export function parseLearningJson(text: string): LearningExtraction | undefined {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  const raw = (fenced?.[1] ?? trimmed).trim()
  const start = raw.indexOf("{")
  const end = raw.lastIndexOf("}")
  if (start < 0 || end <= start) return undefined
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as Partial<LearningExtraction>
    return {
      facts: Array.isArray(parsed.facts) ? parsed.facts : [],
      patterns: Array.isArray(parsed.patterns) ? parsed.patterns : [],
      mistakes: Array.isArray(parsed.mistakes) ? parsed.mistakes : [],
      preferenceUpdates: Array.isArray(parsed.preferenceUpdates) ? parsed.preferenceUpdates : [],
    }
  } catch {
    return undefined
  }
}

export function learningHasEntries(extraction: LearningExtraction | undefined): boolean {
  if (!extraction) return false
  return (
    extraction.facts.length +
      extraction.patterns.length +
      extraction.mistakes.length +
      extraction.preferenceUpdates.length >
    0
  )
}

export function shouldExtractLearnings(userTurns: number): boolean {
  return userTurns >= 2
}

export function transcriptFromTurns(turns: ReadonlyArray<{ role: string; text: string }>): string {
  return turns.map((turn) => `${turn.role}: ${turn.text}`).join("\n")
}

export function runStatusFromReason(reason: SessionCompletionReason): RunStatus {
  return isSuccessfulCompletion(reason) ? "verified" : "unproven"
}

export function fallbackExtraction(goal: string): LearningExtraction {
  const trimmed = goal.trim()
  const slug = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "session-goal"
  return {
    facts: [
      {
        slug,
        summary: trimmed.slice(0, 120),
        body: `**Why:** Completed session goal.\n**How to apply:** ${trimmed}`,
        tags: ["session", "goal"],
      },
    ],
    patterns: [],
    mistakes: [],
    preferenceUpdates: [],
  }
}

export function applyLearningExtraction(input: {
  projectRoot: string
  sessionID: string
  reason: SessionCompletionReason
  extraction: LearningExtraction
}) {
  return extractAndMerge(input.projectRoot, input.extraction, {
    sourceSession: input.sessionID,
    runStatus: runStatusFromReason(input.reason),
    runId: input.sessionID,
  })
}
