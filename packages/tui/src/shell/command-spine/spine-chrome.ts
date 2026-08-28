/**
 * Presentation helpers for command-spine chrome.
 * Pure: tests feed fixtures and assert labels/cues without mounting the TUI.
 */

import type { SpineApprovalSnapshot, SpineKind, SpineLayout, SpineReceipt } from "./spine-types"
import { selectionActions } from "../../util/selection"
import { displayWidth } from "../../util/locale"

/** Label column shared by approval / proof key-value rows. */
export const FACT_LABEL_WIDTH = 12
const CHIP_PAD = 2
const CHIP_GAP = 1

// ── Header status zones (Option A breadcrumb redesign) ───────────

/** Keys that belong to the governance zone of the header status line. */
const GOVERNANCE_ITEM_KEYS = new Set(["contract", "proof", "governed", "pending"])

export type HeaderItemZone = "runtime" | "governance" | "context"

export function headerItemZone(item: { key: string }): HeaderItemZone {
  if (item.key === "live") return "runtime"
  if (GOVERNANCE_ITEM_KEYS.has(item.key)) return "governance"
  return "context"
}

/**
 * Partition flat header items into render zones: runtime (brand-adjacent
 * state), governance (proof/contract/tally — security state stays together),
 * and context (branch/model/session/path breadcrumbs).
 */
export function partitionHeaderStatusItems<T extends { key: string }>(items: readonly T[]): {
  runtime: T[]
  governance: T[]
  context: T[]
} {
  const runtime: T[] = []
  const governance: T[] = []
  const context: T[] = []
  for (const item of items) {
    const zone = headerItemZone(item)
    if (zone === "runtime") runtime.push(item)
    else if (zone === "governance") governance.push(item)
    else context.push(item)
  }
  return { runtime, governance, context }
}

const BREADCRUMB_SEP = " ▸ "

/** Generic container directories that carry no brand meaning in a trail. */
const CONTAINER_SEGMENTS = new Set([
  "projects", "project", "repos", "repo", "workspace", "workspaces",
  "dev", "code", "src", "work", "home", "users", "user",
])

/**
 * Path → breadcrumb trail for the header context zone.
 *
 * Drops drive letters and empty segments; anchors on the first non-container
 * segment (skipping PROJECTS/, home/, users/…), elides everything between the
 * anchor and the nearest leaves:
 *   L:\PROJECTS\arcana\packages\engine, 3 → "arcana ▸ … ▸ engine"
 *   /home/user/arcana/packages/core, 3    → "arcana ▸ … ▸ core"
 *   Z:\a\b\c\d, 3                         → "a ▸ … ▸ d"
 * `maxSegments` counts displayed tokens including the ellipsis. Below 3 the
 * trail is leaf-anchored: up to `maxSegments` leaves plus a leading ellipsis
 * when trimmed (so one extra token on top of the budget).
 */
export function breadcrumbFromPath(path: string, maxSegments: number): string {
  const parts = path
    .split(/[\\/]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && !/^[a-zA-Z]:$/.test(part))
  const max = Math.max(0, Math.floor(maxSegments))
  if (parts.length === 0 || max === 0) return ""
  if (parts.length <= max) return parts.join(BREADCRUMB_SEP)

  if (max < 3) {
    const tail = parts.slice(-max)
    const trimmed = parts.length > tail.length
    return [...(trimmed ? ["…"] : []), ...tail].join(BREADCRUMB_SEP)
  }

  let anchorIndex = 0
  while (anchorIndex < parts.length - 1 && CONTAINER_SEGMENTS.has(parts[anchorIndex]!.toLowerCase())) {
    anchorIndex++
  }
  const head = parts[anchorIndex]!
  const tailCount = max - 2
  const tail = parts.slice(Math.max(anchorIndex + 1, parts.length - tailCount))
  if (tail.length === 0 || tail.includes(head)) {
    return parts.slice(-max).join(BREADCRUMB_SEP)
  }
  return [head, "…", ...tail].join(BREADCRUMB_SEP)
}

/** Display width of a padded chip: pad + label + pad. */
export function chipCellWidth(label: string): number {
  return displayWidth(label) + CHIP_PAD
}

/**
 * Greedy row pack so chips wrap instead of overflowing the content column.
 * A chip wider than the budget keeps its own row (render truncates).
 */
export function packChipRows<T>(
  items: readonly T[],
  contentWidth: number,
  itemWidth: (item: T) => number,
  gap = CHIP_GAP,
): T[][] {
  const budget = Math.max(1, Math.floor(contentWidth))
  const rows: T[][] = []
  let row: T[] = []
  let used = 0
  for (const item of items) {
    const w = itemWidth(item)
    if (row.length > 0 && used + gap + w > budget) {
      rows.push(row)
      row = []
      used = 0
    }
    row.push(item)
    used += (row.length > 1 ? gap : 0) + w
  }
  if (row.length > 0) rows.push(row)
  return rows
}

export function headerChipBudget(layout: SpineLayout): number {
  if (layout === "minimal") return 24
  if (layout === "narrow") return 40
  if (layout === "compact") return 56
  return 72
}

export type ToolChipStatus = "live" | "done" | "fail" | "idle"

/**
 * Lifecycle vocabulary used by the shared tool-chip renderer.  The existing
 * `ToolChipStatus` export is kept for compatibility with the older chrome
 * helper; this richer state is what the visual surface consumes.
 */
export type ToolChipLifecycle = "queued" | "running" | "success" | "failure" | "interrupted"

export type ToolChipModel = {
  label: string
  summary: string
  lifecycle: ToolChipLifecycle
  glyph: "·" | "●" | "✓" | "✗" | "!"
  /** Human-readable status used when a meaningful outcome is unavailable. */
  statusLabel: "queued" | "running" | "success" | "failed" | "interrupted"
  /** Compact result/error text. Exact command/output remains in the receipt/body. */
  outcome?: string
}

/** Stable category labels shared by both shell implementations. */
export function toolCategoryLabel(tool: string): string {
  const value = normalizeToolText(tool).toLowerCase()
  if (!value) return "tool"
  if (value === "inspect" || value === "patch" || value === "run" || value === "agent" || value === "report") return value
  if (value === "fix") return "edit"
  const tokens = value.split(/[^a-z0-9]+/).filter(Boolean)
  const has = (...names: string[]) => tokens.some((token) => names.some((name) => token === name || token.startsWith(name)))
  if (has("task", "subtask", "subagent")) return "task"
  if (has("search", "grep", "ripgrep", "find")) return "search"
  if (has("fetch", "url", "http")) return "fetch"
  if (has("read")) return "read"
  if (has("glob", "list", "directory")) return "list"
  if (has("edit", "write", "patch", "rename", "move", "copy")) return "edit"
  if (has("bash", "shell", "exec", "terminal", "run", "command", "powershell")) return "run"
  if (has("question")) return "question"
  if (has("skill")) return "skill"
  if (has("todo")) return "todo"
  return "tool"
}

function normalizeToolText(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim()
}

function stripLeadingOutcomeGlyph(value: string): string {
  return value.replace(/^(?:[✓✗×!·]\s*)+/, "").trim()
}

function receiptOutcome(receipt: SpineReceipt | undefined, lifecycle: ToolChipLifecycle): string | undefined {
  // The glyph already communicates a terminal failure/interruption. Without a
  // receipt there is no useful second fact to add, so avoid generic filler
  // such as "· failed" beside an already-specific summary.
  if (!receipt) return undefined

  if (lifecycle === "failure") {
    const failure = normalizeToolText(receipt.summary || receipt.command)
    return failure ? stripLeadingOutcomeGlyph(failure) : "failed"
  }
  if (lifecycle === "interrupted") {
    const interruption = normalizeToolText(receipt.summary || receipt.command)
    return interruption ? stripLeadingOutcomeGlyph(interruption) : "interrupted"
  }

  const stats = receipt.stats
  if (stats && (stats.passed !== undefined || stats.failed !== undefined)) {
    const passed = stats.passed ?? 0
    const failed = stats.failed ?? 0
    const ignored = stats.ignored !== undefined && stats.ignored > 0 ? ` · ${stats.ignored} skipped` : ""
    return `${passed} passed · ${failed} failed${ignored}${stats.duration ? ` · ${stats.duration}` : ""}`
  }
  if (stats && (stats.added !== undefined || stats.removed !== undefined)) {
    return `+${stats.added ?? 0} -${stats.removed ?? 0}`
  }
  const summary = normalizeToolText(receipt.summary)
  if (summary) return stripLeadingOutcomeGlyph(summary)
  if (!stats) return undefined
  return normalizeToolText(stats.duration)
}

/**
 * Build the single semantic model used by command-spine and legacy tool rows.
 * This function is intentionally pure: state comes from the mapper/adapter and
 * the renderer only decides how much of the model fits in the terminal.
 */
export function toolChipModel(input: {
  kind: string
  label?: string
  summary?: string
  receipt?: SpineReceipt
  streaming?: boolean
  lifecycle?: ToolChipLifecycle
}): ToolChipModel {
  const receiptStatus = input.receipt?.status
  const lifecycle: ToolChipLifecycle = input.lifecycle
    ?? (input.kind === "fail" || receiptStatus === "fail"
      ? "failure"
      : receiptStatus === "interrupted"
        ? "interrupted"
        : input.streaming === true
          ? "running"
          : receiptStatus === "pending"
            ? "queued"
            : "success")
  const labels: Record<ToolChipLifecycle, ToolChipModel["statusLabel"]> = {
    queued: "queued",
    running: "running",
    success: "success",
    failure: "failed",
    interrupted: "interrupted",
  }
  const glyphs: Record<ToolChipLifecycle, ToolChipModel["glyph"]> = {
    queued: "·",
    running: "●",
    success: "✓",
    failure: "✗",
    interrupted: "!",
  }
  const summary = normalizeToolText(input.summary)
  const outcome = receiptOutcome(input.receipt, lifecycle)
  return {
    label: normalizeToolText(input.label) || toolCategoryLabel(input.kind),
    summary,
    lifecycle,
    glyph: glyphs[lifecycle],
    statusLabel: labels[lifecycle],
    outcome: outcome && outcome !== summary ? outcome : undefined,
  }
}

export function toolChipStatus(input: { kind: string; streaming?: boolean }): ToolChipStatus {
  if (input.kind === "fail") return "fail"
  if (input.streaming === true) return "live"
  if (
    input.kind === "inspect"
    || input.kind === "run"
    || input.kind === "patch"
    || input.kind === "agent"
    || input.kind === "fix"
    || input.kind === "report"
  ) {
    return "done"
  }
  return "idle"
}

export function toolChipChrome(input: {
  kind: string
  label?: string
  streaming?: boolean
}) {
  const status = toolChipStatus(input)
  const label = (input.label ?? input.kind).trim()
  const glyph = status === "live" ? "●" : status === "fail" ? "✗" : status === "done" ? "✓" : "·"
  // Done is implied by the check glyph — don't paint a leftover "done" label.
  const cue = status === "live" ? "live" : status === "fail" ? "fail" : ""
  return { label, status, glyph, cue }
}

export function thinkingRowChrome(input: {
  streaming?: boolean
  expanded?: boolean
  title?: string
}) {
  const streaming = input.streaming === true
  const verb = streaming ? "Thinking" : "Thought"
  const title = input.title?.trim() || verb
  return {
    verb,
    title,
    cue: streaming ? "live" : "done",
    badge: "",
    disclosure: (input.expanded ? "▾" : "▸") as "▸" | "▾",
    streaming,
  }
}

export function streamTextCue(streaming?: boolean) {
  const live = streaming === true
  return {
    live,
    label: live ? "streaming" : "complete",
    badge: "",
  }
}

export type ApprovalGateKey = { key: "a" | "d" | "v"; action: string }

export function approvalGateFacts(
  snapshot?: Partial<Pick<SpineApprovalSnapshot, "tool" | "risk" | "action" | "available">>,
  layout?: SpineLayout,
) {
  const inspect = layout === "minimal" || layout === "narrow" ? "inspect" : "full inspection"
  const keys: readonly ApprovalGateKey[] = [
    { key: "a", action: "approve once" },
    { key: "d", action: "deny" },
    { key: "v", action: inspect },
  ]
  return {
    title: "Approval",
    tool: snapshot?.tool,
    risk: snapshot?.risk ?? "HIGH",
    action: snapshot?.action,
    available: snapshot?.available !== false,
    keys,
  }
}

export function formatApprovalActionKeys(facts: { keys: readonly ApprovalGateKey[] }): string {
  return facts.keys.map((item) => `[${item.key}] ${item.action}`).join("  ")
}

export type ApprovalFactRow = { label: string; value: string; group: "primary" | "meta" }

export function approvalFactGroups(
  snapshot?: Partial<SpineApprovalSnapshot>,
  layout?: SpineLayout,
): { primary: ApprovalFactRow[]; meta: ApprovalFactRow[] } {
  const compact = layout === "compact" || layout === "wide"
  const wide = layout === "wide"
  const primary: ApprovalFactRow[] = []
  const meta: ApprovalFactRow[] = []
  const push = (group: "primary" | "meta", label: string, value?: string) => {
    const text = value?.trim()
    if (!text) return
    ;(group === "primary" ? primary : meta).push({ label, value: text, group })
  }
  push("primary", "tool", snapshot?.tool)
  push("primary", "action", snapshot?.action)
  if (snapshot?.contractRevision !== undefined && snapshot.contractRevision !== null) {
    push("primary", "contract", `r${snapshot.contractRevision}`)
  }
  if (compact || snapshot?.capability) push(compact ? "primary" : "meta", "capability", snapshot?.capability)
  if (compact) {
    push("meta", "policy", snapshot?.policy)
    push("meta", "route", snapshot?.route)
    push("meta", "change", snapshot?.change ?? "unavailable · fail-closed")
  }
  push("meta", "principal", snapshot?.principal)
  if (wide && snapshot?.arguments?.length) {
    push("meta", "args", snapshot.arguments.join(" "))
  }
  push("meta", "expires", snapshot?.expires ?? "unknown")
  return { primary, meta }
}

export function taskRowChrome(input: {
  streaming?: boolean
  childCount?: number
  expanded?: boolean
}) {
  const n = input.childCount ?? 0
  return {
    kind: "task",
    status: input.streaming === true ? "running" : "done",
    // Handover language: the parent delegated work to a subagent and the result
    // comes back when it completes. "delegated" while running, "returned" on done.
    cue: input.streaming === true ? "delegated" : "returned",
    childHint: n > 0 ? `${n} ${n === 1 ? "step" : "steps"}` : "",
    disclosure: (input.expanded ? "▾" : "▸") as "▸" | "▾",
  }
}

export function chatCardChrome(input: {
  speaker: string
  streaming?: boolean
  isUser?: boolean
}) {
  const isUser = input.isUser === true
  return {
    speaker: input.speaker,
    live: input.streaming === true,
    badge: "",
    role: isUser ? "you" : "assistant",
    meta: isUser ? "you" : "assistant",
  }
}

export function promptBarState(state: "idle" | "working" | "waiting" | "stop") {
  if (state === "working") return { pulse: true, label: "working", hint: "" }
  if (state === "waiting") return { pulse: false, label: "waiting", hint: "approval" }
  if (state === "stop") return { pulse: false, label: "stop", hint: "halted" }
  return { pulse: false, label: "idle", hint: "" }
}

export function focusedEntryActionHint(input: {
  layout: SpineLayout
  agent?: boolean
  expanded?: boolean
  toggleable?: boolean
  hasSession?: boolean
  hasDetails?: boolean
  hasDiff?: boolean
  approval?: boolean
  canApprove?: boolean
  canDeny?: boolean
}): string {
  const actions: string[] = []
  if (input.approval) {
    actions.push("v inspect")
    if (input.canApprove) actions.push("a approve")
    if (input.canDeny) actions.push("d deny")
  }
  if (input.agent && input.hasSession) actions.push("enter open")
  if (input.toggleable) {
    const action = input.expanded ? "collapse" : "expand"
    actions.push(input.agent ? `space ${action}` : `enter/space ${action}`)
  }
  if (input.hasDetails) actions.push("o details")
  if (input.hasDiff) actions.push("d diff")
  if (!input.agent && input.hasSession) actions.push("g session")
  actions.push("y copy")

  const limit = input.layout === "minimal" ? 2 : input.layout === "narrow" ? 3 : input.layout === "compact" ? 4 : 5
  return actions.slice(0, limit).join(" · ")
}

export function codeBlockChrome(input: {
  bodyLabel?: string
  filetype?: string
  streaming?: boolean
}) {
  const language = (input.filetype || input.bodyLabel || "code").trim() || "code"
  return {
    language,
    header: language,
    live: input.streaming === true,
    badge: "",
  }
}

export function insightHeaderChrome(input: { title: string; severity?: string }) {
  const severity = (input.severity ?? "NONE").trim() || "NONE"
  return {
    title: input.title.trim() || "Insight",
    severity,
    showSeverity: severity !== "NONE",
  }
}

export function listingEntryChrome(name: string) {
  const raw = name ?? ""
  const dir = raw.endsWith("/")
  return {
    kind: (dir ? "dir" : "file") as "dir" | "file",
    name: dir ? raw.slice(0, -1) : raw,
    mark: dir ? "/" : "",
  }
}

export function selectionHintChrome() {
  const actions = selectionActions()
  const copy = `${actions.copy.modifiers[0]}+${actions.copy.key} ${actions.copy.label}`
  const clear = `${actions.clear.key} ${actions.clear.label}`
  return { hint: `${copy} · ${clear}`, copy, clear }
}

export { selectionActions }

export function isToolKind(kind: SpineKind): boolean {
  return kind === "inspect" || kind === "run" || kind === "patch" || kind === "fail" || kind === "agent"
}
