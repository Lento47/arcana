/**
 * Session-scoped active goal store + injection, mutation gates, and agent
 * suggestion helpers (goal/agent awareness MVP).
 *
 * Storage: ~/.arcana/goals/<sessionID>.json (or ARCANA_HOME/goals when set).
 * Pure Node APIs so engine, CLI, and TUI can share without Effect boilerplate.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { randomUUID } from "crypto"
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
  /** Stable identity for one objective within a session. */
  goalID: string
  /** Increments only when the objective changes, never for status updates. */
  revision: number
  goal: string
  scope: string
  priority: GoalPriority
  status: GoalStatus
  /** Start of this objective revision's evidence window. */
  createdAt: string
  updatedAt: string
  /** Optional kanban session key for board linkage */
  boardSessionID?: string
  openCards?: number
  doneCards?: number
  blockedCards?: number
  verification?: GoalVerification
}

export type GoalVerification = {
  claimedAt?: string
  startedAt?: string
  resolvedAt?: string
  attempts: number
  verdict?: "verified" | "rejected" | "error"
  summary?: string
  unmetCriteria?: string[]
  evidenceRefs?: string[]
}

export type GoalVerificationResult = {
  verdict: "verified" | "rejected" | "error"
  summary: string
  unmetCriteria?: readonly string[]
  evidenceRefs?: readonly string[]
}

export type GoalArchiveRecord = SessionGoal & {
  archivedAt: string
  outcome: "verified_complete" | "legacy_unverified"
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
  "content_search",
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
  "memory_store_fact",
])

function goalsDir(): string {
  const base = process.env.ARCANA_HOME?.trim() || join(homedir(), ".arcana")
  return join(base, "goals")
}

function goalPath(sessionID: string): string {
  const safe = sessionID.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 180)
  return join(goalsDir(), `${safe}.json`)
}

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 180)
}

function escapePromptField(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
}

function archivePath(goal: SessionGoal): string {
  return join(goalsDir(), "archive", safeSegment(goal.sessionID), `${safeSegment(goal.goalID)}-r${goal.revision}.json`)
}

export function getSessionGoal(sessionID: string): GoalSnapshot {
  if (!sessionID) return { sessionID: "", status: "unset" }
  try {
    const path = goalPath(sessionID)
    if (!existsSync(path)) return { sessionID, status: "unset" }
    const raw = JSON.parse(readFileSync(path, "utf8")) as SessionGoal
    if (!raw?.goal?.trim()) return { sessionID, status: "unset" }
    const updatedAt = raw.updatedAt ?? new Date().toISOString()
    return {
      sessionID,
      goalID: raw.goalID?.trim() || `legacy-${safeSegment(sessionID)}`,
      revision: Number.isInteger(raw.revision) && raw.revision > 0 ? raw.revision : 1,
      goal: raw.goal,
      scope: raw.scope ?? "not specified",
      priority: raw.priority ?? "medium",
      status: raw.status ?? "in_progress",
      createdAt: raw.createdAt ?? updatedAt,
      updatedAt,
      boardSessionID: raw.boardSessionID,
      openCards: raw.openCards,
      doneCards: raw.doneCards,
      blockedCards: raw.blockedCards,
      verification: raw.verification,
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
    /** Explicit user replacement, even when the objective text is unchanged. */
    newRevision?: boolean
  },
): SessionGoal {
  const dir = goalsDir()
  mkdirSync(dir, { recursive: true })
  const prev = getSessionGoal(sessionID)
  const sameObjective = !input.newRevision && prev.status !== "unset" && prev.goal === input.goal.trim()
  const now = new Date().toISOString()
  const next: SessionGoal = {
    sessionID,
    goalID: sameObjective ? prev.goalID : randomUUID(),
    revision: sameObjective ? prev.revision : prev.status === "unset" ? 1 : prev.revision + 1,
    goal: input.goal.trim(),
    scope: (input.scope ?? (prev.status !== "unset" ? prev.scope : "not specified")).trim() || "not specified",
    priority: input.priority ?? (prev.status !== "unset" ? prev.priority : "medium"),
    status: input.status ?? "in_progress",
    createdAt: sameObjective ? prev.createdAt : now,
    updatedAt: now,
    boardSessionID: input.boardSessionID ?? (prev.status !== "unset" ? prev.boardSessionID : undefined),
    openCards: input.openCards ?? (prev.status !== "unset" ? prev.openCards : undefined),
    doneCards: input.doneCards ?? (prev.status !== "unset" ? prev.doneCards : undefined),
    blockedCards: input.blockedCards ?? (prev.status !== "unset" ? prev.blockedCards : undefined),
    verification: sameObjective ? prev.verification : undefined,
  }
  writeFileSync(goalPath(sessionID), JSON.stringify(next, null, 2), "utf8")
  return next
}

export function patchSessionGoal(
  sessionID: string,
  patch: Partial<Omit<SessionGoal, "sessionID" | "goalID" | "revision" | "createdAt" | "updatedAt">>,
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

/** Record a worker's completion claim without granting completion authority. */
export function claimSessionGoalCompletion(sessionID: string): GoalSnapshot {
  const cur = getSessionGoal(sessionID)
  if (cur.status === "unset") return cur
  if (cur.status === "complete_pending_verify") return cur
  if (cur.status === "complete" || cur.status === "complete_unverified") return cur
  const next = setSessionGoal(sessionID, {
    goal: cur.goal,
    scope: cur.scope,
    priority: cur.priority,
    status: "complete_pending_verify",
    boardSessionID: cur.boardSessionID,
    openCards: cur.openCards,
    doneCards: cur.doneCards,
    blockedCards: cur.blockedCards,
  })
  next.verification = {
    attempts: cur.verification?.attempts ?? 0,
    claimedAt: new Date().toISOString(),
  }
  writeFileSync(goalPath(sessionID), JSON.stringify(next, null, 2), "utf8")
  return next
}

/** Mark a pending verifier attempt. Idempotent callers may safely call this after restart. */
export function startSessionGoalVerification(input: {
  sessionID: string
  goalID: string
  revision: number
}): GoalSnapshot {
  const cur = getSessionGoal(input.sessionID)
  if (
    cur.status === "unset" ||
    cur.status !== "complete_pending_verify" ||
    cur.goalID !== input.goalID ||
    cur.revision !== input.revision
  ) return cur
  const next: SessionGoal = {
    ...cur,
    updatedAt: new Date().toISOString(),
    verification: {
      ...cur.verification,
      attempts: (cur.verification?.attempts ?? 0) + 1,
      startedAt: new Date().toISOString(),
      verdict: undefined,
    },
  }
  writeFileSync(goalPath(input.sessionID), JSON.stringify(next, null, 2), "utf8")
  return next
}

function archiveGoal(goal: SessionGoal, outcome: GoalArchiveRecord["outcome"]): GoalArchiveRecord {
  const record: GoalArchiveRecord = { ...goal, archivedAt: new Date().toISOString(), outcome }
  const path = archivePath(goal)
  mkdirSync(join(goalsDir(), "archive", safeSegment(goal.sessionID)), { recursive: true })
  if (!existsSync(path)) writeFileSync(path, JSON.stringify(record, null, 2), "utf8")
  return record
}

/** Apply a verifier result only to the exact pending objective revision. */
export function resolveSessionGoalVerification(input: {
  sessionID: string
  goalID: string
  revision: number
  result: GoalVerificationResult
}): { applied: boolean; archived?: GoalArchiveRecord; goal: GoalSnapshot } {
  const cur = getSessionGoal(input.sessionID)
  if (
    cur.status === "unset" ||
    cur.status !== "complete_pending_verify" ||
    cur.goalID !== input.goalID ||
    cur.revision !== input.revision
  ) return { applied: false, goal: cur }

  const resolved: SessionGoal = {
    ...cur,
    updatedAt: new Date().toISOString(),
    verification: {
      ...cur.verification,
      attempts: cur.verification?.attempts ?? 1,
      resolvedAt: new Date().toISOString(),
      verdict: input.result.verdict,
      summary: input.result.summary,
      unmetCriteria: [...(input.result.unmetCriteria ?? [])],
      evidenceRefs: [...(input.result.evidenceRefs ?? [])],
    },
  }

  if (input.result.verdict === "verified") {
    const archived = archiveGoal(resolved, "verified_complete")
    clearSessionGoal(input.sessionID)
    return { applied: true, archived, goal: getSessionGoal(input.sessionID) }
  }

  const next: SessionGoal = {
    ...resolved,
    status: input.result.verdict === "rejected" ? "in_progress" : "blocked",
  }
  writeFileSync(goalPath(input.sessionID), JSON.stringify(next, null, 2), "utf8")
  return { applied: true, goal: next }
}

/** Quarantine old model-terminal states without treating them as verified. */
export function migrateLegacyTerminalGoal(sessionID: string): GoalSnapshot {
  const cur = getSessionGoal(sessionID)
  if (cur.status === "unset") return cur
  if (cur.status !== "complete" && cur.status !== "complete_unverified") return cur
  archiveGoal(cur, "legacy_unverified")
  clearSessionGoal(sessionID)
  return getSessionGoal(sessionID)
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
  const snap = migrateLegacyTerminalGoal(input.sessionID)
  const sessionAgentRaw = input.sessionAgent?.trim() || "unknown"
  const actorAgentRaw = input.actorAgent?.trim() || sessionAgentRaw
  const sessionAgent = escapePromptField(sessionAgentRaw)
  const actorAgent = escapePromptField(actorAgentRaw)
  const actorRole = input.actorRole ?? (actorAgent === sessionAgent ? "primary" : "subagent")

  if (snap.status === "unset") {
    // No goal = no block. Injecting 7 lines of "unset" state wastes
    // ~20 tokens per turn and dilutes the prompt with non-actionable content.
    return ""
  }

  const board =
    snap.openCards !== undefined || snap.doneCards !== undefined
      ? `  board: open ${snap.openCards ?? 0} · done ${snap.doneCards ?? 0} · blocked ${snap.blockedCards ?? 0}`
      : undefined

  const goalText = snap.goal.length > 400 ? snap.goal.slice(0, 397) + "…" : snap.goal
  const scopeText = snap.scope.length > 200 ? snap.scope.slice(0, 197) + "…" : snap.scope
  const goalLine = escapePromptField(goalText)
  const scopeLine = escapePromptField(scopeText)

  const pending = snap.status === "complete_pending_verify"
  return [
    pending ? "<goal-lifecycle>" : "<active-goal>",
    `  goal: ${goalLine}`,
    `  scope: ${scopeLine}`,
    `  priority: ${snap.priority}`,
    `  status: ${snap.status}`,
    board,
    `  session_agent: ${sessionAgent}`,
    `  actor_agent: ${actorAgent}`,
    `  actor_role: ${actorRole}`,
    pending
      ? "  note: Completion was claimed and is awaiting independent verification. Do not mutate or invent a replacement goal."
      : snap.verification?.verdict === "rejected"
        ? `  verification: rejected — ${escapePromptField(snap.verification.summary ?? "criteria remain unmet")}`
        : undefined,
    !pending && snap.verification?.verdict === "rejected" && snap.verification.unmetCriteria?.length
      ? `  unmet_criteria: ${escapePromptField(snap.verification.unmetCriteria.join(" | ").slice(0, 600))}`
      : undefined,
    pending ? "</goal-lifecycle>" : "</active-goal>",
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

  const snap = migrateLegacyTerminalGoal(input.sessionID)

  if (snap.status === "complete" || snap.status === "complete_unverified") {
    return {
      allow: false,
      reason: "goal_complete",
      message:
        `Goal is ${snap.status}. Mutation tool "${input.toolName}" is frozen. ` +
        `Read-only tools remain fully available: read, grep, glob, list, websearch, question. ` +
        `Use them to summarize, analyze, or answer questions about the completed work. ` +
        `To start new work, set a new goal with goal_set or /goal.`,
    }
  }

  if (snap.status === "complete_pending_verify") {
    return {
      allow: false,
      reason: "goal_complete",
      message: `Goal is pending independent verification. Do not invent a replacement goal or mutate until it resolves.`,
    }
  }

  const strict = GATE_STRICT_AGENTS.has(agent) || agent === "build" || agent === "general"
  if (strict && snap.status === "unset") {
    return {
      allow: false,
      reason: "goal_required",
      message:
        `No active goal for this session. Set one only if the user's current request explicitly requires multi-step mutation before "${input.toolName}". ` +
        `Do not create a goal merely to unlock tools; read/search and conversational work remain available.`,
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
