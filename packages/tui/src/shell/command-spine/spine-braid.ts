/**
 * PR6: subagent braids.
 *
 * Isolated subagent sessions render as branches of the same execution spine:
 * running rows show current activity, completed rows show outcomes, crashed
 * rows stay visible with "parent unaffected". Selecting a branch navigates to
 * the isolated child session.
 *
 * The real API does not expose subagent OS pids (Session records carry no
 * pid), so the braid uses the short session id and notes "pid unavailable"
 * rather than inventing a process id.
 */

import type { Message, Part, Session, SessionStatus, ToolPart } from "@arcana/sdk/v2"
import type { SpineBraidChild, SpineBraidStatus } from "./spine-types"

export type SpineBraidInput = {
  sessions: readonly Session[]
  statusBySessionID: Readonly<Record<string, SessionStatus | undefined>>
  messagesBySessionID: Readonly<Record<string, readonly Message[] | undefined>>
  partsByMessageID: Readonly<Record<string, readonly Part[] | undefined>>
}

function lastAssistantStatus(messages: readonly Message[] | undefined): "running" | "completed" | "idle" {
  if (!messages?.length) return "idle"
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]!
    if (message.role !== "assistant") continue
    return message.time.completed ? "completed" : "running"
  }
  return "idle"
}

function toolParts(parts: Readonly<Record<string, readonly Part[] | undefined>>, messageID: string): ToolPart[] {
  return (parts[messageID] ?? []).filter(
    (part): part is ToolPart => part.type === "tool",
  )
}

function actionCount(
  messages: readonly Message[] | undefined,
  parts: Readonly<Record<string, readonly Part[] | undefined>>,
): number {
  if (!messages) return 0
  let count = 0
  for (const message of messages) {
    count += toolParts(parts, message.id).filter((part) => part.state.status === "completed").length
  }
  return count
}

function testStats(
  parts: Readonly<Record<string, readonly Part[] | undefined>>,
  messages: readonly Message[] | undefined,
): { passed?: number; failed?: number } | undefined {
  if (!messages) return undefined
  let passed: number | undefined
  let failed: number | undefined
  for (const message of messages) {
    for (const part of toolParts(parts, message.id)) {
      if (part.state.status !== "completed") continue
      const meta = part.state.metadata ?? {}
      const p = typeof meta.passed === "number" ? meta.passed : typeof meta.pass === "number" ? meta.pass : undefined
      const f = typeof meta.failed === "number" ? meta.failed : typeof meta.fail === "number" ? meta.fail : undefined
      if (p !== undefined || f !== undefined) {
        passed = (passed ?? 0) + (p ?? 0)
        failed = (failed ?? 0) + (f ?? 0)
      }
    }
  }
  return passed !== undefined || failed !== undefined ? { passed, failed } : undefined
}

function runningLine(
  messages: readonly Message[] | undefined,
  parts: Readonly<Record<string, readonly Part[] | undefined>>,
): string {
  if (!messages?.length) return "starting"
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]!
    const running = toolParts(parts, message.id).find(
      (part) => part.state.status === "running" || part.state.status === "pending",
    )
    if (running && "title" in running.state && running.state.title) return running.state.title
  }
  return "working"
}

function completedLine(
  messages: readonly Message[] | undefined,
  parts: Readonly<Record<string, readonly Part[] | undefined>>,
): string {
  const stats = testStats(parts, messages)
  if (stats) {
    return `${stats.passed ?? 0} passed · ${stats.failed ?? 0} failed`
  }
  const actions = actionCount(messages, parts)
  let duration = ""
  if (messages) {
    const first = messages.find((m) => m.role === "user")?.time?.created
    const last = messages.findLast((m) => m.role === "assistant")?.time?.completed
    if (typeof first === "number" && typeof last === "number" && last >= first) {
      duration = `${Math.round((last - first) / 1000)}s`
    }
  }
  return `completed · ${actions} action${actions === 1 ? "" : "s"}${duration ? ` · ${duration}` : ""}`
}

export function braidStatusFor(
  status: SessionStatus | undefined,
  messages: readonly Message[] | undefined,
): SpineBraidStatus {
  if (status?.type === "retry") return "crashed"
  if (status?.type === "busy") return "running"
  const assistant = lastAssistantStatus(messages)
  if (assistant === "running") return "running"
  if (assistant === "completed") return "completed"
  // No messages yet: treat a fresh child session as running (it may not have
  // streamed its first message yet), never as silently completed.
  return status ? "running" : "completed"
}

export function buildSubagentBraid(input: SpineBraidInput): SpineBraidChild[] {
  return [...input.sessions]
    .toSorted((a, b) => (a.time?.created ?? 0) - (b.time?.created ?? 0))
    .map((session) => {
      const messages = input.messagesBySessionID[session.id]
      const status = input.statusBySessionID[session.id]
      const braidStatus = braidStatusFor(status, messages)
      const line =
        braidStatus === "running"
          ? runningLine(messages, input.partsByMessageID)
          : braidStatus === "crashed"
            ? status?.type === "retry"
              ? status.message || "crashed"
              : "crashed"
            : completedLine(messages, input.partsByMessageID)
      const detail =
        braidStatus === "crashed"
          ? `crashed · parent unaffected · ${status?.type === "retry" ? status.message : "session error"}`
          : "pid unavailable · isolated child session"
      return {
        sessionID: session.id,
        agent: session.agent ?? "subagent",
        title: session.title || session.id.slice(0, 8),
        status: braidStatus,
        line,
        detail,
      }
    })
}
