/**
 * TUI-2.1A: Deterministic Spine Ordering
 *
 * Provides deterministic ordering for mixed spine entries (messages,
 * governance events, approvals). Prevents ordering instability from
 * equal timestamps or replayed events.
 *
 * Deduplication uses durable IDs, never receipt text.
 */

// ─── Ordering Key ────────────────────────────────────────────────

export type SpineOrderingKey = {
  sessionId: string
  sequence: number
  timestamp: string
  /**
   * Wall-clock time of the underlying fact (message creation, governance
   * event, approval creation). Message indexes and event sequences are
   * different scales, so occurredAt is the primary cross-source order; the
   * sequence stays as the within-source tie-breaker.
   */
  occurredAt?: number
  /** Source priority: GOVERNANCE=0 (highest), APPROVAL=1, MESSAGE=2 */
  sourcePriority: number
  sourceEventId: string
}

const SOURCE_PRIORITY: Record<string, number> = {
  GOVERNANCE: 0,
  APPROVAL: 1,
  MESSAGE: 2,
}

export function createOrderingKey(input: {
  sessionId: string
  sequence: number
  timestamp: string
  occurredAt?: number
  source: string
  sourceEventId: string
}): SpineOrderingKey {
  return {
    sessionId: input.sessionId,
    sequence: input.sequence,
    timestamp: input.timestamp,
    occurredAt: input.occurredAt,
    sourcePriority: SOURCE_PRIORITY[input.source] ?? 99,
    sourceEventId: input.sourceEventId,
  }
}

/**
 * Compare two ordering keys for deterministic sort.
 * Returns negative if a < b, positive if a > b, 0 if equal.
 */
export function compareOrderingKeys(a: SpineOrderingKey, b: SpineOrderingKey): number {
  // 1. Session grouping
  if (a.sessionId !== b.sessionId) {
    return a.sessionId < b.sessionId ? -1 : 1
  }

  // 2. Wall clock when both sides know when the fact happened. Without this,
  // approval rows (sequence 0, no timestamp) sorted above every message and
  // rendered before the request that triggered them.
  if (a.occurredAt !== undefined && b.occurredAt !== undefined && a.occurredAt !== b.occurredAt) {
    return a.occurredAt - b.occurredAt
  }

  // 3. Sequence number (within-source ordering)
  if (a.sequence !== b.sequence) {
    return a.sequence - b.sequence
  }

  // 4. Timestamp (secondary ordering for same-sequence entries)
  if (a.timestamp !== b.timestamp) {
    return a.timestamp < b.timestamp ? -1 : 1
  }

  // 5. Source priority (governance > approval > message)
  if (a.sourcePriority !== b.sourcePriority) {
    return a.sourcePriority - b.sourcePriority
  }

  // 6. Source event ID (final tie-breaker)
  if (a.sourceEventId !== b.sourceEventId) {
    return a.sourceEventId < b.sourceEventId ? -1 : 1
  }

  return 0
}

// ─── Deduplication ───────────────────────────────────────────────

/**
 * Deduplication key using durable IDs.
 * Same durable event replayed twice → one visible entry.
 */
export type SpineDedupeKey = {
  approvalId?: string
  approvalVersion?: number
  governanceEventId?: string
  executionId?: string
  messageId?: string
}

export function createDedupeKey(input: {
  approvalId?: string
  approvalVersion?: number
  governanceEventId?: string
  executionId?: string
  messageId?: string
}): SpineDedupeKey {
  return {
    approvalId: input.approvalId,
    approvalVersion: input.approvalVersion,
    governanceEventId: input.governanceEventId,
    executionId: input.executionId,
    messageId: input.messageId,
  }
}

export function dedupeKeyToString(key: SpineDedupeKey): string {
  if (key.approvalId) {
    return `approval:${key.approvalId}:v${key.approvalVersion ?? 0}`
  }
  if (key.governanceEventId) {
    return `governance:${key.governanceEventId}`
  }
  if (key.executionId) {
    return `execution:${key.executionId}`
  }
  if (key.messageId) {
    return `message:${key.messageId}`
  }
  return `unknown:${JSON.stringify(key)}`
}
