import { EventV2 } from "@arcana/core/event"
import { ArcanaEvent } from "@arcana/core/epistemic/event"
import { Schema } from "effect"

export const Recorded = EventV2.define({
  type: "governance.recorded",
  schema: {
    sessionID: Schema.String,
    event: ArcanaEvent,
  },
})

/**
 * Durable event families that explain an authority decision or support the
 * resulting RunProof. This is intentionally limited to canonical ArcanaEvent
 * families; presentation must never promote log-only execution schemas to
 * governance truth.
 */
export const prefixes = [
  "contract.",
  "claim.",
  "evidence.",
  "obligation.",
  "completion.",
  "intent.",
  "authorization.",
  "capability.",
  "verification.",
] as const

export function isGovernanceEvent(event: ArcanaEvent): boolean {
  return prefixes.some((prefix) => event.type.startsWith(prefix))
}

export * as GovernanceEvent from "./governance-event"
