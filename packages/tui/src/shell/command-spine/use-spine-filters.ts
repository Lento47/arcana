import { createEffect, createMemo, createSignal } from "solid-js"
import type { Accessor } from "solid-js"
import type { SpineEntry } from "./spine-types"
import {
  applyViewFilter,
  nextSpineViewFilter,
  spineFilterLabel,
  type SpineViewFilter,
} from "./spine-view-filter"

/**
 * View filtering state and derivation for the spine.
 *
 * Owns the active filter signal, the cycle action (bound to `f`), the reset
 * to "all" whenever the session changes (a new session starts unfiltered), and
 * the derived filtered rows. Pending approvals break through via
 * applyViewFilter. Settled ledger rows (deny, revoke, receipt, completed
 * approval) stay in the header tally and the governance view.
 */
export function useSpineFilters(input: {
  /** The rows to filter (post grouping). Visible indexes are assigned after the filter. */
  displayRows: Accessor<readonly SpineEntry[]>
  /** Reactively changing sessionID — resets the filter to "all". */
  sessionID: Accessor<string>
}) {
  const [viewFilter, setViewFilter] = createSignal<SpineViewFilter>("all")
  // Per-session filter memory: switching A→B→A restores the curated view.
  // In-memory only (not KV) — resets on TUI restart, which is the right
  // default for a session-local preference.
  const filterMemory = new Map<string, SpineViewFilter>()

  const cycleViewFilter = () => setViewFilter((current) => nextSpineViewFilter(current))

  const filteredRows = createMemo(() => applyViewFilter(input.displayRows(), viewFilter()))

  createEffect((prevSessionID?: string) => {
    const id = input.sessionID()
    if (prevSessionID !== undefined && prevSessionID !== id) {
      // Save outgoing session's filter.
      filterMemory.set(prevSessionID, viewFilter())
    }
    // Restore incoming session's filter, or default to "all" for first visits.
    setViewFilter(filterMemory.get(id) ?? "all")
    return id
  })

  return {
    viewFilter,
    filteredRows,
    cycleViewFilter,
    spineFilterLabel,
  }
}
