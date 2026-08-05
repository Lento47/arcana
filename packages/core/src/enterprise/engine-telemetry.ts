/**
 * F12: Live telemetry ingestion from engine events.
 *
 * Consumes a bounded set of engine runtime event kinds and records
 * usage events through the existing metering store API. Metering is
 * strictly informational: ingestion failures are swallowed and never
 * propagate into the engine event flow.
 */

import type { MeteringStore, UsageEvent } from "./metering"

export type EngineEventKind =
  | "session.started"
  | "session.next.step.ended"
  | "session.next.tool.called"

export type EngineEvent = {
  readonly kind: string
  readonly tenantId: string
  readonly sessionId: string
  readonly timestamp: string
  readonly data?: Record<string, unknown>
}

const FEATURE = "local_runtime"

const EVENT_KINDS: ReadonlySet<string> = new Set([
  "session.started",
  "session.next.step.ended",
  "session.next.tool.called",
])

function unitsFor(event: EngineEvent): number {
  switch (event.kind) {
    case "session.started":
      return 1
    case "session.next.tool.called":
      return 1
    case "session.next.step.ended": {
      const tokens = (event.data as { tokens?: { input?: number; output?: number } } | undefined)?.tokens
      if (tokens && typeof tokens.input === "number" && typeof tokens.output === "number") {
        return tokens.input + tokens.output
      }
      return 1
    }
    default:
      return 0
  }
}

export function ingestEngineEvent(
  store: MeteringStore,
  event: EngineEvent,
): void {
  if (!EVENT_KINDS.has(event.kind)) return

  const record: UsageEvent = {
    tenantId: event.tenantId,
    eventId: `ingest-${event.sessionId}-${event.kind}-${event.timestamp}`,
    feature: FEATURE,
    units: unitsFor(event),
    at: event.timestamp,
  }

  try {
    store.putUsage(record)
  } catch {
    // Metering failures are swallowed; they never affect engine flow.
  }
}
