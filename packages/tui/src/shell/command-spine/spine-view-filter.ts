/**
 * TUI-2.1: Spine view filters (P2).
 *
 * Categories: conversation | tools | governance | all.
 * Session proof/contract live in header chrome, not as a peer filter.
 * A leftover "proof" filter value folds into governance.
 * Pending approvals break through. Settled ledger rows do not.
 */

import type { SpineEntry } from "./spine-types"

export type SpineViewFilter = "all" | "conversation" | "tools" | "governance"

/** Legacy filter name kept only so persisted/cycled "proof" can fold in. */
export type SpineViewFilterInput = SpineViewFilter | "proof"

export const SPINE_VIEW_FILTERS: readonly SpineViewFilter[] = [
  "all",
  "conversation",
  "tools",
  "governance",
]

export function normalizeSpineViewFilter(filter: string | undefined): SpineViewFilter {
  if (filter === "proof") return "governance"
  if (filter === "conversation" || filter === "tools" || filter === "governance" || filter === "all") {
    return filter
  }
  return "all"
}

export function nextSpineViewFilter(current: SpineViewFilterInput): SpineViewFilter {
  const normalized = normalizeSpineViewFilter(current)
  const index = SPINE_VIEW_FILTERS.indexOf(normalized)
  return SPINE_VIEW_FILTERS[(index + 1) % SPINE_VIEW_FILTERS.length]!
}

export function spineFilterLabel(filter: SpineViewFilterInput): string {
  switch (normalizeSpineViewFilter(filter)) {
    case "conversation":
      return "conversation"
    case "tools":
      return "tools"
    case "governance":
      return "governance"
    default:
      return "all"
  }
}

/**
 * Already-decided ledger records (deny, revoke, exhaust, stale, effect
 * receipt, completed approval). Header tally + inspector + governance view.
 * Pending `approve` rows stay in the timeline so the operator can answer them.
 */
export function isSettledGovernanceRecord(entry: SpineEntry): boolean {
  if (entry.kind === "approve") return false
  if (entry.id.startsWith("proof-continuation:")) return true
  if (entry.source?.kind === "governance") return true
  if (entry.source?.kind === "approve") return true
  return false
}

/** Pending approvals and non-ledger fails (tool/message) still break through. */
export function isSecurityCritical(entry: SpineEntry): boolean {
  if (isSettledGovernanceRecord(entry)) return false
  return entry.kind === "fail" || entry.kind === "approve" || entry.breakthrough === true
}

/**
 * Ledger noise: collapsed groups and every settled governance/approval
 * record. Header tally + governance view own these.
 */
export function isQuietGovernanceLedger(entry: SpineEntry): boolean {
  if (entry.id.startsWith("governance-group:")) return true
  if (isSettledGovernanceRecord(entry)) return true
  if (isSecurityCritical(entry)) return false
  if (entry.source?.kind !== "governance") return false
  return true
}

export function entryMatchesViewFilter(entry: SpineEntry, filter: SpineViewFilterInput): boolean {
  const active = normalizeSpineViewFilter(filter)
  if (isSecurityCritical(entry)) return true
  if (active === "all" && isQuietGovernanceLedger(entry)) return false
  if (active === "all") return true

  switch (active) {
    case "conversation":
      // Governance groups reuse the "ok" spine kind for authorized bursts;
      // source identity wins so they never leak into the chat filter.
      if (entry.source?.kind === "governance") return false
      return (
        entry.kind === "ask"
        || entry.kind === "plan"
        || entry.kind === "ok"
        || entry.kind === "question"
      )
    case "tools":
      return (
        entry.kind === "think"
        || entry.kind === "inspect"
        || entry.kind === "run"
        || entry.kind === "patch"
        || entry.kind === "fix"
        || entry.kind === "agent"
        || entry.kind === "report"
      )
    case "governance":
      return entry.source?.kind === "governance"
    default:
      return true
  }
}

/** Gutter numbers for rows that will actually paint. Hidden rows stay at 0. */
export function assignVisibleIndexes(entries: readonly SpineEntry[]): SpineEntry[] {
  let next = 1
  return entries.map((entry) => {
    if (entry.hidden) return entry.index === 0 ? entry : { ...entry, index: 0 }
    const withIndex = entry.index === next ? entry : { ...entry, index: next }
    next++
    return withIndex
  })
}

export function applyViewFilter(
  entries: readonly SpineEntry[],
  filter: SpineViewFilterInput,
): SpineEntry[] {
  return assignVisibleIndexes(
    entries.filter((entry) => !entry.hidden && entryMatchesViewFilter(entry, filter)),
  )
}
