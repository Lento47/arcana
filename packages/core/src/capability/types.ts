/**
 * Phase C: Capability Security — Core types
 *
 * All types are additive. No Phase B semantics are modified.
 * Schema version: 1
 */

// ─── Capability Actions ───────────────────────────────────────────────

export type CapabilityAction =
  | "filesystem.read"
  | "filesystem.write"
  | "filesystem.delete"
  | "process.execute"
  | "network.read"
  | "network.write"
  | "secret.use"
  | "git.commit"
  | "git.push"
  | "deploy"
  | "publish"
  | "delegate"
  | "policy.modify"

// ─── Risk Classes ─────────────────────────────────────────────────────

export type RiskClass =
  | "LOW"
  | "MODERATE"
  | "HIGH"
  | "CRITICAL"

// ─── Provenance Labels ────────────────────────────────────────────────

export type ProvenanceLabel =
  | "SYSTEM_POLICY"
  | "USER_INSTRUCTION"
  | "ACTIVE_CONTRACT"
  | "TRUSTED_LOCAL_SOURCE"
  | "UNTRUSTED_LOCAL_SOURCE"
  | "REMOTE_CONTENT"
  | "TOOL_OUTPUT"
  | "MODEL_OUTPUT"
  | "SUBAGENT_OUTPUT"
  | "MCP_DESCRIPTION"

// ─── Sensitivity Labels ───────────────────────────────────────────────

export type SensitivityLabel =
  | "PUBLIC"
  | "INTERNAL"
  | "PRIVATE"
  | "SECRET"

/**
 * Lattice ordering: PUBLIC ≤ INTERNAL ≤ PRIVATE ≤ SECRET
 * Combining data takes the maximum sensitivity.
 */
export const SENSITIVITY_ORDER: Record<SensitivityLabel, number> = {
  PUBLIC: 0,
  INTERNAL: 1,
  PRIVATE: 2,
  SECRET: 3,
}

export function combineSensitivity(
  a: SensitivityLabel,
  b: SensitivityLabel,
): SensitivityLabel {
  return SENSITIVITY_ORDER[a] >= SENSITIVITY_ORDER[b] ? a : b
}

export function maxSensitivity(
  labels: SensitivityLabel[],
): SensitivityLabel {
  if (labels.length === 0) return "PUBLIC"
  return labels.reduce(combineSensitivity, "PUBLIC")
}

// ─── Resource Selectors ───────────────────────────────────────────────

export interface ResourceSelector {
  kind: "file" | "directory" | "process" | "network" | "secret" | "git" | "package" | "policy"
  pattern: string
}

// ─── Principal ────────────────────────────────────────────────────────

export interface Principal {
  kind: "user" | "agent" | "subagent" | "service"
  id: string
}

// ─── Issuer ───────────────────────────────────────────────────────────

export interface Issuer {
  kind: "user" | "policy" | "parent_capability" | "approval"
  id: string
}

// ─── Capability Grant ─────────────────────────────────────────────────

export type CapabilityStatus = "ACTIVE" | "EXPIRED" | "REVOKED" | "EXHAUSTED"

export interface CapabilityGrant {
  id: string
  schemaVersion: "1"

  principal: Principal
  issuer: Issuer

  actions: CapabilityAction[]
  resources: ResourceSelector[]

  constraints: {
    workspaceId?: string
    sessionId?: string
    contractId?: string
    toolNames?: string[]
    executable?: string
    argumentPatterns?: string[]
    networkHosts?: string[]
    maxUses?: number
    expiresAt?: string
    approvalRequired?: boolean
  }

  delegation: {
    allowed: boolean
    maximumDepth: number
    currentDepth: number
  }

  status: CapabilityStatus

  createdEventId: string
  revokedEventId?: string
}

// ─── Authorization Request ────────────────────────────────────────────

export interface CanonicalResource {
  kind: ResourceSelector["kind"]
  path?: string
  host?: string
  executable?: string
  secretKind?: string
}

export interface AuthorizationRequest {
  schemaVersion: "1"
  requestId: string

  principalId: string
  sessionId: string
  contractId?: string

  tool: string
  action: CapabilityAction
  resource: CanonicalResource

  executable?: string
  arguments?: string[]
  workingDirectory?: string
  networkDestination?: string

  provenance: ProvenanceLabel[]
  sensitivity: SensitivityLabel[]

  requestedAt: string
  nonce: string
}

// ─── Authorization Decision ───────────────────────────────────────────

export type AuthorizationDecisionKind = "ALLOW" | "DENY" | "REQUIRE_APPROVAL"

export interface DecisionReason {
  code: string
  message: string
  severity: "info" | "warning" | "critical"
}

export interface AuthorizationDecision {
  requestId: string
  requestHash: string

  decision: AuthorizationDecisionKind

  policyVersion: string
  capabilityIds: string[]

  reasons: DecisionReason[]
  riskClass: RiskClass

  decidedAt: string
  validUntil?: string
}

// ─── Authorization Trace Health ────────────────────────────────────────

/**
 * Authorization trace health — whether authorization event recording is complete.
 * COMPLETE: every executed event has a matching requested+allowed
 * DEGRADED: some events may have failed to record
 * UNAVAILABLE: no authorization events exist or emitter is nonfunctional
 */
export type AuthorizationTraceHealth = "COMPLETE" | "DEGRADED" | "UNAVAILABLE"

// ─── Authorization Profile (RunProof integration) ─────────────────────

export interface AuthorizationProfile {
  policyVersions: ReadonlyArray<string>
  requests: number
  allowed: number
  denied: number
  approvalsRequired: number
  staleDecisions: number
  executed: number
  executionFailures: number
  unauthorizedExecutions: number
  capabilityViolations: number
  authorizationTraceHealth: AuthorizationTraceHealth
  orphanExecutions: number
  unmatchedAllows: number
  unmatchedRequests: number
}

// ─── Security Labels ──────────────────────────────────────────────────

/**
 * Security labels attached to every consequential value.
 * Provenance: where the data came from (set — can have multiple sources).
 * Sensitivity: how sensitive the data is (lattice — join selects maximum).
 */
export interface SecurityLabels {
  readonly provenance: ReadonlySet<ProvenanceLabel>
  readonly sensitivity: SensitivityLabel
}

/**
 * A value with attached security labels and source event traceability.
 * Labels are immutable once attached — only declassification creates a new derivative.
 */
export interface LabeledValue<T> {
  readonly value: T
  readonly labels: SecurityLabels
  readonly sourceEventIds: ReadonlyArray<string>
}

/**
 * Field-level provenance for authorization requests with heterogeneous sources.
 */
export interface LabeledAuthorizationField {
  readonly field: string
  readonly provenance: ReadonlyArray<ProvenanceLabel>
  readonly sensitivity: SensitivityLabel
  readonly sourceEventIds: ReadonlyArray<string>
}

// ─── Declassification ─────────────────────────────────────────────────

/**
 * A narrow declassification decision — explicit, scoped, immutable, capability-bound.
 * Must be issued by trusted policy or explicit approval. Model output cannot issue this.
 */
export interface DeclassificationDecision {
  readonly sourceSensitivity: "SECRET" | "PRIVATE"
  readonly targetSensitivity: "PRIVATE" | "INTERNAL" | "PUBLIC"
  readonly fields: ReadonlyArray<string>
  readonly purpose: string
  readonly capabilityId: string
  readonly requestHash: string
  readonly expiresAt: string
}

// ─── Information Flow Profile (RunProof integration) ──────────────────

/**
 * RunProof information-flow profile — derived from security label events.
 * Hard invariant: unlabeledConsequentialRequests = 0.
 */
export interface InformationFlowProfile {
  readonly labeledInputs: number
  readonly labeledDerivedValues: number
  readonly secretValuesUsed: number
  readonly secretFlowsDenied: number
  readonly declassificationsRequested: number
  readonly declassificationsAllowed: number
  readonly labelTamperingAttempts: number
  readonly unlabeledConsequentialRequests: number
  readonly traceHealth: AuthorizationTraceHealth
}

// ─── Intent Binding ───────────────────────────────────────────────────

export interface IntentBinding {
  requestEventId: string
  contractId?: string
  criterionIds: string[]
  actionJustification: string
}

// ─── Policy Version ───────────────────────────────────────────────────

export const POLICY_VERSION = "phase-c-v1"
