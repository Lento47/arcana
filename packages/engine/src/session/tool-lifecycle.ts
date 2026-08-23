import { SessionV1 } from "@arcana/core/v1/session"

export type ToolRecovery = {
  messages: SessionV1.WithParts[]
  recovered: SessionV1.ToolPart[]
}

/**
 * Repair durable tool rows that cannot still be executing because their
 * owning assistant message is already terminal. The engine writes the repair;
 * presentation layers must never invent a successful result for these rows.
 */
export function recoverCompletedTurnTools(
  messages: readonly SessionV1.WithParts[],
  recoverLatest: boolean = false,
  now: number = Date.now(),
): ToolRecovery {
  const recovered: SessionV1.ToolPart[] = []
  const next = messages.map((message, index) => {
    if (message.info.role !== "assistant") return message
    const isSuperseded = index < messages.length - 1
    if (message.info.time.completed === undefined && !isSuperseded && !recoverLatest) return message

    const completedAt = message.info.time.completed
    let changed = false
    const parts = message.parts.map((part) => {
      if (part.type !== "tool" || (part.state.status !== "pending" && part.state.status !== "running")) return part
      changed = true
      const start = part.state.status === "running" ? part.state.time.start : message.info.time.created
      const repaired: SessionV1.ToolPart = {
        ...part,
        state: {
          status: "cancelled",
          reason: "recovered_stale",
          input: part.state.input,
          title: part.state.status === "running" ? part.state.title : part.tool,
          output: part.state.status === "running" ? part.state.output : undefined,
          metadata: part.state.status === "running" ? part.state.metadata : undefined,
          time: { start, end: Math.max(start, completedAt ?? now) },
        },
      }
      recovered.push(repaired)
      return repaired
    })
    return changed ? { ...message, parts } : message
  })
  return { messages: next, recovered }
}

export * as SessionToolLifecycle from "./tool-lifecycle"
