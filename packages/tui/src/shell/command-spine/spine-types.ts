export type SpineKind = "ask" | "plan" | "inspect" | "patch" | "run" | "fail" | "fix" | "ok" | "think" | "agent" | "report"

export type SpineLayout = "wide" | "compact" | "narrow" | "minimal"

export type StatusTone =
  | "brand"
  | "success"
  | "accent"
  | "secondary"
  | "info"
  | "warning"
  | "error"
  | "text"
  | "muted"

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
  kind: "message" | "text" | "tool" | "patch" | "reasoning" | "subtask" | "agent"
}

export type SpineEntry = {
  id: string
  index: number
  elapsed: string
  timestamp?: string
  actor?: string
  label?: string
  kind: SpineKind
  glyph: string
  summary: string
  body?: string
  bodyLabel?: string
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
 * (Previously 6/2 — wasted a full word of horizontal space on every row.)
 */
export function spineOuterPadding(layout: SpineLayout) {
  if (layout === "wide") return 2
  if (layout === "minimal") return 0
  return 1
}

/**
 * Left meta column: step index + optional compact elapsed.
 * Prefer a single short row over the old two-line "index + HH:MM:SS" block
 * that consumed ~20 columns on wide layouts.
 *
 *   wide/compact  →  "01 +1.2s"   (9)
 *   narrow        →  "01 +1s"     (7)
 *   minimal       →  "01"         (3)
 */
export function spineGutterWidth(layout: SpineLayout) {
  if (layout === "wide" || layout === "compact") return 9
  if (layout === "narrow") return 7
  return 3
}

/** Glyph column — single cell + breathing room. */
export function spineRailWidth(layout: SpineLayout) {
  if (layout === "minimal") return 2
  return 2
}

/** Max characters for the elapsed fragment inside the gutter. */
export function spineElapsedMax(layout: SpineLayout) {
  if (layout === "wide" || layout === "compact") return 6 // "+12.1s"
  if (layout === "narrow") return 4 // "+1s"
  return 0
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
  plan: "▸",
  inspect: "▸",
  patch: "▸",
  run: "▸",
  fail: "×",
  fix: "▸",
  ok: "◎",
  think: "◇",
  agent: "⤷",
  report: "◆",
}
