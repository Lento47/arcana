export type SpineKind =
  | "ask"
  | "plan"
  | "think"
  | "inspect"
  | "patch"
  | "run"
  | "fail"
  | "fix"
  | "approve"
  | "question"
  | "agent"
  | "ok"
  | "report"

export type SpineLayout = "wide" | "compact" | "narrow" | "minimal"

export type StatusTone = "brand" | "success" | "accent" | "secondary" | "info" | "warning" | "error" | "text" | "muted"

export type StatusSegment = {
  key: string
  icon?: string
  label: string
  value: string
  tone: StatusTone
}

export function statusToneColor(tone: StatusTone, theme: Record<string, unknown>): any {
  switch (tone) {
    case "brand":
      return theme.spineBrand as any
    case "success":
      return theme.success as any
    case "accent":
      return theme.accent as any
    case "secondary":
      return theme.secondary as any
    case "info":
      return theme.info as any
    case "warning":
      return theme.warning as any
    case "error":
      return theme.error as any
    case "text":
      return theme.text as any
    case "muted":
    default:
      return theme.textMuted as any
  }
}

export type SpineReceiptFile = {
  path: string
  added: number
  removed: number
}

export type SpineReceipt = {
  label: string
  command?: string
  /** Inline outcome summary shown on the row — e.g. "4 matches", "2 files", "ERR". */
  summary?: string
  stats?: {
    passed?: number
    failed?: number
    ignored?: number
    duration?: string
    added?: number
    removed?: number
  }
  status: "ok" | "fail" | "pending"
  files?: SpineReceiptFile[]
}

export type SpineDiffExcerpt = {
  files: string
  stats: string
  body?: string
  splitBody?: { left: string; right: string }
}

export type SpineSourceRef = {
  messageID: string
  partID?: string
  /** Child subsession ID for agent/subtask entries — enables click-to-navigate. */
  sessionID?: string
  kind: "message" | "text" | "tool" | "patch" | "reasoning" | "subtask" | "agent" | "approve" | "question"
}

export type SpineEntry = {
  id: string
  index: number
  elapsed: string
  /** Numeric elapsed in ms (parallel to `elapsed`). Use for sums; avoids re-parsing "+1h"→"+1s" bug. */
  elapsedMs?: number
  timestamp?: string
  actor?: string
  label?: string
  kind: SpineKind
  glyph: string
  summary: string
  body?: string
  bodyLabel?: string
  /**
   * Path or language hint for syntax highlighting when `summary` includes
   * range meta (e.g. "src/foo.ts · L1–40").
   */
  bodyHint?: string
  /** Muted note under code/prose (EOF, truncation, line range). */
  bodyNote?: string
  collapsible?: boolean
  expandedByDefault?: boolean
  receipt?: SpineReceipt
  diff?: SpineDiffExcerpt
  source?: SpineSourceRef
  hidden?: boolean
  /** True when the content is still actively streaming (think entries show spinner). */
  streaming?: boolean
  /** Verb text from preceding think entry — merged into the tool row. */
  thinking?: string
  /** Grouped child entries (when this entry is a parent row). */
  children?: SpineEntry[]
  /** System-reminder blocks extracted from read tool output — rendered as callouts. */
  reminders?: string[]
  /** Structured subagent report data — when kind is "report". */
  report?: SpineReportData
  /** Parsed CLI table data — rendered as stacked rows instead of raw text. */
  table?: { headers: string[]; rows: string[][] }
  /**
   * Directory / glob path listing — plain names, no code fence or XML.
   * Prefer this over stuffing entries into `body` as "file" source.
   */
  listing?: string[]
}

export type SpineConcernSeverity = "HIGH" | "MEDIUM" | "LOW"

export type SpineReportData = {
  title: string
  summary: string
  scorecard: { label: string; status: "pass" | "warn" | "fail" }[]
  concerns: { severity: SpineConcernSeverity; title: string; detail: string }[]
  body: string
}

export function getSpineLayout(width: number, current?: SpineLayout): SpineLayout {
  // Hysteresis: ±5px dead zone prevents rapid layout toggling at boundary widths
  // when the user resizes the terminal across a breakpoint.
  if (current) {
    if (current === "wide" && width >= 115) return "wide"
    if (current === "compact" && width >= 95 && width < 125) return "compact"
    if (current === "narrow" && width >= 75 && width < 105) return "narrow"
    if (current === "minimal" && width < 85) return "minimal"
  }
  if (width >= 120) return "wide"
  if (width >= 100) return "compact"
  if (width >= 80) return "narrow"
  return "minimal"
}

/**
 * Outer left inset. Keep small so chat content owns the width.
 * Wide previously used 2; 1 is enough separation from the terminal edge.
 */
export function spineOuterPadding(layout: SpineLayout) {
  if (layout === "minimal") return 0
  return 1
}

/**
 * Left meta column: step index only.
 * Duration lives on the node header (not a fixed gutter tax).
 * Wall-clock is not shown on the spine row.
 *
 *   all layouts → "01" (2) + optional trailing space handled by rail align
 */
export function spineGutterWidth(_layout: SpineLayout) {
  return 2
}

/** Glyph column — single cell + trailing space. */
export function spineRailWidth(_layout: SpineLayout) {
  return 2
}

/**
 * Measured content width for chat/think prose (Grok-class wrap width).
 *
 * Terminal columns minus gutter + rail + card padding/border + safety.
 * Floors at 24 so Yoga never collapses markdown to mid-word wraps.
 *
 * @param terminalWidth - full terminal columns
 * @param layout - current spine layout
 * @param variant - "chat" includes soft-card padding; "think" is tighter
 */
export function spineProseWidth(
  terminalWidth: number,
  layout: SpineLayout,
  variant: "chat" | "think" | "inline" = "chat",
): number {
  // Prefer a sane default if dimensions are missing/zero (first paint race).
  const term =
    Number.isFinite(terminalWidth) && terminalWidth >= 40
      ? Math.floor(terminalWidth)
      : 80
  // Entry: outer pad + gutter. Chat card: left border + padL + padR.
  // No separate rail sibling on the body anymore (pad/border only).
  const chrome =
    spineOuterPadding(layout)
    + spineGutterWidth(layout)
    + (variant === "chat" ? 1 /* border */ + 2 /* padL */ + 1 /* padR */ : variant === "think" ? spineRailWidth(layout) + 1 : 1)
    + 2 // scrollbar / safety
  // Floor high enough that word-wrap never collapses to mid-token wraps.
  return Math.max(40, term - chrome)
}

/**
 * Max characters for elapsed shown on the node header (not gutter).
 * minimal hides duration to save horizontal room on tiny terminals.
 */
export function spineElapsedMax(layout: SpineLayout) {
  if (layout === "minimal") return 0
  if (layout === "narrow") return 5 // "+12s"
  return 7 // "+12.1s"
}

/** Compact "+1.2s" / "+12s" for node meta. Empty when max is 0 or value blank. */
export function compactSpineElapsed(elapsed: string | undefined, max: number): string {
  if (!elapsed || max <= 0) return ""
  const value = elapsed.trim()
  if (!value) return ""
  if (value.length <= max) return value
  const stripped = value.replace(/^\+/, "").replace(/(\d+)\.(\d+)s/, "$1s")
  const withPlus = stripped.startsWith("+") ? stripped : `+${stripped}`
  if (withPlus.length <= max) return withPlus
  return withPlus.slice(0, max - 1) + "…"
}

export function spineTone(kind: SpineKind, theme: Record<string, unknown>) {
  switch (kind) {
    case "ask":
      return theme.spineAsk as any
    case "plan":
      return theme.spinePlan as any
    case "inspect":
      return theme.spineInspect as any
    case "patch":
      return theme.spinePatch as any
    case "run":
      return theme.spineRun as any
    case "fail":
      return theme.spineFail as any
    case "fix":
      return theme.spineFix as any
    case "approve":
      return (theme.warning ?? theme.spineFix) as any
    case "question":
      return (theme.spineAsk ?? theme.accent) as any
    case "ok":
      return theme.spineOk as any
    case "think":
      return theme.spineThink as any
    case "agent":
      return theme.spineSubagent as any
    case "report":
      return theme.spineReport as any
    default:
      return theme.spineThink as any
  }
}

export const SPINE_GLYPH: Record<SpineKind, string> = {
  ask: "◆",
  // Chat voice uses brand marks in SpineChatCard; tools keep ▸
  plan: "✦",
  inspect: "▸",
  patch: "▸",
  run: "▸",
  fail: "×",
  fix: "▸",
  approve: "◤",
  question: "?",
  ok: "✦",
  think: "◇",
  agent: "⤷",
  report: "◆",
}
