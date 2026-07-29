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

// ─── Authorization Profile (RunProof integration) ─────────────────────

export interface AuthorizationProfile {
  policyVersion: string
  requests: number
  allowed: number
  denied: number
  approvalsRequired: number
  executed: number
  unauthorizedExecutions: number
  capabilityViolations: number
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
