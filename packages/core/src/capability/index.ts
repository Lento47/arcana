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
  type AuthorizationTraceHealth,
  type IntentBinding,
  type SecurityLabels,
  type LabeledValue,
  type LabeledAuthorizationField,
  type DeclassificationDecision,
  type IntentBinding,
  type IntentJustification,
  type IntentBindingStatus,
  type IntentBindingCreatedBy,
  type IntentBindingRequirement,
  INTENT_BINDING_REQUIREMENT,
  type InformationFlowProfile,
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
  type AuthorizationEventEmitter,
  authorizeAndExecute,
  authorizeAndExecuteEffect,
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
  type CapabilityGrantStoreError,
  type SessionPolicyBinding,
  type IntentBindingStoreEffect,
  type IntentEnforcementMode,
  InMemoryGrantStore,
  InMemoryIntentBindingStoreEffect,
  SessionPolicyProvider,
} from "./grant-store"

export {
  SqliteGrantStore,
} from "./grant-store-sqlite"

export {
  computeRequestHash,
  canonicalizeRequest,
} from "./request-hash"

export {
  createLabels,
  labelValue,
  combineLabels,
  combineAllLabels,
  mapLabeledValue,
  deriveLabeledValue,
  validateDeclassification,
  declassifyValue,
  detectLabelTampering,
  aggregateFieldLabels,
  classifyUserInput,
  classifyActiveContract,
  classifyTrustedLocalSource,
  classifyUntrustedLocalSource,
  classifyRemoteContent,
  classifyToolOutput,
  classifyModelOutput,
  classifySubagentOutput,
  classifyMcpDescription,
  classifySecret,
  classifySystemPolicy,
} from "./labels"

export {
  type IntentBindingStore,
  InMemoryIntentBindingStore,
  resolveBindingRequirement,
  validateIntentBinding,
  createIntentBinding,
  isRemoteContentIntentInjection,
  evaluateIntentBinding,
} from "./intent-binding"

export {
  type DelegatedContext,
  type CapabilityGrantDraft,
  type DelegationRequest,
  type DelegationResult,
  type DelegationReason,
  type DelegationReasonCode,
  delegateCapabilities,
  validateAttenuation,
  canParentDelegate,
  isResourceNarrowerOrEqual,
  isSensitivityNarrowerOrEqual,
  validateAncestorChain,
  findDescendants,
  cascadeRevocation,
  type DelegationProfile,
  deriveDelegationProfile,
} from "./delegation"

export {
  type ScopedApproval,
  type ScopedApprovalDecision,
  type ScopedApprovalStore,
  InMemoryScopedApprovalStore,
  createPendingApproval,
  approveRequest,
  consumeApproval,
  validateApprovalMatch,
  checkApprovedScope,
} from "./scoped-approval"

export {
  type RuntimeDelegationRequest,
  type RuntimeDelegationResult,
  type RuntimeDelegationError,
  type RuntimeDelegationErrorCode,
  type RuntimeGrantStore,
  type DelegationSessionConfig,
  executeDelegation,
  validateGrantUsability,
  revokeWithCascade,
} from "./runtime-delegation"
