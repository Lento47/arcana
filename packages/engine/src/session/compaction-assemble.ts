/**
 * Full-replace compaction assembly helpers (P2).
 *
 * Arcana's post-compact model view is assembled at read time by
 * `MessageV2.filterCompacted`:
 *
 * ```text
 * [compaction-user, summary-assistant, ...retained tail..., continue-user?]
 * ```
 *
 * These helpers make the **head** (summarized region) and **tail** (verbatim)
 * cut tool-pair safe, prepare head content for the summarizer, and format
 * continuation guidance after a successful full-replace.
 */

import type { SessionV1 } from "@arcana/core/v1/session"
import type { MessageID } from "./schema"

const DEFAULT_TOOL_OUTPUT_MAX = 2_000

export type WithParts = SessionV1.WithParts

/** True when an assistant message has tool parts that never finished. */
export function hasIncompleteTools(message: WithParts): boolean {
  if (message.info.role !== "assistant") return false
  return message.parts.some(
    (p) => p.type === "tool" && (p.state.status === "pending" || p.state.status === "running"),
  )
}

/**
 * Drop a trailing assistant that still has incomplete tool calls so the head
 * sent to the summarizer never ends mid tool_use (strict providers reject that).
 */
export function dropTrailingIncompleteAssistant(messages: WithParts[]): WithParts[] {
  if (messages.length === 0) return messages
  let end = messages.length
  while (end > 0 && hasIncompleteTools(messages[end - 1]!)) {
    end--
  }
  return end === messages.length ? messages : messages.slice(0, end)
}

/**
 * Ensure the retained tail does not start on an assistant with incomplete tools.
 * Walks forward past incomplete assistants; keeps mid-turn assistant cuts that
 * are complete (preserves budget-based splitTurn behavior).
 */
export function toolPairSafeTailStart(
  messages: WithParts[],
  startIndex: number,
): { start: number; id: MessageID } | undefined {
  if (startIndex <= 0 || startIndex >= messages.length) return undefined

  let i = startIndex
  while (i < messages.length && hasIncompleteTools(messages[i]!)) {
    i++
  }
  if (i >= messages.length) return undefined
  if (i === 0) return undefined
  return { start: i, id: messages[i]!.info.id }
}

/**
 * When dropping messages from the front of the head (budget pressure), only
 * drop complete user→… turns so we never orphan the second half of a tool pair.
 */
export function dropCompleteTurnsFromFront(messages: WithParts[], dropCount: number): WithParts[] {
  if (dropCount <= 0 || messages.length === 0) return messages
  let dropped = 0
  let i = 0
  while (i < messages.length && dropped < dropCount) {
    // Advance to next user boundary after current message
    if (messages[i]!.info.role !== "user") {
      i++
      continue
    }
    let j = i + 1
    while (j < messages.length && messages[j]!.info.role !== "user") j++
    // Drop turn [i, j)
    dropped += j - i
    i = j
  }
  if (i === 0) return messages
  // Never leave fewer than one message if we can help it
  if (i >= messages.length) return messages.slice(-1)
  return messages.slice(i)
}

/**
 * Truncate completed tool outputs for summarizer input only (does not mutate originals
 * if caller clones). Caps each tool output string.
 */
export function prepareHeadForSummarization(
  messages: WithParts[],
  maxToolChars = DEFAULT_TOOL_OUTPUT_MAX,
): WithParts[] {
  return messages.map((msg) => {
    if (msg.info.role !== "assistant") return msg
    let changed = false
    const parts = msg.parts.map((part) => {
      if (part.type !== "tool") return part
      if (part.state.status !== "completed") return part
      const out = part.state.output
      if (typeof out !== "string" || out.length <= maxToolChars) return part
      changed = true
      return {
        ...part,
        state: {
          ...part.state,
          output: out.slice(0, maxToolChars) + "\n…[truncated for compaction summary]",
        },
      }
    })
    return changed ? { ...msg, parts } : msg
  })
}

/**
 * Documented full-replace layout for tests and future assemblers.
 * Matches what filterCompacted produces for model consumption.
 */
export type FullReplaceAssembly = {
  /** Compaction marker user message id */
  compactionUserID: string
  /** Summary assistant message id */
  summaryAssistantID: string
  /** Verbatim retained tail starting message id (optional) */
  tailStartID?: string
  /** Optional synthetic continue user after compact */
  continueUserID?: string
}

/**
 * Wrap LLM summary text so the model knows it replaces earlier turns.
 * Idempotent if already prefixed.
 */
export function formatSummaryCarrier(summary: string): string {
  const body = summary.trim()
  if (!body) return body
  if (body.startsWith("## Compaction summary") || body.includes("<compaction-summary>")) return body
  return [
    "## Compaction summary",
    "",
    body,
    "",
    "Treat the above as the authoritative record of earlier conversation turns.",
    "Messages that follow (if any) are recent verbatim context that was not summarized.",
  ].join("\n")
}

/**
 * Post-compact continuation guidance for the agent (synthetic user text).
 */
export function buildContinuationText(input: {
  overflow?: boolean
  /** Optional session goal / title hint */
  focus?: string
}): string {
  const focus = input.focus?.trim()
  const media =
    input.overflow === true
      ? "The previous request exceeded the provider's size limit due to large media attachments. The conversation was compacted and media files were removed from context. If the user was asking about attached images or files, explain that the attachments were too large to process and suggest they try again with smaller or fewer files.\n\n"
      : ""
  const goalLine = focus
    ? `Active focus: ${focus}\n\n`
    : ""
  return (
    media +
    goalLine +
    "Context was compacted into a summary plus recent turns. " +
    "Continue from the summary and recent messages. " +
    "If you have clear next steps, proceed; otherwise stop and ask for clarification."
  )
}
