/**
 * Runtime-owned approval routing (Phase D: Desktop awareness).
 *
 * The authoritative flow is:
 *   CLI/TUI agent session -> canonical AuthorizationRequest -> PDP ->
 *   REQUIRE_APPROVAL -> durable PENDING approval -> approval event ->
 *   Desktop or local TUI operator surface -> runtime receives approve/deny ->
 *   exact-request revalidation -> PEP execution or denial -> receipt +
 *   evidence + RunProof.
 *
 * Routing is ADVISORY ONLY. It selects where an operator decision is
 * presented and whether a local fallback is permitted. It NEVER:
 *   - authorizes an action,
 *   - extends approval expiry,
 *   - fabricates an operator identity,
 *   - consumes an approval,
 *   - changes a PDP result, or
 *   - executes an effect.
 *
 * The PDP/PEP remain the only execution authority.
 */

import type { RiskClass } from "../capability/types"

// ---------------------------------------------------------------------------
// Route model
// ---------------------------------------------------------------------------

export type ApprovalRoute =
  | "LOCAL_TUI" // The TUI may display and decide the approval locally.
  | "DESKTOP_PREFERRED" // Route to Desktop when live; fall back to TUI only when policy permits.
  | "DESKTOP_REQUIRED" // Remains PENDING when Desktop is unavailable; no silent local fallback.
  | "CENTRAL_REQUIRED" // Local TUI and Desktop may inspect but cannot decide.

export type DeploymentMode = "LOCAL" | "HYBRID" | "ENTERPRISE"

export type DecisionSurface = "LOCAL_TUI" | "DESKTOP" | "CENTRAL" | "PENDING"

// ---------------------------------------------------------------------------
// Policy model
// ---------------------------------------------------------------------------

export interface ApprovalRoutingSelector {
  /** Exact workspace id or a list of workspace ids. */
  workspace?: string | readonly string[]
  /** Exact capability action (for example "git.push", "deploy") or a list. */
  action?: string | readonly string[]
  /** Exact capability grant id. */
  capabilityId?: string
  /** Risk class from the PDP decision, or a list. */
  riskClass?: RiskClass | readonly RiskClass[]
  /** Deployment modes the rule applies to. */
  deploymentModes?: readonly DeploymentMode[]
}

export interface ApprovalRoutingRule extends ApprovalRoutingSelector {
  id: string
  route: ApprovalRoute
  /**
   * DESKTOP_PREFERRED only: whether the TUI may decide when Desktop is
   * unavailable. Ignored for other routes (DESKTOP_REQUIRED and
   * CENTRAL_REQUIRED never fall back; LOCAL_TUI is always local).
   */
  localFallbackAllowed?: boolean
}

export interface ApprovalRoutingPolicy {
  policyVersion: string
  defaultRoute: ApprovalRoute
  defaultLocalFallbackAllowed: boolean
  rules: readonly ApprovalRoutingRule[]
}

export interface ApprovalRoutingInput {
  sessionId: string
  workspaceId: string
  action: string
  capabilityId?: string
  riskClass: RiskClass
  deploymentMode: DeploymentMode
  /** Live Desktop subscriber state for this workspace (advisory). */
  desktopOnline: boolean
  /** Echoed for evidence; never used in the routing decision itself. */
  requestId?: string
  requestHash?: string
}

export interface ApprovalRouteResolution {
  route: ApprovalRoute
  /**
   * Where the operator decision will actually be accepted:
   *  - LOCAL_TUI when the TUI may decide,
   *  - DESKTOP when a live Desktop subscriber exists (or Desktop is required),
   *  - CENTRAL for CENTRAL_REQUIRED requests (local surfaces may inspect only),
   *  - PENDING when the routed surface is unavailable and no fallback is
   *    permitted. The approval remains durable and awaiting that surface.
   */
  decisionSurface: DecisionSurface
  localFallbackAllowed: boolean
  policyVersion: string
  ruleId?: string
  desktopOnline: boolean
  requestId?: string
  requestHash?: string
}

// ---------------------------------------------------------------------------
// Default policies by deployment mode
// ---------------------------------------------------------------------------

/**
 * Baseline policy when no workspace policy file exists.
 *
 * LOCAL: everything stays in the TUI (existing behavior).
 * HYBRID: Desktop preferred for HIGH/CRITICAL risk and required for
 *   deploy/publish/policy.modify; local fallback stays permitted so a
 *   Desktop outage does not silently strand ordinary approvals.
 * ENTERPRISE: central control owns every decision; local surfaces are
 *   inspection-only (fail closed until Arcana Control is connected).
 */
export function defaultApprovalRoutingPolicy(deploymentMode: DeploymentMode): ApprovalRoutingPolicy {
  switch (deploymentMode) {
    case "HYBRID":
      return {
        policyVersion: "default-hybrid-v1",
        defaultRoute: "LOCAL_TUI",
        defaultLocalFallbackAllowed: true,
        rules: [
          {
            id: "hybrid-deploy-desktop-required",
            route: "DESKTOP_REQUIRED",
            action: ["deploy", "publish", "policy.modify"],
            localFallbackAllowed: false,
          },
          {
            id: "hybrid-high-risk-desktop-preferred",
            route: "DESKTOP_PREFERRED",
            riskClass: ["HIGH", "CRITICAL"],
            localFallbackAllowed: true,
          },
        ],
      }
    case "ENTERPRISE":
      return {
        policyVersion: "default-enterprise-v1",
        defaultRoute: "CENTRAL_REQUIRED",
        defaultLocalFallbackAllowed: false,
        rules: [],
      }
    case "LOCAL":
    default:
      return {
        policyVersion: "default-local-v1",
        defaultRoute: "LOCAL_TUI",
        defaultLocalFallbackAllowed: true,
        rules: [],
      }
  }
}

// ---------------------------------------------------------------------------
// Pure resolution
// ---------------------------------------------------------------------------

function matchesSelector(
  value: string | undefined,
  selector: string | readonly string[] | undefined,
): boolean {
  if (selector === undefined) return true
  if (typeof selector === "string") return value === selector
  return value !== undefined && selector.includes(value)
}

function ruleMatches(
  rule: ApprovalRoutingRule,
  input: ApprovalRoutingInput,
): boolean {
  if (!matchesSelector(input.workspaceId, rule.workspace)) return false
  if (!matchesSelector(input.action, rule.action)) return false
  if (!matchesSelector(input.capabilityId, rule.capabilityId)) return false
  if (!matchesSelector(input.riskClass, rule.riskClass)) return false
  if (rule.deploymentModes !== undefined && !rule.deploymentModes.includes(input.deploymentMode)) {
    return false
  }
  return true
}

export function resolveApprovalRoute(
  policy: ApprovalRoutingPolicy,
  input: ApprovalRoutingInput,
): ApprovalRouteResolution {
  const matched = policy.rules.find((rule) => ruleMatches(rule, input))
  const route = matched?.route ?? policy.defaultRoute
  const localFallbackAllowed =
    matched?.localFallbackAllowed ?? policy.defaultLocalFallbackAllowed

  let decisionSurface: DecisionSurface
  switch (route) {
    case "LOCAL_TUI":
      decisionSurface = "LOCAL_TUI"
      break
    case "DESKTOP_PREFERRED":
      decisionSurface = input.desktopOnline ? "DESKTOP" : localFallbackAllowed ? "LOCAL_TUI" : "PENDING"
      break
    case "DESKTOP_REQUIRED":
      decisionSurface = input.desktopOnline ? "DESKTOP" : "PENDING"
      break
    case "CENTRAL_REQUIRED":
      decisionSurface = "CENTRAL"
      break
  }

  return {
    route,
    decisionSurface,
    localFallbackAllowed,
    policyVersion: policy.policyVersion,
    ruleId: matched?.id,
    desktopOnline: input.desktopOnline,
    requestId: input.requestId,
    requestHash: input.requestHash,
  }
}

// ---------------------------------------------------------------------------
// Wire helpers
// ---------------------------------------------------------------------------

export function isLocalDecisionAllowed(resolution: ApprovalRouteResolution): boolean {
  return resolution.decisionSurface === "LOCAL_TUI"
}

export function isCentralDecision(resolution: ApprovalRouteResolution): boolean {
  return resolution.route === "CENTRAL_REQUIRED"
}
