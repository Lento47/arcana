import { STOP_WORDS } from "./stop-words.js"
import type {
  ExecutionPosture,
  ModelRouteHint,
  RiskLevel,
  SignalEngine,
  SignalIntent,
  ToolSignal,
  ToolSignalInput,
  TurnSignal,
  TurnSignalInput,
} from "./types.js"

const CODE_TERMS = ["code", "file", "repo", "typescript", "javascript", "python", "bug", "fix", "patch", "diff"]
const DEBUG_TERMS = ["error", "stack", "trace", "failing", "broken", "timeout", "crash", "exception"]
const RESEARCH_TERMS = ["latest", "research", "compare", "market", "news", "current", "recent", "source", "cite"]
const AUTOMATION_TERMS = ["cron", "schedule", "automate", "every", "monitor", "watch", "notify"]
const REVIEW_TERMS = ["review", "audit", "check", "verify", "safe", "risk"]
const WRITE_TOOL_TERMS = ["write", "edit", "delete", "rename", "commit", "install", "apply_patch"]
const NETWORK_TOOL_TERMS = ["fetch", "web", "http", "request", "download"]

function includesAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term))
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(2))))
}

function riskFromScore(score: number): RiskLevel {
  if (score >= 0.67) return "high"
  if (score >= 0.34) return "medium"
  return "low"
}

function postureFor(risk: RiskLevel, sandbox: boolean, approval: boolean): ExecutionPosture {
  if (approval || risk === "high") return "approval"
  if (sandbox) return "sandbox"
  if (risk === "medium") return "assist"
  return "observe"
}

function detectIntent(prompt: string): { intent: SignalIntent; labels: string[]; reasons: string[] } {
  const text = prompt.toLowerCase()
  const labels: string[] = []
  const reasons: string[] = []

  if (includesAny(text, DEBUG_TERMS)) {
    labels.push("debugging")
    reasons.push("Prompt includes failure/debugging language.")
  }
  if (includesAny(text, CODE_TERMS)) {
    labels.push("code")
    reasons.push("Prompt references code, files, or repository work.")
  }
  if (includesAny(text, RESEARCH_TERMS)) {
    labels.push("research")
    reasons.push("Prompt may require fresh or cited information.")
  }
  if (includesAny(text, AUTOMATION_TERMS)) {
    labels.push("automation")
    reasons.push("Prompt references scheduling, monitoring, or repeated work.")
  }
  if (includesAny(text, REVIEW_TERMS)) {
    labels.push("review")
    reasons.push("Prompt asks for verification, review, or risk assessment.")
  }

  if (labels.includes("debugging")) return { intent: "debugging", labels, reasons }
  if (labels.includes("code") && labels.includes("review")) return { intent: "repo_analysis", labels, reasons }
  if (labels.includes("code")) return { intent: "code_edit", labels, reasons }
  if (labels.includes("automation")) return { intent: "automation", labels, reasons }
  if (labels.includes("research")) return { intent: "research", labels, reasons }
  if (labels.includes("review")) return { intent: "review", labels, reasons }
  if (prompt.trim()) return { intent: "chat", labels: ["chat"], reasons: ["Prompt does not require a specialized route."] }
  return { intent: "unknown", labels: ["unknown"], reasons: ["Prompt is empty or ambiguous."] }
}

function routeFor(intent: SignalIntent, input: TurnSignalInput): ModelRouteHint {
  if (input.userSovereignty?.preferLocal) return { profile: "local", reason: "User sovereignty profile prefers local inference." }
  if (intent === "code_edit" || intent === "debugging") return { profile: "code", reason: "Code or debugging task detected." }
  if (intent === "repo_analysis" || intent === "review") return { profile: "reasoning", reason: "Review task benefits from deliberate reasoning." }
  if (intent === "research") return { profile: "balanced", reason: "Research task needs balanced quality and latency." }
  if (intent === "automation") return { profile: "fast", reason: "Automation tasks should minimize latency and cost unless escalated." }
  return { profile: "balanced", reason: "Default route for general prompts." }
}

export function analyzeTurn(input: TurnSignalInput): TurnSignal {
  const prompt = input.prompt ?? ""
  const text = prompt.toLowerCase()
  const detected = detectIntent(prompt)
  const reasons = [...detected.reasons]
  let score = 0.12

  const needsWeb = includesAny(text, RESEARCH_TERMS)
  const needsMemory = detected.intent !== "chat" && detected.intent !== "unknown"
  const needsSandbox = detected.intent === "code_edit" || detected.intent === "debugging" || detected.intent === "repo_analysis"
  let needsApproval = false

  if (needsWeb) score += 0.12
  if (needsSandbox) score += 0.18
  if (detected.intent === "automation") score += 0.16
  if (detected.intent === "review") score += 0.12
  if (input.availableTools?.some((tool) => includesAny(tool.toLowerCase(), WRITE_TOOL_TERMS))) score += 0.12
  if (input.userSovereignty?.requireApprovalForWrites && needsSandbox) needsApproval = true
  if (input.userSovereignty?.requireApprovalForNetwork && needsWeb) needsApproval = true

  if (needsApproval) reasons.push("User sovereignty profile requires approval for this class of action.")
  if (needsSandbox && !input.sandboxEnabled) reasons.push("Task would benefit from sandboxed execution.")
  if (needsWeb) reasons.push("Task may require network-backed evidence or freshness.")

  const confidenceValue = clampScore(0.55 + Math.min(detected.labels.length, 4) * 0.09)
  const risk = riskFromScore(score)

  return {
    kind: "turn",
    intent: detected.intent,
    risk,
    executionPosture: postureFor(risk, needsSandbox && !input.sandboxEnabled, needsApproval),
    modelRoute: routeFor(detected.intent, input),
    confidence: {
      value: confidenceValue,
      reasons: detected.labels.length ? ["Intent matched heuristic signal labels."] : ["No strong intent labels matched."],
    },
    needs: {
      sandbox: needsSandbox,
      approval: needsApproval,
      web: needsWeb,
      memory: needsMemory || Number(input.memoryCandidateCount ?? 0) > 0,
    },
    labels: detected.labels,
    reasons,
  }
}

const DESTRUCTIVE_GUARD_RULES = [
  "WHOLESALE_REPLACEMENT",
  "BLOCK_DELETION",
  "BLOCK_INSERTION",
  "PERMISSION_POLICY_EDIT",
  "SELF_AWARENESS_DESTRUCTIVE",
  "FILE_DELETE",
  "FILE_MOVE",
]

export function analyzeTool(input: ToolSignalInput): ToolSignal {
  const toolName = input.toolName.toLowerCase()
  const argText = JSON.stringify(input.args ?? {}).toLowerCase()
  const labels: string[] = []
  const reasons: string[] = []
  let score = 0.08

  if (includesAny(toolName, WRITE_TOOL_TERMS) || includesAny(argText, WRITE_TOOL_TERMS)) {
    labels.push("write-capable")
    reasons.push("Tool or arguments indicate filesystem/package/git mutation.")
    score += 0.42
  }
  if (includesAny(toolName, NETWORK_TOOL_TERMS) || includesAny(argText, NETWORK_TOOL_TERMS)) {
    labels.push("network-capable")
    reasons.push("Tool or arguments indicate network access.")
    score += 0.24
  }
  if (argText.includes("secret") || argText.includes("token") || argText.includes("api_key")) {
    labels.push("secret-adjacent")
    reasons.push("Arguments may reference credentials or secret material.")
    score += 0.18
  }

  const matchedGuardRules = input.guardRules?.filter((rule) => DESTRUCTIVE_GUARD_RULES.includes(rule)) ?? []
  if (matchedGuardRules.length > 0) {
    labels.push("destructive-edit")
    reasons.push(`File-edit guard flagged destructive patterns: ${matchedGuardRules.join(", ")}.`)
    score += 0.25
  }

  const needsApproval =
    (input.userSovereignty?.requireApprovalForWrites && labels.includes("write-capable")) ||
    (input.userSovereignty?.requireApprovalForNetwork && labels.includes("network-capable")) ||
    matchedGuardRules.includes("PERMISSION_POLICY_EDIT")

  if (needsApproval) reasons.push("User sovereignty profile requires approval for this tool class.")
  if (!labels.length) {
    labels.push("low-risk")
    reasons.push("Tool does not match write, network, or secret-adjacent signals.")
  }

  const risk = riskFromScore(score)
  return {
    kind: "tool",
    toolName: input.toolName,
    risk,
    executionPosture: postureFor(risk, !input.sandboxEnabled && labels.includes("write-capable"), Boolean(needsApproval)),
    confidence: {
      value: clampScore(0.62 + Math.min(labels.length, 3) * 0.08),
      reasons: ["Tool signal generated from local deterministic heuristics."],
    },
    labels,
    reasons,
    guardRules: input.guardRules,
  }
}

export function createSignalEngine(): SignalEngine {
  return { analyzeTurn, analyzeTool }
}

// --- Cross-turn loop detection ---

function simpleHash(input: string): string {
  let hash = 0
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i)
    hash = ((hash << 5) - hash + char) | 0
  }
  return hash.toString(36)
}

/**
 * Compute a semantic fingerprint for a response.
 * Uses content-bearing tokens only (filters stop words, short tokens).
 * Returns a compact hash string stable for identical content.
 */
export function computeResponseFingerprint(response: string): string {
  const tokens = (response.toLowerCase().match(/[a-z0-9_./-]+/g) ?? [])
    .filter((t) => t.length >= 3 && !STOP_WORDS.has(t))
  const unique = [...new Set(tokens)].sort().slice(0, 30)
  return simpleHash(unique.join("|"))
}

export type CrossTurnLoopResult = {
  detected: boolean
  consecutiveSimilar: number
  warning: string | null
}

/**
 * Detect whether the agent is stuck in a cross-turn loop by comparing
 * the current response's fingerprint against recent turn fingerprints.
 * A loop is detected when ≥2 consecutive recent turns have the same fingerprint.
 */
export function detectCrossTurnLoop(
  currentFingerprint: string,
  recentFingerprints: ReadonlyArray<{ readonly hash: string; readonly timestamp: number }>,
): CrossTurnLoopResult {
  if (recentFingerprints.length < 2) {
    return { detected: false, consecutiveSimilar: 0, warning: null }
  }

  const recent = recentFingerprints.slice(-5)
  let consecutive = 0
  for (let i = recent.length - 1; i >= 0; i--) {
    if (recent[i].hash === currentFingerprint) {
      consecutive++
    } else {
      break
    }
  }

  if (consecutive >= 2) {
    return {
      detected: true,
      consecutiveSimilar: consecutive,
      warning: [
        `You have produced ${consecutive + 1} consecutive responses with the same approach.`,
        "This is a loop. You MUST try a fundamentally different strategy.",
        "Do NOT repeat the same tool calls, the same analysis, or the same suggestions.",
        "If you are stuck, explicitly state what is not working and ask the user for clarification.",
      ].join(" "),
    }
  }

  return { detected: false, consecutiveSimilar: consecutive, warning: null }
}
