/**
 * Phase C Task 11: Intent-Action Binding
 *
 * Links authorization requests to user objectives.
 * A capability alone is insufficient for HIGH/CRITICAL actions.
 * The action must connect to a real user request, contract criterion, or explicit approval.
 *
 * Hard invariant:
 *   Execute(q) ⟹ ∃b: Binds(b,q) ∧ b.requestHash = H(q) ∧ b.contractId = active contract
 *
 * This module is pure — no side effects, no event emission, no database access.
 */

import { computeRequestHash } from "./request-hash"
import type {
  AuthorizationRequest,
  IntentBinding,
  IntentJustification,
  IntentBindingStatus,
  IntentBindingCreatedBy,
  IntentBindingRequirement,
  RiskClass,
} from "./types"
import { INTENT_BINDING_REQUIREMENT } from "./types"
import { classifyRisk } from "./pdp"

// ─── Intent Binding Store Interface ───────────────────────────────────

/**
 * Abstract store for intent bindings.
 * Implementations: in-memory (tests), SQLite (production).
 */
export interface IntentBindingStore {
  /**
   * Get all active bindings for a request hash.
   */
  getBindingsForRequest(requestHash: string): IntentBinding[] | Promise<IntentBinding[]>

  /**
   * Get all active bindings for a contract.
   */
  getBindingsForContract(contractId: string): IntentBinding[] | Promise<IntentBinding[]>

  /**
   * Store a new binding.
   */
  putBinding(binding: IntentBinding): void | Promise<void>

  /**
   * Revoke a binding by ID.
   */
  revokeBinding(bindingId: string): void | Promise<void>
}

// ─── In-Memory Store (Tests) ──────────────────────────────────────────

export class InMemoryIntentBindingStore implements IntentBindingStore {
  private bindings = new Map<string, IntentBinding>()

  getBindingsForRequest(requestHash: string): IntentBinding[] {
    return [...this.bindings.values()].filter(
      (b) => b.requestHash === requestHash && b.status === "ACTIVE",
    )
  }

  getBindingsForContract(contractId: string): IntentBinding[] {
    return [...this.bindings.values()].filter(
      (b) => b.contractId === contractId && b.status === "ACTIVE",
    )
  }

  putBinding(binding: IntentBinding): void {
    this.bindings.set(binding.id, binding)
  }

  revokeBinding(bindingId: string): void {
    const existing = this.bindings.get(bindingId)
    if (existing) {
      this.bindings.set(bindingId, { ...existing, status: "REVOKED" })
    }
  }
}

// ─── Binding Requirement Resolution ───────────────────────────────────

/**
 * Determine what intent binding is required for a given request.
 * Based on the risk class of the action.
 */
export function resolveBindingRequirement(
  request: AuthorizationRequest,
): IntentBindingRequirement {
  const risk = classifyRisk(request.action, request.sensitivity)
  return INTENT_BINDING_REQUIREMENT[risk]
}

// ─── Binding Validation ───────────────────────────────────────────────

export interface IntentValidationResult {
  readonly satisfied: boolean
  readonly requirement: IntentBindingRequirement
  readonly binding?: IntentBinding
  readonly reason: string
}

/**
 * Validate that a request has a sufficient intent binding.
 *
 * Rules:
 * - OPTIONAL: always satisfied (LOW risk reads)
 * - USER_REQUEST: needs any active binding linking to a user request
 * - CONTRACT_CRITERION: needs binding to active contract with criterion IDs
 * - EXPLICIT_APPROVAL: needs binding with justification=EXPLICIT_APPROVAL
 *
 * Additional rules:
 * - Different contract → DENY
 * - Model-generated justification only → insufficient
 * - Remote content introduces unrelated action → no valid binding → DENY
 * - Stale or revoked bindings → not valid
 */
export function validateIntentBinding(
  request: AuthorizationRequest,
  bindings: IntentBinding[],
): IntentValidationResult {
  const requirement = resolveBindingRequirement(request)

  // OPTIONAL: always satisfied
  if (requirement === "OPTIONAL") {
    return {
      satisfied: true,
      requirement,
      reason: "LOW risk action does not require intent binding",
    }
  }

  // Filter to active bindings for this request hash
  const activeBindings = bindings.filter((b) => b.status === "ACTIVE")

  if (activeBindings.length === 0) {
    return {
      satisfied: false,
      requirement,
      reason: `No active intent binding for ${requirement} requirement`,
    }
  }

  // Check for stale/revoked bindings
  const staleBindings = bindings.filter((b) => b.status !== "ACTIVE")
  if (staleBindings.length > 0 && activeBindings.length === 0) {
    return {
      satisfied: false,
      requirement,
      reason: "All intent bindings are stale or revoked",
    }
  }

  // USER_REQUEST: any active binding is sufficient
  if (requirement === "USER_REQUEST") {
    const valid = activeBindings.find((b) =>
      b.justification === "DIRECT_REQUIREMENT" ||
      b.justification === "NECESSARY_SUBSTEP" ||
      b.justification === "EXPLICIT_APPROVAL",
    )
    if (valid) {
      return { satisfied: true, requirement, binding: valid, reason: "User request binding found" }
    }
    return {
      satisfied: false,
      requirement,
      reason: "No valid user request binding found",
    }
  }

  // CONTRACT_CRITERION: needs contract ID and criterion IDs
  if (requirement === "CONTRACT_CRITERION") {
    const valid = activeBindings.find((b) =>
      b.contractId !== undefined &&
      b.criterionIds.length > 0 &&
      (b.justification === "DIRECT_REQUIREMENT" || b.justification === "NECESSARY_SUBSTEP"),
    )
    if (valid) {
      return { satisfied: true, requirement, binding: valid, reason: `Contract criterion binding found: ${valid.contractId}` }
    }
    return {
      satisfied: false,
      requirement,
      reason: "No active contract criterion binding found",
    }
  }

  // EXPLICIT_APPROVAL: needs EXPLICIT_APPROVAL justification
  if (requirement === "EXPLICIT_APPROVAL") {
    const valid = activeBindings.find((b) =>
      b.justification === "EXPLICIT_APPROVAL" &&
      b.contractId !== undefined &&
      b.criterionIds.length > 0,
    )
    if (valid) {
      return { satisfied: true, requirement, binding: valid, reason: "Explicit approval binding found" }
    }
    return {
      satisfied: false,
      requirement,
      reason: "CRITICAL action requires explicit approval binding with active contract",
    }
  }

  return {
    satisfied: false,
    requirement,
    reason: "Unknown binding requirement",
  }
}

// ─── Binding Creation ─────────────────────────────────────────────────

/**
 * Create an intent binding from a user request event.
 * This is called by the runtime when a user makes a request that implies actions.
 */
export function createIntentBinding(params: {
  requestHash: string
  userRequestEventId: string
  contractId?: string
  criterionIds?: string[]
  justification: IntentJustification
  createdBy: IntentBindingCreatedBy
  expiresAt?: string
}): IntentBinding {
  return {
    id: `intent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    requestHash: params.requestHash,
    userRequestEventId: params.userRequestEventId,
    contractId: params.contractId,
    criterionIds: Object.freeze([...(params.criterionIds ?? [])]),
    justification: params.justification,
    createdBy: params.createdBy,
    status: "ACTIVE",
    createdAt: new Date().toISOString(),
    expiresAt: params.expiresAt,
  }
}

// ─── Remote Content Intent Check ──────────────────────────────────────

/**
 * Check if a request with REMOTE_CONTENT provenance is introducing an unrelated action.
 * Remote content (README, issue text) cannot create valid intent bindings for consequential actions.
 *
 * Returns true if the request should be denied because remote content
 * is trying to introduce an action unrelated to the user's objective.
 *
 * Only bindings for THIS specific request can satisfy the check.
 */
export function isRemoteContentIntentInjection(
  request: AuthorizationRequest,
  bindings: IntentBinding[],
): boolean {
  const hasRemoteContent = request.provenance.includes("REMOTE_CONTENT")
  if (!hasRemoteContent) return false

  // Only bindings for THIS request hash can satisfy
  const requestHash = computeRequestHash(request)
  const requestBindings = bindings.filter(
    (b) => b.status === "ACTIVE" && b.requestHash === requestHash,
  )
  const hasUserBinding = requestBindings.some((b) =>
    b.justification === "DIRECT_REQUIREMENT" ||
    b.justification === "NECESSARY_SUBSTEP" ||
    b.justification === "EXPLICIT_APPROVAL",
  )

  return !hasUserBinding
}

// ─── Deterministic PDP Integration ────────────────────────────────────

/**
 * Evaluate intent binding as part of PDP decision.
 * Returns reasons to add to the decision.
 */
export function evaluateIntentBinding(
  request: AuthorizationRequest,
  bindings: IntentBinding[],
): { decision: "ALLOW" | "DENY" | "REQUIRE_APPROVAL"; reasons: Array<{ code: string; message: string; severity: "info" | "warning" | "critical" }> } {
  const reasons: Array<{ code: string; message: string; severity: "info" | "warning" | "critical" }> = []

  // Check for remote content injection first
  if (isRemoteContentIntentInjection(request, bindings)) {
    reasons.push({
      code: "DENY_REMOTE_CONTENT_INJECTION",
      message: "Remote content cannot introduce unrelated actions without user binding",
      severity: "critical",
    })
    return { decision: "DENY", reasons }
  }

  const validation = validateIntentBinding(request, bindings)

  if (validation.satisfied) {
    if (validation.binding) {
      reasons.push({
        code: "ALLOW_INTENT_BINDING",
        message: `Intent binding satisfied: ${validation.reason}`,
        severity: "info",
      })
    }
    return { decision: "ALLOW", reasons }
  }

  // Not satisfied — determine if DENY or REQUIRE_APPROVAL
  const requirement = validation.requirement

  if (requirement === "EXPLICIT_APPROVAL") {
    reasons.push({
      code: "REQUIRE_APPROVAL_INTENT",
      message: `CRITICAL action requires explicit approval: ${validation.reason}`,
      severity: "warning",
    })
    return { decision: "REQUIRE_APPROVAL", reasons }
  }

  if (requirement === "CONTRACT_CRITERION") {
    reasons.push({
      code: "DENY_NO_INTENT_BINDING",
      message: `HIGH action requires contract criterion: ${validation.reason}`,
      severity: "critical",
    })
    return { decision: "DENY", reasons }
  }

  if (requirement === "USER_REQUEST") {
    reasons.push({
      code: "REQUIRE_APPROVAL_INTENT",
      message: `MODERATE action requires user request binding: ${validation.reason}`,
      severity: "warning",
    })
    return { decision: "REQUIRE_APPROVAL", reasons }
  }

  return { decision: "ALLOW", reasons }
}
