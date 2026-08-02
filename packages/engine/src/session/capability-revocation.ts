import { Effect } from "effect"
import type { CapabilityGrant } from "@arcana/core/capability/types"

/**
 * Production capability revocation workflow (operator-initiated).
 *
 * Revokes an ACTIVE capability grant owned by the session and every descendant
 * grant issued from it (cascade), then records `capability.revoked` evidence
 * for each revoked grant. Unknown, already-revoked, and foreign-session grants
 * are no-ops so the API cannot probe grant existence across sessions.
 */

export const OPERATOR_REVOKE = "OPERATOR_REVOKE" as const
export const PARENT_REVOKED = "PARENT_REVOKED" as const

export interface CapabilityRevocationDeps {
  readonly loadGrant: (
    capabilityId: string,
  ) => Effect.Effect<CapabilityGrant | null, never>
  readonly revokeCascade: (
    grantId: string,
    revokedEventId: string,
  ) => Effect.Effect<{ revokedIds: string[] }, never>
  readonly emitRevoked: (input: {
    capabilityId: string
    reason: typeof OPERATOR_REVOKE | typeof PARENT_REVOKED
  }) => Effect.Effect<void, never>
}

export interface CapabilityRevocationResult {
  readonly revokedIds: readonly string[]
}

export const revokeCapabilityWithCascade = Effect.fn("CapabilityRevocation.revoke")(
  function* (
    deps: CapabilityRevocationDeps,
    input: { sessionId: string; capabilityId: string },
  ) {
    const grant = yield* deps.loadGrant(input.capabilityId)
    if (!grant || grant.status !== "ACTIVE") return { revokedIds: [] }
    if (grant.constraints.sessionId !== input.sessionId) return { revokedIds: [] }

    const revokedEventId = `evt-capability-revoked:${input.capabilityId}:${Date.now()}`
    const { revokedIds } = yield* deps.revokeCascade(input.capabilityId, revokedEventId)
    for (const capabilityId of revokedIds) {
      yield* deps.emitRevoked({
        capabilityId,
        reason: capabilityId === input.capabilityId ? OPERATOR_REVOKE : PARENT_REVOKED,
      })
    }
    return { revokedIds }
  },
)

export * as CapabilityRevocation from "./capability-revocation"
