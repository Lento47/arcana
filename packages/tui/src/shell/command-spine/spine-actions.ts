import type { SpineEntry } from "./spine-types"
import { spineEntryDetailMessageID, spineEntryDiffMessageID, spineEntrySessionID } from "./spine-details"
import { canToggleSpineEntry } from "./spine-navigation"
import type { SpineFooterHint, SpineFooterSelection } from "./spine-footer-hints"

function hint(keys: string, label: string): SpineFooterHint {
  return { keys, label }
}

export function spineFooterSelection(entry: SpineEntry | undefined): SpineFooterSelection {
  if (!entry) {
    return {
      label: "spine",
      hints: [
        hint("j/k", "focus"),
        hint("tab", "next"),
        hint("enter", "toggle"),
        hint("y", "copy"),
      ],
    }
  }

  const hints: SpineFooterHint[] = []
  if (canToggleSpineEntry(entry)) hints.push(hint("enter", "toggle"))
  if (spineEntryDiffMessageID(entry)) hints.push(hint("d", "diff"))
  if (spineEntrySessionID(entry)) hints.push(hint("g", "session"))
  if (spineEntryDetailMessageID(entry)) hints.push(hint("o", "details"))
  hints.push(hint("y", "copy"))

  return {
    label: `${String(entry.index).padStart(2, "0")} ${entry.kind}`,
    hints,
  }
}
