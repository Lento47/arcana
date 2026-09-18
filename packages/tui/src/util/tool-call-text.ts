/**
 * Text-protocol tool calls, collapsed.
 *
 * Some agents (and harnesses without native tool parts) emit tool calls as
 * text: Anthropic-style XML (`<tool_call><function=read><parameter=filePath>…
 * `) or a JSON envelope. Dumping that markup into the transcript is
 * unreadable; this turns each call into one line — the name and its
 * parameters — and keeps a partially streamed call readable while it arrives.
 */

const CALL_OPEN = "<tool_call>"
const CALL_CLOSE = "</tool_call>"
/** The mark a collapsed call leads with. */
export const TOOL_CALL_MARK = "◆"

function compact(value: string, max = 60): string {
  const one = value.replace(/\s+/g, " ").trim()
  return one.length > max ? `${one.slice(0, max - 1)}…` : one
}

function jsonCall(body: string): string | undefined {
  if (!body.startsWith("{")) return undefined
  try {
    const parsed = JSON.parse(body) as { name?: string; arguments?: unknown }
    const name = typeof parsed.name === "string" && parsed.name.trim() ? parsed.name.trim() : "call"
    let args: unknown = parsed.arguments
    if (typeof args === "string") {
      try {
        args = JSON.parse(args)
      } catch {
        return `${TOOL_CALL_MARK} ${name} · ${compact(String(args))}`
      }
    }
    if (args && typeof args === "object") {
      const parts = Object.entries(args as Record<string, unknown>).map(([key, value]) =>
        `${key} ${compact(String(value))}`,
      )
      return `${TOOL_CALL_MARK} ${name}${parts.length ? ` · ${parts.join(" · ")}` : ""}`
    }
    return `${TOOL_CALL_MARK} ${name}`
  } catch {
    return undefined
  }
}

function xmlCall(body: string): string {
  const name = /<function=([^>]+)>/.exec(body)?.[1]?.trim()
  const params = [...body.matchAll(/<parameter=([^>]+)>([\s\S]*?)<\/parameter>/g)]
    .map((match) => `${match[1]!.trim()} ${compact(match[2]!.trim())}`)
    .filter((part) => part.trim().length > 0)
  const head = `${TOOL_CALL_MARK} ${name ?? "call"}`
  return params.length > 0 ? `${head} · ${params.join(" · ")}` : `${head} · …`
}

function formatCall(body: string): string {
  const trimmed = body.trim()
  if (!trimmed) return `${TOOL_CALL_MARK} …`
  return jsonCall(trimmed) ?? xmlCall(trimmed)
}

/**
 * Replace every `<tool_call>` block with its one-line summary. Text without
 * the marker is returned untouched; an unterminated block (still streaming)
 * collapses to what is already known plus an ellipsis.
 */
export function collapseToolCalls(text: string): string {
  if (!text.includes(CALL_OPEN)) return text
  let out = ""
  let index = 0
  while (index < text.length) {
    const start = text.indexOf(CALL_OPEN, index)
    if (start === -1) {
      out += text.slice(index)
      break
    }
    out += text.slice(index, start)
    const end = text.indexOf(CALL_CLOSE, start)
    const body = end === -1 ? text.slice(start + CALL_OPEN.length) : text.slice(start + CALL_OPEN.length, end)
    out += formatCall(body)
    if (end === -1) break
    index = end + CALL_CLOSE.length
  }
  return out
}
