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
 * the derived filtered rows. Security-critical states (denials, pending
 * approvals) break through via applyViewFilter regardless of the active filter.
 */
export function useSpineFilters(input: {
  /** The rows to filter (post grouping + display-index assignment). */
  displayRows: Accessor<readonly SpineEntry[]>
  /** Reactively changing sessionID — resets the filter to "all". */
  sessionID: Accessor<string>
}) {
  const [viewFilter, setViewFilter] = createSignal<SpineViewFilter>("all")

  const cycleViewFilter = () => setViewFilter((current) => nextSpineViewFilter(current))

  const filteredRows = createMemo(() => applyViewFilter(input.displayRows(), viewFilter()))

  createEffect(() => {
    input.sessionID()
    setViewFilter("all")
  })

  return {
    viewFilter,
    filteredRows,
    cycleViewFilter,
    spineFilterLabel,
  }
}
