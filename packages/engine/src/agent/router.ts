import type { Agent } from "./agent"

export interface RouteInput {
  prompt: string
  description: string
  context?: {
    files?: string[]
    recentErrors?: boolean
    sessionType?: "new" | "followup" | "fix"
  }
}

export interface RouteResult {
  agent: Agent.Info
  confidence: number
  reason: string
}

/**
 * Pure keyword/priority router. Scores subagents by how well their `routing`
 * metadata matches the task text and returns the best match. Falls back to the
 * supplied `fallback` (or the first non-hidden subagent) when nothing scores.
 *
 * Kept deliberately dependency-free so callers can route from an already-loaded
 * agent list without threading a new Effect service through the layer graph.
 */
export function route(agents: Agent.Info[], input: RouteInput, fallback?: Agent.Info): RouteResult {
  const scored: Array<{ agent: Agent.Info; score: number; reason: string }> = []
  const prompt = (input.prompt + " " + input.description).toLowerCase()

  for (const agent of agents) {
    if (agent.hidden || agent.mode === "primary") continue
    const routing = agent.routing
    if (!routing) continue

    let score = 0
    const reasons: string[] = []

    if (routing.keywords) {
      const matches = routing.keywords.filter((kw) => prompt.includes(kw.toLowerCase()))
      if (matches.length > 0) {
        score += matches.length * 10
        reasons.push(`keywords: ${matches.join(", ")}`)
      }
    }
    if (routing.priority) score += routing.priority
    if (reasons.length > 0) scored.push({ agent, score, reason: reasons.join("; ") })
  }

  scored.sort((a, b) => b.score - a.score)
  if (scored.length === 0) {
    const chosen = fallback ?? agents.find((a) => a.mode === "subagent" && !a.hidden)
    if (!chosen) throw new Error("no routable subagent available")
    return { agent: chosen, confidence: 0, reason: "no routing match, using default" }
  }
  return { agent: scored[0].agent, confidence: Math.min(1, scored[0].score / 100), reason: scored[0].reason }
}

export function listCapable(agents: Agent.Info[], capability: string): Agent.Info[] {
  return agents.filter((a) => a.routing?.capabilities?.includes(capability))
}
