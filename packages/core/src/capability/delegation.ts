/**
 * Phase C Task 13: Capability Attenuation and Subagent Delegation
 *
 * Authority(child) ⪯ Authority(parent)
 *
 * For every child grant:
 *   Actions_child ⊆ Actions_parent
 *   Resources_child ⊆ Resources_parent
 *   Expiry_child ≤ Expiry_parent
 *   Uses_child ≤ Uses_parent
 *   Depth_child = Depth_parent + 1 ≤ MaximumDepth_parent
 *
 * Also require equal or narrower:
 *   Workspace, Session lineage, Contract and revision,
 *   Tool names, Executables and arguments, Network hosts,
 *   Secret identifiers, Provenance permissions, Sensitivity permissions
 *
 * A child receives zero ambient authority by default.
 * Parent has 8 capabilities → child receives none automatically.
 * Parent explicitly derives 2 attenuated capabilities → child receives exactly those 2.
 */

import type {
  CapabilityGrant,
  CapabilityAction,
  ResourceSelector,
  ProvenanceLabel,
  SensitivityLabel,
  CanonicalResource,
} from "./types"
import { SENSITIVITY_ORDER } from "./types"
import {
  canonicalizePath,
  validateCanonicalResource,
  validateResourceSelector,
  isCanonicalResourceNarrowerOrEqual,
  isSegmentSubset,
} from "./canonical-resource"

// ─── Types ────────────────────────────────────────────────────────────

/**
 * Security context inherited from parent to child.
 * Child must inherit maximum sensitivity and union of provenance.
 * It cannot start with clean PUBLIC labels.
 */
export interface DelegatedContext {
  sourceEventIds: ReadonlyArray<string>
  provenance: ReadonlyArray<ProvenanceLabel>
  sensitivity: SensitivityLabel
  contractId: string
  contractRevision: number
  parentSessionId: string
}

/**
 * A draft capability grant for a child.
 * The runtime validates and fills in derived fields.
 */
export interface CapabilityGrantDraft {
  actions: CapabilityAction[]
  resources: ResourceSelector[]
  constraints?: {
    toolNames?: string[]
    executable?: string
    argumentPatterns?: string[]
    networkHosts?: string[]
    maxUses?: number
    expiresAt?: string
    approvalRequired?: boolean
  }
}

/**
 * Request to delegate capabilities from parent to child.
 */
export interface DelegationRequest {
  parentPrincipalId: string
  childPrincipalId: string
  parentSessionId: string
  childSessionId: string
  contractId: string
  contractRevision: number
  requestedGrants: CapabilityGrantDraft[]
  delegatedContext: DelegatedContext
}

export type DelegationReasonCode =
  | "DENY_ACTION_AMPLIFICATION"
  | "DENY_RESOURCE_AMPLIFICATION"
  | "DENY_EXPIRY_AMPLIFICATION"
  | "DENY_USE_AMPLIFICATION"
  | "DENY_DELEGATION_DEPTH"
  | "DENY_CONTRACT_MISMATCH"
  | "DENY_SECRET_AMPLIFICATION"
  | "DENY_NETWORK_AMPLIFICATION"
  | "DENY_NO_PARENT_AUTHORITY"
  | "DENY_EXECUTABLE_AMPLIFICATION"
  | "DENY_ARGUMENT_AMPLIFICATION"
  | "DENY_TOOL_AMPLIFICATION"

export interface DelegationReason {
  code: DelegationReasonCode
  message: string
  severity: "critical"
}

export type DelegationResult =
  | {
      status: "CREATED"
      childGrants: CapabilityGrant[]
    }
  | {
      status: "DENIED"
      reasons: DelegationReason[]
    }

// ─── Resource Comparison ──────────────────────────────────────────────

/**
 * Check if child resource selector is narrower than or equal to parent.
 * Returns true if child ⊆ parent.
 *
 * Security: Rejects '..' traversal in child resources before comparison.
 */
export function isResourceNarrowerOrEqual(
  child: ResourceSelector,
  parent: ResourceSelector,
): boolean {
  if (child.kind !== parent.kind) return false

  // Canonical validation: reject '..' traversal in child patterns
  if (child.pattern.includes("..")) return false
  switch (child.kind) {
    case "file":
    case "directory":
      return isPathNarrowerOrEqual(child.pattern, parent.pattern)
    case "process":
      return isExecutableNarrowerOrEqual(child.pattern, parent.pattern)
    case "network":
      return isHostNarrowerOrEqual(child.pattern, parent.pattern)
    case "secret":
      return isExactNarrowerOrEqual(child.pattern, parent.pattern)
    case "git":
      return isPathNarrowerOrEqual(child.pattern, parent.pattern)
    case "package":
      return isExactNarrowerOrEqual(child.pattern, parent.pattern)
    case "policy":
      return isExactNarrowerOrEqual(child.pattern, parent.pattern)
    default:
      return false
  }
}

/**
 * Path narrowing: child path must be descendant of parent path.
 * "packages/engine/**" ⊆ "packages/**" ✓
 * "packages/engine/**" ⊆ "packages/evil/**" ✗
 * "*" ⊆ "*" ✓ (wildcard matches wildcard)
 *
 * Uses canonical path normalization and segment-based comparison
 * to prevent prefix confusion attacks (e.g., engine-malicious vs engine).
 */
function isPathNarrowerOrEqual(child: string, parent: string): boolean {
  // Canonicalize paths to handle '..' traversal and normalize separators
  const c = canonicalizePath(child) || normalizePath(child)
  const p = canonicalizePath(parent) || normalizePath(parent)

  // Wildcard parent matches anything
  if (p === "*" || p === "**" || p === "/*") return true

  // Child wildcard with non-wildcard parent: not narrower
  if (c === "*" || c === "**" || c === "/*") return false

  // Exact match
  if (c === p) return true

  // Descendant: child must start with parent path
  if (c.startsWith(p + "/")) return true

  // Parent with wildcard suffix
  if (p.endsWith("/*") || p.endsWith("/**")) {
    const dir = p.replace(/\/\*\*?$/, "")
    return c.startsWith(dir + "/")
  }

  return false
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/\/$/, "")
}

/**
 * Executable narrowing: child must be exact subset.
 * "bun" ⊆ "bun" ✓
 * "bun" ⊆ "*" ✓
 * "*" ⊆ "bun" ✗
 * "node" ⊆ "bun" ✗
 */
function isExecutableNarrowerOrEqual(child: string, parent: string): boolean {
  if (parent === "*") return true
  if (child === "*") return false
  const cBase = child.split(/[/\\]/).pop() ?? child
  const pBase = parent.split(/[/\\]/).pop() ?? parent
  return cBase === pBase
}

/**
 * Host narrowing: child host must be subset of parent host.
 * "api.example.com" ⊆ "*.example.com" ✓
 * "api.example.com" ⊆ "api.example.com" ✓
 * "*.example.com" ⊆ "*.example.com" ✓
 * "evil.com" ⊆ "*.example.com" ✗
 */
function isHostNarrowerOrEqual(child: string, parent: string): boolean {
  const c = child.toLowerCase()
  const p = parent.toLowerCase()

  if (p === "*" || p === "**") return true
  if (c === p) return true

  // Parent wildcard subdomain
  if (p.startsWith("*.")) {
    const suffix = p.slice(1) // ".example.com"
    if (!c.endsWith(suffix)) return false
    const prefix = c.slice(0, -suffix.length)
    return prefix.length > 0 && !prefix.includes(".")
  }

  return false
}

/**
 * Exact narrowing: child must exactly match parent.
 */
function isExactNarrowerOrEqual(child: string, parent: string): boolean {
  return child === parent
}

// ─── Sensitivity Narrowing ────────────────────────────────────────────

/**
 * Check if child sensitivity is equal or more restrictive than parent.
 * SECRET ≥ PRIVATE ≥ INTERNAL ≥ PUBLIC
 * Child can only be equal or higher (more restrictive).
 */
export function isSensitivityNarrowerOrEqual(
  child: string,
  parent: string,
): boolean {
  const childLevel = SENSITIVITY_ORDER[child as keyof typeof SENSITIVITY_ORDER] ?? 0
  const parentLevel = SENSITIVITY_ORDER[parent as keyof typeof SENSITIVITY_ORDER] ?? 0
  return childLevel >= parentLevel
}

// ─── Attenuation Validation ───────────────────────────────────────────

/**
 * Validate that a child grant is a valid attenuation of a parent grant.
 * Returns null if valid, or a denial reason if invalid.
 */
export function validateAttenuation(
  childDraft: CapabilityGrantDraft,
  parentGrant: CapabilityGrant,
): DelegationReason | null {
  // Actions: child must be subset of parent
  for (const action of childDraft.actions) {
    if (!parentGrant.actions.includes(action)) {
      return {
        code: "DENY_ACTION_AMPLIFICATION",
        message: `Child action ${action} not in parent actions [${parentGrant.actions.join(", ")}]`,
        severity: "critical",
      }
    }
  }

  // Resources: each child resource must be narrower than some parent resource
  for (const childRes of childDraft.resources) {
    const anyNarrower = parentGrant.resources.some((parentRes) =>
      isResourceNarrowerOrEqual(childRes, parentRes),
    )
    if (!anyNarrower) {
      return {
        code: "DENY_RESOURCE_AMPLIFICATION",
        message: `Child resource ${childRes.kind}:${childRes.pattern} not narrower than any parent resource`,
        severity: "critical",
      }
    }
  }

  // Expiry: child must not expire later than parent
  if (childDraft.constraints?.expiresAt && parentGrant.constraints.expiresAt) {
    if (childDraft.constraints.expiresAt > parentGrant.constraints.expiresAt) {
      return {
        code: "DENY_EXPIRY_AMPLIFICATION",
        message: `Child expiry ${childDraft.constraints.expiresAt} later than parent ${parentGrant.constraints.expiresAt}`,
        severity: "critical",
      }
    }
  }
  // If child has expiry but parent doesn't → OK (child is more restrictive)
  // If parent has expiry but child doesn't → child inherits parent's expiry

  // Use count: child must not exceed parent
  if (childDraft.constraints?.maxUses !== undefined && parentGrant.constraints.maxUses !== undefined) {
    if (childDraft.constraints.maxUses > parentGrant.constraints.maxUses) {
      return {
        code: "DENY_USE_AMPLIFICATION",
        message: `Child use count ${childDraft.constraints.maxUses} exceeds parent ${parentGrant.constraints.maxUses}`,
        severity: "critical",
      }
    }
  }

  // Delegation depth
  if (!parentGrant.delegation.allowed) {
    return {
      code: "DENY_DELEGATION_DEPTH",
      message: `Parent capability does not allow delegation`,
      severity: "critical",
    }
  }
  const childDepth = parentGrant.delegation.currentDepth + 1
  if (childDepth > parentGrant.delegation.maximumDepth) {
    return {
      code: "DENY_DELEGATION_DEPTH",
      message: `Child depth ${childDepth} exceeds maximum ${parentGrant.delegation.maximumDepth}`,
      severity: "critical",
    }
  }

  // Tool names: child must be subset of parent
  if (childDraft.constraints?.toolNames && parentGrant.constraints.toolNames) {
    for (const tool of childDraft.constraints.toolNames) {
      if (!parentGrant.constraints.toolNames!.includes(tool)) {
        return {
          code: "DENY_TOOL_AMPLIFICATION",
          message: `Child tool ${tool} not in parent tools [${parentGrant.constraints.toolNames!.join(", ")}]`,
          severity: "critical",
        }
      }
    }
  }
  // If child has tool constraint but parent doesn't → OK (child is more restrictive)
  // If parent has tool constraint but child doesn't → child inherits parent's constraint

  // Executable: must be narrower or equal
  if (childDraft.constraints?.executable && parentGrant.constraints.executable) {
    if (!isExecutableNarrowerOrEqual(childDraft.constraints.executable, parentGrant.constraints.executable)) {
      return {
        code: "DENY_EXECUTABLE_AMPLIFICATION",
        message: `Child executable ${childDraft.constraints.executable} broader than parent ${parentGrant.constraints.executable}`,
        severity: "critical",
      }
    }
  }

  // Network hosts: each child host must be narrower than some parent host
  if (childDraft.constraints?.networkHosts && parentGrant.constraints.networkHosts) {
    for (const childHost of childDraft.constraints.networkHosts) {
      const anyNarrower = parentGrant.constraints.networkHosts.some((parentHost) =>
        isHostNarrowerOrEqual(childHost, parentHost),
      )
      if (!anyNarrower) {
        return {
          code: "DENY_NETWORK_AMPLIFICATION",
          message: `Child host ${childHost} not narrower than any parent host`,
          severity: "critical",
        }
      }
    }
  }
  // If child has hosts but parent doesn't → DENY (can't add network access)
  if (childDraft.constraints?.networkHosts && !parentGrant.constraints.networkHosts) {
    return {
      code: "DENY_NETWORK_AMPLIFICATION",
      message: `Child requests network hosts but parent has no network access`,
      severity: "critical",
    }
  }

  return null
}

// ─── Delegation Runtime ───────────────────────────────────────────────

let delegationCounter = 0

/**
 * Execute a delegation request: validate all child grants against parent grants,
 * create attenuated child grants, return result.
 *
 * The runtime—not the model—derives and validates the child grants.
 */
export function delegateCapabilities(
  request: DelegationRequest,
  parentGrants: CapabilityGrant[],
  parentEventId: string,
): DelegationResult {
  const reasons: DelegationReason[] = []
  const childGrants: CapabilityGrant[] = []

  // Contract match
  if (request.delegatedContext.contractId !== request.contractId) {
    reasons.push({
      code: "DENY_CONTRACT_MISMATCH",
      message: `Delegated context contract ${request.delegatedContext.contractId} != request contract ${request.contractId}`,
      severity: "critical",
    })
  }

  // No requested grants → no authority
  if (request.requestedGrants.length === 0) {
    reasons.push({
      code: "DENY_NO_PARENT_AUTHORITY",
      message: "No grants requested — child receives zero ambient authority",
      severity: "critical",
    })
    return { status: "DENIED", reasons }
  }

  // Validate each requested grant against parent grants
  for (const draft of request.requestedGrants) {
    // Find a parent grant that covers this draft
    let matched = false
    for (const parent of parentGrants) {
      // Parent must be ACTIVE
      if (parent.status !== "ACTIVE") continue
      // Parent must match principal
      if (parent.principal.id !== request.parentPrincipalId) continue

      const attenuationError = validateAttenuation(draft, parent)
      if (attenuationError === null) {
        matched = true

        // Create child grant with attenuated fields
        delegationCounter++
        const childGrant: CapabilityGrant = {
          id: `child-${Date.now()}-${delegationCounter}`,
          schemaVersion: "1",
          principal: { kind: "subagent", id: request.childPrincipalId },
          issuer: { kind: "parent_capability", id: parent.id },
          actions: draft.actions,
          resources: draft.resources,
          constraints: {
            workspaceId: parent.constraints.workspaceId,
            sessionId: request.childSessionId,
            contractId: request.contractId,
            toolNames: draft.constraints?.toolNames ?? parent.constraints.toolNames,
            executable: draft.constraints?.executable ?? parent.constraints.executable,
            argumentPatterns: draft.constraints?.argumentPatterns ?? parent.constraints.argumentPatterns,
            networkHosts: draft.constraints?.networkHosts ?? parent.constraints.networkHosts,
            maxUses: draft.constraints?.maxUses ?? parent.constraints.maxUses,
            expiresAt: draft.constraints?.expiresAt ?? parent.constraints.expiresAt,
            approvalRequired: draft.constraints?.approvalRequired ?? parent.constraints.approvalRequired,
          },
          delegation: {
            allowed: false, // Child cannot delegate further by default
            maximumDepth: parent.delegation.maximumDepth,
            currentDepth: parent.delegation.currentDepth + 1,
          },
          status: "ACTIVE",
          createdEventId: parentEventId,
        }

        // Inherit parent's expiry if child doesn't specify
        if (!draft.constraints?.expiresAt && parent.constraints.expiresAt) {
          childGrant.constraints.expiresAt = parent.constraints.expiresAt
        }

        // Inherit parent's tool constraint if child doesn't specify
        if (!draft.constraints?.toolNames && parent.constraints.toolNames) {
          childGrant.constraints.toolNames = [...parent.constraints.toolNames]
        }

        childGrants.push(childGrant)
        break
      }
    }

    if (!matched) {
      // Find the specific reason from the last parent check
      let lastError: DelegationReason | null = null
      for (const parent of parentGrants) {
        if (parent.status !== "ACTIVE") continue
        if (parent.principal.id !== request.parentPrincipalId) continue
        lastError = validateAttenuation(draft, parent)
        if (lastError) break
      }
      if (lastError) {
        reasons.push(lastError)
      } else {
        reasons.push({
          code: "DENY_NO_PARENT_AUTHORITY",
          message: `No active parent grant covers this draft`,
          severity: "critical",
        })
      }
    }
  }

  if (reasons.length > 0) {
    return { status: "DENIED", reasons }
  }

  return { status: "CREATED", childGrants }
}

// ─── Parent Grant Status Validation ───────────────────────────────────

/**
 * Check if a parent grant can delegate.
 * Returns null if valid, or a reason if not.
 */
export function canParentDelegate(parent: CapabilityGrant, now: string): DelegationReason | null {
  if (parent.status === "REVOKED") {
    return {
      code: "DENY_NO_PARENT_AUTHORITY",
      message: `Parent capability ${parent.id} is revoked`,
      severity: "critical",
    }
  }
  if (parent.status === "EXPIRED") {
    return {
      code: "DENY_NO_PARENT_AUTHORITY",
      message: `Parent capability ${parent.id} is expired`,
      severity: "critical",
    }
  }
  if (parent.status === "EXHAUSTED") {
    return {
      code: "DENY_NO_PARENT_AUTHORITY",
      message: `Parent capability ${parent.id} is exhausted`,
      severity: "critical",
    }
  }
  if (parent.constraints.expiresAt && parent.constraints.expiresAt <= now) {
    return {
      code: "DENY_EXPIRY_AMPLIFICATION",
      message: `Parent capability ${parent.id} expired at ${parent.constraints.expiresAt}`,
      severity: "critical",
    }
  }
  if (!parent.delegation.allowed) {
    return {
      code: "DENY_DELEGATION_DEPTH",
      message: `Parent capability ${parent.id} does not allow delegation`,
      severity: "critical",
    }
  }
  return null
}

// ─── Ancestor Chain Validation ────────────────────────────────────────

/**
 * Validate that a child grant's complete ancestry is active.
 *
 * Usable(child) ⟹ Active(child) ∧ ∀a ∈ Ancestors(child): Active(a)
 *
 * A child grant must not remain usable after its parent authority is revoked.
 */
export function validateAncestorChain(
  grant: CapabilityGrant,
  getGrantById: (id: string) => CapabilityGrant | undefined,
): { valid: boolean; reason: string | null } {
  // Check the grant itself
  if (grant.status !== "ACTIVE") {
    return { valid: false, reason: `Grant ${grant.id} is ${grant.status}` }
  }

  // Walk up the ancestor chain via issuer
  const visited = new Set<string>()
  let current = grant

  while (current.issuer.kind === "parent_capability") {
    const parentId = current.issuer.id
    if (visited.has(parentId)) {
      return { valid: false, reason: `Cycle detected in ancestor chain at ${parentId}` }
    }
    visited.add(parentId)

    const parent = getGrantById(parentId)
    if (!parent) {
      return { valid: false, reason: `Ancestor ${parentId} not found` }
    }
    if (parent.status !== "ACTIVE") {
      return { valid: false, reason: `Ancestor ${parentId} is ${parent.status}` }
    }
    current = parent
  }

  return { valid: true, reason: null }
}

/**
 * Find all descendant grants of a given grant.
 * Returns grant IDs that would be invalidated if the given grant is revoked.
 */
export function findDescendants(
  grantId: string,
  allGrants: CapabilityGrant[],
): string[] {
  const descendants: string[] = []
  const childrenMap = new Map<string, string[]>()

  // Build parent→children index
  for (const g of allGrants) {
    if (g.issuer.kind === "parent_capability") {
      const existing = childrenMap.get(g.issuer.id) ?? []
      existing.push(g.id)
      childrenMap.set(g.issuer.id, existing)
    }
  }

  // BFS from grantId
  const queue = [grantId]
  const visited = new Set<string>([grantId])

  while (queue.length > 0) {
    const current = queue.shift()!
    const children = childrenMap.get(current) ?? []
    for (const child of children) {
      if (!visited.has(child)) {
        visited.add(child)
        descendants.push(child)
        queue.push(child)
      }
    }
  }

  return descendants
}

/**
 * Cascade revocation to all descendants.
 * Returns the list of invalidated grant IDs.
 */
export function cascadeRevocation(
  parentGrantId: string,
  revokedEventId: string,
  allGrants: CapabilityGrant[],
): { invalidatedIds: string[]; updatedGrants: CapabilityGrant[] } {
  const descendantIds = findDescendants(parentGrantId, allGrants)
  const toInvalidate = new Set([parentGrantId, ...descendantIds])

  const updatedGrants = allGrants.map((g) => {
    if (toInvalidate.has(g.id) && g.status === "ACTIVE") {
      return { ...g, status: "REVOKED" as const, revokedEventId }
    }
    return g
  })

  return {
    invalidatedIds: descendantIds,
    updatedGrants,
  }
}

// ─── Delegation Evidence Profile ──────────────────────────────────────

/**
 * Delegation profile for RunProof — derived from delegation events.
 * Hard invariant: authorityAmplifications = 0.
 */
export interface DelegationProfile {
  delegationsRequested: number
  delegationsCreated: number
  delegationsDenied: number
  authorityAmplifications: number
  maxDepth: number
  invalidatedDescendants: number
}

/**
 * Derive delegation profile from delegation events.
 */
export function deriveDelegationProfile(
  events: ReadonlyArray<{ type: string; payload: unknown }>,
): DelegationProfile {
  let delegationsRequested = 0
  let delegationsCreated = 0
  let delegationsDenied = 0
  let authorityAmplifications = 0
  let maxDepth = 0
  let invalidatedDescendants = 0

  for (const e of events) {
    const p = e.payload as Record<string, unknown>
    switch (e.type) {
      case "capability.delegation_requested":
        delegationsRequested++
        break
      case "capability.delegated":
        delegationsCreated++
        if (typeof p.depth === "number" && p.depth > maxDepth) {
          maxDepth = p.depth
        }
        break
      case "capability.delegation_denied":
        delegationsDenied++
        if (p.reason && String(p.reason).includes("AMPLIFICATION")) {
          authorityAmplifications++
        }
        break
      case "capability.ancestor_invalidated":
        invalidatedDescendants++
        break
    }
  }

  return {
    delegationsRequested,
    delegationsCreated,
    delegationsDenied,
    authorityAmplifications,
    maxDepth,
    invalidatedDescendants,
  }
}
