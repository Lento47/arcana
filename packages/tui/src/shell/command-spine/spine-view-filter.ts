/**
 * TUI-2.1: Spine view filters (P2).
 *
 * Categories: conversation | tools | governance | proof | all.
 * Security-critical states (fail / approval-required rows) always break
 * through the active filter — a filter can hide noise, never evidence of a
 * denial, revocation, stale decision, or pending approval.
 */

import type { SpineEntry } from "./spine-types"

export type SpineViewFilter = "all" | "conversation" | "tools" | "governance" | "proof"

export const SPINE_VIEW_FILTERS: readonly SpineViewFilter[] = [
  "all",
  "conversation",
  "tools",
  "governance",
  "proof",
]

export function nextSpineViewFilter(current: SpineViewFilter): SpineViewFilter {
  const index = SPINE_VIEW_FILTERS.indexOf(current)
  return SPINE_VIEW_FILTERS[(index + 1) % SPINE_VIEW_FILTERS.length]!
}

export function spineFilterLabel(filter: SpineViewFilter): string {
  switch (filter) {
    case "conversation":
      return "conversation"
    case "tools":
      return "tools"
    case "governance":
      return "governance"
    case "proof":
      return "proof"
    default:
      return "all"
  }
}

/** Fail / approval-required rows are never hidden by a view filter. */
export function isSecurityCritical(entry: SpineEntry): boolean {
  return entry.kind === "fail" || entry.kind === "approve"
}

export function entryMatchesViewFilter(entry: SpineEntry, filter: SpineViewFilter): boolean {
  if (filter === "all") return true
  if (isSecurityCritical(entry)) return true

  switch (filter) {
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
      if (entry.id.startsWith("governance-proof:")) return false
      return entry.source?.kind === "governance"
    case "proof":
      return entry.id.startsWith("governance-proof:")
    default:
      return true
  }
}

export function applyViewFilter(
  entries: readonly SpineEntry[],
  filter: SpineViewFilter,
): SpineEntry[] {
  return entries.filter((entry) => entryMatchesViewFilter(entry, filter))
}
