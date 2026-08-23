const MIN_REPLAY_OVERLAP = 32
const MAX_REPLAY_SEPARATOR = 32

export type TextNormalizationReason =
  | "cumulative_snapshot"
  | "exact_chunk_replay"
  | "overlapping_chunk_replay"
  | "whole_response_replay"

export type TextNormalization = {
  text: string
  removedCharacters: number
  reason?: TextNormalizationReason
}

function suffixPrefixOverlap(left: string, right: string) {
  const max = Math.min(left.length, right.length)
  for (let length = max; length >= MIN_REPLAY_OVERLAP; length--) {
    if (left.endsWith(right.slice(0, length))) return length
  }
  return 0
}

/**
 * Normalize protocol-level replay while preserving ordinary short repetition.
 * AI SDK deltas are expected to be append-only, but compatible proxies can
 * send cumulative snapshots or replay a large chunk after reconnecting.
 */
export function normalizeTextDelta(assembled: string, incoming: string): TextNormalization {
  if (!incoming || !assembled) return { text: incoming, removedCharacters: 0 }

  if (incoming.length > assembled.length && incoming.startsWith(assembled)) {
    return {
      text: incoming.slice(assembled.length),
      removedCharacters: assembled.length,
      reason: "cumulative_snapshot",
    }
  }

  if (incoming.length >= MIN_REPLAY_OVERLAP && assembled.endsWith(incoming)) {
    return { text: "", removedCharacters: incoming.length, reason: "exact_chunk_replay" }
  }

  const overlap = suffixPrefixOverlap(assembled, incoming)
  if (overlap > 0) {
    return {
      text: incoming.slice(overlap),
      removedCharacters: overlap,
      reason: "overlapping_chunk_replay",
    }
  }

  return { text: incoming, removedCharacters: 0 }
}

/** Final guard for a provider replaying the complete response token-for-token. */
export function collapseWholeResponseReplay(value: string): TextNormalization {
  const leadingLength = value.length - value.trimStart().length
  const trailingLength = value.length - value.trimEnd().length
  const leading = value.slice(0, leadingLength)
  const trailing = trailingLength > 0 ? value.slice(value.length - trailingLength) : ""
  const text = value.trim()
  if (text.length < MIN_REPLAY_OVERLAP * 2) return { text: value, removedCharacters: 0 }

  const midpoint = Math.floor(text.length / 2)
  for (let split = Math.max(MIN_REPLAY_OVERLAP, midpoint - MAX_REPLAY_SEPARATOR); split <= midpoint + MAX_REPLAY_SEPARATOR; split++) {
    const left = text.slice(0, split).trimEnd()
    const right = text.slice(split).trimStart()
    if (left.length < MIN_REPLAY_OVERLAP || left !== right) continue
    const normalized = `${leading}${left}${trailing}`
    return {
      text: normalized,
      removedCharacters: value.length - normalized.length,
      reason: "whole_response_replay",
    }
  }

  return { text: value, removedCharacters: 0 }
}

export * as TextStreamNormalizer from "./text-stream-normalizer"
