// packages/core/src/capability/effect-claim.ts
//
// Authority Kernel K4 — protected REMOTE effect lifecycle over the durable
// claim store (eclaim-store.ts). Implements the Arcana Output-Gate Principle:
//
//   AuthorityStateDurable ≺ ExternallyObservableEffect
//
// Flow: CLAIMED (durable) → DISPATCHED (durable) → dispatch() →
//       SETTLED | AMBIGUOUS   ·   pre-send failure ⇒ FAILED (proven no effect)
//
// Idempotency: idempotencyKey = SHA256("arcana-effect-v1" ‖ effectId ‖ requestHash).
// Retries of the same logical operation reuse the SAME claim — never re-dispatch.

import {
  SqliteEffectClaimStore,
  deriveIdempotencyKey,
  makeEffectId,
  type ClaimState,
  type EffectClaimRecord,
} from "./eclaim-store"

export { SqliteEffectClaimStore, deriveIdempotencyKey, makeEffectId }
export type { ClaimState, EffectClaimRecord }

export class PreDispatchError extends Error {
  readonly preDispatch = true
  constructor(message: string) {
    super(message)
    this.name = "PreDispatchError"
  }
}

export interface ProtectedRemoteInput {
  toolName: string
  destination: string
  requestHash: string
  principalId?: string
  sessionId: string
  /** Retry of a known logical operation: reuses the SAME claim identity. */
  existingEffectId?: string
  /**
   * Resolve `{ settled: true, receipt }` ONLY when downstream confirmed.
   * Throw PreDispatchError for pre-send failures. Post-send uncertainty:
   * throw normally — the claim lands AMBIGUOUS, never silently retried.
   */
  dispatch: () => Promise<{ settled: boolean; receipt: string }>
}

export type ProtectedRemoteOutcome =
  | { status: "SETTLED"; effectId: string; idempotencyKey: string; receipt: string }
  | { status: "CANCELLED" | "FAILED" | "AMBIGUOUS"; effectId: string; idempotencyKey: string; detail: string }
  | { status: "DUPLICATE"; effectId: string; state: ClaimState }

/**
 * Full protected lifecycle for one REMOTE effect. Every state transition is
 * committed to disk BEFORE and AFTER the external send, so a crash at any
 * point leaves an inspectable record (P4: no silent disappearance).
 */
export async function runProtectedRemoteEffect(
  dbPath: string,
  input: ProtectedRemoteInput & { principalId?: string },
): Promise<ProtectedRemoteOutcome> {
  const store = new SqliteEffectClaimStore(dbPath)
  try {
    return await runLifecycle(store, input)
  } finally {
    store.close()
  }
}

async function runLifecycle(
  store: SqliteEffectClaimStore,
  input: ProtectedRemoteInput & { principalId?: string },
): Promise<ProtectedRemoteOutcome> {
  const principalId = input.principalId ?? "arcana-cli"

  // 1. CLAIMED — durable before anything observable happens.
  const effectId = input.existingEffectId ?? makeEffectId()
  if (input.existingEffectId) {
    const existing = store.getClaim(effectId)
    if (existing) {
      return { status: "DUPLICATE", effectId, state: existing.state }
    }
  }
  const idempotencyKey = deriveIdempotencyKey(effectId, input.requestHash)
  const byKey = store.getClaimByIdempotencyKey(idempotencyKey)
  if (byKey) {
    return { status: "DUPLICATE", effectId: byKey.effectId, state: byKey.state }
  }
  const now = Date.now()
  store.insertClaim({
    effectId,
    idempotencyKey,
    requestHash: input.requestHash,
    toolName: input.toolName,
    destination: input.destination,
    principalId,
    sessionId: input.sessionId,
    state: "CLAIMED",
    receipt: null,
    createdAt: now,
    updatedAt: now,
  })

  // 2. DISPATCHED — still durable before the external send.
  store.transition(effectId, "DISPATCHED")

  // 3. Dispatch.
  try {
    const outcome = await input.dispatch()
    if (!outcome.settled) {
      store.transition(effectId, "AMBIGUOUS", { receipt: outcome.receipt || "unsettled" })
      return {
        status: "AMBIGUOUS",
        effectId,
        idempotencyKey,
        detail: outcome.receipt || "dispatch returned unsettled",
      }
    }
    store.transition(effectId, "SETTLED", { receipt: outcome.receipt })
    return { status: "SETTLED", effectId, idempotencyKey, receipt: outcome.receipt }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if ((error as { preDispatch?: boolean })?.preDispatch === true) {
      store.transition(effectId, "FAILED", { receipt: `pre-dispatch failure: ${message}` })
      return { status: "FAILED", effectId, idempotencyKey, detail: message }
    }
    store.transition(effectId, "AMBIGUOUS", { receipt: `dispatch error: ${message}` })
    return { status: "AMBIGUOUS", effectId, idempotencyKey, detail: message }
  }
}

// ─── Reconciliation ─────────────────────────────────────────────────────

export type ReconcileProbeResult =
  | { verdict: "SETTLED"; receipt: string }
  | { verdict: "NOT_FOUND" }
  | { verdict: "UNKNOWN" }

/** All AMBIGUOUS claims — the operator-facing unresolved-effects queue. */
export function listUnresolvedClaims(dbPath: string): EffectClaimRecord[] {
  const store = new SqliteEffectClaimStore(dbPath)
  try {
    return store.listUnresolved()
  } finally {
    store.close()
  }
}

/**
 * Reconcile one AMBIGUOUS claim against the downstream system.
 *   SETTLED-known → SETTLED (amended receipt) · NOT_FOUND → FAILED (proven no
 *   effect) · UNKNOWN → stays AMBIGUOUS for the unresolved queue.
 * Receipts are append-only; amendments never erase history.
 */
export async function reconcileClaim(
  dbPath: string,
  effectId: string,
  probe: (idempotencyKey: string) => Promise<ReconcileProbeResult>,
): Promise<{ status: ClaimState; detail: string }> {
  const store = new SqliteEffectClaimStore(dbPath)
  try {
    const claim = store.getClaim(effectId)
    if (!claim) throw new Error(`claim not found: ${effectId}`)
    if (claim.state !== "AMBIGUOUS") return { status: claim.state, detail: "not ambiguous" }

    const probed = await probe(claim.idempotencyKey)
    if (probed.verdict === "SETTLED") {
      store.amendClaim(effectId, `reconciled settled: ${probed.receipt}`, "SETTLED")
      return { status: "SETTLED", detail: probed.receipt }
    }
    if (probed.verdict === "NOT_FOUND") {
      store.amendClaim(effectId, "reconciled: downstream never received the effect", "FAILED")
      return { status: "FAILED", detail: "proven no effect (downstream NOT_FOUND)" }
    }
    return { status: "AMBIGUOUS", detail: "downstream could not determine outcome" }
  } finally {
    store.close()
  }
}
