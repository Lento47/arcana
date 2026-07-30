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

import { Effect } from "effect"
import { evaluate } from "./pdp"
import { computeRequestHash } from "./request-hash"
import type { PolicyContext } from "./pdp"
import type {
  AuthorizationRequest,
  AuthorizationDecision,
} from "./types"
import type { ScopedApprovalStore } from "./scoped-approval"
import { consumeApproval } from "./scoped-approval"

// ─── Types ────────────────────────────────────────────────────────────

export class AuthorizationStoreError {
  readonly _tag = "AuthorizationStoreError" as const
  constructor(readonly operation: string, readonly cause: unknown) {}
}

/**
 * Authorization event emitter — called by the PEP to record decisions.
 * The PEP calls this at each decision point. The caller provides the
 * implementation that writes to the EventStore.
 */
export interface AuthorizationEventEmitter {
  readonly emit: (event: {
    sessionId?: string
    actor: { kind: string; id: string }
    type: string
    payload: unknown
  }) => void | Promise<void> | Effect.Effect<void, unknown, unknown>
}

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
  ): T | Promise<T> | Effect.Effect<T, unknown, unknown>
}

export interface PolicyContextProvider {
  /** Load a fresh policy context snapshot. Never cached. */
  snapshot(): PolicyContext | Promise<PolicyContext> | Effect.Effect<PolicyContext, never, never>
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

// ─── Helpers ──────────────────────────────────────────────────────────

/** Resolve a snapshot that may be Effect, Promise, or synchronous value. */
function resolveSnapshot(
  provider: PolicyContextProvider,
): Effect.Effect<PolicyContext> {
  const result = provider.snapshot()
  if (result && typeof result === "object" && Effect.isEffect(result)) {
    return result as Effect.Effect<PolicyContext>
  }
  if (result instanceof Promise) {
    return Effect.promise(() => result)
  }
  return Effect.succeed(result as PolicyContext)
}

/** Resolve an executeExact that may be Effect, Promise, or synchronous value. */
function resolveExecute<T>(
  fn: (req: Readonly<AuthorizationRequest>) => T | Promise<T> | Effect.Effect<T, unknown, unknown>,
  req: Readonly<AuthorizationRequest>,
): Effect.Effect<T, AuthorizationStoreError> {
  return Effect.tryPromise({
    try: () => {
      const result = fn(req)
      if (result && typeof result === "object" && Effect.isEffect(result)) {
        return Effect.runPromise(result as Effect.Effect<T, unknown, never>)
      }
      if (result instanceof Promise) {
        return result
      }
      return Promise.resolve(result as T)
    },
    catch: (cause) => new AuthorizationStoreError("resolveExecute", cause),
  })
}

/**
 * Extract the approval ID from an ALLOW decision that came via an approved scope.
 * Returns null if the decision was not approval-based.
 */
function extractApprovalId(decision: AuthorizationDecision): string | null {
  for (const reason of decision.reasons) {
    if (reason.code === "ALLOW_CAPABILITY_MATCH" && reason.message.startsWith("Approved scope: ")) {
      return reason.message.slice("Approved scope: ".length)
    }
  }
  return null
}

// ─── PEP Implementation (Effect-native) ──────────────────────────────

/**
 * Effect-native authorize and execute.
 *
 * 1. Receive structured request
 * 2. Deep-freeze request
 * 3. Compute request hash
 * 4. Load fresh policy context
 * 5. Call PDP
 * 6. DENY/REQUIRE_APPROVAL → return without execution
 * 7. ALLOW via approval → atomic claim → skip second eval → execute → consume
 * 8. ALLOW via capability → re-validate → re-compute hash → confirm still ALLOW → execute
 * 9. Return structured receipt
 */
export function authorizeAndExecuteEffect<T>(
  effect: PreparedEffect<T>,
  contextProvider: PolicyContextProvider,
  eventEmitter?: AuthorizationEventEmitter,
  approvalStore?: ScopedApprovalStore,
): Effect.Effect<EnforcementResult<T>> {
  return Effect.gen(function* () {
    // Step 1-2: Deep-freeze the request to prevent mutation
    const frozenRequest = deepFreeze({ ...effect.request })
    const req = frozenRequest as AuthorizationRequest
    const originalHash = computeRequestHash(req)

    // Emit authorization.requested
    yield* emitEvent(eventEmitter, {
      sessionId: req.sessionId,
      actor: { kind: "policy", id: "pep" },
      type: "authorization.requested",
      payload: {
        requestId: req.requestId,
        principalId: req.principalId,
        tool: req.tool,
        action: req.action,
        requestHash: originalHash,
      },
    })

    // Step 4: Load fresh policy context (never cached)
    const ctx = yield* resolveSnapshot(contextProvider)

    // Step 5: First PDP evaluation
    const firstDecision = evaluate(req, ctx)

    // Step 6: Gate on decision
    if (firstDecision.decision === "DENY") {
      yield* emitEvent(eventEmitter, {
        sessionId: req.sessionId,
        actor: { kind: "policy", id: "pdp" },
        type: "authorization.denied",
        payload: {
          requestId: req.requestId,
          requestHash: originalHash,
          decision: firstDecision,
        },
      })
      return {
        status: "DENIED" as const,
        request: req,
        decision: firstDecision,
      }
    }

    if (firstDecision.decision === "REQUIRE_APPROVAL") {
      yield* emitEvent(eventEmitter, {
        sessionId: req.sessionId,
        actor: { kind: "policy", id: "pdp" },
        type: "authorization.approval_required",
        payload: {
          requestId: req.requestId,
          requestHash: originalHash,
          decision: firstDecision,
        },
      })
      return {
        status: "APPROVAL_REQUIRED" as const,
        request: req,
        decision: firstDecision,
      }
    }

    // Step 7: ALLOW — check if approval-based
    const approvalId = extractApprovalId(firstDecision)

    if (approvalId && approvalStore) {
      // Approval-based allow: atomically claim before execution.
      // The atomic claim replaces the second evaluation — if it succeeds,
      // the approval is bound to this execution and cannot be reused.
      const executionId = `exec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const now = new Date().toISOString()

      const claimed = yield* approvalStore.atomicClaim(
        approvalId,
        executionId,
        "evt-pep-claim",
        now,
      ).pipe(
        Effect.catch(() => Effect.succeed(null)),
      )

      if (!claimed) {
        // Claim failed — another execution already claimed it
        yield* emitEvent(eventEmitter, {
          sessionId: req.sessionId,
          actor: { kind: "policy", id: "pep" },
          type: "authorization.stale",
          payload: {
            requestId: req.requestId,
            reason: `approval ${approvalId} claim failed — already claimed or consumed`,
          },
        })
        return {
          status: "STALE_DECISION" as const,
          request: req,
          originalDecision: firstDecision,
          currentDecision: firstDecision,
          reason: `approval ${approvalId} claim failed — already claimed or consumed`,
        }
      }

      // Claim succeeded — emit allowed and execute
      yield* emitEvent(eventEmitter, {
        sessionId: req.sessionId,
        actor: { kind: "policy", id: "pdp" },
        type: "authorization.allowed",
        payload: {
          requestId: req.requestId,
          requestHash: originalHash,
          decision: firstDecision,
          approvalId,
          executionId,
        },
      })

      const startedAt = new Date().toISOString()
      const value = yield* resolveExecute(
        effect.executeExact,
        req,
      )
      const completedAt = new Date().toISOString()

      // Consume the approval (CLAIMED → CONSUMED)
      const consumed = consumeApproval(claimed, "evt-pep-consume", completedAt)
      if (consumed) {
        yield* approvalStore.updateApproval(claimed.id, consumed).pipe(
          Effect.catch(() => Effect.void),
        )
      }

      // Emit authorization.executed
      yield* emitEvent(eventEmitter, {
        sessionId: req.sessionId,
        actor: { kind: "policy", id: "pep" },
        type: "authorization.executed",
        payload: {
          requestId: req.requestId,
          requestHash: originalHash,
          decision: firstDecision,
          startedAt,
          completedAt,
          approvalId,
          executionId,
        },
      })

      return {
        status: "EXECUTED" as const,
        request: req,
        requestHash: originalHash,
        decision: firstDecision,
        value,
        startedAt,
        completedAt,
      }
    }

    // Step 8: Non-approval allow — re-validate before execution
    const reHash = computeRequestHash(req)
    if (reHash !== originalHash) {
      yield* emitEvent(eventEmitter, {
        sessionId: req.sessionId,
        actor: { kind: "policy", id: "pep" },
        type: "authorization.stale",
        payload: {
          requestId: req.requestId,
          reason: "request hash changed between authorization and execution",
        },
      })
      return {
        status: "STALE_DECISION" as const,
        request: req,
        originalDecision: firstDecision,
        currentDecision: firstDecision,
        reason: "request hash changed between authorization and execution",
      }
    }

    // Reload fresh policy context (capability may have been revoked)
    const freshCtx = yield* resolveSnapshot(contextProvider)
    const secondDecision = evaluate(req, freshCtx)

    if (secondDecision.decision !== "ALLOW") {
      yield* emitEvent(eventEmitter, {
        sessionId: req.sessionId,
        actor: { kind: "policy", id: "pdp" },
        type: "authorization.stale",
        payload: {
          requestId: req.requestId,
          reason: `decision changed from ALLOW to ${secondDecision.decision}`,
        },
      })
      return {
        status: "STALE_DECISION" as const,
        request: req,
        originalDecision: firstDecision,
        currentDecision: secondDecision,
        reason: `decision changed from ALLOW to ${secondDecision.decision} between evaluations`,
      }
    }

    if (secondDecision.requestHash !== originalHash) {
      yield* emitEvent(eventEmitter, {
        sessionId: req.sessionId,
        actor: { kind: "policy", id: "pep" },
        type: "authorization.stale",
        payload: {
          requestId: req.requestId,
          reason: "request hash mismatch in re-evaluation",
        },
      })
      return {
        status: "STALE_DECISION" as const,
        request: req,
        originalDecision: firstDecision,
        currentDecision: secondDecision,
        reason: "request hash mismatch in re-evaluation",
      }
    }

    // Emit authorization.allowed
    yield* emitEvent(eventEmitter, {
      sessionId: req.sessionId,
      actor: { kind: "policy", id: "pdp" },
      type: "authorization.allowed",
      payload: {
        requestId: req.requestId,
        requestHash: originalHash,
        decision: secondDecision,
      },
    })

    // Step 8: Execute the exact authorized operation
    const startedAt = new Date().toISOString()
    const value = yield* resolveExecute(
      effect.executeExact,
      req,
    )
    const completedAt = new Date().toISOString()

    // Emit authorization.executed
    yield* emitEvent(eventEmitter, {
      sessionId: req.sessionId,
      actor: { kind: "policy", id: "pep" },
      type: "authorization.executed",
      payload: {
        requestId: req.requestId,
        requestHash: originalHash,
        decision: secondDecision,
        startedAt,
        completedAt,
      },
    })

    return {
      status: "EXECUTED" as const,
      request: req,
      requestHash: originalHash,
      decision: secondDecision,
      value,
      startedAt,
      completedAt,
    }
  }).pipe(
    Effect.catch((error) =>
      Effect.gen(function* () {
        const req = deepFreeze({ ...effect.request }) as AuthorizationRequest
        // Unwrap AuthorizationStoreError to preserve original error
        const originalError = error instanceof AuthorizationStoreError ? error.cause : error
        yield* emitEvent(eventEmitter, {
          sessionId: req.sessionId,
          actor: { kind: "policy", id: "pep" },
          type: "authorization.execution_failed",
          payload: {
            requestId: req.requestId,
            error: String(originalError),
          },
        })
        return {
          status: "EXECUTION_FAILED" as const,
          request: req,
          decision: evaluate(req, {
            now: "", policyVersion: "", capabilities: [],
            explicitDenyRules: [], approvalRules: [], workspaceTrust: "UNKNOWN",
          }),
          error: originalError,
        }
      })
    ),
  )
}

/** Best-effort event emission — never blocks authorization. */
function emitEvent(
  emitter: AuthorizationEventEmitter | undefined,
  event: { sessionId?: string; actor: { kind: string; id: string }; type: string; payload: unknown },
): Effect.Effect<void> {
  if (!emitter) return Effect.void
  return Effect.gen(function* () {
    const result = emitter.emit(event)
    if (result && typeof result === "object" && Effect.isEffect(result)) {
      yield* (result as Effect.Effect<void>).pipe(Effect.catch(() => Effect.void))
    } else if (result instanceof Promise) {
      yield* Effect.promise(() => result.catch(() => {}))
    }
  }).pipe(Effect.catch(() => Effect.void))
}

// ─── Async wrapper (backward compatible) ─────────────────────────────

/**
 * Authorize and execute an effect through the full PEP sequence.
 * Async wrapper around authorizeAndExecuteEffect for backward compatibility.
 */
export async function authorizeAndExecute<T>(
  effect: PreparedEffect<T>,
  contextProvider: PolicyContextProvider,
  eventEmitter?: AuthorizationEventEmitter,
): Promise<EnforcementResult<T>> {
  return Effect.runPromise(authorizeAndExecuteEffect(effect, contextProvider, eventEmitter))
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
    ) as T
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
