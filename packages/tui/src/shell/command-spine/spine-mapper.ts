import type { Message, Part, ToolPart, TextPart, PatchPart, ReasoningPart } from "@arcana/sdk/v2"
import type { SpineEntry, SpineKind, SpineReportData, SpineConcernSeverity, SpineReceipt } from "./spine-types"
import { SPINE_GLYPH } from "./spine-types"
import { reasoningSummary } from "../../context/thinking"

const INSPECT_TOOLS = new Set([
  "read",
  "glob",
  "grep",
  "search",
  "web_search",
  "web_fetch",
  "fetch",
  "list",
  "list_files",
  "directory_list",
  "file_search",
  "ripgrep",
  "find",
])

const PATCH_TOOLS = new Set([
  "edit",
  "write",
  "patch",
  "apply_patch",
  "create",
  "overwrite",
  "insert",
  "rename",
  "delete_file",
  "move_file",
  "copy_file",
])

const RUN_TOOLS = new Set(["bash", "shell", "exec", "run", "command", "terminal", "powershell"])

function toolToSpineKind(tool: string): SpineKind {
  if (RUN_TOOLS.has(tool)) return "run"
  if (PATCH_TOOLS.has(tool)) return "patch"
  if (INSPECT_TOOLS.has(tool)) return "inspect"

  const lower = tool.toLowerCase()
  if (
    lower.includes("search") ||
    lower.includes("read") ||
    lower.includes("fetch") ||
    lower.includes("find") ||
    lower.includes("list")
  )
    return "inspect"
  if (lower.includes("edit") || lower.includes("write") || lower.includes("patch")) return "patch"
  if (
    lower.includes("run") ||
    lower.includes("exec") ||
    lower.includes("shell") ||
    lower.includes("bash") ||
    lower.includes("cmd")
  )
    return "run"

  return "inspect"
}

function formatElapsed(ms: number | undefined): string {
  if (ms === undefined || ms < 0) return ""

  if (ms >= 3600000) {
    const h = Math.floor(ms / 3600000)
    const m = Math.floor((ms % 3600000) / 60000)
    return `+${h}h`
  }
  if (ms >= 60000) {
    return `+${Math.round(ms / 60000)}m`
  }
  if (ms < 1000) return `+${Math.round(ms)}ms`
  const s = Math.round(ms / 1000)
  return s >= 1 ? `+${s}s` : ""
}

function formatTimestamp(ms: number | undefined): string | undefined {
  if (ms === undefined || !Number.isFinite(ms) || ms <= 0) return undefined
  const date = new Date(ms)
  if (Number.isNaN(date.getTime())) return undefined
  // HH:MM only — seconds bloated the left gutter without adding scan value.
  return date.toLocaleTimeString("en-GB", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  })
}

function isTextRelevant(part: TextPart): boolean {
  if (part.ignored) return false
  if (part.synthetic) return false
  if (!part.text?.trim()) return false
  return true
}

function kindLabel(kind: SpineKind, fallback?: string): string {
  if (fallback) return fallback
  switch (kind) {
    case "run": return "incantation"
    case "inspect": return "codex"
    case "patch": return "transmutation"
    case "report": return "divination"
    case "fail": return "omen"
    case "ask": return "you"
    case "plan": return "insight"
    case "ok": return "coda"
    case "think": return ""
    case "agent": return "familiar"
    default: return kind
  }
}

function truncate(text: string, max = 500): string {
  if (text.length <= max) return text
  return text.slice(0, max).trimEnd() + "…"
}

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
}

/** Strip ANSI escape sequences (SGR color codes, cursor movement, etc.). */
function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "").replace(/\x1b\][^\x07]*\x07/g, "")
}

function preserveBodyText(text: string): string {
  return normalizeNewlines(text)
}

function cleanText(text: string): string {
  return preserveBodyText(text).trim()
}

/** Parse subagent task output into a structured report. Extracts summary paragraph,
 *  scorecard entries, and concerns from markdown sections. Returns undefined if
 *  the output doesn't match the expected report format. */
function parseReportSections(md: string): SpineReportData | undefined {
  const sections = splitMarkdownSections(md)
  const summary = sections.get("Summary") ?? sections.get("summary") ?? ""
  const scorecard = parseScorecard(sections.get("Architecture Scorecard") ?? sections.get("Scorecard") ?? "")
  const concerns = parseConcerns(sections.get("Major Concerns") ?? sections.get("MAJOR CONCERNS") ?? "")
  const title = extractFirstHeading(md) ?? "Subagent analysis"

  if (!summary && !concerns.length && !scorecard.length) return undefined

  return {
    title,
    summary: summary.slice(0, 280),
    scorecard,
    concerns: concerns.slice(0, 8),
    body: md,
  }
}

function splitMarkdownSections(md: string): Map<string, string> {
  const map = new Map<string, string>()
  const parts = md.split(/^## /m)
  for (const part of parts) {
    const nl = part.indexOf("\n")
    if (nl === -1) continue
    map.set(part.slice(0, nl).trim(), part.slice(nl + 1).trim())
  }
  return map
}

function extractFirstHeading(md: string): string | undefined {
  const m = md.match(/^# ([^\n]+)/)
  return m?.[1]?.trim().slice(0, 80)
}

function parseScorecard(section: string): SpineReportData["scorecard"] {
  const items: SpineReportData["scorecard"] = []
  for (const line of section.split("\n")) {
    const m = line.match(/^\s*[-*]\s+(.+?)\s*[—:-]\s*(.+)/)
    if (!m) continue
    const label = m[1].trim()
    const rest = m[2].toLowerCase()
    const status: SpineReportData["scorecard"][0]["status"] =
      rest.includes("pass") || rest.includes("✅") || rest.includes("✔") ? "pass"
      : rest.includes("fail") || rest.includes("❌") || rest.includes("✘") ? "fail"
      : "warn"
    items.push({ label, status })
  }
  return items
}

function parseConcerns(section: string): SpineReportData["concerns"] {
  const items: SpineReportData["concerns"] = []
  const blocks = section.split(/\n(?=###?\s+)/)
  for (const block of blocks) {
    const headMatch = block.match(/^###?\s*(?:\[(HIGH|MEDIUM|LOW)\]\s*)?(.+)/m)
    if (!headMatch) continue
    const severity = (headMatch[1] ?? "MEDIUM") as SpineConcernSeverity
    const title = headMatch[2].trim().slice(0, 120)
    const detail = block.slice(headMatch[0].length).trim().slice(0, 300)
    items.push({ severity, title, detail })
  }
  if (!items.length) {
    for (const line of section.split("\n")) {
      const m = line.match(/^\s*[-*]\s*\*?\*?(HIGH|MEDIUM|LOW)\*?\*?:?\s*(.+)/i)
      if (!m) continue
      items.push({ severity: m[1].toUpperCase() as SpineConcernSeverity, title: m[2].trim().slice(0, 120), detail: "" })
    }
  }
  return items
}

/** Strip XML wrappers: <task>, <task_result>, <task_id>. */
function stripTaskXml(output: string): string {
  return output
    .replace(/<\/?task[^>]*>/gi, "")
    .replace(/<\/?task_result[^>]*>/gi, "")
    .replace(/<\/?task_id[^>]*>/gi, "")
    .replace(/<task_description>[\s\S]*?<\/task_description>/gi, "")
    .trim()
}

/** Strip engine XML wrapper from read tool output — keeps only file content.
 *  Also extracts <system-reminder> blocks so the prose layer can render them
 *  as callout cards separate from the main code body. */
function stripReadXml(output: string): { body: string; reminders: string[] } {
  const reminders: string[] = []
  let content = output

  // Pull <system-reminder> blocks out before stripping other XML.
  content = content.replace(/<system-reminder>([\s\S]*?)<\/system-reminder>/g, (_, text) => {
    reminders.push(text.trim())
    return ""
  })

  // Remove <path>, <type>, and wrapping <file-content> tags.
  content = content
    .replace(/<path>[^<]*<\/path>\s*/g, "")
    .replace(/<type>[^<]*<\/type>\s*/g, "")
    .replace(/<\/?file-content>/g, "")
    .trim()

  return { body: content, reminders }
}

function firstLineSummary(text: string, max = 120): string {
  const cleaned = cleanText(text)
  const first = cleaned.split("\n").find((line) => line.trim()) ?? cleaned
  return truncate(first.trim(), max)
}

function sentenceCase(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return trimmed
  return trimmed[0]!.toUpperCase() + trimmed.slice(1)
}

function normalizeThinkingLine(line: string): string {
  let value = line
    .trim()
    .replace(/^#{1,6}\s+/, "")
    .replace(/^(?:[-*]|\d+[.)])\s+/, "")
    .replace(/^['"`]+|['"`]+$/g, "")
    .replace(/^(?:okay|ok|alright|so)[,.:;\s-]+/i, "")
    .replace(/^the user wants/i, "User wants")
    .replace(/^the user is asking(?: me)? to\s+/i, "Need to ")
    .replace(/^(?:i|we)\s+(?:need|have|want)\s+to\s+/i, "")
    .replace(/^(?:i|we)\s+should\s+/i, "")
    .replace(/^let(?:'|’)s\s+/i, "")
    .replace(/^(?:i am|i'm|we are|we're)\s+/i, "")

  value = value.replace(/^need to\s+/i, "")
  return sentenceCase(value)
}

function isGenericThinkingLine(line: string): boolean {
  return /^(?:think|thinking|reasoning|analysis|analyzing|figure out|understand|working through)(?:\b|…|\.\.\.)/i.test(
    line.trim(),
  )
}

function isLowSignalThinkingLine(line: string): boolean {
  return /^(?:more detail|details?|step by step|step one|next step|continuing)(?:\b|\.|…|\.\.\.)/i.test(line.trim())
}

function thinkingSummary(text: string, seed: string): string {
  // Prefer OpenAI-style **Title** — compact slug for the spine header.
  const content = text.trim()
  if (!content) return "Thinking"
  const titleMatch = content.match(/^\*\*([^*\n]+)\*\*(?:\r?\n\r?\n|$)/)
  if (titleMatch?.[1]) return truncate(titleMatch[1].trim(), 36)
  // Fixed verb — avoids confusing glyph salad across entries.
  return "Thinking"
}

const EMPTY_PARTS: Part[] = []

/** Chat prose (ask / plan / ok): never character-truncate with "…". Terminal wraps instead. */
function chatTextView(text: string): {
  summary: string
  body?: string
  collapsible: boolean
  expandedByDefault: boolean
} {
  const full = preserveBodyText(text)
  const cleaned = cleanText(full)
  if (!cleaned) {
    return { summary: "…", collapsible: false, expandedByDefault: false }
  }

  // Single paragraph: full text on the spine line; OpenTUI word-wraps it.
  if (!full.includes("\n")) {
    return { summary: cleaned, collapsible: false, expandedByDefault: false }
  }

  const lines = full.split("\n")
  const firstIdx = lines.findIndex((line) => line.trim().length > 0)
  const first = (firstIdx >= 0 ? lines[firstIdx]! : cleaned).trimEnd()
  const rest = lines.slice(Math.max(0, firstIdx) + 1).join("\n")

  if (!rest.trim()) {
    return { summary: first.trim(), collapsible: false, expandedByDefault: false }
  }

  return {
    summary: first.trim(),
    // Remainder only — first line is already the summary (no duplicated open).
    body: rest.replace(/^\n+/, ""),
    collapsible: true,
    expandedByDefault: true,
  }
}

function joinTextBodies(parts: TextPart[]): string {
  return parts
    .map((part) => preserveBodyText(part.text))
    .filter((text) => text.trim())
    .join("\n\n")
}

function diffTitleFromBody(body: string, fallback: string): string {
  const lines = cleanText(body).split("\n")
  const fileLine = lines.find((line) => line.startsWith("+++ ")) ?? lines.find((line) => line.startsWith("--- "))
  if (!fileLine) return fallback
  return (
    fileLine
      .replace(/^(\+\+\+|---)\s+[ab]\//, "")
      .replace(/^(\+\+\+|---)\s+/, "")
      .trim() || fallback
  )
}

function splitDiffBody(body: string): { left: string; right: string } {
  const lines = cleanText(body).split("\n").slice(0, 16)
  const left: string[] = []
  const right: string[] = []
  for (const line of lines) {
    if (line.startsWith("+") && !line.startsWith("+++")) {
      right.push(line)
      continue
    }
    if (line.startsWith("-") && !line.startsWith("---")) {
      left.push(line)
      continue
    }
    left.push(line)
    right.push(line)
  }
  return { left: left.join("\n"), right: right.join("\n") }
}

function diffFilesFromBody(body: string, fallback: string): string[] {
  const files: string[] = []
  const seen = new Set<string>()
  const add = (value: string) => {
    const file = value.replace(/^[ab]\//, "").trim()
    if (!file || file === "/dev/null" || seen.has(file)) return
    seen.add(file)
    files.push(file)
  }

  for (const line of cleanText(body).split("\n")) {
    const git = line.match(/^diff --git\s+a\/(.*?)\s+b\/(.*)$/)
    if (git?.[2]) add(git[2])
    if (line.startsWith("+++ ")) add(line.replace(/^\+\+\+\s+/, ""))
    else if (line.startsWith("--- ")) add(line.replace(/^---\s+/, ""))
  }

  if (files.length) return files
  return fallback
    .split(",")
    .map((file) => file.trim())
    .filter(Boolean)
}

function formatPatchHeadline(fileCount: number, stats: { added?: number; removed?: number } | undefined, hasDiff: boolean) {
  const scope = fileCount > 0 ? `${fileCount} file${fileCount === 1 ? "" : "s"}` : "file path unavailable"
  const parts = [scope]
  if (hasDiff && (stats?.added !== undefined || stats?.removed !== undefined)) {
    parts.push(`+${stats.added ?? 0} -${stats.removed ?? 0}`)
  }
  parts.push(hasDiff ? "diff" : fileCount > 0 ? "file-list only" : "evidence incomplete")
  return parts.join(" · ")
}
/** Detect CLI table output (PowerShell/bash columnar tables).
 *  Returns headers + data rows, or null if not a table. */
function parseTableOutput(text: string): { headers: string[]; rows: string[][] } | null {
  const lines = cleanText(text).split("\n")
  if (lines.length < 3) return null
  // Detect separator line like "----  ----  ----"
  const sepIdx = lines.findIndex((l) => /^[\s-]{6,}/.test(l) && l.includes("-"))
  if (sepIdx < 1 || sepIdx >= lines.length - 1) return null
  const headerLine = lines[sepIdx - 1]
  if (!headerLine) return null
  // Split headers by 2+ spaces
  const headers = headerLine.split(/\s{2,}/).map((h) => h.trim()).filter(Boolean)
  if (headers.length < 2) return null
  const dataLines = lines.slice(sepIdx + 1).filter((l) => l.trim() && !/^[\s-]{6,}/.test(l))
  if (!dataLines.length) return null
  const rows = dataLines.map((line) => {
    const cols = line.split(/\s{2,}/).map((c) => c.trim())
    while (cols.length < headers.length) cols.push("")
    return cols.slice(0, headers.length)
  })
  return { headers, rows }
}

function getRunSummary(part: ToolPart): string {
  const input = part.state.input as Record<string, unknown>
  const command = (input.command as string) ?? (input.cmd as string) ?? ""
  if (command) return command
  if (part.state.status === "running" && part.state.title) return part.state.title
  if (part.state.status === "completed" && part.state.title) return part.state.title
  return ""
}

function getPatchSummary(part: ToolPart): string {
  const input = part.state.input as Record<string, unknown>
  const filePath = (input.filePath as string) ?? (input.path as string) ?? (input.file as string) ?? ""
  const filePattern = (input.pattern as string) ?? ""
  return filePath || filePattern || ""
}

function getInspectSummary(part: ToolPart): string {
  const input = part.state.input as Record<string, unknown>
  const filePath = (input.filePath as string) ?? (input.path as string) ?? (input.file as string) ?? ""
  const pattern = (input.pattern as string) ?? (input.query as string) ?? (input.glob as string) ?? ""
  if (filePath) return filePath
  if (pattern) return pattern
  if (part.state.status === "running" && part.state.title) return part.state.title
  if (part.state.status === "completed" && part.state.title) return part.state.title
  return part.tool
}

function computeElapsed(
  assistantDuration: ReadonlyMap<string, number> | undefined,
  message: Message,
  toolPart?: ToolPart,
): string {
  if (toolPart) {
    const state = toolPart.state
    if ("time" in state && state.time && "end" in state.time && state.time.end && "start" in state.time) {
      return formatElapsed(state.time.end - state.time.start)
    }
  }

  if (message.role === "assistant") {
    const dur = assistantDuration?.get(message.id)
    if (dur !== undefined) return formatElapsed(dur)
    if (message.time.completed) {
      return formatElapsed(message.time.completed - message.time.created)
    }
  }

  return ""
}

function parseTestStats(
  output: string,
): { passed?: number; failed?: number; ignored?: number; duration?: string } | undefined {
  const text = cleanText(output)
  if (!text) return undefined

  const rust = text.match(/(\d+)\s+passed(?:;\s*(\d+)\s+failed)?(?:;\s*(\d+)\s+ignored)?/i)
  if (rust) {
    const duration = text.match(/finished in\s+([0-9.]+s)/i)?.[1]
    return {
      passed: Number(rust[1]),
      failed: rust[2] !== undefined ? Number(rust[2]) : 0,
      ignored: rust[3] !== undefined ? Number(rust[3]) : undefined,
      duration,
    }
  }

  const jest = text.match(/Tests:\s*(?:(\d+)\s+failed,\s*)?(?:(\d+)\s+skipped,\s*)?(\d+)\s+passed/i)
  if (jest) {
    return {
      failed: jest[1] !== undefined ? Number(jest[1]) : 0,
      ignored: jest[2] !== undefined ? Number(jest[2]) : undefined,
      passed: Number(jest[3]),
    }
  }

  const bun = text.match(/(\d+)\s+pass(?:ed)?(?:,\s*(\d+)\s+fail(?:ed)?)?(?:,\s*(\d+)\s+skip(?:ped)?)?/i)
  if (bun && /pass/i.test(text)) {
    return {
      passed: Number(bun[1]),
      failed: bun[2] !== undefined ? Number(bun[2]) : 0,
      ignored: bun[3] !== undefined ? Number(bun[3]) : undefined,
    }
  }

  return undefined
}

function metadataNumber(meta: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = meta[key]
    if (typeof value === "number" && Number.isFinite(value)) return value
  }
  return undefined
}

/** Extract a short inline summary from tool output for the spine row. */
function summarizeOutput(output: string): string {
  const text = stripAnsi(output).trim()
  if (!text) return ""
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean)
  if (!lines.length) return ""
  // Grep-like: count matches
  const matchCount = lines.length
  if (matchCount === 1) return truncate(lines[0]!, 60)
  return `${matchCount} matches`
}

function toolStateToReceipt(tool: string, state: ToolPart["state"]): SpineReceipt | undefined {
  if (state.status === "pending" || state.status === "running") {
    return { label: tool, status: "pending" }
  }

  if (state.status === "error") {
    const input = state.input as Record<string, unknown>
    const command = (input.command as string) ?? (input.cmd as string) ?? ""
    return {
      label: tool,
      command: command || (state.error ? truncate(stripAnsi(state.error), 120) : undefined),
      status: "fail",
    }
  }

  if (state.status === "completed") {
    const input = state.input as Record<string, unknown>
    const command = (input.command as string) ?? (input.cmd as string) ?? ""
    const metadata = (state.metadata ?? {}) as Record<string, unknown>

    if (RUN_TOOLS.has(tool) || toolToSpineKind(tool) === "run") {
      const fromMeta = {
        passed: metadataNumber(metadata, "passed", "pass", "testsPassed"),
        failed: metadataNumber(metadata, "failed", "fail", "testsFailed"),
        ignored: metadataNumber(metadata, "ignored", "skipped", "skip"),
        duration:
          typeof metadata.duration === "string"
            ? metadata.duration
            : typeof metadata.durationMs === "number"
              ? formatElapsed(metadata.durationMs).replace(/^\+/, "")
              : undefined,
      }
      const fromOutput = parseTestStats(stripAnsi(state.output ?? ""))
      const stats = {
        passed: fromMeta.passed ?? fromOutput?.passed,
        failed: fromMeta.failed ?? fromOutput?.failed,
        ignored: fromMeta.ignored ?? fromOutput?.ignored,
        duration: fromMeta.duration ?? fromOutput?.duration,
      }
      const hasStats = stats.passed !== undefined || stats.failed !== undefined
      let summary = ""
      if (hasStats) {
        summary = `✓ ${stats.passed ?? 0} passed` + ((stats.failed ?? 0) > 0 ? ` · ${stats.failed} failed` : "")
      } else {
        summary = summarizeOutput(state.output ?? "")
      }
      return {
        label: tool,
        command: command || undefined,
        summary: summary || undefined,
        stats: hasStats || stats.duration ? stats : undefined,
        status: (stats.failed ?? 0) > 0 ? "fail" : "ok",
      }
    }

    if (PATCH_TOOLS.has(tool) || toolToSpineKind(tool) === "patch") {
      const added = metadataNumber(metadata, "added", "insertions", "additions")
      const removed = metadataNumber(metadata, "removed", "deletions", "deletions")
      const patchSummary = added !== undefined || removed !== undefined
        ? `+${added ?? 0} -${removed ?? 0}`
        : summarizeOutput(state.output ?? "")
      if (added !== undefined || removed !== undefined) {
        return {
          label: tool,
          stats: { added, removed },
          summary: patchSummary,
          status: "ok",
        }
      }
      return {
        label: tool,
        summary: patchSummary,
        status: "ok",
      }
    }

    const outSummary = state.status === "completed" ? summarizeOutput(state.output ?? "") : ""
    return {
      label: tool,
      command: command || undefined,
      summary: outSummary || undefined,
      status: "ok",
    }
  }

  return { label: tool, status: "pending" }
}

function userMessageToEntries(
  message: Message,
  parts: Part[],
  assistantDuration: ReadonlyMap<string, number>,
): SpineEntry[] {
  if (message.role !== "user") return []

  const textParts = parts.filter((p): p is TextPart => p.type === "text" && isTextRelevant(p))
  const joined = joinTextBodies(textParts)
  const view = joined
    ? chatTextView(joined)
    : { summary: message.summary?.title ?? "…", body: undefined, collapsible: false, expandedByDefault: false }
  const elapsed = computeElapsed(assistantDuration, message)
  const textPart = textParts[0]

  return [
    {
      id: `${message.id}:ask`,
      index: 0,
      elapsed,
      timestamp: formatTimestamp(message.time.created),
      kind: "ask",
      label: "you",
      glyph: SPINE_GLYPH.ask,
      summary: view.summary || "…",
      body: view.body,
      bodyLabel: "prompt",
      collapsible: view.collapsible,
      expandedByDefault: view.expandedByDefault,
      source: { messageID: message.id, partID: textPart?.id, kind: textPart ? "text" : "message" },
    },
  ]
}

function toolInputText(part: ToolPart, key: string): string | undefined {
  const input =
    "input" in part.state && part.state.input && typeof part.state.input === "object"
      ? (part.state.input as Record<string, unknown>)
      : undefined
  const value = input?.[key]
  return typeof value === "string" && value.trim() ? value : undefined
}

function taskToolAgent(part: ToolPart): string | undefined {
  if (part.tool !== "task" && part.tool !== "subtask") return undefined
  const input =
    "input" in part.state && part.state.input && typeof part.state.input === "object"
      ? (part.state.input as Record<string, unknown>)
      : undefined
  for (const key of ["subagent_type", "subagentType", "agent", "name"]) {
    const value = input?.[key]
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return undefined
}

function taskToolSummary(part: ToolPart): string {
  const input =
    "input" in part.state && part.state.input && typeof part.state.input === "object"
      ? (part.state.input as Record<string, unknown>)
      : undefined
  for (const key of ["description", "prompt", "command"]) {
    const value = input?.[key]
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  if ("title" in part.state && typeof part.state.title === "string" && part.state.title.trim()) return part.state.title.trim()
  return part.tool
}
function toolOutputBody(part: ToolPart): { body: string; label: string; reminders: string[]; report?: SpineReportData; table?: { headers: string[]; rows: string[][] } } {
  const state = part.state
  if (state.status === "error") {
    const error = stripAnsi(preserveBodyText(state.error ?? ""))
    return { body: error.trim() ? error : "", label: "error", reminders: [] }
  }

  if (state.status !== "completed") return { body: "", label: "output", reminders: [] }

  if (part.tool === "write") {
    const content = toolInputText(part, "content")
    if (content) return { body: preserveBodyText(content), label: "written content", reminders: [] }
  }

  if (part.tool === "edit") {
    const diff =
      state.metadata && typeof state.metadata === "object"
        ? (state.metadata as Record<string, unknown>).diff
        : undefined
    if (typeof diff === "string" && diff.trim()) return { body: preserveBodyText(diff), label: "diff", reminders: [] }
  }

  // Subagent task output — parse as structured report if markdown headings detected.
  if (part.tool === "task" || part.tool === "subtask") {
    const raw = stripAnsi(preserveBodyText(state.output ?? ""))
    const cleaned = stripTaskXml(raw)
    if (cleaned) {
      const report = parseReportSections(cleaned)
      if (report) return { body: cleaned, label: "report", reminders: [], report }
    }
  }

  const output = stripAnsi(preserveBodyText(state.output ?? ""))
  if (/^\[?STALE\]?\s*(Wrote file successfully|Edit applied successfully)\.?$/i.test(cleanText(output))) {
    return { body: "", label: "output", reminders: [] }
  }
  // Strip XML wrapper from read/grep tool output so the spine shows clean
  // file content instead of raw <path>/<file-content> metadata tags.
  // Detect CLI table output for adaptive rendering (stacked rows vs raw text).
  if (toolToSpineKind(part.tool) === "run") {
    const table = parseTableOutput(output)
    if (table && table.rows.length > 0) {
      return { body: output, label: "output", reminders: [], table }
    }
  }

  if (part.tool === "read" || part.tool === "grep" || toolToSpineKind(part.tool) === "inspect") {
    const stripped = stripReadXml(output)
    if (stripped.body) return { body: stripped.body, label: "output", reminders: stripped.reminders }
  }
  return { body: output, label: "output", reminders: [] }
}

function toolPartToEntries(message: Message, part: ToolPart, partIndex: number): SpineEntry[] {
  const toolKind = toolToSpineKind(part.tool)
  const agentName = taskToolAgent(part)
  const kind: SpineKind = part.state.status === "error" ? "fail" : agentName ? "agent" : toolKind
  const glyph = SPINE_GLYPH[kind] ?? SPINE_GLYPH.inspect
  const elapsed = computeElapsed(undefined, message, part)
  let receipt = toolStateToReceipt(part.tool, part.state)
  const baseId = `${message.id}:${part.id || `tool-${partIndex}`}`

  let summary = ""
  let diff = undefined as SpineEntry["diff"]

  if (toolKind === "run") {
    summary = getRunSummary(part)
    if (!summary) {
      if (part.state.status === "completed") summary = truncate(stripAnsi(part.state.output ?? ""), 120)
      else if (part.state.status === "error") summary = truncate(stripAnsi(part.state.error ?? ""), 80)
      else summary = part.tool
    }
  }

  if (toolKind === "patch") {
    summary = getPatchSummary(part)
    if (!summary) summary = part.tool
  }

  if (toolKind === "inspect") {
    summary = agentName ? taskToolSummary(part) : getInspectSummary(part)
  }

  const renderedOutput = toolOutputBody(part)
  const body = renderedOutput.body
  const finalKind: SpineKind = renderedOutput.report ? "report" : kind
  const finalGlyph = renderedOutput.report ? SPINE_GLYPH.report : glyph
  if (renderedOutput.report) {
    summary = `Divination: ${renderedOutput.report.title}`
  }
  if (kind === "fail" && part.state.status === "error") {
    // Prefer the error on the spine line (design: "fail  error[E0308]: …").
    summary = truncate(stripAnsi(part.state.error ?? ""), 120) || summary || part.tool
  }
  if (
    toolKind === "patch" &&
    body &&
    (renderedOutput.label === "diff" || body.includes("@@ ") || body.startsWith("diff --git"))
  ) {
    const added = (body.match(/^\+[^+]/gm) ?? []).length
    const removed = (body.match(/^-[^-]/gm) ?? []).length
    const files = diffFilesFromBody(body, summary || part.tool)
    summary = formatPatchHeadline(files.length, { added, removed }, true)
    receipt = undefined
    diff = {
      files: files.join(", ") || diffTitleFromBody(body, summary || part.tool),
      stats: added || removed ? `+${added} -${removed}` : "",
      body: preserveBodyText(body),
      splitBody: splitDiffBody(body),
    }
  }
  return [
    {
      id: `${baseId}:${finalKind}`,
      index: 0,
      elapsed,
      timestamp: formatTimestamp(message.time.created),
      kind: finalKind,
      label: finalKind === "fail" ? "fail" : agentName ?? (finalKind === "report" ? "report" : kindLabel(kind)),
      glyph: finalGlyph,
      summary,
      body: body && !diff && !renderedOutput.report ? body : undefined,
      bodyLabel: renderedOutput.report ? "divination" : renderedOutput.label,
      collapsible: !!diff || !!renderedOutput.report || (!!body && !diff),
      expandedByDefault: !!diff || !!renderedOutput.report || (kind === "fail" && !!body) || (!!body && (body.split("\n").length <= 10)) || (receipt?.summary != null && receipt.summary.length > 0),
      receipt,
      diff,
      reminders: renderedOutput.reminders.length ? renderedOutput.reminders : undefined,
      report: renderedOutput.report,
      table: renderedOutput.table,
      source: { messageID: message.id, partID: part.id, kind: "tool" },
    },
  ]
}

function patchPartToEntry(message: Message, part: PatchPart): SpineEntry {
  const files = part.files.join(", ")
  const fileCount = part.files.length
  return {
    id: `${message.id}:${part.id}:patch`,
    index: 0,
    elapsed: "",
    timestamp: formatTimestamp(message.time.created),
    kind: "patch",
    label: "patch",
    glyph: SPINE_GLYPH.patch,
    summary: formatPatchHeadline(fileCount, undefined, false),
    collapsible: fileCount > 0,
    expandedByDefault: true,
    diff: {
      files: files || `${part.files.length} files`,
      stats: "",
    },
    source: { messageID: message.id, partID: part.id, kind: "patch" },
  }
}
function messageTimestamp(message: Message): number {
  const time = message.time as { created: number; completed?: number }
  return time.completed ?? time.created
}

function makeOkEntry(message: Message): SpineEntry {
  return {
    id: `${message.id}:ok`,
    index: 0,
    elapsed: "",
    timestamp: formatTimestamp(messageTimestamp(message)),
    kind: "ok",
    label: "done",
    glyph: SPINE_GLYPH.ok,
    summary: "complete",
    hidden: true,
    source: { messageID: message.id, kind: "message" },
  }
}

function splitMarkedResponse(content: string): { reasoning: string; response: string } {
  const text = preserveBodyText(content).trimStart()
  const marker = text.match(/\n{2,}(?:answer|response|final|assistant)\s*[:\-]\s*/i)
  if (marker?.index !== undefined) {
    return {
      reasoning: text.slice(0, marker.index).trim(),
      response: text.slice(marker.index + marker[0].length).trimStart(),
    }
  }
  return { reasoning: text.trim(), response: "" }
}

function splitInlineThinkingText(part: TextPart): { thinking?: string; text?: TextPart } {
  let text = preserveBodyText(part.text)
  const thinking: string[] = []

  text = text.replace(/<(think|thinking|reasoning)>\s*([\s\S]*?)\s*<\/\1>/gi, (_match, _tag, body) => {
    const value = String(body).trim()
    if (value) thinking.push(value)
    return ""
  })

  const leading = text.match(/^\s*\?(?:think|thinking|reasoning)\s*:?\s*([\s\S]*)$/i)
  if (leading) {
    const split = splitMarkedResponse(leading[1] ?? "")
    if (split.reasoning) thinking.push(split.reasoning)
    text = split.response
  } else {
    const labeled = text.match(/^\s*(?:thinking|reasoning)\s*:\s*([\s\S]*)$/i)
    if (labeled && /\n{2,}(?:answer|response|final|assistant)\s*[:\-]\s*/i.test(labeled[1] ?? "")) {
      const split = splitMarkedResponse(labeled[1] ?? "")
      if (split.reasoning) thinking.push(split.reasoning)
      text = split.response
    }
  }

  const cleaned = text.trimStart()
  return {
    thinking: thinking.length ? thinking.join("\n\n") : undefined,
    text: cleaned.trim() ? ({ ...part, text: cleaned } as TextPart) : undefined,
  }
}

function makeInlineThinkEntry(
  message: Message,
  part: TextPart,
  text: string,
  options?: { expandThinking?: boolean },
): SpineEntry {
  const raw = preserveBodyText(text.replace("[REDACTED]", ""))
  const hasText = !!raw.trim()
  const streaming = message.role === "assistant" && !message.time.completed
  const { body: titleStrippedBody } = reasoningSummary(raw)
  const summary = thinkingSummary(raw, `${part.id}:inline`)
  return {
    id: `${message.id}:${part.id}:think-inline`,
    index: 0,
    elapsed: "",
    timestamp: formatTimestamp(message.time.created),
    kind: "think",
    label: "",
    glyph: SPINE_GLYPH.think,
    summary,
    body: hasText ? titleStrippedBody : undefined,
    bodyLabel: "reasoning",
    collapsible: true,
    expandedByDefault: hasText && (streaming || options?.expandThinking === true),
    hidden: false,
    streaming,
    source: { messageID: message.id, partID: part.id, kind: "reasoning" },
  }
}
function makeThinkEntry(message: Message, part: ReasoningPart, options?: { expandThinking?: boolean }): SpineEntry {
  // Strip OpenRouter encrypted-reasoning placeholder (matches legacy session route).
  const raw = preserveBodyText((part.text ?? "").replace("[REDACTED]", ""))
  const hasText = !!raw.trim()
  // Streaming tracks the reasoning PART finalizing (part.time.end), not just the
  // whole message completing — so the thinking spinner stops as soon as reasoning
  // is done even while tools keep running. Matches runState's "thinking" detection
  // and the legacy ReasoningPart (isDone = part.time.end). The message-completed
  // check is kept as a fallback for parts that never receive an end timestamp.
  const partDone = !!(part.time && part.time.end)
  const messageDone = !!(message.time && "completed" in message.time && message.time.completed)
  const streaming = message.role === "assistant" && !partDone && !messageDone
  // Split OpenAI-style **Title** disclosure so the title lives only in the spine
  // header summary, not duplicated at the top of the body (matches legacy reasoningSummary).
  const { body: titleStrippedBody } = reasoningSummary(raw)
  // Summary is a short one-line title only (no "think"/"thinking" label spam).
  const summary = thinkingSummary(raw, part.id)
  // Auto-open while tokens are streaming so the user actually sees the agent think;
  // when complete, respect thinking_mode (expandThinking).
  const expandedByDefault = hasText && (streaming || options?.expandThinking === true)
  return {
    id: `${message.id}:${part.id}:think`,
    index: 0,
    elapsed: "",
    timestamp: formatTimestamp(message.time.created),
    kind: "think",
    // Empty label — glyph `?` is enough; avoids redundant thinking labels.
    label: "",
    glyph: SPINE_GLYPH.think,
    summary,
    body: hasText ? titleStrippedBody : undefined,
    bodyLabel: "reasoning",
    collapsible: true,
    expandedByDefault,
    hidden: false,
    streaming,
    source: { messageID: message.id, partID: part.id, kind: "reasoning" },
  }
}

function makeTextEntry(
  message: Message,
  parts: TextPart[],
  kind: "plan" | "ok",
  assistantDuration: ReadonlyMap<string, number>,
): SpineEntry | undefined {
  if (!parts.length) return undefined
  const joined = joinTextBodies(parts)
  if (!joined.trim()) return undefined
  const view = chatTextView(joined)
  const primary = parts[0]!
  return {
    id: `${message.id}:${primary.id}:${kind}`,
    index: 0,
    elapsed: computeElapsed(assistantDuration, message),
    timestamp: formatTimestamp(message.time.created),
    kind,
    label: assistantTextLabel(message, kind),
    glyph: SPINE_GLYPH[kind],
    summary: view.summary,
    body: view.body,
    bodyLabel: "assistant",
    collapsible: view.collapsible,
    expandedByDefault: view.expandedByDefault,
    streaming: message.role === "assistant" && !message.time.completed,
    source: { messageID: message.id, partID: primary.id, kind: "text" },
  }
}

function assistantTextLabel(message: Message, _kind: "plan" | "ok") {
  const agent = typeof message.agent === "string" ? message.agent.trim() : ""
  return agent && agent !== "default" ? `assistant · ${agent}` : "assistant"
}
function shouldAddTrailingOk(entries: SpineEntry[], message: Message): boolean {
  const messageEntries = entries.filter((e) => e.id.startsWith(message.id))

  if (messageEntries.length === 0) return false

  const hasToolEntry = messageEntries.some(
    (e) => e.kind === "run" || e.kind === "patch" || e.kind === "inspect" || e.kind === "agent",
  )
  if (!hasToolEntry) return false

  const hasPending = messageEntries.some((e) => e.receipt?.status === "pending")
  if (hasPending) return false

  const hasFailed = messageEntries.some((e) => e.kind === "fail" || e.receipt?.status === "fail")
  if (hasFailed) return false

  if ("finish" in message && message.finish) {
    if (message.finish === "error" || message.finish === "content-filter") return false
  }

  return true
}

function assistantMessagePartsToEntries(
  message: Message,
  parts: Part[],
  assistantDuration: ReadonlyMap<string, number>,
  options?: { expandThinking?: boolean },
): SpineEntry[] {
  const entries: SpineEntry[] = []

  let sawTool = false
  const textBeforeTool: TextPart[] = []
  const textAfterTool: TextPart[] = []

  // Collect child session IDs from task tool parts so agent/subtask entries
  // can link to their subsessions and become clickable/openable.
  const childSessionIDs: string[] = []
  for (const p of parts) {
    if (p.type === "tool" && p.state.status === "completed") {
      const meta = (p.state.metadata ?? {}) as Record<string, unknown>
      const sid = meta.sessionId
      if (typeof sid === "string" && sid) childSessionIDs.push(sid)
    }
  }

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]

    if (part.type === "reasoning") {
      // Always create a think entry — even empty-text reasoning-start
      // gets a placeholder summary. makeThinkEntry handles empty text.
      entries.push(makeThinkEntry(message, part, options))
      continue
    }

    if (part.type === "text" && isTextRelevant(part)) {
      const split = splitInlineThinkingText(part)
      if (split.thinking) entries.push(makeInlineThinkEntry(message, part, split.thinking, options))
      if (split.text) {
        if (!sawTool) textBeforeTool.push(split.text)
        else textAfterTool.push(split.text)
      }
      continue
    }

    if (part.type === "tool") {
      sawTool = true
      entries.push(...toolPartToEntries(message, part, i))
      continue
    }

    if (part.type === "patch") {
      sawTool = true
      entries.push(patchPartToEntry(message, part))
      continue
    }

    if (part.type === "subtask") {
      sawTool = true
      entries.push({
        id: `${message.id}:${part.id}:agent`,
        index: 0,
        elapsed: "",
        timestamp: formatTimestamp(message.time.created),
        kind: "agent",
        label: (part.agent as string) || "agent",
        glyph: SPINE_GLYPH.agent,
        actor: (part.agent as string) || "agent",
        summary: truncate(part.description || part.prompt, 120) || `subagent: ${part.agent ?? "agent"}`,
        source: { messageID: message.id, partID: part.id, kind: "subtask", sessionID: childSessionIDs[0] },
      })
      continue
    }

    if (part.type === "agent") {
      sawTool = true
      entries.push({
        id: `${message.id}:${part.id}:agent`,
        index: 0,
        elapsed: "",
        timestamp: formatTimestamp(message.time.created),
        kind: "agent",
        label: part.name || "agent",
        glyph: SPINE_GLYPH.agent,
        actor: part.name || "agent",
        summary: `subagent: ${part.name}`,
        source: { messageID: message.id, partID: part.id, kind: "agent", sessionID: childSessionIDs[0] },
      })
      continue
    }
  }

  const planEntry = makeTextEntry(message, textBeforeTool, "plan", assistantDuration)
  const okEntry = makeTextEntry(message, textAfterTool, "ok", assistantDuration)

  if (!sawTool && planEntry && !okEntry) {
    const thinkEntries = entries.filter((entry) => entry.kind === "think")
    return [...thinkEntries, planEntry]
  }

  const merged: SpineEntry[] = []

  // Reasoning is a first-class row. Keep it separate from assistant prose and
  // tool rows so expanding/collapsing thinking never rewrites the response.
  for (const entry of entries) {
    if (entry.kind === "think") merged.push(entry)
  }
  if (planEntry) merged.push(planEntry)
  for (const entry of entries) {
    if (entry.kind !== "think") merged.push(entry)
  }
  if (okEntry) merged.push(okEntry)

  if (!okEntry && shouldAddTrailingOk(merged, message)) {
    merged.push(makeOkEntry(message))
  }

  // Group consecutive tool entries with same label + target into parent rows.
  const grouped = groupConsecutiveTools(merged)
  const deduped = dedupeFilePaths(grouped)
  return deduped
}

/**
 * Replace repeated consecutive file paths with a ditto marker (⟐).
 * Resets on tool change, target change, or error.
 */
function dedupeFilePaths(entries: SpineEntry[]): SpineEntry[] {
  let lastFile = ""
  let lastTool = ""
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]!
    if (e.kind === "fail" || e.hidden) { lastFile = ""; lastTool = ""; continue }
    if (e.children) { lastFile = ""; lastTool = ""; continue }
    const file = e.summary?.replace(/^[^:]*:\s*/, "").trim()
    if (!file || file.length < 3) continue
    if (e.label && e.label !== lastTool) { lastFile = file; lastTool = e.label ?? ""; continue }
    if (file === lastFile) {
      e.summary = "⟐"
      e.timestamp = ""
    } else {
      lastFile = file
      lastTool = e.label ?? ""
    }
  }
  return entries
}

/** Collapse consecutive same-target tool entries into parent rows. */
function groupConsecutiveTools(entries: SpineEntry[]): SpineEntry[] {
  const result: SpineEntry[] = []
  let run: SpineEntry[] = []

  function sameTarget(a: SpineEntry, b: SpineEntry): boolean {
    // Must be same tool glyph and not an error
    if (a.glyph !== b.glyph || a.kind === "fail" || b.kind === "fail") return false
    // Extract file path from summary (e.g. "src/foo.ts" from "codex · src/foo.ts")
    const aFile = a.summary?.replace(/^[^:]*:\s*/, "").trim()
    const bFile = b.summary?.replace(/^[^:]*:\s*/, "").trim()
    if (!aFile || !bFile || aFile.length < 3) return false
    return aFile === bFile
  }

  function flush() {
    if (run.length === 0) return
    if (run.length === 1) {
      result.push(run[0]!)
    } else {
      const first = run[0]!
      const parseElapsedMs = (s: string) => (parseFloat(s.replace(/^\+/, "").replace(/[a-z]+$/i, "")) || 0) * (s.endsWith("ms") ? 1 : 1000)
      const totalMs = run.reduce((sum, e) => sum + parseElapsedMs(e.elapsed), 0)
      result.push({
        ...first,
        elapsed: totalMs > 0 ? formatElapsed(totalMs) : first.elapsed,
        summary: `${first.summary} · ${run.length} actions`,
        expandedByDefault: false,
        children: [...run],
      })
    }
    run = []
  }

  for (const entry of entries) {
    // Reasoning rows are separate from tools. They remain visible while not
    // participating in same-target tool grouping.
    if (entry.kind === "think") {
      result.push(entry)
      continue
    }
    if (entry.kind !== "run" && entry.kind !== "inspect" && entry.kind !== "patch") {
      flush()
      result.push(entry)
      continue
    }
    if (run.length === 0 || sameTarget(run[0]!, entry)) {
      run.push(entry)
    } else {
      flush()
      run = [entry]
    }
  }
  flush()
  return result
}

function assignIndexes(entries: SpineEntry[], startIndex: number): SpineEntry[] {
  let idx = startIndex
  return entries.map((e) => {
    if (e.hidden) return e.index === 0 ? e : { ...e, index: 0 }
    const next = idx++
    return e.index === next ? e : { ...e, index: next }
  })
}

/**
 * Preserve Solid list identity when entry content is unchanged — critical for
 * scroll/render perf. Changed entries return a NEW object so <For> detects the
 * reference shift and re-renders the child. Mutating in place would leave stale
 * DOM because Solid can't track plain-object property writes.
 */
function stabilizeEntries(next: SpineEntry[], previous: SpineEntry[] | undefined): SpineEntry[] {
  if (!previous?.length) return next
  const prevById = new Map(previous.map((e) => [e.id, e]))
  return next.map((entry) => {
    const prev = prevById.get(entry.id)
    if (!prev) return entry
    if (
      prev.index === entry.index &&
      prev.kind === entry.kind &&
      prev.summary === entry.summary &&
      prev.body === entry.body &&
      prev.elapsed === entry.elapsed &&
      prev.timestamp === entry.timestamp &&
      prev.label === entry.label &&
      prev.glyph === entry.glyph &&
      prev.collapsible === entry.collapsible &&
      prev.expandedByDefault === entry.expandedByDefault &&
      prev.streaming === entry.streaming &&
      prev.hidden === entry.hidden &&
      prev.actor === entry.actor &&
      prev.bodyLabel === entry.bodyLabel &&
      prev.thinking === entry.thinking &&
      prev.children === entry.children &&
      prev.receipt === entry.receipt &&
      prev.diff === entry.diff &&
      prev.reminders === entry.reminders &&
      prev.report === entry.report &&
      prev.table === entry.table
    ) {
      return prev
    }
    // Properties changed — return a NEW object so Solid <For> detects the
    // reference shift and re-renders the SpineEntry child. The old object
    // is discarded; GC handles cleanup.
    return { ...entry }
  })
}

export type SpineMessageCacheEntry = {
  message: Message
  parts: Part[]
  duration: number | undefined
  expandThinking: boolean
  entries: SpineEntry[]
}

export function messagesToSpineEntriesCached(input: {
  messages: Message[]
  getParts: (messageId: string) => Part[]
  assistantDuration: ReadonlyMap<string, number>
  expandThinking?: boolean
  cache?: Map<string, SpineMessageCacheEntry>
  previousEntries?: SpineEntry[]
}): { entries: SpineEntry[]; cache: Map<string, SpineMessageCacheEntry> } {
  const { messages, getParts, assistantDuration, cache, previousEntries } = input
  const expandThinking = input.expandThinking === true
  const allEntries: SpineEntry[] = []
  const nextCache = new Map<string, SpineMessageCacheEntry>()

  for (const message of messages) {
    const parts = getParts(message.id) ?? EMPTY_PARTS
    const duration = assistantDuration.get(message.id)
    const cached = cache?.get(message.id)

    // SolidJS store proxies survive produce() mutations — the proxy reference
    // is stable even when part text changes during assistant streaming. Cache hit
    // on parts identity would return stale entries with old prose/reasoning text.
    // Force cache miss for the active assistant message, then one more recompute
    // after completion so entries flip out of streaming mode before caching.
    const activeAssistant = message.role === "assistant" && !message.time.completed
    const cachedWasStreaming = cached?.entries.some((entry) => entry.streaming) === true
    const hasStreamingParts = activeAssistant || cachedWasStreaming

    let entries: SpineEntry[]
    if (
      cached &&
      !hasStreamingParts &&
      cached.message === message &&
      cached.parts === parts &&
      cached.duration === duration &&
      cached.expandThinking === expandThinking
    ) {
      entries = cached.entries
    } else if (message.role === "user") {
      entries = userMessageToEntries(message, parts, assistantDuration)
    } else if (message.role === "assistant") {
      entries = assistantMessagePartsToEntries(message, parts, assistantDuration, { expandThinking })
    } else {
      entries = []
    }

    nextCache.set(message.id, { message, parts, duration, expandThinking, entries })
    allEntries.push(...entries)
  }

  const indexed = assignIndexes(allEntries, 1)
  return { entries: stabilizeEntries(indexed, previousEntries), cache: nextCache }
}

export function messagesToSpineEntries(input: {
  messages: Message[]
  getParts: (messageId: string) => Part[]
  assistantDuration: ReadonlyMap<string, number>
  expandThinking?: boolean
}): SpineEntry[] {
  return messagesToSpineEntriesCached(input).entries
}
