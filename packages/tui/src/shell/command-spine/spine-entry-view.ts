import type {
  SpineDiffExcerpt,
  SpineEntry,
  SpineKind,
  SpineLayout,
  SpineReceipt,
  SpineReportData,
  SpineApprovalSnapshot,
  SpineProofContinuation,
} from "./spine-types"
import { joinSpineProse } from "./spine-prose"

/**
 * Discriminated-union render view for a spine row.
 *
 * The flat `SpineEntry` data type is produced by the mapper/adapters and can
 * carry any combination of optional artifacts. At the render boundary we
 * classify it into ONE of the variants below, each carrying ONLY the fields
 * its row kind needs. This makes impossible combinations (an approval row
 * accidentally carrying diff+report+table+listing+children at once) a type
 * error instead of a silent render bug.
 */

export type SpineEntryViewBase = {
  id: string
  index: number
  layout: SpineLayout
  focused?: boolean
  expanded?: boolean
  onToggle?: () => void
  onFocus?: () => void
  onHover?: () => void
  onNavigate?: (sessionID: string) => void
  contentWidth?: number
  thinkContentWidth?: number
  gutterWidth?: number
}

/** User / assistant prose (ask/plan/ok) — rendered as SpineChatCard. */
export type ChatEntry = SpineEntryViewBase & {
  type: "chat"
  kind: "ask" | "plan" | "ok"
  label?: string
  text: string
  elapsed?: string
  timestamp?: string
  streaming?: boolean
  reminders?: string[]
  bodyLabel?: string
}

/** Tool / thinking / run / inspect / patch / fix rows with header + artifacts. */
export type ToolEntry = SpineEntryViewBase & {
  type: "tool"
  kind: SpineKind
  label?: string
  glyph: string
  summary: string
  actor?: string
  elapsed?: string
  startMs?: number
  streaming?: boolean
  thinking?: string
  body?: string
  bodyLabel?: string
  bodyHint?: string
  bodyNote?: string
  /** Live preliminary output while running (subagent text stream). */
  liveOutput?: string
  reminders?: string[]
  receipt?: SpineReceipt
  diff?: SpineDiffExcerpt
  report?: SpineReportData
  table?: { headers: string[]; rows: string[][] }
  listing?: string[]
  children?: SpineChildView[]
  childSessionID?: string
  proof?: SpineProofContinuation
}

/** Approval row (durable approval or permission/question gate). */
export type ApprovalEntry = SpineEntryViewBase & {
  type: "approval"
  kind: SpineKind
  label?: string
  glyph: string
  summary: string
  elapsed?: string
  streaming?: boolean
  body?: string
  bodyLabel?: string
  /** True while awaiting operator action — no operator has acted yet. */
  pending: boolean
  /** Requester/agent identity for a pending approval (not an operator). */
  requester?: string
  /** Exact-request snapshot for the inline approval card. */
  snapshot?: SpineApprovalSnapshot
}

/** Governance / projection row (event or aggregated group). */
export type GovernanceEntry = SpineEntryViewBase & {
  type: "governance"
  kind: SpineKind
  label?: string
  glyph: string
  summary: string
  elapsed?: string
  children?: SpineChildView[]
}

/** Proof / evidence row (governance-proof / governance-trace). */
export type ProofEntry = SpineEntryViewBase & {
  type: "proof"
  kind: SpineKind
  label?: string
  glyph: string
  summary: string
  elapsed?: string
  children?: SpineChildView[]
  proof?: SpineProofContinuation
}

/** Subagent task row. */
export type SubagentEntry = SpineEntryViewBase & {
  type: "subagent"
  kind: SpineKind
  label?: string
  glyph: string
  summary: string
  actor?: string
  elapsed?: string
  startMs?: number
  streaming?: boolean
  body?: string
  bodyLabel?: string
  bodyHint?: string
  bodyNote?: string
  /** Live preliminary output while running (subagent text stream). */
  liveOutput?: string
  table?: { headers: string[]; rows: string[][] }
  listing?: string[]
  children?: SpineChildView[]
  childSessionID?: string
}

/** Recovery / error row. */
export type RecoveryEntry = SpineEntryViewBase & {
  type: "recovery"
  kind: SpineKind
  label?: string
  glyph: string
  summary: string
  actor?: string
  elapsed?: string
  streaming?: boolean
  body?: string
  bodyLabel?: string
  bodyHint?: string
  bodyNote?: string
  receipt?: SpineReceipt
}

/** Grouped child row (tool burst / governance children). */
export type SpineChildView = {
  kind: SpineKind
  summary?: string
  label?: string
  receipt?: SpineReceipt
  elapsed?: string
  body?: string
  bodyLabel?: string
  bodyHint?: string
  bodyNote?: string
  /** True when the child is a governance event (drives the disclosure noun). */
  governance?: boolean
}

export type SpineEntryView =
  | ChatEntry
  | ToolEntry
  | ApprovalEntry
  | GovernanceEntry
  | ProofEntry
  | SubagentEntry
  | RecoveryEntry

function childView(child: SpineEntry): SpineChildView {
  return {
    kind: child.kind,
    summary: child.summary,
    label: child.label,
    receipt: child.receipt,
    elapsed: child.elapsed,
    body: child.body,
    bodyLabel: child.bodyLabel,
    bodyHint: child.bodyHint,
    bodyNote: child.bodyNote,
    governance: child.source?.kind === "governance",
  }
}

function childrenViews(children: SpineEntry[] | undefined): SpineChildView[] | undefined {
  if (!children || children.length === 0) return undefined
  return children.map(childView)
}

export function toSpineEntryView(entry: SpineEntry, ctx: {
  layout: SpineLayout
  focused?: boolean
  expanded?: boolean
  onToggle?: () => void
  onFocus?: () => void
  onHover?: () => void
  onNavigate?: (sessionID: string) => void
  contentWidth?: number
  thinkContentWidth?: number
  gutterWidth?: number
  childSessionID?: string
}): SpineEntryView {
  const base: SpineEntryViewBase = {
    id: entry.id,
    index: entry.index,
    layout: ctx.layout,
    focused: ctx.focused,
    expanded: ctx.expanded,
    onToggle: ctx.onToggle,
    onFocus: ctx.onFocus,
    onHover: ctx.onHover,
    onNavigate: ctx.onNavigate,
    contentWidth: ctx.contentWidth,
    thinkContentWidth: ctx.thinkContentWidth,
    gutterWidth: ctx.gutterWidth,
  }
  const isChat = (entry.kind === "ask" || entry.kind === "plan" || entry.kind === "ok") &&
    entry.source?.kind !== "governance"

  if (isChat) {
    return {
      ...base,
      type: "chat",
      kind: entry.kind as "ask" | "plan" | "ok",
      label: entry.label,
      text: joinSpineProse(entry.summary, entry.body),
      elapsed: entry.elapsed,
      timestamp: entry.timestamp,
      streaming: entry.streaming === true,
      reminders: entry.reminders,
      bodyLabel: entry.bodyLabel,
    }
  }

  if (entry.kind === "agent") {
    return {
      ...base,
      type: "subagent",
      kind: entry.kind,
      label: entry.label,
      glyph: entry.glyph,
      summary: entry.summary,
      actor: entry.actor,
      elapsed: entry.elapsed,
      startMs: entry.startMs,
      streaming: entry.streaming === true,
      body: entry.body,
      bodyLabel: entry.bodyLabel,
      bodyHint: entry.bodyHint,
      bodyNote: entry.bodyNote,
      liveOutput: entry.liveOutput,
      table: entry.table,
      listing: entry.listing,
      children: childrenViews(entry.children),
      childSessionID: ctx.childSessionID,
    }
  }

  const isGovernance = entry.source?.kind === "governance"
  if (isGovernance) {
    if (entry.id.startsWith("governance-proof:") || entry.id.startsWith("governance-trace:")) {
      return {
        ...base,
        type: "proof",
        kind: entry.kind,
        label: entry.label,
        glyph: entry.glyph,
        summary: entry.summary,
        elapsed: entry.elapsed,
        children: childrenViews(entry.children),
        proof: entry.proof,
      }
    }
    return {
      ...base,
      type: "governance",
      kind: entry.kind,
      label: entry.label,
      glyph: entry.glyph,
      summary: entry.summary,
      elapsed: entry.elapsed,
      children: childrenViews(entry.children),
    }
  }

  if (entry.kind === "approve" || entry.kind === "question") {
    // PENDING durable approvals have no operator yet — render requester/nothing.
    const isDurableApproval = entry.id.startsWith("approval:")
    const pending = isDurableApproval && entry.label === "approval required"
    return {
      ...base,
      type: "approval",
      kind: entry.kind,
      label: entry.label,
      glyph: entry.glyph,
      summary: entry.summary,
      elapsed: entry.elapsed,
      streaming: entry.streaming === true,
      body: entry.body,
      bodyLabel: entry.bodyLabel,
      pending,
      // The adapter puts the requester (principal agent identity) in `actor`
      // for PENDING records - no operator has acted yet.
      requester: pending ? entry.actor : undefined,
      snapshot: entry.approval,
    }
  }

  if (entry.kind === "fail") {
    return {
      ...base,
      type: "recovery",
      kind: entry.kind,
      label: entry.label,
      glyph: entry.glyph,
      summary: entry.summary,
      actor: entry.actor,
      elapsed: entry.elapsed,
      streaming: entry.streaming === true,
      body: entry.body,
      bodyLabel: entry.bodyLabel,
      bodyHint: entry.bodyHint,
      bodyNote: entry.bodyNote,
      receipt: entry.receipt,
    }
  }

  return {
    ...base,
    type: "tool",
    kind: entry.kind,
    label: entry.label,
    glyph: entry.glyph,
    summary: entry.summary,
    actor: entry.actor,
    elapsed: entry.elapsed,
    startMs: entry.startMs,
    streaming: entry.streaming === true,
    thinking: entry.thinking,
    body: entry.body,
    bodyLabel: entry.bodyLabel,
    bodyHint: entry.bodyHint,
    bodyNote: entry.bodyNote,
    reminders: entry.reminders,
    receipt: entry.receipt,
    diff: entry.diff,
    report: entry.report,
    table: entry.table,
    listing: entry.listing,
    children: childrenViews(entry.children),
    childSessionID: ctx.childSessionID,
    proof: entry.proof,
  }
}
