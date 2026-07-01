import type { Part } from "@arcana/sdk/v2"

const ARCANA_PROMPT_COMMANDS = new Set(["contract", "actions", "diffgate", "verify", "sovereignty"])
const ARCANA_HIGH_RISK_PATTERN =
  /\b(auth|security|permission|dependency|install|upgrade|lockfile|package|token|secret|credential|payment|billing|database|migration|deploy|production|prod)\b/i
const ARCANA_CRITICAL_RISK_PATTERN =
  /\b(rm\s+-rf|delete|drop|truncate|destroy|wipe|reset\s+--hard|force-push|revoke|rotate\s+secret|prod(?:uction)?\s+deploy)\b/i

export type ArcanaTaskMetadata = {
  command: string
  risk?: string
}

export function parseArcanaPromptCommand(input: string): { command: string; arguments: string } | undefined {
  if (!input.startsWith("/")) return
  const firstLineEnd = input.indexOf("\n")
  const firstLine = firstLineEnd === -1 ? input : input.slice(0, firstLineEnd)
  const restOfInput = firstLineEnd === -1 ? "" : input.slice(firstLineEnd + 1)
  const [head = "", ...firstLineArgs] = firstLine.split(" ")
  const command = head.slice(1)
  if (!ARCANA_PROMPT_COMMANDS.has(command)) return

  return {
    command,
    arguments: firstLineArgs.join(" ") + (restOfInput ? "\n" + restOfInput : ""),
  }
}

export function arcanaRiskForTask(task: string) {
  if (ARCANA_CRITICAL_RISK_PATTERN.test(task)) return "critical"
  if (ARCANA_HIGH_RISK_PATTERN.test(task)) return "high"
  return "medium"
}

export function arcanaTaskFromPart(part: Part): ArcanaTaskMetadata | undefined {
  if (part.type !== "text") return
  const metadata = part.metadata
  if (!metadata || typeof metadata !== "object") return
  const arcana = metadata.arcana
  if (!arcana || typeof arcana !== "object") return
  const command = (arcana as { command?: unknown; risk?: unknown }).command
  const risk = (arcana as { command?: unknown; risk?: unknown }).risk
  if (typeof command !== "string") return
  return {
    command,
    ...(typeof risk === "string" ? { risk } : {}),
  }
}

export function arcanaCommandFromPart(part: Part) {
  const task = arcanaTaskFromPart(part)
  const command = task?.command
  return typeof command === "string" ? command : undefined
}

export function promptTextFromPart(part: Part) {
  if (part.type !== "text" || part.synthetic) return ""
  const command = arcanaCommandFromPart(part)
  return command ? `/${command} ${part.text}` : part.text
}
