import type { SpineEntry } from "./spine-types"

export function spineEntryDetailMessageID(entry: SpineEntry | undefined) {
  const messageID = entry?.source?.messageID?.trim()
  return messageID || undefined
}