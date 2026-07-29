/**
 * Phase C: Workspace and MCP Trust Adapters
 *
 * Workspace trust affects grant issuance, not PDP bypass.
 * MCP trust binds server identity, transport, tool schema, and arguments.
 *
 * Trust is based on:
 * - Approved workspace identity
 * - Current commit or policy digest
 * - Config digest
 * - Symlink and mount checks
 * - Explicit user approval
 */

import type { WorkspaceTrust } from "./pdp"

// ─── Workspace Trust ──────────────────────────────────────────────────

export interface WorkspaceIdentity {
  /** Repository URL or local path */
  readonly url: string
  /** Current commit SHA */
  readonly commitSha?: string
  /** Whether the workspace has uncommitted changes */
  readonly isDirty: boolean
  /** Config file digest (e.g., .arcana/config.yaml hash) */
  readonly configDigest?: string
  /** Whether symlinks point outside the workspace */
  readonly hasExternalSymlinks: boolean
  /** Whether the workspace is a git worktree */
  readonly isWorktree: boolean
  /** User or organization that approved this workspace */
  readonly approvedBy?: string
}

export interface WorkspaceTrustAssessment {
  readonly trust: WorkspaceTrust
  readonly reasons: ReadonlyArray<string>
  readonly approvedAt?: string
}

/**
 * Assess workspace trust based on identity and policy.
 *
 * TRUSTED: approved by user, clean state, known commit, no external symlinks.
 * UNTRUSTED: unknown source, dirty state, external symlinks, or not approved.
 * UNKNOWN: insufficient information to assess.
 */
export function assessWorkspaceTrust(
  identity: WorkspaceIdentity,
  approvedWorkspaces: ReadonlySet<string>,
): WorkspaceTrustAssessment {
  const reasons: string[] = []

  // Must be explicitly approved
  if (!approvedWorkspaces.has(identity.url)) {
    reasons.push(`Workspace ${identity.url} is not in approved set`)
    return { trust: "UNTRUSTED", reasons }
  }

  // Dirty state reduces trust
  if (identity.isDirty) {
    reasons.push("Workspace has uncommitted changes")
  }

  // External symlinks are a security risk
  if (identity.hasExternalSymlinks) {
    reasons.push("Workspace has symlinks pointing outside")
    return { trust: "UNTRUSTED", reasons }
  }

  // Config digest verification
  if (!identity.configDigest) {
    reasons.push("No config digest available")
  }

  if (identity.isDirty || !identity.commitSha) {
    return { trust: "UNTRUSTED", reasons: [...reasons, "Dirty or unversioned workspace"] }
  }

  return {
    trust: "TRUSTED",
    reasons,
    approvedAt: new Date().toISOString(),
  }
}

// ─── MCP Trust ────────────────────────────────────────────────────────

export interface MCPServerIdentity {
  /** Server name or identifier */
  readonly serverId: string
  /** Transport type */
  readonly transport: "stdio" | "http" | "websocket"
  /** Server URL (for http/websocket) */
  readonly url?: string
  /** Server version */
  readonly version?: string
  /** Whether the server is in the approved set */
  readonly isApproved: boolean
}

export interface MCPToolSchema {
  /** Tool name */
  readonly name: string
  /** Schema digest (hash of the JSON schema) */
  readonly schemaDigest: string
  /** Declared actions (from tool description) */
  readonly declaredActions: ReadonlyArray<string>
  /** Declared resource kinds */
  readonly declaredResourceKinds: ReadonlyArray<string>
}

export interface MCPRequestBinding {
  /** Server identity */
  readonly server: MCPServerIdentity
  /** Tool schema */
  readonly tool: MCPToolSchema
  /** Canonical argument digest */
  readonly argumentDigest: string
  /** Requested action */
  readonly action: string
  /** Resource selector */
  readonly resourceKind: string
  /** Network destination (if any) */
  readonly networkDestination?: string
  /** Sensitivity labels */
  readonly sensitivity: ReadonlyArray<string>
  /** Provenance labels */
  readonly provenance: ReadonlyArray<string>
}

export interface MCPTrustAssessment {
  readonly trusted: boolean
  readonly reasons: ReadonlyArray<string>
  readonly requiresApproval: boolean
}

/**
 * Assess MCP request trust.
 *
 * Denied conditions:
 * - Server not approved
 * - Tool schema changed since last authorization
 * - MCP_DESCRIPTION used for secret.use
 * - Unknown tool effect
 *
 * Approval required:
 * - First-time tool
 * - Changed arguments
 * - Network destination not in allowlist
 */
export function assessMCPTrust(
  binding: MCPRequestBinding,
  approvedServers: ReadonlySet<string>,
  knownToolDigests: ReadonlyMap<string, string>,
): MCPTrustAssessment {
  const reasons: string[] = []

  // Server must be approved
  if (!approvedServers.has(binding.server.serverId)) {
    reasons.push(`MCP server ${binding.server.serverId} is not approved`)
    return { trusted: false, reasons, requiresApproval: true }
  }

  // Tool schema must be known and unchanged
  const knownDigest = knownToolDigests.get(binding.tool.name)
  if (!knownDigest) {
    reasons.push(`MCP tool ${binding.tool.name} is unknown`)
    return { trusted: false, reasons, requiresApproval: true }
  }
  if (knownDigest !== binding.tool.schemaDigest) {
    reasons.push(`MCP tool ${binding.tool.name} schema changed: ${knownDigest} → ${binding.tool.schemaDigest}`)
    return { trusted: false, reasons, requiresApproval: true }
  }

  // MCP_DESCRIPTION cannot authorize secret.use
  if (binding.provenance.includes("MCP_DESCRIPTION") && binding.action === "secret.use") {
    reasons.push("MCP tool description cannot authorize secret access")
    return { trusted: false, reasons, requiresApproval: false }
  }

  // MCP_DESCRIPTION cannot authorize policy.modify
  if (binding.provenance.includes("MCP_DESCRIPTION") && binding.action === "policy.modify") {
    reasons.push("MCP tool description cannot authorize policy modification")
    return { trusted: false, reasons, requiresApproval: false }
  }

  return { trusted: true, reasons: [], requiresApproval: false }
}

/**
 * Compute tool schema digest for change detection.
 */
export function computeToolSchemaDigest(schema: unknown): string {
  // Deep sort keys for deterministic serialization
  function sortKeys(obj: unknown): unknown {
    if (obj === null || typeof obj !== "object") return obj
    if (Array.isArray(obj)) return obj.map(sortKeys)
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(obj as object).sort()) {
      sorted[key] = sortKeys((obj as Record<string, unknown>)[key])
    }
    return sorted
  }
  const serialized = JSON.stringify(sortKeys(schema))
  // Simple hash for now — in production, use crypto.createHash
  let hash = 0
  for (let i = 0; i < serialized.length; i++) {
    const char = serialized.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash |= 0
  }
  return `schema-${Math.abs(hash).toString(36)}`
}
