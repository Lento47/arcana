export type SignalFeedbackOutcome = "accepted" | "overridden" | "failed" | "useful" | "not_useful"

export type SignalFeedback = {
  id?: string
  signalKind: "turn" | "tool" | "rerank" | "policy"
  outcome: SignalFeedbackOutcome
  correction?: string
  labels?: string[]
  score?: number
  timestamp?: string
  metadata?: Record<string, unknown>
}

export type FeedbackSummary = {
  total: number
  byOutcome: Record<SignalFeedbackOutcome, number>
  averageScore: number | null
  corrections: number
}

const OUTCOMES: SignalFeedbackOutcome[] = ["accepted", "overridden", "failed", "useful", "not_useful"]

export function createFeedbackEvent(feedback: SignalFeedback): Required<Pick<SignalFeedback, "signalKind" | "outcome" | "timestamp">> & SignalFeedback {
  return {
    ...feedback,
    timestamp: feedback.timestamp ?? new Date().toISOString(),
  }
}

export function serializeFeedback(feedback: SignalFeedback): string {
  return JSON.stringify(createFeedbackEvent(feedback))
}

export function parseFeedback(line: string): SignalFeedback | null {
  try {
    const parsed = JSON.parse(line) as SignalFeedback
    if (!parsed.signalKind || !parsed.outcome) return null
    if (!OUTCOMES.includes(parsed.outcome)) return null
    return parsed
  } catch {
    return null
  }
}

export function summarizeFeedback(events: SignalFeedback[]): FeedbackSummary {
  const byOutcome = Object.fromEntries(OUTCOMES.map((outcome) => [outcome, 0])) as Record<SignalFeedbackOutcome, number>
  let scored = 0
  let scoreTotal = 0
  let corrections = 0

  for (const event of events) {
    byOutcome[event.outcome] = (byOutcome[event.outcome] ?? 0) + 1
    if (typeof event.score === "number" && Number.isFinite(event.score)) {
      scored++
      scoreTotal += event.score
    }
    if (event.correction?.trim()) corrections++
  }

  return {
    total: events.length,
    byOutcome,
    averageScore: scored ? Number((scoreTotal / scored).toFixed(4)) : null,
    corrections,
  }
}
