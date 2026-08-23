import type { SpineEntry } from "./spine-types"

export function navigableSpineEntries(entries: readonly SpineEntry[]) {
  return entries.filter((entry) => !entry.hidden)
}

export function nextSpineFocusID(entries: readonly SpineEntry[], currentID: string | undefined, direction: -1 | 1) {
  const visible = navigableSpineEntries(entries)
  if (!visible.length) return undefined

  const currentIndex = currentID ? visible.findIndex((entry) => entry.id === currentID) : -1
  if (currentIndex === -1) return visible[direction > 0 ? 0 : visible.length - 1]?.id

  const nextIndex = Math.max(0, Math.min(visible.length - 1, currentIndex + direction))
  return visible[nextIndex]?.id
}

export function canToggleSpineEntry(entry: SpineEntry) {
  if (entry.collapsible === false) return false
  // Agent entries are always toggleable — show subagent progress/details
  if (entry.kind === "agent") return true
  if (entry.body?.trim()) return true
  if (entry.listing?.length) return true
  if (entry.diff) return true
  if (entry.report) return true
  if (entry.table) return true
  if (entry.children?.length) return true
  return false
}

/** One disclosure command shared by mouse, Enter, Space, and action menus. */
export function activateSpineEntryDisclosure(
  entry: SpineEntry,
  actions: {
    focus: (entry: SpineEntry) => void
    toggle: (entry: SpineEntry) => void
  },
) {
  if (!canToggleSpineEntry(entry)) return false
  actions.focus(entry)
  actions.toggle(entry)
  return true
}
