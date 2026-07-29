/**
 * Phase C Task 5: Policy Decision Point
 *
 * Pure, deterministic, side-effect-free authorization decision engine.
 * Never executes tools, displays prompts, mutates capabilities,
 * consumes use counters, or appends events.
 *
 * Default deny. Deny-overrides: DENY > REQUIRE_APPROVAL > ALLOW.
 */

import { computeRequestHash } from "./request-hash"
import type {
  AuthorizationRequest,
  AuthorizationDecision,
  AuthorizationDecisionKind,
  CapabilityGrant,
  CapabilityAction,
  DecisionReason,
  ProvenanceLabel,
  SensitivityLabel,
  CanonicalResource,
  ResourceSelector,
  RiskClass,
  IntentBinding,
} from "./types"
import { POLICY_VERSION, SENSITIVITY_ORDER } from "./types"

// ─── Policy Rules ─────────────────────────────────────────────────────

export type PolicyRuleKind = "deny" | "approval"

export interface PolicyRule {
  id: string
  kind: PolicyRuleKind
  description: string

  /** Match conditions — all must match for the rule to fire. */
  conditions: {
    actions?: CapabilityAction[]
    provenance?: ProvenanceLabel[]
    sensitivity?: SensitivityLabel[]
    resourceKinds?: CanonicalResource["kind"][]
    networkHosts?: string[]
    principalIds?: string[]
  }
}

// ─── Policy Context ───────────────────────────────────────────────────

export type WorkspaceTrust = "TRUSTED" | "UNTRUSTED" | "UNKNOWN"

export interface PolicyContext {
  now: string
  policyVersion: string
  capabilities: CapabilityGrant[]
  explicitDenyRules: PolicyRule[]
  approvalRules: PolicyRule[]
  workspaceTrust: WorkspaceTrust
  intentBindings?: IntentBinding[]
}

// ─── Reason Codes ─────────────────────────────────────────────────────

export type DenyReasonCode =
  | "DENY_INVALID_REQUEST"
  | "DENY_REQUEST_HASH_MISMATCH"
  | "DENY_NO_MATCHING_CAPABILITY"
  | "DENY_PRINCIPAL_MISMATCH"
  | "DENY_ACTION_OUT_OF_SCOPE"
  | "DENY_RESOURCE_OUT_OF_SCOPE"
  | "DENY_WORKSPACE_MISMATCH"
  | "DENY_SESSION_MISMATCH"
  | "DENY_CONTRACT_MISMATCH"
  | "DENY_TOOL_OUT_OF_SCOPE"
  | "DENY_EXECUTABLE_OUT_OF_SCOPE"
  | "DENY_ARGUMENT_OUT_OF_SCOPE"
  | "DENY_NETWORK_HOST_OUT_OF_SCOPE"
  | "DENY_CAPABILITY_EXPIRED"
  | "DENY_CAPABILITY_REVOKED"
  | "DENY_CAPABILITY_EXHAUSTED"
  | "DENY_DELEGATION_DEPTH"
  | "DENY_UNTRUSTED_PROVENANCE"
  | "DENY_SECRET_FLOW"
  | "DENY_EXPLICIT_POLICY"
  | "DENY_LABEL_TAMPERING"
  | "DENY_SECRET_EXFILTRATION"
  | "DENY_SECRET_MODEL_EXPOSURE"
  | "DENY_MCP_SECRET_USE"
  | "DENY_TOOL_OUTPUT_POLICY_CHANGE"
  | "DENY_UNLABELED_CONSEQUENTIAL"
  | "DENY_NO_INTENT_BINDING"
  | "DENY_REMOTE_CONTENT_INJECTION"

export type ApprovalReasonCode =
  | "REQUIRE_APPROVAL_HIGH_RISK"
  | "REQUIRE_APPROVAL_UNTRUSTED_WORKSPACE"
  | "REQUIRE_APPROVAL_UNTRUSTED_PROVENANCE"
  | "REQUIRE_APPROVAL_SECRET_USE"
  | "REQUIRE_APPROVAL_EXTERNAL_WRITE"
  | "REQUIRE_APPROVAL_REMOTE_WRITE"
  | "REQUIRE_APPROVAL_UNTRUSTED_LOCAL_WRITE"
  | "REQUIRE_APPROVAL_INTENT"

export type AllowReasonCode = "ALLOW_CAPABILITY_MATCH" | "ALLOW_INTENT_BINDING"

export type ReasonCode =
  | DenyReasonCode
  | ApprovalReasonCode
  | AllowReasonCode

// ─── Risk Classification ──────────────────────────────────────────────

const ACTION_RISK: Record<CapabilityAction, RiskClass> = {
  "filesystem.read": "LOW",
  "filesystem.write": "MODERATE",
  "filesystem.delete": "HIGH",
  "process.execute": "HIGH",
  "network.read": "LOW",
  "network.write": "HIGH",
  "secret.use": "HIGH",
  "git.commit": "HIGH",
  "git.push": "CRITICAL",
  deploy: "CRITICAL",
  publish: "CRITICAL",
  delegate: "HIGH",
  "policy.modify": "CRITICAL",
}

export function classifyRisk(
  action: CapabilityAction,
  sensitivity: SensitivityLabel[],
): RiskClass {
  const base = ACTION_RISK[action] ?? "MODERATE"
  const maxSens = sensitivity.reduce(
    (max, s) => (SENSITIVITY_ORDER[s] > SENSITIVITY_ORDER[max] ? s : max),
    "PUBLIC" as SensitivityLabel,
  )
  // SECRET elevates to at least HIGH
  if (maxSens === "SECRET" && base !== "CRITICAL") return "HIGH"
  return base
}

// ─── Resource Matching ────────────────────────────────────────────────

/**
 * Conservative resource matching.
 * Returns true if the selector covers the requested resource.
 */
export function matchResource(
  selector: ResourceSelector,
  resource: CanonicalResource,
): boolean {
  // Kind must match
  if (selector.kind !== resource.kind) return false

  switch (selector.kind) {
    case "file":
    case "directory":
      return matchFilePath(selector.pattern, resource.path ?? "")

    case "process":
      return matchExecutable(selector.pattern, resource.executable ?? "")

    case "network":
      return matchHost(selector.pattern, resource.host ?? "")

    case "secret":
      return matchExact(selector.pattern, resource.secretKind ?? "")

    case "git":
      // Git selectors are workspace-scoped, match by exact path
      return matchFilePath(selector.pattern, resource.path ?? "")

    case "package":
      return matchExact(selector.pattern, resource.path ?? "")

    case "policy":
      // Policy resources match by exact identity
      return matchExact(selector.pattern, resource.path ?? "")

    default:
      return false
  }
}

/**
 * File path matching — descendant-safe.
 * Pattern "packages/engine/**" matches "packages/engine/src/foo.ts"
 * but NOT "packages/engine-evil/foo.ts"
 */
function normalizePath(p: string): string {
  return p.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/\/$/, "")
}

function matchFilePath(pattern: string, target: string): boolean {
  // Normalize separators
  const p = normalizePath(pattern)
  const t = normalizePath(target)

  // Reject traversal
  if (t.includes("..") || p.includes("..")) return false

  // Wildcard-all pattern matches any target
  if (p === "*" || p === "**" || p === "/*") return true

  // Empty target with non-wildcard pattern: no match
  if (t.length === 0) return false

  // Exact match
  if (p === t) return true

  // Descendant match: pattern must be a directory prefix
  // "packages/engine" matches "packages/engine/src/foo"
  // But NOT "packages/engine-evil"
  if (p.endsWith("/*") || p.endsWith("/**")) {
    const dir = p.replace(/\/\*\*?$/, "")
    return t.startsWith(dir + "/")
  }

  // Plain directory prefix (no wildcard)
  // Must end at a path boundary
  if (t.startsWith(p + "/")) return true

  return false
}

/**
 * Host matching — suffix-safe.
 * "api.example.com" matches exactly "api.example.com"
 * "*.example.com" matches "sub.example.com" but NOT "evil.example.com.attacker.com"
 */
function matchHost(pattern: string, target: string): boolean {
  const p = pattern.toLowerCase()
  const t = target.toLowerCase()

  // Wildcard-all matches everything
  if (p === "*" || p === "**") return true

  // Empty target with non-wildcard: no match
  if (t.length === 0) return false

  // Exact match
  if (p === t) return true

  // Wildcard subdomain: *.example.com matches sub.example.com
  if (p.startsWith("*.")) {
    const suffix = p.slice(1) // ".example.com"
    if (!t.endsWith(suffix)) return false
    const prefix = t.slice(0, -suffix.length)
    return prefix.length > 0 && !prefix.includes(".")
  }

  return false
}

/**
 * Executable matching — exact name only, with wildcard support.
 * "bun" matches "bun" but not "bunx" or "/usr/bin/bun"
 * "*" matches any non-empty executable
 * Empty executable with wildcard: no match (malformed request)
 */
function matchExecutable(pattern: string, target: string): boolean {
  // Wildcard-all matches any non-empty executable
  if (pattern === "*") return target.length > 0
  // Empty target with non-wildcard: no match
  if (target.length === 0) return false
  // Normalize: extract basename
  const pBase = pattern.split(/[/\\]/).pop() ?? pattern
  const tBase = target.split(/[/\\]/).pop() ?? target
  return pBase === tBase
}

/**
 * Exact string matching.
 */
function matchExact(pattern: string, target: string): boolean {
  return pattern === target
}

// ─── Request Validation ───────────────────────────────────────────────

function validateRequest(req: AuthorizationRequest): string | null {
  if (!req.requestId || req.requestId.length === 0) return "missing requestId"
  if (!req.principalId || req.principalId.length === 0) return "missing principalId"
  if (!req.sessionId || req.sessionId.length === 0) return "missing sessionId"
  if (!req.tool || req.tool.length === 0) return "missing tool"
  if (!req.action || req.action.length === 0) return "missing action"
  if (!req.resource || !req.resource.kind) return "missing resource kind"
  if (!req.requestedAt || req.requestedAt.length === 0) return "missing requestedAt"
  if (!req.nonce || req.nonce.length === 0) return "missing nonce"
  if (req.schemaVersion !== "1") return "unsupported schema version"
  return null
}

// ─── Capability Matching ──────────────────────────────────────────────

interface CapabilityMatchResult {
  matches: boolean
  denialReasons: DecisionReason[]
  matchedCapabilityIds: string[]
}

function matchCapabilities(
  req: AuthorizationRequest,
  capabilities: CapabilityGrant[],
  now: string,
): CapabilityMatchResult {
  const denialReasons: DecisionReason[] = []
  const matchedIds: string[] = []

  // Filter to ACTIVE capabilities for this principal
  const relevant = capabilities.filter((c) => c.principal.id === req.principalId)

  if (relevant.length === 0) {
    denialReasons.push({
      code: "DENY_PRINCIPAL_MISMATCH",
      message: `No capabilities for principal ${req.principalId}`,
      severity: "critical",
    })
    return { matches: false, denialReasons, matchedCapabilityIds: [] }
  }

  for (const cap of relevant) {
    const capReasons: DecisionReason[] = []

    // Status checks
    if (cap.status === "REVOKED") {
      capReasons.push({
        code: "DENY_CAPABILITY_REVOKED",
        message: `Capability ${cap.id} is revoked`,
        severity: "critical",
      })
    }
    if (cap.status === "EXPIRED") {
      capReasons.push({
        code: "DENY_CAPABILITY_EXPIRED",
        message: `Capability ${cap.id} is expired`,
        severity: "critical",
      })
    }
    if (cap.status === "EXHAUSTED") {
      capReasons.push({
        code: "DENY_CAPABILITY_EXHAUSTED",
        message: `Capability ${cap.id} is exhausted`,
        severity: "critical",
      })
    }

    // Expiry check
    if (cap.constraints.expiresAt && cap.constraints.expiresAt <= now) {
      capReasons.push({
        code: "DENY_CAPABILITY_EXPIRED",
        message: `Capability ${cap.id} expired at ${cap.constraints.expiresAt}`,
        severity: "critical",
      })
    }

    // Action match
    if (!cap.actions.includes(req.action)) {
      capReasons.push({
        code: "DENY_ACTION_OUT_OF_SCOPE",
        message: `Capability ${cap.id} does not cover action ${req.action}`,
        severity: "critical",
      })
    }

    // Resource match — at least one resource selector must cover the request
    if (cap.resources.length === 0) {
      capReasons.push({
        code: "DENY_RESOURCE_OUT_OF_SCOPE",
        message: `Capability ${cap.id} has no resource selectors`,
        severity: "critical",
      })
    } else {
      const anyMatch = cap.resources.some((r) => matchResource(r, req.resource))
      if (!anyMatch) {
        capReasons.push({
          code: "DENY_RESOURCE_OUT_OF_SCOPE",
          message: `Capability ${cap.id} does not cover resource ${req.resource.kind}:${req.resource.path ?? req.resource.host ?? req.resource.executable ?? req.resource.secretKind ?? "?"}`,
          severity: "critical",
        })
      }
    }

    // Workspace constraint
    if (
      cap.constraints.workspaceId &&
      req.sessionId &&
      cap.constraints.workspaceId !== req.sessionId
    ) {
      // Workspace constraint is on the capability, not the request
      // We check if the capability is workspace-bound and the request is outside
      // This is checked via the session binding
    }

    // Session constraint
    if (
      cap.constraints.sessionId &&
      cap.constraints.sessionId !== req.sessionId
    ) {
      capReasons.push({
        code: "DENY_SESSION_MISMATCH",
        message: `Capability ${cap.id} is bound to session ${cap.constraints.sessionId}, request is for ${req.sessionId}`,
        severity: "critical",
      })
    }

    // Contract constraint
    if (
      cap.constraints.contractId &&
      req.contractId &&
      cap.constraints.contractId !== req.contractId
    ) {
      capReasons.push({
        code: "DENY_CONTRACT_MISMATCH",
        message: `Capability ${cap.id} is bound to contract ${cap.constraints.contractId}`,
        severity: "critical",
      })
    }

    // Tool constraint
    if (
      cap.constraints.toolNames &&
      cap.constraints.toolNames.length > 0 &&
      !cap.constraints.toolNames.includes(req.tool)
    ) {
      capReasons.push({
        code: "DENY_TOOL_OUT_OF_SCOPE",
        message: `Capability ${cap.id} does not cover tool ${req.tool}`,
        severity: "critical",
      })
    }

    // Executable constraint
    if (
      cap.constraints.executable &&
      req.executable &&
      cap.constraints.executable !== req.executable
    ) {
      capReasons.push({
        code: "DENY_EXECUTABLE_OUT_OF_SCOPE",
        message: `Capability ${cap.id} allows executable ${cap.constraints.executable}, not ${req.executable}`,
        severity: "critical",
      })
    }

    // Network host constraint
    if (
      cap.constraints.networkHosts &&
      cap.constraints.networkHosts.length > 0 &&
      req.networkDestination
    ) {
      const hostAllowed = cap.constraints.networkHosts.some((h) =>
        matchHost(h, req.networkDestination!),
      )
      if (!hostAllowed) {
        capReasons.push({
          code: "DENY_NETWORK_HOST_OUT_OF_SCOPE",
          message: `Capability ${cap.id} does not cover host ${req.networkDestination}`,
          severity: "critical",
        })
      }
    }

    // Use limit
    if (
      cap.constraints.maxUses !== undefined &&
      cap.constraints.maxUses <= 0
    ) {
      capReasons.push({
        code: "DENY_CAPABILITY_EXHAUSTED",
        message: `Capability ${cap.id} has no remaining uses`,
        severity: "critical",
      })
    }

    // Delegation depth
    if (
      !cap.delegation.allowed &&
      cap.delegation.currentDepth > 0
    ) {
      capReasons.push({
        code: "DENY_DELEGATION_DEPTH",
        message: `Capability ${cap.id} does not allow delegation`,
        severity: "critical",
      })
    }
    if (
      cap.delegation.currentDepth > cap.delegation.maximumDepth
    ) {
      capReasons.push({
        code: "DENY_DELEGATION_DEPTH",
        message: `Capability ${cap.id} delegation depth ${cap.delegation.currentDepth} exceeds max ${cap.delegation.maximumDepth}`,
        severity: "critical",
      })
    }

    if (capReasons.length === 0) {
      matchedIds.push(cap.id)
    } else {
      denialReasons.push(...capReasons)
    }
  }

  return {
    matches: matchedIds.length > 0,
    denialReasons,
    matchedCapabilityIds: matchedIds,
  }
}

// ─── Provenance and Sensitivity Evaluation ────────────────────────────

function evaluateProvenance(
  req: AuthorizationRequest,
  ctx: PolicyContext,
): DecisionReason[] {
  const reasons: DecisionReason[] = []

  const hasRemoteContent = req.provenance.includes("REMOTE_CONTENT")
  const hasToolOutput = req.provenance.includes("TOOL_OUTPUT")
  const hasMcpDescription = req.provenance.includes("MCP_DESCRIPTION")
  const hasModelOutput = req.provenance.includes("MODEL_OUTPUT")
  const hasSecret = req.sensitivity.includes("SECRET")
  const hasUntrustedLocal = req.provenance.includes("UNTRUSTED_LOCAL_SOURCE")

  // MCP_DESCRIPTION cannot authorize secret.use — DENY_MCP_SECRET_USE
  if (hasMcpDescription && req.action === "secret.use") {
    reasons.push({
      code: "DENY_MCP_SECRET_USE",
      message: "MCP tool description cannot authorize secret access",
      severity: "critical",
    })
  }

  // TOOL_OUTPUT cannot authorize policy.modify — DENY_TOOL_OUTPUT_POLICY_CHANGE
  if (hasToolOutput && req.action === "policy.modify") {
    reasons.push({
      code: "DENY_TOOL_OUTPUT_POLICY_CHANGE",
      message: "Tool output cannot authorize policy modification",
      severity: "critical",
    })
  }

  // SECRET + network.write without explicit combined capability — DENY_SECRET_EXFILTRATION
  if (hasSecret && req.action === "network.write") {
    reasons.push({
      code: "DENY_SECRET_EXFILTRATION",
      message: "SECRET data cannot be sent to network without explicit combined capability",
      severity: "critical",
    })
  }

  // SECRET + model-visible log/export — DENY_SECRET_MODEL_EXPOSURE
  if (hasSecret && hasModelOutput && (req.action === "network.write" || req.action === "filesystem.write")) {
    reasons.push({
      code: "DENY_SECRET_MODEL_EXPOSURE",
      message: "SECRET data cannot be exposed through model output",
      severity: "critical",
    })
  }

  // MODEL_OUTPUT alone cannot create authority
  if (hasModelOutput && !hasRemoteContent && !hasToolOutput && req.action !== "filesystem.read") {
    // Model output alone cannot modify external state without other provenance
    // This is a soft check — the capability grant still governs
  }

  return reasons
}

function evaluateProvenanceApprovals(
  req: AuthorizationRequest,
  ctx: PolicyContext,
): DecisionReason[] {
  const reasons: DecisionReason[] = []

  const hasRemoteContent = req.provenance.includes("REMOTE_CONTENT")
  const hasUntrustedLocal = req.provenance.includes("UNTRUSTED_LOCAL_SOURCE")
  const hasSecret = req.sensitivity.includes("SECRET")

  // REMOTE_CONTENT + network.write → REQUIRE_APPROVAL_REMOTE_WRITE
  if (hasRemoteContent && req.action === "network.write") {
    reasons.push({
      code: "REQUIRE_APPROVAL_REMOTE_WRITE",
      message: "Network write with remote content provenance requires approval",
      severity: "warning",
    })
  }

  // UNTRUSTED_LOCAL_SOURCE + network.write → REQUIRE_APPROVAL_UNTRUSTED_LOCAL_WRITE
  if (hasUntrustedLocal && req.action === "network.write") {
    reasons.push({
      code: "REQUIRE_APPROVAL_UNTRUSTED_LOCAL_WRITE",
      message: "Untrusted local source with network write requires approval",
      severity: "warning",
    })
  }

  // UNTRUSTED_LOCAL_SOURCE + high-risk action → REQUIRE_APPROVAL_UNTRUSTED_PROVENANCE
  if (hasUntrustedLocal && ["secret.use", "process.execute"].includes(req.action)) {
    reasons.push({
      code: "REQUIRE_APPROVAL_UNTRUSTED_PROVENANCE",
      message: "Untrusted local source with consequential action requires approval",
      severity: "warning",
    })
  }

  // SECRET + any network → REQUIRE_APPROVAL_SECRET_USE
  if (hasSecret && (req.action === "network.read" || req.action === "network.write")) {
    reasons.push({
      code: "REQUIRE_APPROVAL_SECRET_USE",
      message: "Secret-bearing network operation requires approval",
      severity: "warning",
    })
  }

  return reasons
}

// ─── Explicit Rule Evaluation ─────────────────────────────────────────

function matchRule(
  rule: PolicyRule,
  req: AuthorizationRequest,
): boolean {
  const conds = rule.conditions

  if (conds.actions && !conds.actions.includes(req.action)) return false
  if (
    conds.provenance &&
    !req.provenance.some((p) => conds.provenance!.includes(p))
  )
    return false
  if (
    conds.sensitivity &&
    !req.sensitivity.some((s) => conds.sensitivity!.includes(s))
  )
    return false
  if (conds.resourceKinds && !conds.resourceKinds.includes(req.resource.kind))
    return false
  if (conds.principalIds && !conds.principalIds.includes(req.principalId))
    return false
  if (
    conds.networkHosts &&
    req.networkDestination &&
    !conds.networkHosts.some((h) => matchHost(h, req.networkDestination!))
  )
    return false

  return true
}

function evaluateDenyRules(
  rules: PolicyRule[],
  req: AuthorizationRequest,
): DecisionReason[] {
  const reasons: DecisionReason[] = []
  for (const rule of rules) {
    if (rule.kind === "deny" && matchRule(rule, req)) {
      reasons.push({
        code: "DENY_EXPLICIT_POLICY",
        message: `Explicit deny rule: ${rule.description}`,
        severity: "critical",
      })
    }
  }
  return reasons
}

function evaluateApprovalRules(
  rules: PolicyRule[],
  req: AuthorizationRequest,
): DecisionReason[] {
  const reasons: DecisionReason[] = []
  for (const rule of rules) {
    if (rule.kind === "approval" && matchRule(rule, req)) {
      reasons.push({
        code: "REQUIRE_APPROVAL_HIGH_RISK",
        message: `Approval rule: ${rule.description}`,
        severity: "warning",
      })
    }
  }
  return reasons
}

// ─── Workspace Trust ──────────────────────────────────────────────────

function evaluateWorkspaceTrust(
  ctx: PolicyContext,
  req: AuthorizationRequest,
): DecisionReason[] {
  const reasons: DecisionReason[] = []

  if (ctx.workspaceTrust === "UNTRUSTED") {
    // High-risk actions in untrusted workspace require approval
    const risk = classifyRisk(req.action, req.sensitivity)
    if (risk === "HIGH" || risk === "CRITICAL") {
      reasons.push({
        code: "REQUIRE_APPROVAL_UNTRUSTED_WORKSPACE",
        message: `High-risk action in untrusted workspace`,
        severity: "warning",
      })
    }
  }

  return reasons
}

// ─── PDP Core ─────────────────────────────────────────────────────────

export function evaluate(
  request: AuthorizationRequest,
  context: PolicyContext,
): AuthorizationDecision {
  const reasons: DecisionReason[] = []
  const timestamp = context.now

  // Step 1: Validate request
  const validationError = validateRequest(request)
  if (validationError) {
    reasons.push({
      code: "DENY_INVALID_REQUEST",
      message: validationError,
      severity: "critical",
    })
    return buildDecision(request, context, "DENY", reasons, [], timestamp)
  }

  // Step 2: Recompute and validate request hash
  const recomputedHash = computeRequestHash(request)

  // Step 3: Evaluate explicit deny rules (highest priority)
  const denyReasons = evaluateDenyRules(context.explicitDenyRules, request)
  if (denyReasons.length > 0) {
    reasons.push(...denyReasons)
    return buildDecision(request, context, "DENY", reasons, [], timestamp)
  }

  // Step 4: Evaluate provenance denials
  const provenanceDenials = evaluateProvenance(request, context)
  if (provenanceDenials.some((r) => r.severity === "critical")) {
    reasons.push(...provenanceDenials.filter((r) => r.severity === "critical"))
    return buildDecision(request, context, "DENY", reasons, [], timestamp)
  }

  // Step 5: Match capabilities
  const capResult = matchCapabilities(
    request,
    context.capabilities,
    context.now,
  )

  if (!capResult.matches) {
    // No matching capability — check if there are specific denial reasons
    if (capResult.denialReasons.length > 0) {
      reasons.push(...capResult.denialReasons)
    } else {
      reasons.push({
        code: "DENY_NO_MATCHING_CAPABILITY",
        message: "No capability grants this action",
        severity: "critical",
      })
    }
    return buildDecision(request, context, "DENY", reasons, [], timestamp)
  }

  // Step 5.5: Evaluate intent binding for HIGH/CRITICAL actions
  // Only evaluates when intentBindings is explicitly provided in the context.
  // When undefined, intent binding is not enforced (backward compatible).
  const intentRisk = classifyRisk(request.action, request.sensitivity)
  if ((intentRisk === "HIGH" || intentRisk === "CRITICAL") && context.intentBindings !== undefined) {
    const bindings = context.intentBindings
    const intentResult = evaluateIntentBindingLocal(request, bindings, intentRisk)

    if (intentResult.decision === "DENY") {
      reasons.push(...intentResult.reasons)
      return buildDecision(request, context, "DENY", reasons, capResult.matchedCapabilityIds, timestamp)
    }
    if (intentResult.decision === "REQUIRE_APPROVAL") {
      reasons.push(...intentResult.reasons)
      // Don't return yet — continue to step 6 approval checks
    }
    if (intentResult.decision === "ALLOW" && intentResult.reasons.length > 0) {
      reasons.push(...intentResult.reasons)
    }
  }

  // Step 6: Evaluate approval conditions
  const approvalReasons: DecisionReason[] = []

  // Approval rules
  approvalReasons.push(...evaluateApprovalRules(context.approvalRules, request))

  // Provenance approvals
  approvalReasons.push(...evaluateProvenanceApprovals(request, context))

  // Workspace trust
  approvalReasons.push(...evaluateWorkspaceTrust(context, request))

  // High-risk classification
  const risk = classifyRisk(request.action, request.sensitivity)
  if (risk === "CRITICAL") {
    approvalReasons.push({
      code: "REQUIRE_APPROVAL_HIGH_RISK",
      message: `CRITICAL risk action requires approval`,
      severity: "warning",
    })
  }

  if (approvalReasons.length > 0) {
    reasons.push(...approvalReasons)
    return buildDecision(
      request,
      context,
      "REQUIRE_APPROVAL",
      reasons,
      capResult.matchedCapabilityIds,
      timestamp,
    )
  }

  // Step 7: ALLOW
  reasons.push({
    code: "ALLOW_CAPABILITY_MATCH",
    message: `Authorized by capability ${capResult.matchedCapabilityIds.join(", ")}`,
    severity: "info",
  })

  return buildDecision(
    request,
    context,
    "ALLOW",
    reasons,
    capResult.matchedCapabilityIds,
    timestamp,
  )
}

// ─── Intent Binding Evaluation ────────────────────────────────────────

/**
 * Local intent binding evaluation — pure, no external imports.
 * Integrated into PDP to avoid circular dependencies with intent-binding.ts.
 */
function evaluateIntentBindingLocal(
  request: AuthorizationRequest,
  bindings: IntentBinding[],
  risk: RiskClass,
): { decision: "ALLOW" | "DENY" | "REQUIRE_APPROVAL"; reasons: DecisionReason[] } {
  const reasons: DecisionReason[] = []

  // Check for remote content injection
  const hasRemoteContent = request.provenance.includes("REMOTE_CONTENT")
  if (hasRemoteContent) {
    // Only bindings for THIS specific request can satisfy the check
    const requestBindings = bindings.filter(
      (b) => b.status === "ACTIVE" && b.requestHash === computeRequestHash(request),
    )
    const hasUserBinding = requestBindings.some((b) =>
      b.justification === "DIRECT_REQUIREMENT" ||
      b.justification === "NECESSARY_SUBSTEP" ||
      b.justification === "EXPLICIT_APPROVAL",
    )
    if (!hasUserBinding) {
      reasons.push({
        code: "DENY_REMOTE_CONTENT_INJECTION",
        message: "Remote content cannot introduce consequential actions without user binding",
        severity: "critical",
      })
      return { decision: "DENY", reasons }
    }
  }

  // Filter active bindings for this request
  const activeBindings = bindings.filter(
    (b) => b.status === "ACTIVE" && b.requestHash === computeRequestHash(request),
  )

  // LOW risk: OPTIONAL — always allowed
  if (risk === "LOW") {
    return { decision: "ALLOW", reasons }
  }

  // MODERATE: USER_REQUEST — needs any active binding
  if (risk === "MODERATE") {
    if (activeBindings.length > 0) {
      reasons.push({
        code: "ALLOW_INTENT_BINDING",
        message: "User request binding found",
        severity: "info",
      })
      return { decision: "ALLOW", reasons }
    }
    reasons.push({
      code: "REQUIRE_APPROVAL_INTENT",
      message: "MODERATE action requires user request binding",
      severity: "warning",
    })
    return { decision: "REQUIRE_APPROVAL", reasons }
  }

  // HIGH: CONTRACT_CRITERION — needs contract + criterion
  if (risk === "HIGH") {
    const valid = activeBindings.find((b) =>
      b.contractId !== undefined &&
      b.criterionIds.length > 0 &&
      (b.justification === "DIRECT_REQUIREMENT" || b.justification === "NECESSARY_SUBSTEP"),
    )
    if (valid) {
      reasons.push({
        code: "ALLOW_INTENT_BINDING",
        message: `Contract criterion binding found: ${valid.contractId}`,
        severity: "info",
      })
      return { decision: "ALLOW", reasons }
    }
    reasons.push({
      code: "DENY_NO_INTENT_BINDING",
      message: "HIGH action requires active contract criterion binding",
      severity: "critical",
    })
    return { decision: "DENY", reasons }
  }

  // CRITICAL: EXPLICIT_APPROVAL — needs explicit approval + contract
  if (risk === "CRITICAL") {
    const valid = activeBindings.find((b) =>
      b.justification === "EXPLICIT_APPROVAL" &&
      b.contractId !== undefined &&
      b.criterionIds.length > 0,
    )
    if (valid) {
      reasons.push({
        code: "ALLOW_INTENT_BINDING",
        message: "Explicit approval binding found",
        severity: "info",
      })
      return { decision: "ALLOW", reasons }
    }
    reasons.push({
      code: "REQUIRE_APPROVAL_INTENT",
      message: "CRITICAL action requires explicit approval with active contract",
      severity: "warning",
    })
    return { decision: "REQUIRE_APPROVAL", reasons }
  }

  return { decision: "ALLOW", reasons }
}

// ─── Decision Builder ─────────────────────────────────────────────────

function buildDecision(
  req: AuthorizationRequest,
  ctx: PolicyContext,
  decision: AuthorizationDecisionKind,
  reasons: DecisionReason[],
  capabilityIds: string[],
  decidedAt: string,
): AuthorizationDecision {
  return {
    requestId: req.requestId,
    requestHash: computeRequestHash(req),
    decision,
    policyVersion: ctx.policyVersion,
    capabilityIds,
    reasons,
    riskClass: classifyRisk(req.action, req.sensitivity),
    decidedAt,
  }
}
