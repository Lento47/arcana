import type { SpineEntry } from "./spine-types"

export function spineEntryDetailMessageID(entry: SpineEntry | undefined) {
  const messageID = entry?.source?.messageID?.trim()
  return messageID || undefined
}

export function spineEntryDiffMessageID(entry: SpineEntry | undefined) {
  if (!entry?.diff) return undefined
  return spineEntryDetailMessageID(entry)
}

export function spineEntrySessionID(entry: SpineEntry | undefined) {
  const sessionID = entry?.source?.sessionID?.trim()
  return sessionID || undefined
}