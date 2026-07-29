export {
  type CapabilityAction,
  type RiskClass,
  type ProvenanceLabel,
  type SensitivityLabel,
  type ResourceSelector,
  type Principal,
  type Issuer,
  type CapabilityStatus,
  type CapabilityGrant,
  type CanonicalResource,
  type AuthorizationRequest,
  type AuthorizationDecisionKind,
  type DecisionReason,
  type AuthorizationDecision,
  type AuthorizationProfile,
  type IntentBinding,
  SENSITIVITY_ORDER,
  combineSensitivity,
  maxSensitivity,
  POLICY_VERSION,
} from "./types"

export {
  type EffectBoundary,
  type EnforcementLevel,
  type ResourceDerivation,
  type MigrationPriority,
  type AuditAggregate,
  EFFECT_BOUNDARY_INVENTORY,
  computeAuditAggregate,
} from "./effect-boundary"

export {
  type PolicyRule,
  type PolicyRuleKind,
  type PolicyContext,
  type WorkspaceTrust,
  type DenyReasonCode,
  type ApprovalReasonCode,
  type AllowReasonCode,
  type ReasonCode,
  evaluate as evaluatePolicy,
  classifyRisk,
  matchResource,
} from "./pdp"

export {
  type PreparedEffect,
  type PolicyContextProvider,
  type EnforcementResult,
  authorizeAndExecute,
  authorizeAndExecuteSync,
} from "./pep"

export {
  type ToolCallContext,
  toolToAction,
  buildAuthorizationRequest,
  authorizeTool,
} from "./pep-integration"

export {
  type CapabilityGrantStore,
  type SessionPolicyBinding,
  InMemoryGrantStore,
  SessionPolicyProvider,
} from "./grant-store"

export {
  computeRequestHash,
  canonicalizeRequest,
} from "./request-hash"
