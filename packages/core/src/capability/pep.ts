/**
 * Phase C Task 6: Central Policy Enforcement Point
 *
 * The single deterministic runtime boundary through which consequential
 * P0 effects must pass. The PDP decides; the PEP guarantees only the
 * exact authorized operation executes.
 *
 * Hard invariant:
 *   Executed(e) ⟹ ∃d: d.decision = ALLOW
 *     ∧ d.requestHash = e.requestHash
 *     ∧ d.principalId = e.principalId
 *     ∧ d.policyVersion = e.policyVersion
 *
 * The PEP does NOT duplicate PDP policy logic.
 */

import { evaluate } from "./pdp"
import { computeRequestHash } from "./request-hash"
import type { PolicyContext } from "./pdp"
import type {
  AuthorizationRequest,
  AuthorizationDecision,
} from "./types"

// ─── Types ────────────────────────────────────────────────────────────

export interface PreparedEffect<T> {
  /** Immutable authorization request describing the exact operation. */
  request: AuthorizationRequest
  /**
   * Execute the exact authorized operation.
   * Receives a readonly snapshot of the request that was authorized.
   * Must not read any mutable state from outside the request.
   */
  executeExact(
    request: Readonly<AuthorizationRequest>,
  ): T | Promise<T>
}

export interface PolicyContextProvider {
  /** Load a fresh policy context snapshot. Never cached. */
  snapshot(): PolicyContext | Promise<PolicyContext>
}

export type EnforcementResult<T> =
  | {
      status: "EXECUTED"
      request: AuthorizationRequest
      requestHash: string
      decision: AuthorizationDecision
      value: T
      startedAt: string
      completedAt: string
    }
  | {
      status: "DENIED"
      request: AuthorizationRequest
      decision: AuthorizationDecision
    }
  | {
      status: "APPROVAL_REQUIRED"
      request: AuthorizationRequest
      decision: AuthorizationDecision
    }
  | {
      status: "STALE_DECISION"
      request: AuthorizationRequest
      originalDecision: AuthorizationDecision
      currentDecision: AuthorizationDecision
      reason: string
    }
  | {
      status: "EXECUTION_FAILED"
      request: AuthorizationRequest
      decision: AuthorizationDecision
      error: unknown
    }

// ─── Deep Freeze ──────────────────────────────────────────────────────

function deepFreeze<T>(obj: T): Readonly<T> {
  if (obj === null || typeof obj !== "object") return obj
  Object.freeze(obj)
  for (const key of Object.keys(obj as object)) {
    deepFreeze((obj as Record<string, unknown>)[key])
  }
  return obj as Readonly<T>
}

// ─── Request Integrity ────────────────────────────────────────────────

function verifyRequestIntegrity(
  original: AuthorizationRequest,
  atExecution: AuthorizationRequest,
): string | null {
  // Verify the request has not been mutated between authorization and execution
  if (original.requestId !== atExecution.requestId) return "requestId changed"
  if (original.principalId !== atExecution.principalId) return "principalId changed"
  if (original.sessionId !== atExecution.sessionId) return "sessionId changed"
  if (original.tool !== atExecution.tool) return "tool changed"
  if (original.action !== atExecution.action) return "action changed"
  if (original.resource.kind !== atExecution.resource.kind) return "resource.kind changed"
  if (original.resource.path !== atExecution.resource.path) return "resource.path changed"
  if (original.resource.host !== atExecution.resource.host) return "resource.host changed"
  if (original.resource.executable !== atExecution.resource.executable) return "resource.executable changed"
  if (original.resource.secretKind !== atExecution.resource.secretKind) return "resource.secretKind changed"
  if (original.executable !== atExecution.executable) return "executable changed"
  if (original.workingDirectory !== atExecution.workingDirectory) return "workingDirectory changed"
  if (original.networkDestination !== atExecution.networkDestination) return "networkDestination changed"
  if (original.nonce !== atExecution.nonce) return "nonce changed"
  if (original.requestedAt !== atExecution.requestedAt) return "requestedAt changed"

  // Array comparisons
  const argsA = original.arguments ?? []
  const argsB = atExecution.arguments ?? []
  if (argsA.length !== argsB.length) return "arguments length changed"
  for (let i = 0; i < argsA.length; i++) {
    if (argsA[i] !== argsB[i]) return `arguments[${i}] changed`
  }

  const provA = [...original.provenance].sort()
  const provB = [...atExecution.provenance].sort()
  if (provA.join(",") !== provB.join(",")) return "provenance changed"

  const sensA = [...original.sensitivity].sort()
  const sensB = [...atExecution.sensitivity].sort()
  if (sensA.join(",") !== sensB.join(",")) return "sensitivity changed"

  return null
}

// ─── PEP Implementation ───────────────────────────────────────────────

/**
 * Authorize and execute an effect through the full PEP sequence:
 *
 * 1. Receive structured request
 * 2. Deep-freeze request
 * 3. Compute request hash
 * 4. Load fresh policy context
 * 5. Call PDP
 * 6. DENY/REQUIRE_APPROVAL → return without execution
 * 7. ALLOW → re-validate → re-compute hash → confirm still ALLOW → execute
 * 8. Return structured receipt
 */
export async function authorizeAndExecute<T>(
  effect: PreparedEffect<T>,
  contextProvider: PolicyContextProvider,
): Promise<EnforcementResult<T>> {
  // Step 1-2: Deep-freeze the request to prevent mutation
  const frozenRequest = deepFreeze({ ...effect.request })
  const originalHash = computeRequestHash(frozenRequest as AuthorizationRequest)

  // Step 4: Load fresh policy context (never cached)
  const ctx = await contextProvider.snapshot()

  // Step 5: First PDP evaluation
  const firstDecision = evaluate(
    frozenRequest as AuthorizationRequest,
    ctx,
  )

  // Step 6: Gate on decision
  if (firstDecision.decision === "DENY") {
    return {
      status: "DENIED",
      request: frozenRequest as AuthorizationRequest,
      decision: firstDecision,
    }
  }

  if (firstDecision.decision === "REQUIRE_APPROVAL") {
    return {
      status: "APPROVAL_REQUIRED",
      request: frozenRequest as AuthorizationRequest,
      decision: firstDecision,
    }
  }

  // Step 7: ALLOW — re-validate before execution

  // Re-compute hash (should match)
  const reHash = computeRequestHash(frozenRequest as AuthorizationRequest)
  if (reHash !== originalHash) {
    // Hash mismatch is a bug — refuse execution
    return {
      status: "STALE_DECISION",
      request: frozenRequest as AuthorizationRequest,
      originalDecision: firstDecision,
      currentDecision: firstDecision,
      reason: "request hash changed between authorization and execution",
    }
  }

  // Reload fresh policy context (capability may have been revoked)
  const freshCtx = await contextProvider.snapshot()
  const secondDecision = evaluate(
    frozenRequest as AuthorizationRequest,
    freshCtx,
  )

  // Confirm the decision is still ALLOW
  if (secondDecision.decision !== "ALLOW") {
    return {
      status: "STALE_DECISION",
      request: frozenRequest as AuthorizationRequest,
      originalDecision: firstDecision,
      currentDecision: secondDecision,
      reason: `decision changed from ALLOW to ${secondDecision.decision} between evaluations`,
    }
  }

  // Confirm request hash matches in the second decision
  if (secondDecision.requestHash !== originalHash) {
    return {
      status: "STALE_DECISION",
      request: frozenRequest as AuthorizationRequest,
      originalDecision: firstDecision,
      currentDecision: secondDecision,
      reason: "request hash mismatch in re-evaluation",
    }
  }

  // Step 8: Execute the exact authorized operation
  const startedAt = new Date().toISOString()
  try {
    const value = await effect.executeExact(
      frozenRequest as Readonly<AuthorizationRequest>,
    )
    const completedAt = new Date().toISOString()

    return {
      status: "EXECUTED",
      request: frozenRequest as AuthorizationRequest,
      requestHash: originalHash,
      decision: secondDecision,
      value,
      startedAt,
      completedAt,
    }
  } catch (error) {
    return {
      status: "EXECUTION_FAILED",
      request: frozenRequest as AuthorizationRequest,
      decision: secondDecision,
      error,
    }
  }
}

// ─── Synchronous variant for non-async effects ────────────────────────

export function authorizeAndExecuteSync<T>(
  effect: PreparedEffect<T>,
  contextProvider: { snapshotSync(): PolicyContext },
): EnforcementResult<T> {
  const frozenRequest = deepFreeze({ ...effect.request })
  const originalHash = computeRequestHash(frozenRequest as AuthorizationRequest)

  const ctx = contextProvider.snapshotSync()
  const firstDecision = evaluate(
    frozenRequest as AuthorizationRequest,
    ctx,
  )

  if (firstDecision.decision === "DENY") {
    return {
      status: "DENIED",
      request: frozenRequest as AuthorizationRequest,
      decision: firstDecision,
    }
  }

  if (firstDecision.decision === "REQUIRE_APPROVAL") {
    return {
      status: "APPROVAL_REQUIRED",
      request: frozenRequest as AuthorizationRequest,
      decision: firstDecision,
    }
  }

  // Re-validate
  const freshCtx = contextProvider.snapshotSync()
  const secondDecision = evaluate(
    frozenRequest as AuthorizationRequest,
    freshCtx,
  )

  if (secondDecision.decision !== "ALLOW") {
    return {
      status: "STALE_DECISION",
      request: frozenRequest as AuthorizationRequest,
      originalDecision: firstDecision,
      currentDecision: secondDecision,
      reason: `decision changed from ALLOW to ${secondDecision.decision}`,
    }
  }

  const reHash = computeRequestHash(frozenRequest as AuthorizationRequest)
  if (reHash !== originalHash) {
    return {
      status: "STALE_DECISION",
      request: frozenRequest as AuthorizationRequest,
      originalDecision: firstDecision,
      currentDecision: secondDecision,
      reason: "request hash changed",
    }
  }

  const startedAt = new Date().toISOString()
  try {
    const value = effect.executeExact(
      frozenRequest as Readonly<AuthorizationRequest>,
    )
    const completedAt = new Date().toISOString()

    return {
      status: "EXECUTED",
      request: frozenRequest as AuthorizationRequest,
      requestHash: originalHash,
      decision: secondDecision,
      value,
      startedAt,
      completedAt,
    }
  } catch (error) {
    return {
      status: "EXECUTION_FAILED",
      request: frozenRequest as AuthorizationRequest,
      decision: secondDecision,
      error,
    }
  }
}
