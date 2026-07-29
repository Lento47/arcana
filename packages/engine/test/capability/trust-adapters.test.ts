/**
 * Phase C: Workspace and MCP trust adapter tests
 */

import { describe, expect, it } from "bun:test"
import {
  assessWorkspaceTrust,
  assessMCPTrust,
  computeToolSchemaDigest,
  type WorkspaceIdentity,
  type MCPRequestBinding,
} from "@arcana/core/capability/trust-adapters"

// ─── Workspace Trust ──────────────────────────────────────────────────

describe("Workspace trust assessment", () => {
  const approved = new Set(["https://github.com/org/repo"])

  it("TRUSTED: approved, clean, known commit, no external symlinks", () => {
    const identity: WorkspaceIdentity = {
      url: "https://github.com/org/repo",
      commitSha: "abc123",
      isDirty: false,
      configDigest: "digest-1",
      hasExternalSymlinks: false,
      isWorktree: false,
    }

    const result = assessWorkspaceTrust(identity, approved)
    expect(result.trust).toBe("TRUSTED")
  })

  it("UNTRUSTED: not approved", () => {
    const identity: WorkspaceIdentity = {
      url: "https://github.com/evil/repo",
      commitSha: "abc123",
      isDirty: false,
      hasExternalSymlinks: false,
      isWorktree: false,
    }

    const result = assessWorkspaceTrust(identity, approved)
    expect(result.trust).toBe("UNTRUSTED")
    expect(result.reasons.some((r) => r.includes("not in approved set"))).toBe(true)
  })

  it("UNTRUSTED: external symlinks", () => {
    const identity: WorkspaceIdentity = {
      url: "https://github.com/org/repo",
      commitSha: "abc123",
      isDirty: false,
      hasExternalSymlinks: true,
      isWorktree: false,
    }

    const result = assessWorkspaceTrust(identity, approved)
    expect(result.trust).toBe("UNTRUSTED")
    expect(result.reasons.some((r) => r.includes("symlinks"))).toBe(true)
  })

  it("UNTRUSTED: dirty workspace", () => {
    const identity: WorkspaceIdentity = {
      url: "https://github.com/org/repo",
      commitSha: "abc123",
      isDirty: true,
      hasExternalSymlinks: false,
      isWorktree: false,
    }

    const result = assessWorkspaceTrust(identity, approved)
    expect(result.trust).toBe("UNTRUSTED")
  })
})

// ─── MCP Trust ────────────────────────────────────────────────────────

describe("MCP trust assessment", () => {
  const approvedServers = new Set(["github-mcp"])
  const knownDigests = new Map([["search_repos", "schema-abc"]])

  it("trusted: approved server, known tool, matching schema", () => {
    const binding: MCPRequestBinding = {
      server: { serverId: "github-mcp", transport: "stdio", isApproved: true },
      tool: { name: "search_repos", schemaDigest: "schema-abc", declaredActions: ["network.read"], declaredResourceKinds: ["network"] },
      argumentDigest: "arg-1",
      action: "network.read",
      resourceKind: "network",
      sensitivity: ["PUBLIC"],
      provenance: ["MCP_DESCRIPTION"],
    }

    const result = assessMCPTrust(binding, approvedServers, knownDigests)
    expect(result.trusted).toBe(true)
    expect(result.requiresApproval).toBe(false)
  })

  it("denied: unapproved server", () => {
    const binding: MCPRequestBinding = {
      server: { serverId: "evil-mcp", transport: "http", isApproved: false },
      tool: { name: "search_repos", schemaDigest: "schema-abc", declaredActions: ["network.read"], declaredResourceKinds: ["network"] },
      argumentDigest: "arg-1",
      action: "network.read",
      resourceKind: "network",
      sensitivity: ["PUBLIC"],
      provenance: ["MCP_DESCRIPTION"],
    }

    const result = assessMCPTrust(binding, approvedServers, knownDigests)
    expect(result.trusted).toBe(false)
    expect(result.requiresApproval).toBe(true)
  })

  it("denied: MCP_DESCRIPTION cannot authorize secret.use", () => {
    const binding: MCPRequestBinding = {
      server: { serverId: "github-mcp", transport: "stdio", isApproved: true },
      tool: { name: "search_repos", schemaDigest: "schema-abc", declaredActions: ["secret.use"], declaredResourceKinds: ["secret"] },
      argumentDigest: "arg-1",
      action: "secret.use",
      resourceKind: "secret",
      sensitivity: ["SECRET"],
      provenance: ["MCP_DESCRIPTION"],
    }

    const result = assessMCPTrust(binding, approvedServers, knownDigests)
    expect(result.trusted).toBe(false)
    expect(result.reasons.some((r) => r.includes("secret access"))).toBe(true)
    expect(result.requiresApproval).toBe(false)
  })

  it("approval required: schema changed", () => {
    const binding: MCPRequestBinding = {
      server: { serverId: "github-mcp", transport: "stdio", isApproved: true },
      tool: { name: "search_repos", schemaDigest: "schema-CHANGED", declaredActions: ["network.read"], declaredResourceKinds: ["network"] },
      argumentDigest: "arg-1",
      action: "network.read",
      resourceKind: "network",
      sensitivity: ["PUBLIC"],
      provenance: ["MCP_DESCRIPTION"],
    }

    const result = assessMCPTrust(binding, approvedServers, knownDigests)
    expect(result.trusted).toBe(false)
    expect(result.requiresApproval).toBe(true)
    expect(result.reasons.some((r) => r.includes("schema changed"))).toBe(true)
  })

  it("approval required: unknown tool", () => {
    const binding: MCPRequestBinding = {
      server: { serverId: "github-mcp", transport: "stdio", isApproved: true },
      tool: { name: "unknown_tool", schemaDigest: "schema-x", declaredActions: ["network.read"], declaredResourceKinds: ["network"] },
      argumentDigest: "arg-1",
      action: "network.read",
      resourceKind: "network",
      sensitivity: ["PUBLIC"],
      provenance: ["MCP_DESCRIPTION"],
    }

    const result = assessMCPTrust(binding, approvedServers, knownDigests)
    expect(result.trusted).toBe(false)
    expect(result.requiresApproval).toBe(true)
  })
})

// ─── Schema Digest ────────────────────────────────────────────────────

describe("Tool schema digest", () => {
  it("same schema produces same digest", () => {
    const schema = { type: "object", properties: { name: { type: "string" } } }
    const d1 = computeToolSchemaDigest(schema)
    const d2 = computeToolSchemaDigest(schema)
    expect(d1).toBe(d2)
  })

  it("different schema produces different digest", () => {
    const s1 = { type: "object", properties: { name: { type: "string" } } }
    const s2 = { type: "object", properties: { age: { type: "number" } } }
    expect(computeToolSchemaDigest(s1)).not.toBe(computeToolSchemaDigest(s2))
  })
})
