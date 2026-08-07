import { createEffect, createMemo, createSignal } from "solid-js"
import type { Accessor } from "solid-js"
import type { SpineEntry } from "./spine-types"
import type { ApprovalRecord } from "@arcana/core/crypto/approval-lifecycle"
import {
  canToggleSpineEntry,
  navigableSpineEntries,
  nextSpineFocusID,
} from "./spine-navigation"
import { approvalIdFromEntryID } from "./approval-spine-adapter"

/**
 * Route navigation + focus state for the spine.
 *
 * Owns the focused entry signal, focus actions (set/clear/relative), and the
 * derived helpers the shell uses to resolve which entry is focused. Keyboard
 * and mouse handlers call these actions; the shell supplies the side effects
 * (controller selection, composer blur, scroll-into-view) via callbacks so the
 * hook stays renderer- and controller-agnostic.
 */
export function useSpineNavigation(input: {
  filteredRows: Accessor<readonly SpineEntry[]>
  getApprovalForEntry: (entry: SpineEntry) => ApprovalRecord | undefined
  /** Called when an entry gains focus with an approval id (controller.select). */
  onFocusApproval?: (approvalId: string) => void
  /** Called to blur the composer so spine keys become active. */
  onBlurComposer?: () => void
  /** Called to scroll an entry into view. */
  onScrollIntoView?: (entryID: string) => void
}) {
  const [focusedEntryID, setFocusedEntryID] = createSignal<string | undefined>()

  const focusEntryID = (entryID: string, scrollIntoView = false) => {
    setFocusedEntryID(entryID)
    input.onBlurComposer?.()
    if (input.onFocusApproval) {
      const approvalId = approvalIdFromEntryID(entryID)
      if (approvalId) input.onFocusApproval(approvalId)
    }
    if (scrollIntoView) input.onScrollIntoView?.(entryID)
  }
  const focusEntry = (entry: { id: string }, scrollIntoView = false) =>
    focusEntryID(entry.id, scrollIntoView)

  const entryFocused = (entry: { id: string }) => focusedEntryID() === entry.id

  const focusedEntry = createMemo(() => {
    const fid = focusedEntryID()
    if (!fid) return undefined
    return input.filteredRows().find((e) => e.id === fid)
  })

  const focusedApproval = createMemo<ApprovalRecord | undefined>(() => {
    const entry = focusedEntry()
    if (!entry) return undefined
    return input.getApprovalForEntry(entry)
  })

  const navigableEntries = createMemo(() => navigableSpineEntries(input.filteredRows()))

  // A focused entry that leaves the navigable set (filtered out, removed by a
  // live update) drops focus instead of pointing at a ghost row.
  createEffect(() => {
    const focused = focusedEntryID()
    if (!focused) return
    if (!navigableEntries().some((entry) => entry.id === focused)) setFocusedEntryID(undefined)
  })

  const resolveFocusedEntry = (preferToggleable = false) => {
    const focused = focusedEntry()
    let entry = focused
    if (entry) return entry
    const pool = navigableEntries()
    const pick = preferToggleable ? pool.find((item) => canToggleSpineEntry(item)) ?? pool[0] : pool[0]
    if (pick) focusEntry(pick, true)
    return pick
  }

  const focusRelativeEntry = (direction: -1 | 1) => {
    const nextID = nextSpineFocusID(input.filteredRows(), focusedEntryID(), direction)
    if (nextID) focusEntryID(nextID, true)
  }

  return {
    focusedEntryID,
    setFocusedEntryID,
    focusedEntry,
    focusedApproval,
    navigableEntries,
    resolveFocusedEntry,
    focusRelativeEntry,
    focusEntryID,
    focusEntry,
    entryFocused,
  }
}
