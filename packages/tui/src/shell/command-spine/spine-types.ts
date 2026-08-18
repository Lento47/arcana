import type { Theme } from "../../theme"
import { displayWidth } from "../../util/locale"

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

export function statusToneColor(tone: StatusTone, theme: Theme) {
  switch (tone) {
    case "brand":
      return theme.spineBrand
    case "success":
      return theme.success
    case "accent":
      return theme.accent
    case "secondary":
      return theme.secondary
    case "info":
      return theme.info
    case "warning":
      return theme.warning
    case "error":
      return theme.error
    case "text":
      return theme.text
    case "muted":
    default:
      return theme.textMuted
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
  kind: "message" | "text" | "tool" | "patch" | "reasoning" | "subtask" | "agent" | "approve" | "question" | "governance"
}

/**
 * PR6: immutable exact-request projection for an approval gate.
 *
 * PR2's `ApprovalRequestSnapshot` is not merged into this base, so the TUI
 * derives the closest real projection from the durable ApprovalRecord plus
 * the engine's governance events (authorization.requested /
 * authorization.approval_required / authorization.executed) correlated by
 * requestHash. When no event carries the fields, `available` is false and
 * the gate renders fail-closed ("snapshot unavailable") — never an invented
 * tool/capability/policy.
 */
export type SpineApprovalSnapshot = {
  requestHash: string
  available: boolean
  tool?: string
  action?: string
  capability?: string
  principal?: string
  policy?: string
  change?: string
  route?: string
  risk?: string
  expires?: string
  contractRevision?: number
  executionId?: string
  arguments?: string[]
}

/**
 * PR6: proof continuation shown directly beneath a completed effect.
 * `receipt` is the shortened effect/receipt hash, `evidence` counts attached
 * evidence artifacts, and the remaining fields come from the canonical
 * RunProof snapshot when it is available.
 */
export type SpineProofContinuation = {
  receipt?: string
  evidence?: number
  proofLevel?: string
  integrity?: string
  policy?: string
  executionId?: string
  requestHash?: string
  tool?: string
  action?: string
  startedAt?: string
  completedAt?: string
}

export type SpineEntry = {
  id: string
  index: number
  elapsed: string
  /** Numeric elapsed in ms (parallel to `elapsed`). Use for sums; avoids re-parsing "+1h"→"+1s" bug. */
  elapsedMs?: number
  timestamp?: string
  /** Absolute occurrence time (unix ms) — enables group duration/range derivation. */
  occurredAt?: number
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
  /**
   * PR6: security breakthrough rows. Important governance events visually
   * interrupt the spine and stay visible under every view filter.
   */
  breakthrough?: boolean
  /** PR6: inline exact-request gate context (approval rows). */
  approval?: SpineApprovalSnapshot
  /** PR6: proof continuation beneath a completed effect. */
  proof?: SpineProofContinuation
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
 * Session route frame around the spine: paddingLeft 2 + paddingRight 2
 * + Yoga border 1 on left and right. OpenTUI setBorder(..., 1) per side.
 * Subtract this from terminal width before spineProseWidth — do not also
 * remove the session pad/border or wrap will undershoot twice.
 */
export const SESSION_FRAME_CHROME = 6

/**
 * User density preference: how much chrome the session frame and spine use.
 * Stored in KV (`density`) like theme/animations so it persists per machine.
 * `cozy` is the default (2), `compact` trims to 1, `spacious` adds to 3.
 */
export type Density = "compact" | "cozy" | "spacious"

export const DENSITIES: readonly Density[] = ["compact", "cozy", "spacious"] as const

export function isDensity(value: unknown): value is Density {
  return typeof value === "string" && (DENSITIES as readonly string[]).includes(value)
}

/** Human label for the slash-command title (compact → cozy → spacious). */
export function densityName(value: unknown): string {
  return isDensity(value) ? value : "cozy"
}

/** Cycle order matches the slash command: compact → cozy → spacious → … */
export function nextDensity(current: Density): Density {
  const idx = DENSITIES.indexOf(current)
  return DENSITIES[(idx + 1) % DENSITIES.length] ?? "cozy"
}

/** Per-side horizontal padding of the session frame for a density. */
export function framePadding(density?: Density): number {
  if (density === "compact") return 1
  if (density === "spacious") return 3
  return 2
}

/** Total chrome (padding + borders) the frame consumes for a density. */
export function frameChrome(density?: Density): number {
  return framePadding(density) * 2 + 2
}

export function spineViewportWidth(terminalWidth: number, chrome: number = SESSION_FRAME_CHROME): number {
  const term = Number.isFinite(terminalWidth) ? Math.floor(terminalWidth) : 1
  return Math.max(1, term - chrome)
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

/**
 * Gutter width for the largest visible display index. The 2-col contract
 * grows only when a session actually exceeds 99 rows — the gutter never
 * repeats "99" as a fake cap.
 */
export function spineGutterDigits(maxIndex: number): number {
  const digits = String(Math.max(1, Math.floor(maxIndex))).length
  return Math.max(2, digits)
}

/** Glyph column — single cell + trailing space. */
export function spineRailWidth(_layout: SpineLayout) {
  return 2
}

/**
 * Rail cell text (audit B8): display-width, grapheme-safe.
 *
 * A 1-col glyph gets a trailing space to fill the 2-col rail; a 2-col glyph
 * (◤, ⤷, wide emoji) fills the rail alone. Never slices mid-grapheme — the
 * old `(symbol + " ").slice(0, width).padEnd(width)` split surrogate pairs.
 */
export function spineRailCell(symbol: string, width: number): string {
  if (width <= 0) return ""
  const w = displayWidth(symbol)
  if (w >= width) return symbol
  return symbol + " ".repeat(width - w)
}

/**
 * Soft-card chrome inside the content column. Must stay in lockstep with
 * `SpineChatCard` (left accent + padL + padR). Do not invent a second pad.
 */
export const SPINE_CHAT_CARD_CHROME = {
  border: 1,
  padL: 2,
  padR: 1,
} as const

export function spineChatCardChrome(): number {
  return SPINE_CHAT_CARD_CHROME.border + SPINE_CHAT_CARD_CHROME.padL + SPINE_CHAT_CARD_CHROME.padR
}

/**
 * Measured content width for chat/think prose (Grok-class wrap width).
 *
 * Terminal columns minus outer pad + gutter + variant chrome + safety,
 * clamped to >= 1. Never a bare 80-column fallback: a present-but-narrow
 * terminal gets its real budget, and a missing/zero width (first paint race)
 * degrades to 1, which cannot overflow the parent.
 *
 * @param terminalWidth - full terminal columns
 * @param layout - current spine layout
 * @param variant - "chat" includes soft-card padding; "think" is tighter
 */
export function spineProseWidth(
  terminalWidth: number,
  layout: SpineLayout,
  variant: "chat" | "think" | "inline" = "chat",
  gutterWidth?: number,
): number {
  const term = Number.isFinite(terminalWidth) ? Math.floor(terminalWidth) : 1
  // Entry: outer pad + gutter. Chat card: left border + padL + padR.
  // No separate rail sibling on the body anymore (pad/border only).
  const gutter = gutterWidth ?? spineGutterWidth(layout)
  const chrome =
    spineOuterPadding(layout)
    + gutter
    + (variant === "chat" ? spineChatCardChrome() : variant === "think" ? spineRailWidth(layout) + 1 : 1)
    + 2 // scrollbar / safety
  // Clamp to >= 1 so a tiny/narrow terminal never yields negative or 80-wide prose.
  return Math.max(1, term - chrome)
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

// Unit preservation for compactSpineElapsed (audit T6): an ellipsis must never
// eat the unit — "+123…" is ambiguous (seconds? minutes?), "+0.1s" is not.
const ELAPSED_UNIT_MS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60000,
  h: 3600000,
  d: 86400000,
}

/** Drop a trailing ".0" so "5.0s" reads "5s" (consolidated lexicon). */
function stripZero(s: string) {
  return s.replace(/\.0$/, "")
}

/**
 * Canonical elapsed formatter (audit T8): consistent precision across all
 * ranges via the same finest-tier forms as `compactElapsedForms`, with the
 * sign prefix. Old local copies rounded seconds to ints (`+12s`), rounded
 * minutes up (`90s → +2m`) and dropped the hour's minutes — tier-by-tier
 * precision drift. Zero/negative/non-finite → "" (no `+0ms` noise).
 */
export function formatElapsedMs(ms: number | undefined): string {
  if (ms === undefined || !Number.isFinite(ms) || ms <= 0) return ""
  return "+" + compactElapsedForms(ms)[0]!
}

/** Finest → coarsest unit-preserving render tiers for a value in ms. */
function compactElapsedForms(abs: number): string[] {
  if (abs < 1000) return [`${Math.round(abs)}ms`, `${stripZero((abs / 1000).toFixed(1))}s`]
  if (abs < 60000) return [`${stripZero((abs / 1000).toFixed(1))}s`, `${Math.round(abs / 1000)}s`]
  if (abs < 3600000) return [`${Math.floor(abs / 60000)}m`]
  if (abs < 86400000) return [`${Math.floor(abs / 3600000)}h`]
  return [`${Math.floor(abs / 86400000)}d`]
}

/**
 * Compact "+1.2s" / "+12s" for node meta. Empty when max is 0 or value blank.
 * Values that fit are returned unchanged. Values that don't fit are re-rendered
 * at a coarser precision that keeps the unit intact (audit T6) — the unit is
 * never truncated, even at the cost of a slight overflow.
 */
export function compactSpineElapsed(elapsed: string | undefined, max: number): string {
  if (!elapsed || max <= 0) return ""
  const value = elapsed.trim()
  if (!value) return ""
  if (displayWidth(value) <= max) return value
  const match = value.match(/^([+-]?)(\d+(?:\.\d+)?)(ms|s|m|h|d)?$/)
  if (!match) return value.slice(0, Math.max(1, max))
  const sign = match[1] === "-" ? "-" : "+"
  const ms = Number(match[2]) * (ELAPSED_UNIT_MS[match[3] ?? "s"] ?? 1000)
  if (!Number.isFinite(ms) || ms <= 0) return value.slice(0, Math.max(1, max))
  const forms = compactElapsedForms(ms)
  for (const form of forms) {
    const candidate = sign + form
    if (displayWidth(candidate) <= max) return candidate
  }
  // Coarsest tier keeps the unit — accept a slight overflow rather than eat it.
  return sign + forms[forms.length - 1]!
}

export function spineTone(kind: SpineKind, theme: Theme) {
  switch (kind) {
    case "ask":
      return theme.spineAsk
    case "plan":
      return theme.spinePlan
    case "inspect":
      return theme.spineInspect
    case "patch":
      return theme.spinePatch
    case "run":
      return theme.spineRun
    case "fail":
      return theme.spineFail
    case "fix":
      return theme.spineFix
    case "approve":
      return theme.warning
    case "question":
      return theme.spineAsk
    case "ok":
      return theme.spineOk
    case "think":
      return theme.spineThink
    case "agent":
      return theme.spineSubagent
    // S1 catch: `spineReport` was never a Theme token — the old `as any` hid that
    // it was undefined at runtime. Map to the semantically-closest subagent tone.
    case "report":
      return theme.spineSubagent
    default:
      return theme.spineThink
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
