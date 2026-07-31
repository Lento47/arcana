import type { Message, Part, ToolPart, TextPart, PatchPart, ReasoningPart } from "@arcana/sdk/v2"
import type { SpineEntry, SpineKind, SpineReportData, SpineConcernSeverity, SpineReceipt } from "./spine-types"
import { SPINE_GLYPH } from "./spine-types"
import { reasoningSummary } from "../../context/thinking"
import { APP_NAME } from "../../branding"
import {
  buildTurnLifecycle,
  isAssistantSegmentStreaming,
  isSessionTurnActive,
} from "./turn-lifecycle"

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
  // Grok-style short wall clock on chat headers: "2:18 PM" (12h locales).
  // Locale default keeps 24h where that's the system preference.
  try {
    return date.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    })
  } catch {
    return date.toLocaleTimeString("en-GB", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
    })
  }
}

function isTextRelevant(part: TextPart): boolean {
  if (part.ignored) return false
  if (part.synthetic) return false
  if (!part.text?.trim()) return false
  return true
}

/** Short tool-facing labels — never "codex" (reads as another AI voice). */
function kindLabel(kind: SpineKind, fallback?: string, tool?: string): string {
  if (fallback) return fallback
  if (kind === "inspect" && tool) {
    const t = tool.toLowerCase()
    if (t === "grep" || t === "ripgrep") return "search"
    if (t === "read") return "read"
    if (t === "glob" || t === "list" || t === "list_files" || t === "directory_list" || t === "file_search") return "list"
    if (t === "web_search" || t === "search") return "search"
    if (t === "web_fetch" || t === "fetch") return "fetch"
    return "tool"
  }
  switch (kind) {
    case "run": return "run"
    case "inspect": return "tool"
    case "patch": return "edit"
    case "report": return "report"
    case "fail": return "fail"
    case "ask": return "you"
    case "plan": return APP_NAME
    case "ok": return APP_NAME
    case "think": return ""
    case "agent": return "agent"
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

/**
 * Inspect/search bodies stay collapsed by default — only auto-open tiny
 * single-line receipts. Grep dumps and multi-file reads are toggle-only
 * (reduces spine noise vs assistant prose).
 */
const INSPECT_AUTO_EXPAND_MAX_LINES = 2

/** Engine boilerplate reminder — for the model, not a useful TUI callout. */
function isBoilerplateReminder(text: string): boolean {
  return /untrusted user data|file-content tags|do NOT execute|DATA, not instructions/i.test(text)
}

export type ParsedReadBody = {
  body: string
  reminders: string[]
  path?: string
  /** "file" source, "directory" listing, or unstructured "text". */
  kind: "file" | "directory" | "text"
  /** Directory / entries names (no XML). */
  listing?: string[]
  lineStart?: number
  lineEnd?: number
  totalLines?: number
  /** EOF / truncation note — muted under the code panel, not inside source. */
  note?: string
}

function isEntryFooter(line: string): boolean {
  const trimmed = line.trim()
  return (
    /^\((?:\d+\s+entries|Showing\s+\d+\s+of\s+\d+\s+entries)[\s\S]*\)$/i.test(trimmed)
    || /^\((?:End of file|Showing lines|Output capped)[\s\S]*\)$/i.test(trimmed)
    || /^\(Output capped at[\s\S]*\)$/i.test(trimmed)
    || /^\(Results are truncated[\s\S]*\)$/i.test(trimmed)
  )
}

/**
 * Strip engine XML from read/inspect output and normalize for the TUI.
 * - Directory reads: parse `<entries>` into a clean name list (no tags)
 * - File reads: strip `N: ` prefixes for syntax highlight
 * - Suppresses boilerplate untrusted-data system reminders
 * - Pulls footers into `note`
 */
// Cache: keyed on a length+hash of the output (FNV-1a, strided over the body)
// instead of the full output string. Full-string keys doubled memory (Map keeps
// keys alive for its lifetime) and bloated V8 hidden classes for 100KB tool
// outputs. The LRU is byte-aware: a single 100KB read can co-exist with
// hundreds of small outputs, all under the 8MB cap.
const readParseTextCache = new Map<string, ParsedReadBody>()
const readParseTextCacheSizes = new Map<string, number>()
const READ_PARSE_TEXT_CACHE_BYTES = 8 * 1024 * 1024 // 8MB
let readParseBytes = 0
let readParseLastInput: string | undefined
let readParseLastResult: ParsedReadBody | undefined

/** FNV-1a hash, strided so 100KB strings hash in O(1/128) time. ~50ns. */
function hashReadOutput(s: string): string {
  let h = 0x811c9dc5
  const n = s.length
  const step = Math.max(1, Math.floor(n / 128))
  for (let i = 0; i < n; i += step) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return `${n}:${h.toString(16)}`
}

/**
 * Memoize parseReadToolOutput on output identity. The parser runs 4 regex
 * passes per call; during streaming the same `output` string is fed in 3+
 * times per token (toolOutputBody, summary call sites, etc.). A single-slot
 * "last" cache catches the streaming burst; a small LRU Map catches rescans
 * of completed tool outputs. 8MB byte cap covers a busy session's worth of
 * unique tool outputs without unbounded growth.
 */
export function parseReadToolOutput(output: string): ParsedReadBody {
  if (output === readParseLastInput && readParseLastResult) return readParseLastResult
  const key = hashReadOutput(output)
  const cached = readParseTextCache.get(key)
  if (cached) {
    readParseLastInput = output
    readParseLastResult = cached
    return cached
  }
  const reminders: string[] = []
  let content = output

  const pathMatch = content.match(/<path>([^<]*)<\/path>/i)
  const path = pathMatch?.[1]?.trim() || undefined
  const typeMatch = content.match(/<type>([^<]*)<\/type>/i)
  const typeHint = typeMatch?.[1]?.trim().toLowerCase()

  content = content.replace(/<system-reminder>([\s\S]*?)<\/system-reminder>/gi, (_, text: string) => {
    const trimmed = text.trim()
    if (trimmed && !isBoilerplateReminder(trimmed)) reminders.push(trimmed)
    return ""
  })

  // Directory listing: <entries>…</entries>
  const entriesBlock = content.match(/<entries>([\s\S]*?)<\/entries>/i)
  if (typeHint === "directory" || entriesBlock) {
    const inner = (entriesBlock?.[1] ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n")
    const notes: string[] = []
    const listing: string[] = []
    for (const line of inner.split("\n")) {
      const trimmed = line.trim()
      if (!trimmed) continue
      if (isEntryFooter(trimmed)) {
        notes.push(trimmed.replace(/^\(|\)$/g, "").trim())
        continue
      }
      // Drop any residual tags
      if (/^<\/?[a-z][\w-]*>$/i.test(trimmed)) continue
      listing.push(trimmed)
    }

    let totalLines: number | undefined
    for (const note of notes) {
      const m = note.match(/(\d+)\s+entries/i)
      if (m) totalLines = Number(m[1])
      const showing = note.match(/Showing\s+(\d+)\s+of\s+(\d+)\s+entries/i)
      if (showing) totalLines = Number(showing[2])
    }
    if (totalLines === undefined && listing.length) totalLines = listing.length

    const result: ParsedReadBody = {
      body: listing.join("\n"),
      kind: "directory",
      listing,
      reminders,
      path,
      totalLines,
      note: notes.length ? notes.join(" · ") : totalLines !== undefined ? `${totalLines} entries` : undefined,
    }
    cacheReadOutput(key, output, result)
    return result
  }

  content = content
    .replace(/<path>[^<]*<\/path>\s*/gi, "")
    .replace(/<type>[^<]*<\/type>\s*/gi, "")
    .replace(/<\/?file-content>/gi, "")
    .replace(/<\/?entries>/gi, "")
    .trim()

  const rawLines = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")
  const notes: string[] = []
  const contentLines: string[] = []

  for (const line of rawLines) {
    const trimmed = line.trim()
    if (isEntryFooter(trimmed)) {
      notes.push(trimmed.replace(/^\(|\)$/g, "").trim())
      continue
    }
    contentLines.push(line)
  }

  while (contentLines.length && !contentLines[contentLines.length - 1]!.trim()) {
    contentLines.pop()
  }

  const numbered = contentLines.filter((l) => l.trim().length > 0)
  const numberedHits = numbered.filter((l) => /^\d+:/.test(l)).length
  const looksNumbered = numbered.length > 0 && numberedHits / numbered.length >= 0.7

  let lineStart: number | undefined
  let lineEnd: number | undefined
  let body: string
  let kind: ParsedReadBody["kind"] = "text"

  if (looksNumbered) {
    kind = "file"
    body = contentLines
      .map((line) => {
        if (!line.trim()) return ""
        const m = line.match(/^(\d+):\s?(.*)$/)
        return m ? (m[2] ?? "") : line
      })
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")

    for (const line of contentLines) {
      const m = line.match(/^(\d+):/)
      if (!m) continue
      const n = Number(m[1])
      if (lineStart === undefined || n < lineStart) lineStart = n
      if (lineEnd === undefined || n > lineEnd) lineEnd = n
    }
  } else {
    body = contentLines.join("\n")
    // Heuristic: multi-line path-ish list → listing (glob-like), not code
    const nonEmpty = contentLines.map((l) => l.trim()).filter(Boolean)
    const pathish =
      nonEmpty.length >= 2
      && nonEmpty.filter((l) => /[\\/]|\.\w{1,8}$/.test(l) || l.endsWith("/")).length / nonEmpty.length >= 0.7
    if (pathish) {
      kind = "directory"
      const result: ParsedReadBody = {
        body: nonEmpty.join("\n"),
        kind: "directory",
        listing: nonEmpty.filter((l) => !isEntryFooter(l)),
        reminders,
        path,
        totalLines: nonEmpty.length,
        note: notes.length ? notes.join(" · ") : undefined,
      }
      cacheReadOutput(key, output, result)
      return result
    }
  }

  let totalLines: number | undefined
  for (const note of notes) {
    const eof = note.match(/total\s+(\d+)\s+lines/i)
    if (eof) totalLines = Number(eof[1])
    const showing = note.match(/Showing lines\s+(\d+)\s*-\s*(\d+)\s+of\s+(\d+)/i)
    if (showing) {
      lineStart = lineStart ?? Number(showing[1])
      lineEnd = lineEnd ?? Number(showing[2])
      totalLines = Number(showing[3])
    }
    const capped = note.match(/Showing lines\s+(\d+)\s*-\s*(\d+)/i)
    if (capped && lineStart === undefined) {
      lineStart = Number(capped[1])
      lineEnd = Number(capped[2])
    }
  }

  const note = notes.length ? notes.join(" · ") : undefined
  const result: ParsedReadBody = {
    body: body.trimEnd(),
    kind: looksNumbered ? "file" : kind,
    reminders,
    path,
    lineStart,
    lineEnd,
    totalLines,
    note,
  }
  cacheReadOutput(key, output, result)
  return result
}

function cacheReadOutput(key: string, output: string, result: ParsedReadBody) {
  readParseLastInput = output
  readParseLastResult = result
  // Byte-aware LRU: track input size; evict oldest until under cap.
  const size = output.length * 2 // UTF-16
  while (readParseBytes + size > READ_PARSE_TEXT_CACHE_BYTES && readParseTextCache.size > 0) {
    const oldest = readParseTextCache.keys().next().value
    if (oldest === undefined) break
    const oldSize = readParseTextCacheSizes.get(oldest) ?? 0
    readParseTextCache.delete(oldest)
    readParseTextCacheSizes.delete(oldest)
    readParseBytes -= oldSize
  }
  readParseTextCache.set(key, result)
  readParseTextCacheSizes.set(key, size)
  readParseBytes += size
}

/** @deprecated use parseReadToolOutput */
function stripReadXml(output: string): { body: string; reminders: string[] } {
  const parsed = parseReadToolOutput(output)
  return { body: parsed.body, reminders: parsed.reminders }
}

function formatInspectFileSummary(path: string, meta: Pick<ParsedReadBody, "lineStart" | "lineEnd" | "totalLines">): string {
  const { lineStart, lineEnd, totalLines } = meta
  if (lineStart !== undefined && lineEnd !== undefined) {
    if (totalLines !== undefined && totalLines > lineEnd) {
      return `${path} · L${lineStart}–${lineEnd} of ${totalLines}`
    }
    if (lineStart === lineEnd) return `${path} · L${lineStart}`
    return `${path} · L${lineStart}–${lineEnd}`
  }
  if (totalLines !== undefined) return `${path} · ${totalLines} lines`
  return path
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
  if (filePath) return filePath
  if (filePattern) return filePattern
  if (part.state.status === "running" && part.state.title) return part.state.title
  if (part.state.status === "completed" && part.state.title) return part.state.title
  return part.tool
}

function getInspectSummary(part: ToolPart): string {
  const input = part.state.input as Record<string, unknown>
  const filePath = (input.filePath as string) ?? (input.path as string) ?? (input.file as string) ?? ""
  const pattern = (input.pattern as string) ?? (input.query as string) ?? (input.glob as string) ?? ""
  // Tool-specific primary inputs that aren't paths/patterns. Surfaced here so the
  // spine row shows the *what* during pending instead of just a "Working" shimmer.
  const goal = (input.goal as string) ?? (input.objective as string) ?? ""
  const url = (input.url as string) ?? (input.uri as string) ?? ""
  const text = (input.content as string) ?? (input.text as string) ?? ""
  if (filePath) return filePath
  if (pattern) return pattern
  if (url) return url
  if (goal) return firstLineSummary(goal, 80)
  if (text) return firstLineSummary(text, 80)
  if (part.state.status === "running" && part.state.title) return part.state.title
  if (part.state.status === "completed" && part.state.title) return part.state.title
  return part.tool
}

function computeElapsed(
  assistantDuration: ReadonlyMap<string, number> | undefined,
  message: Message,
  toolPart?: ToolPart,
): { ms: number | undefined; str: string } {
  if (toolPart) {
    const state = toolPart.state
    if ("time" in state && state.time && "end" in state.time && state.time.end && "start" in state.time) {
      const ms = state.time.end - state.time.start
      return { ms, str: formatElapsed(ms) }
    }
  }

  if (message.role === "assistant") {
    const dur = assistantDuration?.get(message.id)
    if (dur !== undefined) return { ms: dur, str: formatElapsed(dur) }
    if (message.time?.completed) {
      const ms = message.time.completed - message.time.created
      return { ms, str: formatElapsed(ms) }
    }
  }

  return { ms: undefined, str: "" }
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

/**
 * Solid store mutates tool parts in place. If the assistant turn already
 * finished (or later parts arrived) while a tool stayed `running`/`pending`,
 * the spine would shimmer "Working" forever. Coerce unfinished tools for display.
 */
function resolveToolState(part: ToolPart, message: Message, allParts: Part[]): ToolPart["state"] {
  const state = part.state
  if (state.status !== "pending" && state.status !== "running") return state

  const turnDone = message.role === "assistant" && !!message.time?.completed
  const idx = allParts.findIndex((p) => p.id === part.id)
  // Later text/reasoning/tools after this one ⇒ this tool is no longer the active step
  let superseded = false
  if (idx >= 0) {
    for (let i = idx + 1; i < allParts.length; i++) {
      const p = allParts[i]!
      if (p.type === "tool" || p.type === "text" || p.type === "reasoning" || p.type === "step-finish" || p.type === "patch") {
        superseded = true
        break
      }
    }
  }

  if (!turnDone && !superseded) return state

  const end = (message.role === "assistant" ? message.time?.completed : undefined) ?? Date.now()
  if (state.status === "running") {
    const output =
      "output" in state && typeof (state as { output?: string }).output === "string"
        ? (state as { output: string }).output
        : ""
    return {
      status: "completed",
      input: state.input ?? {},
      output,
      title: state.title ?? part.tool,
      metadata: state.metadata ?? {},
      time: {
        start: state.time?.start ?? message.time?.created,
        end,
      },
    }
  }

  // Tool was "pending" and never started. If superseded by later content,
  // mark as skipped (not an error). Otherwise leave as pending — the engine
  // may transition it to running/completed later via SolidJS store reactivity.
  if (superseded) {
    return {
      status: "completed",
      input: state.input ?? {},
      output: "",
      title: part.tool,
      metadata: {},
      time: {
        start: message.time?.created,
        end,
      },
    }
  }
  return state
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
  let joined = joinTextBodies(textParts)
  // Defense: optimistic proxies may carry `text` when parts are still empty
  // (SSE message row before part.updated). Never fall through to permanent "…".
  if (!joined.trim()) {
    const fallback =
      typeof (message as { text?: unknown }).text === "string"
        ? ((message as unknown as { text: string }).text)
        : typeof message.summary?.title === "string"
          ? message.summary.title
          : ""
    if (fallback.trim()) joined = fallback
  }
  // Still nothing — omit the row rather than paint "you …" forever.
  if (!joined.trim()) return []

  const view = chatTextView(joined)
  const elapsed = computeElapsed(assistantDuration, message)
  const textPart = textParts[0]

  return [
    {
      id: `${message.id}:ask`,
      index: 0,
      elapsed: elapsed.str,
      elapsedMs: elapsed.ms,
      timestamp: formatTimestamp(message.time?.created),
      kind: "ask",
      label: "you",
      glyph: SPINE_GLYPH.ask,
      summary: view.summary || joined.trim(),
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
function taskToolSessionID(part: ToolPart): string | undefined {
  if (part.tool !== "task" && part.tool !== "subtask") return undefined
  if (!("metadata" in part.state)) return undefined
  // Return sessionID even while running — not just at completion
  const meta = (part.state.metadata ?? {}) as Record<string, unknown>
  for (const key of ["sessionId", "sessionID", "session_id"]) {
    const value = meta[key]
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return undefined
}
type ToolOutputBody = {
  body: string
  label: string
  reminders: string[]
  report?: SpineReportData
  table?: { headers: string[]; rows: string[][] }
  listing?: string[]
  /** File path for syntax / header (read tools). */
  path?: string
  bodyHint?: string
  bodyNote?: string
  lineStart?: number
  lineEnd?: number
  totalLines?: number
}

function toolOutputBody(part: ToolPart): ToolOutputBody {
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

  // Unified diffs live on edit / apply_patch / similar tool metadata — not only "edit".
  if (
    (PATCH_TOOLS.has(part.tool) || toolToSpineKind(part.tool) === "patch")
    && state.metadata
    && typeof state.metadata === "object"
  ) {
    const meta = state.metadata as Record<string, unknown>
    if (typeof meta.diff === "string" && meta.diff.trim()) {
      return { body: preserveBodyText(meta.diff), label: "diff", reminders: [] }
    }
    const filediff = meta.filediff
    if (filediff && typeof filediff === "object") {
      const patch = (filediff as Record<string, unknown>).patch
      if (typeof patch === "string" && patch.trim()) {
        return { body: preserveBodyText(patch), label: "diff", reminders: [] }
      }
    }
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
  // Detect CLI table output for adaptive rendering (stacked rows vs raw text).
  if (toolToSpineKind(part.tool) === "run") {
    const table = parseTableOutput(output)
    if (table && table.rows.length > 0) {
      return { body: output, label: "output", reminders: [], table }
    }
  }

  // Read: file source vs directory listing.
  if (part.tool === "read") {
    const parsed = parseReadToolOutput(output)
    if (parsed.body || parsed.note || parsed.listing?.length) {
      if (parsed.kind === "directory") {
        return {
          body: "",
          label: "listing",
          reminders: parsed.reminders,
          path: parsed.path,
          bodyHint: parsed.path,
          bodyNote: parsed.note,
          listing: parsed.listing,
          totalLines: parsed.totalLines,
        }
      }
      return {
        body: parsed.body,
        label: parsed.kind === "file" ? "file" : "output",
        reminders: parsed.reminders,
        path: parsed.path,
        bodyHint: parsed.path,
        bodyNote: parsed.note,
        lineStart: parsed.lineStart,
        lineEnd: parsed.lineEnd,
        totalLines: parsed.totalLines,
      }
    }
  }

  // Glob / list / other inspect: strip XML; treat path lists as listings.
  if (part.tool === "grep" || part.tool === "ripgrep" || toolToSpineKind(part.tool) === "inspect") {
    const parsed = parseReadToolOutput(output)
    if (parsed.kind === "directory" && parsed.listing?.length) {
      return {
        body: "",
        label: "listing",
        reminders: parsed.reminders,
        path: parsed.path,
        bodyHint: parsed.path,
        bodyNote: parsed.note,
        listing: parsed.listing,
        totalLines: parsed.totalLines ?? parsed.listing.length,
      }
    }
    if (parsed.body) {
      return {
        body: parsed.body,
        label: part.tool === "grep" || part.tool === "ripgrep" ? "matches" : "output",
        reminders: parsed.reminders,
        bodyNote: parsed.note,
        path: parsed.path,
        bodyHint: parsed.path,
      }
    }
  }
  return { body: output, label: "output", reminders: [] }
}

function toolPartToEntries(message: Message, part: ToolPart, partIndex: number, allParts: Part[]): SpineEntry[] {
  const state = resolveToolState(part, message, allParts)
  const resolved: ToolPart = state === part.state ? part : { ...part, state }
  const toolKind = toolToSpineKind(resolved.tool)
  const agentName = taskToolAgent(resolved)
  const kind: SpineKind = state.status === "error" ? "fail" : agentName ? "agent" : toolKind
  const glyph = SPINE_GLYPH[kind] ?? SPINE_GLYPH.inspect
  const elapsed = computeElapsed(undefined, message, resolved)
  let receipt = toolStateToReceipt(resolved.tool, state)
  const baseId = `${message.id}:${resolved.id || `tool-${partIndex}`}`

  let summary = ""
  let diff = undefined as SpineEntry["diff"]

  if (toolKind === "run") {
    summary = getRunSummary(resolved)
    if (!summary) {
      if (state.status === "completed") summary = truncate(stripAnsi(state.output ?? ""), 120)
      else if (state.status === "error") summary = truncate(stripAnsi(state.error ?? ""), 80)
      else summary = resolved.tool
    }
  }

  if (toolKind === "patch") {
    summary = getPatchSummary(resolved)
    if (!summary) summary = resolved.tool
  }

  if (toolKind === "inspect") {
    summary = agentName ? taskToolSummary(resolved) : getInspectSummary(resolved)
  }

  const renderedOutput = toolOutputBody(resolved)
  const body = renderedOutput.body
  const finalKind: SpineKind = renderedOutput.report && !agentName ? "report" : kind
  const finalGlyph = renderedOutput.report && !agentName ? SPINE_GLYPH.report : glyph
  const taskSessionID = taskToolSessionID(resolved)
  if (renderedOutput.report) {
    summary = agentName ? renderedOutput.report.title : `Divination: ${renderedOutput.report.title}`
  }
  if (kind === "fail" && state.status === "error") {
    // Prefer the error on the spine line (design: "fail  error[E0308]: …").
    summary = truncate(stripAnsi(state.error ?? ""), 120) || summary || resolved.tool
  }

  // Codex/read: path · Lstart–end or path · N entries; pure source / clean listing.
  const inputPath =
    state && "input" in state && state.input && typeof state.input === "object"
      ? ((state.input as Record<string, unknown>).filePath as string | undefined)
        ?? ((state.input as Record<string, unknown>).path as string | undefined)
      : undefined
  const filePath =
    renderedOutput.path
    || (resolved.tool === "read" ? inputPath : undefined)
    || (toolKind === "inspect" && (summary.includes("/") || summary.includes("\\")) ? summary : undefined)

  const listing = renderedOutput.listing
  const isListing = renderedOutput.label === "listing" && !!listing?.length

  if (isListing) {
    const pathForSummary = filePath || summary || "directory"
    const n = renderedOutput.totalLines ?? listing!.length
    summary = `${pathForSummary} · ${n} entr${n === 1 ? "y" : "ies"}`
    if (receipt && receipt.status === "ok") {
      receipt = {
        ...receipt,
        summary: `${listing!.length} shown`,
        command: undefined,
      }
    }
  } else if (resolved.tool === "read" && (filePath || renderedOutput.lineStart !== undefined)) {
    const pathForSummary = filePath || summary || "file"
    summary = formatInspectFileSummary(pathForSummary, {
      lineStart: renderedOutput.lineStart,
      lineEnd: renderedOutput.lineEnd,
      totalLines: renderedOutput.totalLines,
    })
    const lineCount =
      renderedOutput.lineStart !== undefined && renderedOutput.lineEnd !== undefined
        ? renderedOutput.lineEnd - renderedOutput.lineStart + 1
        : body
          ? body.split("\n").length
          : undefined
    if (receipt && receipt.status === "ok") {
      receipt = {
        ...receipt,
        summary:
          lineCount !== undefined
            ? `${lineCount} line${lineCount === 1 ? "" : "s"}`
            : receipt.summary,
        command: undefined,
      }
    }
  }

  if (
    toolKind === "patch" &&
    body &&
    (renderedOutput.label === "diff" || body.includes("@@ ") || body.startsWith("diff --git"))
  ) {
    const added = (body.match(/^\+[^+]/gm) ?? []).length
    const removed = (body.match(/^-[^-]/gm) ?? []).length
    const files = diffFilesFromBody(body, summary || resolved.tool)
    summary = formatPatchHeadline(files.length, { added, removed }, true)
    receipt = undefined
    diff = {
      files: files.join(", ") || diffTitleFromBody(body, summary || resolved.tool),
      stats: added || removed ? `+${added} -${removed}` : "",
      body: preserveBodyText(body),
      splitBody: splitDiffBody(body),
    }
  }

  const lineCount = body ? body.split("\n").length : 0
  const listingCount = listing?.length ?? 0
  const isGrep = resolved.tool === "grep" || resolved.tool === "ripgrep"
  // Tools: collapse by default. Failures + true one-liners may auto-open.
  // Grep/search never auto-expand (match dumps drown assistant replies).
  const expandDefault =
    !!diff
    || !!renderedOutput.report
    || (kind === "fail" && !!body)
    || (
      toolKind !== "inspect"
      && !isGrep
      && !!body
      && lineCount > 0
      && lineCount <= 10
    )
    || (
      toolKind === "inspect"
      && !isGrep
      && !isListing
      && !!body
      && lineCount > 0
      && lineCount <= INSPECT_AUTO_EXPAND_MAX_LINES
    )

  const hasExpandableBody = (!!body && !diff) || isListing

  // Cap expanded body size so opening "show matches" stays scannable
  let displayBody = body && !diff && !renderedOutput.report && !isListing ? body : undefined
  if (displayBody && isGrep) {
    const lines = displayBody.split("\n")
    if (lines.length > 24) {
      displayBody = lines.slice(0, 24).join("\n") + `\n… (${lines.length - 24} more — refine the query)`
    }
  }

  return [
    {
      id: `${baseId}:${finalKind}`,
      index: 0,
      elapsed: elapsed.str,
      elapsedMs: elapsed.ms,
      timestamp: formatTimestamp(message.time?.created),
      kind: finalKind,
      label:
        finalKind === "fail"
          ? "fail"
          : agentName
            ? "agent"
            : finalKind === "report"
              ? "report"
              : kindLabel(kind, undefined, resolved.tool),
      glyph: finalGlyph,
      actor: agentName,
      summary,
      body: displayBody,
      bodyLabel: renderedOutput.report ? "report" : renderedOutput.label,
      bodyHint: renderedOutput.bodyHint || (resolved.tool === "read" ? filePath : undefined),
      bodyNote: renderedOutput.bodyNote,
      collapsible: !!diff || !!renderedOutput.report || hasExpandableBody,
      expandedByDefault: expandDefault,
      receipt,
      diff,
      listing: isListing ? listing : undefined,
      reminders: renderedOutput.reminders.length ? renderedOutput.reminders : undefined,
      report: renderedOutput.report,
      table: renderedOutput.table,
      source: { messageID: message.id, partID: resolved.id, kind: agentName ? "subtask" : "tool", sessionID: taskSessionID },
    },
  ]
}

/** Normalize paths for patch/tool matching (Windows/posix, a/b prefixes). */
function normalizeSpinePath(file: string): string {
  return file
    .replace(/\\/g, "/")
    .replace(/^[ab]\//, "")
    .replace(/^\.\//, "")
    .trim()
}

function pathKey(file: string): string {
  return normalizeSpinePath(file).toLowerCase()
}

function pathsMatch(a: string, b: string): boolean {
  const na = pathKey(a)
  const nb = pathKey(b)
  if (!na || !nb) return false
  if (na === nb) return true
  // Absolute vs relative: longer path ends with shorter
  return na.endsWith("/" + nb) || nb.endsWith("/" + na)
}

function setHasPath(keys: Iterable<string>, file: string): boolean {
  const target = pathKey(file)
  if (!target) return false
  for (const key of keys) {
    if (pathsMatch(key, target)) return true
  }
  return false
}

type SiblingPatchEvidence = {
  /** Path keys of files touched by edit/write/apply_patch tools in this message. */
  touchedKeys: string[]
  /** Unified diff bodies that cover at least one of the listed files. */
  bodies: string[]
}

/**
 * Collect line-level diffs + touched files from sibling patch tools so snapshot
 * PatchPart rows can be hydrated or suppressed (they only store hash + files).
 */
function collectSiblingPatchEvidence(parts: Part[]): SiblingPatchEvidence {
  const touchedKeys = new Set<string>()
  const bodies: string[] = []
  const seenBody = new Set<string>()

  const touch = (file: string | undefined) => {
    if (!file || typeof file !== "string") return
    const key = pathKey(file)
    if (key) touchedKeys.add(key)
  }

  const pushBody = (body: string | undefined) => {
    if (!body || !body.trim()) return
    const normalized = preserveBodyText(body)
    if (seenBody.has(normalized)) return
    seenBody.add(normalized)
    bodies.push(normalized)
  }

  for (const part of parts) {
    if (part.type !== "tool") continue
    if (!PATCH_TOOLS.has(part.tool) && toolToSpineKind(part.tool) !== "patch") continue
    const state = part.state
    if (state.status !== "completed" && state.status !== "error") continue

    const input = (state.input && typeof state.input === "object" ? state.input : {}) as Record<string, unknown>
    const meta =
      "metadata" in state && state.metadata && typeof state.metadata === "object"
        ? (state.metadata as Record<string, unknown>)
        : {}

    touch(typeof input.filePath === "string" ? input.filePath : undefined)
    touch(typeof input.path === "string" ? input.path : undefined)
    touch(typeof input.file === "string" ? input.file : undefined)
    touch(typeof meta.filepath === "string" ? meta.filepath : undefined)

    const filediff = meta.filediff
    if (filediff && typeof filediff === "object") {
      const fd = filediff as Record<string, unknown>
      touch(typeof fd.file === "string" ? fd.file : undefined)
      pushBody(typeof fd.patch === "string" ? fd.patch : undefined)
    }

    const filesMeta = meta.files
    if (Array.isArray(filesMeta)) {
      for (const item of filesMeta) {
        if (typeof item === "string") {
          touch(item)
          continue
        }
        if (!item || typeof item !== "object") continue
        const row = item as Record<string, unknown>
        touch(typeof row.filePath === "string" ? row.filePath : undefined)
        touch(typeof row.relativePath === "string" ? row.relativePath : undefined)
        touch(typeof row.file === "string" ? row.file : undefined)
        pushBody(typeof row.patch === "string" ? row.patch : undefined)
      }
    }

    pushBody(typeof meta.diff === "string" ? meta.diff : undefined)

    // Paths implied by a multi-file unified diff body
    if (typeof meta.diff === "string" && meta.diff.trim()) {
      for (const file of diffFilesFromBody(meta.diff, "")) touch(file)
    }
  }

  return { touchedKeys: [...touchedKeys], bodies }
}

/**
 * Snapshot PatchPart is { hash, files } only. Prefer sibling edit tool diffs;
 * hide the rollup entirely when tools already cover every listed file.
 */
function patchPartToEntry(
  message: Message,
  part: PatchPart,
  siblings: SiblingPatchEvidence,
): SpineEntry | null {
  const fileList = part.files.filter((f) => typeof f === "string" && f.trim())
  const fileCount = fileList.length

  // Tool rows already show these files — skip the redundant file-list rollup.
  if (
    fileCount > 0
    && fileList.every((file) => setHasPath(siblings.touchedKeys, file))
  ) {
    return null
  }

  // Hydrate only bodies whose paths match the snapshot file list (strict).
  const matchingBodies = siblings.bodies.filter((body) => {
    if (fileCount === 0) return true
    const bodyFiles = diffFilesFromBody(body, "")
    if (bodyFiles.length === 0) return false
    return bodyFiles.some((bf) => fileList.some((pf) => pathsMatch(bf, pf)))
  })

  const body = matchingBodies.length ? matchingBodies.join("\n") : undefined
  const hasDiff = !!body?.trim()
  let added: number | undefined
  let removed: number | undefined
  if (hasDiff && body) {
    added = (body.match(/^\+[^+]/gm) ?? []).length
    removed = (body.match(/^-[^-]/gm) ?? []).length
  }

  const filesLabel =
    fileList.join(", ")
    || (hasDiff && body ? diffFilesFromBody(body, "").join(", ") : "")
    || `${fileCount} files`

  return {
    id: `${message.id}:${part.id}:patch`,
    index: 0,
    elapsed: "",
    timestamp: formatTimestamp(message.time?.created),
    kind: "patch",
    label: "edit",
    glyph: SPINE_GLYPH.patch,
    summary: formatPatchHeadline(
      fileCount || (hasDiff && body ? diffFilesFromBody(body, "").length : 0),
      hasDiff ? { added, removed } : undefined,
      hasDiff,
    ),
    collapsible: fileCount > 0 || hasDiff,
    expandedByDefault: hasDiff,
    diff: {
      files: filesLabel,
      stats: hasDiff && (added !== undefined || removed !== undefined) ? `+${added ?? 0} -${removed ?? 0}` : "",
      body: hasDiff ? body : undefined,
      splitBody: hasDiff && body ? splitDiffBody(body) : undefined,
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

/** True when a later part means this step is finished (even if timestamps lag). */
function hasLaterContentPart(allParts: Part[], partId: string): boolean {
  const idx = allParts.findIndex((p) => p.id === partId)
  if (idx < 0) return false
  for (let i = idx + 1; i < allParts.length; i++) {
    const p = allParts[i]!
    if (
      p.type === "tool"
      || p.type === "text"
      || p.type === "reasoning"
      || p.type === "step-finish"
      || p.type === "patch"
      || p.type === "step-start"
    ) {
      return true
    }
  }
  return false
}

type StreamingCtx = {
  isLatestAssistant: boolean
  sessionStatusType?: string
}

function makeInlineThinkEntry(
  message: Message,
  part: TextPart,
  text: string,
  options?: { expandThinking?: boolean },
  allParts: Part[] = [],
  streamingCtx: StreamingCtx = { isLatestAssistant: true },
): SpineEntry {
  const raw = preserveBodyText(text.replace("[REDACTED]", ""))
  const hasText = !!raw.trim()
  const life = buildTurnLifecycle({
    message,
    part: part.time ? part : undefined,
    segmentSuperseded: hasLaterContentPart(allParts, part.id),
    isLatestAssistant: streamingCtx.isLatestAssistant,
    sessionStatusType: streamingCtx.sessionStatusType,
  })
  const streaming =
    message.role === "assistant" && isAssistantSegmentStreaming("think", life)
  const { body: titleStrippedBody } = reasoningSummary(raw)
  const summary = thinkingSummary(raw, `${part.id}:inline`)
  return {
    id: `${message.id}:${part.id}:think-inline`,
    index: 0,
    elapsed: "",
    timestamp: formatTimestamp(message.time?.created),
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
function makeThinkEntry(
  message: Message,
  part: ReasoningPart,
  options?: { expandThinking?: boolean },
  allParts: Part[] = [],
  streamingCtx: StreamingCtx = { isLatestAssistant: true },
): SpineEntry {
  // Strip OpenRouter encrypted-reasoning placeholder (matches legacy session route).
  const raw = preserveBodyText((part.text ?? "").replace("[REDACTED]", ""))
  const hasText = !!raw.trim()
  const life = buildTurnLifecycle({
    message,
    part,
    segmentSuperseded: hasLaterContentPart(allParts, part.id),
    isLatestAssistant: streamingCtx.isLatestAssistant,
    sessionStatusType: streamingCtx.sessionStatusType,
  })
  const streaming =
    message.role === "assistant" && isAssistantSegmentStreaming("think", life)
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
    timestamp: formatTimestamp(message.time?.created),
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
  /** When true, tools already ran after this text — segment superseded. */
  toolsAlreadyRan = false,
  streamingCtx: StreamingCtx = { isLatestAssistant: true },
): SpineEntry | undefined {
  if (!parts.length) return undefined
  const joined = joinTextBodies(parts)
  if (!joined.trim()) return undefined
  const view = chatTextView(joined)
  const primary = parts[0]!
  const elapsed = computeElapsed(assistantDuration, message)
  // Body joins every text part in this plan/ok bucket (joinTextBodies).
  // partEnded must match that universe: every part closed, not only parts[0].
  // Prefer every() over at(-1) so a hole (earlier part still open, later closed)
  // stays streaming rather than flipping dual-mode markdown mid-segment.
  const partEnded = parts.every((p) => p.time?.end != null)
  const life = buildTurnLifecycle({
    message,
    part: primary.time ? primary : undefined,
    partEnded,
    segmentSuperseded: toolsAlreadyRan,
    isLatestAssistant: streamingCtx.isLatestAssistant,
    sessionStatusType: streamingCtx.sessionStatusType,
  })
  const streaming =
    message.role === "assistant" && isAssistantSegmentStreaming(kind, life)
  return {
    id: `${message.id}:${primary.id}:${kind}`,
    index: 0,
    elapsed: elapsed.str,
    elapsedMs: elapsed.ms,
    timestamp: formatTimestamp(message.time?.created),
    kind,
    label: assistantTextLabel(message, kind),
    glyph: SPINE_GLYPH[kind],
    summary: view.summary,
    body: view.body,
    bodyLabel: APP_NAME,
    collapsible: view.collapsible,
    expandedByDefault: view.expandedByDefault,
    streaming,
    source: { messageID: message.id, partID: primary.id, kind: "text" },
  }
}

function assistantTextLabel(_message: Message, _kind: "plan" | "ok") {
  // Product voice (Grok-style) — never tool verbs or "assistant · build".
  return APP_NAME
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
  options?: { expandThinking?: boolean } & StreamingCtx,
): SpineEntry[] {
  const entries: SpineEntry[] = []
  const streamingCtx: StreamingCtx = {
    isLatestAssistant: options?.isLatestAssistant !== false,
    sessionStatusType: options?.sessionStatusType,
  }

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

  // Snapshot patch parts only store {hash, files}; hydrate/suppress using tool diffs.
  const siblingPatchEvidence = collectSiblingPatchEvidence(parts)

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]

    if (part.type === "reasoning") {
      // Always create a think entry — even empty-text reasoning-start
      // gets a placeholder summary. makeThinkEntry handles empty text.
      entries.push(makeThinkEntry(message, part, options, parts, streamingCtx))
      continue
    }

    if (part.type === "text" && isTextRelevant(part)) {
      const split = splitInlineThinkingText(part)
      if (split.thinking) {
        entries.push(makeInlineThinkEntry(message, part, split.thinking, options, parts, streamingCtx))
      }
      if (split.text) {
        if (!sawTool) textBeforeTool.push(split.text)
        else textAfterTool.push(split.text)
      }
      continue
    }

    if (part.type === "tool") {
      sawTool = true
      entries.push(...toolPartToEntries(message, part, i, parts))
      continue
    }

    if (part.type === "patch") {
      sawTool = true
      const patchEntry = patchPartToEntry(message, part, siblingPatchEvidence)
      if (patchEntry) entries.push(patchEntry)
      continue
    }

    if (part.type === "subtask") {
      sawTool = true
      entries.push({
        id: `${message.id}:${part.id}:agent`,
        index: 0,
        elapsed: "",
        timestamp: formatTimestamp(message.time?.created),
        kind: "agent",
        label: (part.agent as string) || "agent",
        glyph: SPINE_GLYPH.agent,
        actor: (part.agent as string) || "agent",
        summary: truncate(part.description || part.prompt, 120) || `subagent: ${part.agent ?? "agent"}`,
        body: part.description || part.prompt || "",
        collapsible: true,
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
        timestamp: formatTimestamp(message.time?.created),
        kind: "agent",
        label: part.name || "agent",
        glyph: SPINE_GLYPH.agent,
        actor: part.name || "agent",
        summary: `subagent: ${part.name}`,
        body: `subagent: ${part.name}`,
        collapsible: true,
        source: { messageID: message.id, partID: part.id, kind: "agent", sessionID: childSessionIDs[0] },
      })
      continue
    }
  }

  // plan stops writing once tools ran; ok/plan use full turn lifecycle (idle/finish/completed)
  const planEntry = makeTextEntry(message, textBeforeTool, "plan", assistantDuration, sawTool, streamingCtx)
  const okEntry = makeTextEntry(message, textAfterTool, "ok", assistantDuration, false, streamingCtx)

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

  // Path ditto only — burst grouping runs once at session level so consecutive
  // shell tools across assistant steps still collapse into one expandable row.
  return dedupeFilePaths(merged)
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

/** Stable target key for grouping consecutive same-file edit/read rows. */
function toolTargetKey(entry: SpineEntry): string | undefined {
  // Prefer explicit path fields — patch summaries are often "1 file · +N -M · diff"
  // and must NOT group distinct files together.
  const candidates = [
    entry.bodyHint,
    entry.diff?.files?.split(",")[0],
    entry.summary,
  ]
  for (const raw of candidates) {
    if (!raw || typeof raw !== "string") continue
    // Drop range/meta after " · " (e.g. "src/foo.ts · L1–40")
    const pathPart = raw.split(/\s·\s/)[0]?.trim() ?? ""
    if (!pathPart || pathPart.length < 3) continue
    // Skip generic patch headlines without a path
    if (/^\d+\s+files?\b/i.test(pathPart)) continue
    if (/^(diff|file-list only|evidence incomplete)$/i.test(pathPart)) continue
    // Shell commands are not file targets — never use full command lines here
    if (/\s/.test(pathPart) && !/[\\/]/.test(pathPart) && !pathPart.includes(".")) continue
    return pathKey(pathPart)
  }
  return undefined
}

/** First argv token of a shell command (`rg`, `git`, `bun`, …). */
function commandFamily(summary: string | undefined): string | undefined {
  if (!summary) return undefined
  const token = summary.trim().split(/\s+/)[0]
  if (!token) return undefined
  // strip path prefix: /usr/bin/rg → rg
  const base = token.replace(/^.*[\\/]/, "").replace(/\.exe$/i, "")
  return base || undefined
}

function groupToolSummary(entries: SpineEntry[]): string {
  const n = entries.length
  const kind = entries[0]?.kind
  if (kind === "run") {
    const families = entries.map((e) => commandFamily(e.summary ?? e.receipt?.command))
    const shared = families[0]
    if (shared && families.every((f) => f === shared)) {
      return `${n}× ${shared}`
    }
    return `${n} commands`
  }
  if (kind === "inspect") {
    const label = (entries[0]?.label || "tool").trim() || "tool"
    return `${n}× ${label}`
  }
  const first = entries[0]!
  return `${first.summary} · ${n} actions`
}

/**
 * Collapse consecutive tool bursts into one parent row.
 * - run: any consecutive shell commands (different rg/git cmds still group)
 * - inspect: consecutive same-verb tools (search/read/list)
 * - patch: only the same file target (never merge unrelated edits)
 */
function groupConsecutiveTools(entries: SpineEntry[]): SpineEntry[] {
  const result: SpineEntry[] = []
  let burst: SpineEntry[] = []
  /** Hidden rows (e.g. trailing ok) must not split a tool burst across steps. */
  let deferredHidden: SpineEntry[] = []

  function shouldGroup(a: SpineEntry, b: SpineEntry): boolean {
    if (a.kind !== b.kind || a.kind === "fail" || b.kind === "fail") return false
    // Snapshot PatchPart rows must not merge into edit tool rows
    if ((a.source?.kind ?? "tool") !== (b.source?.kind ?? "tool")) return false

    if (a.kind === "run") {
      // Shell bursts always collapse — commands differ by design
      return true
    }

    if (a.kind === "inspect") {
      // Prefer same verb (search+search), else still group consecutive inspects
      const aLabel = (a.label ?? "").toLowerCase()
      const bLabel = (b.label ?? "").toLowerCase()
      if (aLabel && bLabel) return aLabel === bLabel
      return true
    }

    if (a.kind === "patch") {
      const aKey = toolTargetKey(a)
      const bKey = toolTargetKey(b)
      if (!aKey || !bKey) return false
      return aKey === bKey
    }

    return false
  }

  function flushHidden() {
    if (deferredHidden.length) {
      result.push(...deferredHidden)
      deferredHidden = []
    }
  }

  function flush() {
    if (burst.length === 0) {
      flushHidden()
      return
    }
    if (burst.length === 1) {
      result.push(burst[0]!)
    } else {
      const first = burst[0]!
      const totalMs = burst.reduce((sum, e) => sum + (e.elapsedMs ?? 0), 0)
      // Aggregate match/output stats when present on receipts
      let matchHits = 0
      let hasMatchStats = false
      for (const e of burst) {
        const s = e.receipt?.summary ?? ""
        const m = s.match(/^(\d+)\s+match/i)
        if (m) {
          hasMatchStats = true
          matchHits += Number(m[1]) || 0
        }
      }
      result.push({
        ...first,
        elapsed: totalMs > 0 ? formatElapsed(totalMs) : first.elapsed,
        elapsedMs: totalMs > 0 ? totalMs : first.elapsedMs,
        summary: groupToolSummary(burst),
        // Parent is a folder of actions — don't pin first tool's output body
        body: undefined,
        bodyLabel: undefined,
        receipt: {
          label: first.receipt?.label ?? first.label ?? first.kind,
          status: burst.some((e) => e.receipt?.status === "fail")
            ? "fail"
            : burst.some((e) => e.receipt?.status === "pending")
              ? "pending"
              : "ok",
          summary: hasMatchStats
            ? `${matchHits} match${matchHits === 1 ? "" : "es"} · ${burst.length} runs`
            : `${burst.length} actions`,
          command: undefined,
        },
        collapsible: true,
        expandedByDefault: false,
        children: [...burst].filter(Boolean),
      })
    }
    burst = []
    flushHidden()
  }

  for (const entry of entries) {
    // Synthetic/hidden rows (trailing ok) sit between steps — don't break bursts.
    if (entry.hidden) {
      deferredHidden.push(entry)
      continue
    }
    // Reasoning rows stay visible and never join tool bursts.
    if (entry.kind === "think") {
      flush()
      result.push(entry)
      continue
    }
    if (entry.kind !== "run" && entry.kind !== "inspect" && entry.kind !== "patch") {
      flush()
      result.push(entry)
      continue
    }
    if (burst.length === 0 || shouldGroup(burst[0]!, entry)) {
      burst.push(entry)
    } else {
      flush()
      burst = [entry]
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

function childrenStable(a: SpineEntry[] | undefined, b: SpineEntry[] | undefined): boolean {
  if (a === b) return true
  if (!a || !b || a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!
    const y = b[i]!
    // `receipt?.status` is the field that drives spinner/checkmark rendering.
    // Without it, a pending → ok transition reuses the old entry object and
    // the spinner keeps spinning on the finished tool.
    if (
      x.id !== y.id
      || x.summary !== y.summary
      || x.body !== y.body
      || x.elapsed !== y.elapsed
      || x.receipt?.summary !== y.receipt?.summary
      || x.receipt?.status !== y.receipt?.status
    ) {
      return false
    }
  }
  return true
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
      childrenStable(prev.children, entry.children) &&
      prev.receipt === entry.receipt &&
      prev.diff === entry.diff &&
      prev.reminders === entry.reminders &&
      prev.report === entry.report &&
      prev.table === entry.table
    ) {
      return prev
    }
    // Content changed — return a NEW object so Solid <For> updates props.
    // In-place mutation is invisible to Solid (plain objects are not stores),
    // which left "writing" chrome stuck after streaming flipped false and
    // could freeze body text mid-token. Markdown uses streaming={false}
    // (finalized re-parse), so a new object per delta is acceptable.
    return entry
  })
}

export type SpineMessageCacheEntry = {
  message: Message
  parts: Part[]
  duration: number | undefined
  expandThinking: boolean
  // Tracks `message.time.completed` so the per-message cache detects the
  // streaming → completed transition (proxy ref is stable across the flip).
  completed: number | undefined
  finish: string | undefined
  sessionStatusType: string | undefined
  isLatestAssistant: boolean
  entries: SpineEntry[]
}

// L2 per-message cache. The outer fast path (which compared `messages`
// array identity) was removed in v0.3.20.1 because SolidJS store proxies
// survive `produce()` mutations, so the array ref is stable when messages
// are appended — the fast path returned stale `previousEntries` and newly-
// sent messages were invisible. The L2 cache still keys on per-message
// identity (`cached.message === message`) for streaming rescan bursts.
export type SpineEntriesCache = Map<string, SpineMessageCacheEntry>

export function messagesToSpineEntriesCached(input: {
  messages: Message[]
  getParts: (messageId: string) => Part[]
  assistantDuration: ReadonlyMap<string, number>
  expandThinking?: boolean
  /** Session turn status (idle/busy/…) — Grok-style authority to stop writing chrome. */
  sessionStatusType?: string
  cache?: SpineEntriesCache
  previousEntries?: SpineEntry[]
}): { entries: SpineEntry[]; cache: SpineEntriesCache } {
  const { messages, getParts, assistantDuration, cache, previousEntries } = input
  const expandThinking = input.expandThinking === true
  const sessionStatusType = input.sessionStatusType

  // Latest assistant in this batch (visible session messages order).
  let latestAssistantID: string | undefined
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]!.role === "assistant") {
      latestAssistantID = messages[i]!.id
      break
    }
  }

  const allEntries: SpineEntry[] = []
  const nextCache: SpineEntriesCache = new Map() as SpineEntriesCache

  for (const message of messages) {
    const parts = getParts(message.id) ?? EMPTY_PARTS
    const duration = assistantDuration.get(message.id)
    const cached = cache?.get(message.id)
    const completed = message.role === "assistant" ? message.time?.completed : undefined
    const finish =
      message.role === "assistant" && "finish" in message && typeof message.finish === "string"
        ? message.finish
        : undefined
    const isLatestAssistant = message.role === "assistant" && message.id === latestAssistantID

    // While the turn is still "open" for chrome purposes, always remap so
    // streaming can flip false when idle/finish/completed/parts change.
    // Closed once completed, finish, or session is not busy/retry (engine default idle;
    // missing status after poll must not keep the turn open forever).
    const turnOpenForChrome =
      message.role === "assistant"
      && !completed
      && !finish
      && !(isLatestAssistant && !isSessionTurnActive(sessionStatusType))

    let entries: SpineEntry[]
    if (
      cached
      && !turnOpenForChrome
      && cached.message === message
      && cached.parts === parts
      && cached.duration === duration
      && cached.expandThinking === expandThinking
      && cached.completed === completed
      && cached.finish === finish
      && cached.sessionStatusType === sessionStatusType
      && cached.isLatestAssistant === isLatestAssistant
    ) {
      entries = cached.entries
    } else if (message.role === "user") {
      entries = userMessageToEntries(message, parts, assistantDuration)
    } else if (message.role === "assistant") {
      entries = assistantMessagePartsToEntries(message, parts, assistantDuration, {
        expandThinking,
        isLatestAssistant,
        sessionStatusType,
      })
    } else {
      entries = []
    }

    nextCache.set(message.id, {
      message,
      parts,
      duration,
      expandThinking,
      completed,
      finish,
      sessionStatusType,
      isLatestAssistant,
      entries,
    })
    allEntries.push(...entries)
  }

  // Group consecutive run/inspect bursts across the whole session timeline
  // (not only within one assistant message), then re-index.
  const grouped = groupConsecutiveTools(allEntries)
  const indexed = assignIndexes(grouped, 1)
  const stabilized = stabilizeEntries(indexed, previousEntries)

  return { entries: stabilized, cache: nextCache }
}

export function messagesToSpineEntries(input: {
  messages: Message[]
  getParts: (messageId: string) => Part[]
  assistantDuration: ReadonlyMap<string, number>
  expandThinking?: boolean
  sessionStatusType?: string
}): SpineEntry[] {
  return messagesToSpineEntriesCached(input).entries
}
