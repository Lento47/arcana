/**
 * Live-consistency stream state (P12).
 *
 * Tracks the SSE transport sequence position for the current stream.
 *
 * - lastReceived: the highest state-bearing event sequence the SDK parser
 *   delivered. Heartbeats do NOT advance it (they carry their own counter).
 * - lastApplied: the highest sequence whose event the sync store subscriber
 *   processed without throwing. Advanced ONLY by sync.tsx after a successful
 *   apply; a subscriber failure leaves it behind so the heartbeat gap check
 *   triggers an authoritative reconcile.
 * - streamID: per-connection identity from the engine (handlers/event.ts).
 *   When it changes (daemon restart, reconnect), both counters reset to 0.
 */
export const streamState = {
  streamID: "",
  lastReceived: 0,
  lastApplied: 0,
}

export type TransportEnvelope = {
  streamID: string
  /** Sequence of this event within the stream. For heartbeats: the heartbeat's own counter. */
  sequence: number
  /** Heartbeat only: highest state-bearing sequence enqueued before this tick. */
  headSequence?: number
}

export function transportOf(event: { transport?: TransportEnvelope | undefined }): TransportEnvelope | undefined {
  return event.transport
}

export function isStateBearing(event: { type: string; transport?: TransportEnvelope | undefined }): boolean {
  const tr = event.transport
  if (!tr) return false
  // Heartbeats carry headSequence and their own sequence counter; they are
  // not state-bearing events and must not advance lastReceived/lastApplied.
  return tr.headSequence === undefined
}
