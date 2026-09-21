/**
 * Text-protocol tool calls, collapsed.
 *
 * Some agents (and harnesses without native tool parts) emit tool calls as
 * text: Anthropic-style XML (`<tool_call><function=read><parameter=filePath>…
 * `) or a JSON envelope. Dumping that markup into the transcript is
 * unreadable; this turns each call into one line — the name and its
 * parameters — and keeps a partially streamed call readable while it arrives.
 */

/** The mark a collapsed call leads with. */
export const TOOL_CALL_MARK = "◆"

// Model-generated markup varies in case and spacing (`<Tool_Call>`,
// `<tool_call >`), so matching is case-insensitive and whitespace-tolerant.
// An exact `indexOf("<tool_call>")` let those variants paint raw.
const CALL_OPEN_RE = /<\s*tool_call\s*>/i
const CALL_OPEN_GLOBAL_RE = /<\s*tool_call\s*>/gi
const CALL_CLOSE_RE = /<\s*\/\s*tool_call\s*>/i
const CALL_CLOSE_GLOBAL_RE = /<\s*\/\s*tool_call\s*>/gi

function compact(value: string, max = 60): string {
  const one = value.replace(/\s+/g, " ").trim()
  return one.length > max ? `${one.slice(0, max - 1)}…` : one
}

/**
 * A parameter value as the collapsed row shows it: a path-like value (slashes,
 * no whitespace — commands have spaces, paths do not) renders as parent +
 * basename under an ellipsis, so a workspace root does not spend the row.
 */
function shortValue(value: string): string {
  const trimmed = value.trim()
  if (!/[/\\]/.test(trimmed) || /\s/.test(trimmed)) return value
  const parts = trimmed.replace(/\\/g, "/").split("/").filter(Boolean)
  if (parts.length <= 2) return value
  return `…/${parts.slice(-2).join("/")}`
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
    .map((match) => `${match[1]!.trim()} ${compact(shortValue(match[2]!.trim()))}`)
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
 * collapses to what is already known plus an ellipsis. A closer without an
 * opener is markup residue — it is stripped from gap text rather than painted.
 */
export function collapseToolCalls(text: string): string {
  if (!CALL_OPEN_RE.test(text) && !CALL_CLOSE_RE.test(text)) return text
  let out = ""
  let index = 0
  while (index < text.length) {
    CALL_OPEN_GLOBAL_RE.lastIndex = index
    const open = CALL_OPEN_GLOBAL_RE.exec(text)
    if (!open) {
      out += text.slice(index).replace(CALL_CLOSE_GLOBAL_RE, "")
      break
    }
    out += text.slice(index, open.index).replace(CALL_CLOSE_GLOBAL_RE, "")
    const bodyStart = open.index + open[0].length
    const rest = text.slice(bodyStart)
    const close = CALL_CLOSE_RE.exec(rest)
    if (!close) {
      out += formatCall(rest)
      break
    }
    out += formatCall(rest.slice(0, close.index))
    index = bodyStart + close.index + close[0].length
  }
  return out
}

/**
 * Display-boundary sanitizer for model-shaped text (assistant prose, task
 * reports, step labels, think bodies): engine model-metadata blocks are
 * removed, then text-protocol tool calls collapse to one line each. Text
 * without either marker passes through untouched. Code bodies keep their own
 * path (ANSI strip only) — collapsing inside source would rewrite evidence.
 */
export function sanitizeForDisplay(text: string): string {
  if (!text) return text
  const noReminders = text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>\s*/gi, "")
  return collapseToolCalls(noReminders)
}
