/**
 * Session-scoped active goal store + injection, mutation gates, and agent
 * suggestion helpers (goal/agent awareness MVP).
 *
 * Storage: ~/.arcana/goals/<sessionID>.json (or ARCANA_HOME/goals when set).
 * Pure Node APIs so engine, CLI, and TUI can share without Effect boilerplate.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { homedir } from "os"
import { join } from "path"

export type GoalStatus =
  | "unset"
  | "in_progress"
  | "complete"
  | "complete_unverified"
  | "complete_pending_verify"
  | "blocked"
  | "stale"

export type GoalPriority = "high" | "medium" | "low"

export type SessionGoal = {
  sessionID: string
  goal: string
  scope: string
  priority: GoalPriority
  status: GoalStatus
  updatedAt: string
  /** Optional kanban session key for board linkage */
  boardSessionID?: string
  openCards?: number
  doneCards?: number
  blockedCards?: number
}

export type GoalSnapshot = SessionGoal | { sessionID: string; status: "unset" }

export type GoalGateResult =
  | { allow: true }
  | { allow: false; reason: "goal_required" | "goal_complete"; message: string }

const MUTATING_TOOLS = new Set([
  "edit",
  "write",
  "apply_patch",
  "patch",
  "bash",
  "shell",
  "exec",
  "run",
  "command",
  "terminal",
  "powershell",
  "multiedit",
  "delete_file",
  "move_file",
  "copy_file",
  "create",
  "overwrite",
  "insert",
  "rename",
])

/** Agents that may mutate without a goal (read-only / system). */
const GATE_EXEMPT_AGENTS = new Set([
  "reviewer",
  "qa",
  "anti-ai-slop",
  "explore",
  "title",
  "summary",
  "compaction",
])

/** Agents under Tier B mutation gate when goal unset. */
const GATE_STRICT_AGENTS = new Set(["build", "general", "tester"])

/** Tools always allowed even when goal complete or unset. */
const ALWAYS_ALLOWED_TOOLS = new Set([
  "goal_set",
  "goal_check",
  "kanban",
  "read",
  "grep",
  "glob",
  "list",
  "list_files",
  "webfetch",
  "websearch",
  "web_fetch",
  "web_search",
  "question",
  "todowrite",
  "skill",
  "memory_search",
  "memory_write",
])

function goalsDir(): string {
  const base = process.env.ARCANA_HOME?.trim() || join(homedir(), ".arcana")
  return join(base, "goals")
}

function goalPath(sessionID: string): string {
  const safe = sessionID.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 180)
  return join(goalsDir(), `${safe}.json`)
}

export function getSessionGoal(sessionID: string): GoalSnapshot {
  if (!sessionID) return { sessionID: "", status: "unset" }
  try {
    const path = goalPath(sessionID)
    if (!existsSync(path)) return { sessionID, status: "unset" }
    const raw = JSON.parse(readFileSync(path, "utf8")) as SessionGoal
    if (!raw?.goal?.trim()) return { sessionID, status: "unset" }
    return {
      sessionID,
      goal: raw.goal,
      scope: raw.scope ?? "not specified",
      priority: raw.priority ?? "medium",
      status: raw.status ?? "in_progress",
      updatedAt: raw.updatedAt ?? new Date().toISOString(),
      boardSessionID: raw.boardSessionID,
      openCards: raw.openCards,
      doneCards: raw.doneCards,
      blockedCards: raw.blockedCards,
    }
  } catch {
    return { sessionID, status: "unset" }
  }
}

export function setSessionGoal(
  sessionID: string,
  input: {
    goal: string
    scope?: string
    priority?: GoalPriority
    status?: GoalStatus
    boardSessionID?: string
    openCards?: number
    doneCards?: number
    blockedCards?: number
  },
): SessionGoal {
  const dir = goalsDir()
  mkdirSync(dir, { recursive: true })
  const prev = getSessionGoal(sessionID)
  const next: SessionGoal = {
    sessionID,
    goal: input.goal.trim(),
    scope: (input.scope ?? (prev.status !== "unset" ? prev.scope : "not specified")).trim() || "not specified",
    priority: input.priority ?? (prev.status !== "unset" ? prev.priority : "medium"),
    status: input.status ?? "in_progress",
    updatedAt: new Date().toISOString(),
    boardSessionID: input.boardSessionID ?? (prev.status !== "unset" ? prev.boardSessionID : undefined),
    openCards: input.openCards ?? (prev.status !== "unset" ? prev.openCards : undefined),
    doneCards: input.doneCards ?? (prev.status !== "unset" ? prev.doneCards : undefined),
    blockedCards: input.blockedCards ?? (prev.status !== "unset" ? prev.blockedCards : undefined),
  }
  writeFileSync(goalPath(sessionID), JSON.stringify(next, null, 2), "utf8")
  return next
}

export function patchSessionGoal(
  sessionID: string,
  patch: Partial<Omit<SessionGoal, "sessionID" | "updatedAt">>,
): GoalSnapshot {
  const cur = getSessionGoal(sessionID)
  if (cur.status === "unset" && !patch.goal) return cur
  if (cur.status === "unset") {
    return setSessionGoal(sessionID, {
      goal: patch.goal!,
      scope: patch.scope,
      priority: patch.priority,
      status: patch.status,
      boardSessionID: patch.boardSessionID,
      openCards: patch.openCards,
      doneCards: patch.doneCards,
      blockedCards: patch.blockedCards,
    })
  }
  return setSessionGoal(sessionID, {
    goal: patch.goal ?? cur.goal,
    scope: patch.scope ?? cur.scope,
    priority: patch.priority ?? cur.priority,
    status: patch.status ?? cur.status,
    boardSessionID: patch.boardSessionID ?? cur.boardSessionID,
    openCards: patch.openCards ?? cur.openCards,
    doneCards: patch.doneCards ?? cur.doneCards,
    blockedCards: patch.blockedCards ?? cur.blockedCards,
  })
}

export function clearSessionGoal(sessionID: string): void {
  try {
    const path = goalPath(sessionID)
    if (existsSync(path)) writeFileSync(path, JSON.stringify({ sessionID, status: "unset" }), "utf8")
  } catch {
    /* ignore */
  }
}

/** Format for system prompt injection every turn. */
export function formatActiveGoalBlock(input: {
  sessionID: string
  sessionAgent?: string
  actorAgent?: string
  actorRole?: "primary" | "subagent" | "system"
}): string {
  const snap = getSessionGoal(input.sessionID)
  const sessionAgent = input.sessionAgent?.trim() || "unknown"
  const actorAgent = input.actorAgent?.trim() || sessionAgent
  const actorRole = input.actorRole ?? (actorAgent === sessionAgent ? "primary" : "subagent")

  if (snap.status === "unset") {
    return [
      "<active-goal>",
      "  status: unset",
      `  session_agent: ${sessionAgent}`,
      `  actor_agent: ${actorAgent}`,
      `  actor_role: ${actorRole}`,
      "  note: No active goal. Call goal_set (or user /goal) before multi-step mutation work.",
      "</active-goal>",
    ].join("\n")
  }

  const board =
    snap.openCards !== undefined || snap.doneCards !== undefined
      ? `  board: open ${snap.openCards ?? 0} · done ${snap.doneCards ?? 0} · blocked ${snap.blockedCards ?? 0}`
      : undefined

  const goalLine = snap.goal.length > 400 ? snap.goal.slice(0, 397) + "…" : snap.goal
  const scopeLine = snap.scope.length > 200 ? snap.scope.slice(0, 197) + "…" : snap.scope

  return [
    "<active-goal>",
    `  goal: ${goalLine}`,
    `  scope: ${scopeLine}`,
    `  priority: ${snap.priority}`,
    `  status: ${snap.status}`,
    board,
    `  session_agent: ${sessionAgent}`,
    `  actor_agent: ${actorAgent}`,
    `  actor_role: ${actorRole}`,
    snap.status === "complete" || snap.status === "complete_unverified"
      ? "  note: Goal complete — do not mutate further; summarize or set a new goal."
      : undefined,
    "</active-goal>",
  ]
    .filter(Boolean)
    .join("\n")
}

export function isMutatingTool(toolName: string): boolean {
  const lower = toolName.toLowerCase()
  if (MUTATING_TOOLS.has(lower)) return true
  if (ALWAYS_ALLOWED_TOOLS.has(lower)) return false
  if (lower.includes("edit") || lower.includes("write") || lower.includes("patch")) return true
  if (lower.includes("bash") || lower.includes("shell") || lower.includes("exec")) return true
  return false
}

/**
 * Tier B gate for build/general/tester; freezes mutations after complete.
 */
export function checkGoalToolGate(input: {
  sessionID: string
  agentName: string
  toolName: string
}): GoalGateResult {
  const tool = input.toolName.toLowerCase()
  if (ALWAYS_ALLOWED_TOOLS.has(tool)) return { allow: true }
  if (!isMutatingTool(tool)) return { allow: true }

  const agent = input.agentName.toLowerCase()
  if (GATE_EXEMPT_AGENTS.has(agent)) return { allow: true }

  const snap = getSessionGoal(input.sessionID)

  if (snap.status === "complete" || snap.status === "complete_unverified") {
    return {
      allow: false,
      reason: "goal_complete",
      message:
        `Goal is ${snap.status}. Mutation tool "${input.toolName}" is frozen. ` +
        `Set a new goal with goal_set or /goal to continue, or use read-only tools to summarize.`,
    }
  }

  if (snap.status === "complete_pending_verify") {
    return {
      allow: false,
      reason: "goal_complete",
      message: `Goal is pending verification. Wait for verify outcome or set a new goal before mutating.`,
    }
  }

  const strict = GATE_STRICT_AGENTS.has(agent) || agent === "build" || agent === "general"
  if (strict && snap.status === "unset") {
    return {
      allow: false,
      reason: "goal_required",
      message:
        `No active goal for this session. Call goal_set (or user /goal) before "${input.toolName}". ` +
        `Read/search tools remain available.`,
    }
  }

  return { allow: true }
}

// --- Agent suggestion (Channel S session + Channel D delegation) ---

export type SessionAgentHint = {
  name: string
  mode?: string
  hidden?: boolean
  description?: string
  routing?: { keywords?: string[]; capabilities?: string[]; priority?: number }
}

export type AgentSuggestion = {
  sessionAgent?: { name: string; confidence: number; reason: string }
  delegation?: { name: string; confidence: number; reason: string }
}

function scoreKeywords(text: string, keywords: string[]): { score: number; hits: string[] } {
  const hits = keywords.filter((kw) => text.includes(kw.toLowerCase()))
  return { score: hits.length * 10, hits }
}

const SESSION_RULES: Array<{ name: string; keywords: string[]; weight: number }> = [
  { name: "client", keywords: ["requirements", "inception", "product contract", "stakeholders", "greenfield", "what should we build", "project brief"], weight: 12 },
  { name: "architect", keywords: ["architecture", "adr", "system design", "boundaries", "component map", "architectural"], weight: 12 },
  { name: "plan", keywords: ["plan only", "don't implement", "do not implement", "don't change code", "tradeoffs", "approach only", "planning mode"], weight: 11 },
  { name: "tester", keywords: ["write tests", "unit test", "coverage", "test suite", "spec file", "testing"], weight: 11 },
  { name: "reviewer", keywords: ["code review", "review this", "review pr", "security review", "nits", "feedback only"], weight: 11 },
  { name: "build", keywords: ["implement", "fix", "refactor", "add feature", "ship", "create", "write code", "build"], weight: 8 },
]

const DELEGATION_RULES: Array<{ name: string; keywords: string[]; weight: number }> = [
  { name: "explore", keywords: ["where is", "search", "find", "look up", "locate", "discover", "explore", "investigate", "research"], weight: 12 },
  { name: "general", keywords: ["implement", "refactor", "debug", "fix", "create", "write", "test", "change", "build", "multi-step"], weight: 8 },
  { name: "qa", keywords: ["bug", "edge case", "regression", "quality assurance", "qa", "defect", "bug hunt"], weight: 12 },
  { name: "anti-ai-slop", keywords: ["anti-slop", "ai slop", "overengineering", "code quality gate", "anti-pattern", "slop"], weight: 12 },
]

export function suggestAgents(input: {
  prompt: string
  currentSessionAgent?: string
  sessionAgents: SessionAgentHint[]
  subagents?: SessionAgentHint[]
}): AgentSuggestion {
  const text = input.prompt.toLowerCase()
  const result: AgentSuggestion = {}

  // Channel S — visible session agents only
  const visible = input.sessionAgents.filter((a) => !a.hidden && a.mode !== "subagent")
  const sessionScores: Array<{ name: string; score: number; reason: string }> = []
  for (const agent of visible) {
    let score = 0
    const reasons: string[] = []
    for (const rule of SESSION_RULES) {
      if (rule.name !== agent.name) continue
      const { score: s, hits } = scoreKeywords(text, rule.keywords)
      if (s > 0) {
        score += s + rule.weight
        reasons.push(`signals: ${hits.join(", ")}`)
      }
    }
    if (agent.routing?.keywords?.length) {
      const { score: s, hits } = scoreKeywords(text, agent.routing.keywords)
      if (s > 0) {
        score += s + (agent.routing.priority ?? 0)
        reasons.push(`routing: ${hits.join(", ")}`)
      }
    }
    if (score > 0) sessionScores.push({ name: agent.name, score, reason: reasons.join("; ") || "match" })
  }
  sessionScores.sort((a, b) => b.score - a.score)
  if (sessionScores[0] && sessionScores[0].name !== input.currentSessionAgent) {
    result.sessionAgent = {
      name: sessionScores[0].name,
      confidence: Math.min(1, sessionScores[0].score / 40),
      reason: sessionScores[0].reason,
    }
  }

  // Channel D — subagents
  const subs = input.subagents ?? input.sessionAgents.filter((a) => a.mode === "subagent")
  const delScores: Array<{ name: string; score: number; reason: string }> = []
  for (const agent of subs) {
    let score = 0
    const reasons: string[] = []
    for (const rule of DELEGATION_RULES) {
      if (rule.name !== agent.name) continue
      const { score: s, hits } = scoreKeywords(text, rule.keywords)
      if (s > 0) {
        score += s + rule.weight
        reasons.push(`signals: ${hits.join(", ")}`)
      }
    }
    if (agent.routing?.keywords?.length) {
      const { score: s, hits } = scoreKeywords(text, agent.routing.keywords)
      if (s > 0) {
        score += s + (agent.routing.priority ?? 0)
        reasons.push(`routing: ${hits.join(", ")}`)
      }
    }
    if (score > 0) delScores.push({ name: agent.name, score, reason: reasons.join("; ") || "match" })
  }
  delScores.sort((a, b) => b.score - a.score)
  if (delScores[0]) {
    result.delegation = {
      name: delScores[0].name,
      confidence: Math.min(1, delScores[0].score / 40),
      reason: delScores[0].reason,
    }
  }

  return result
}
