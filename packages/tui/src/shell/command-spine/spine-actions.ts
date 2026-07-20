import type { SpineEntry } from "./spine-types"
import { spineEntryDetailMessageID, spineEntryDiffMessageID, spineEntrySessionID } from "./spine-details"
import { canToggleSpineEntry } from "./spine-navigation"
import type { SpineFooterSelection } from "./spine-footer-hints"

export function spineFooterSelection(entry: SpineEntry | undefined): SpineFooterSelection {
  if (!entry) {
    return { label: "spine", actions: ["j/k focus", "tab next", "enter toggle", "y copy"] }
  }

  const actions: string[] = []
  if (canToggleSpineEntry(entry)) actions.push("enter toggle")
  if (spineEntryDiffMessageID(entry)) actions.push("d diff")
  if (spineEntrySessionID(entry)) actions.push("g session")
  if (spineEntryDetailMessageID(entry)) actions.push("o details")
  actions.push("y copy")

  return {
    label: `${String(entry.index).padStart(2, "0")} ${entry.kind}`,
    actions,
  }
}