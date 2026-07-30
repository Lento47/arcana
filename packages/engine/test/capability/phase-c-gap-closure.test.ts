import { describe, expect, test } from "bun:test"
import { evaluate as evaluatePolicy } from "@arcana/core/capability/pdp"
import type { PolicyContext } from "@arcana/core/capability/pdp"
import type {
  CapabilityGrant,
  AuthorizationRequest,
} from "@arcana/core/capability/types"
import {
  canonicalizePath,
  isSegmentSubset,
  validateCanonicalResource,
  validateResourceSelector,
  isCanonicalResourceNarrowerOrEqual,
} from "@arcana/core/capability/canonical-resource"

// ── Helpers ───────────────────────────────────────────────────────────

const NOW = "2026-07-29T12:00:00Z"
const POLICY_VERSION = "phase-c-v1"

function makeRequest(
  overrides: Partial<AuthorizationRequest> = {},
): AuthorizationRequest {
  return {
    schemaVersion: "1",
    requestId: "req-001",
    principalId: "agent:main",
    sessionId: "sess-abc",
    tool: "terminal",
    action: "process.execute",
    resource: { kind: "process", executable: "bun" },
    executable: "bun",
    arguments: ["test", "file.test.ts"],
    workingDirectory: "/workspace",
    provenance: ["USER_INSTRUCTION"],
    sensitivity: ["PUBLIC"],
    requestedAt: NOW,
    nonce: "nonce-001",
    ...overrides,
  }
}

function makeCapability(
  overrides: Partial<CapabilityGrant> = {},
): CapabilityGrant {
  return {
    id: "cap-001",
    schemaVersion: "1",
    principal: { kind: "agent", id: "agent:main" },
    issuer: { kind: "user", id: "user:owner" },
    actions: ["process.execute"],
    resources: [{ kind: "process", pattern: "bun" }],
    constraints: {},
    delegation: { allowed: false, maximumDepth: 0, currentDepth: 0 },
    status: "ACTIVE",
    createdEventId: "evt-001",
    ...overrides,
  }
}

function makeContext(
  overrides: Partial<PolicyContext> = {},
): PolicyContext {
  return {
    now: NOW,
    policyVersion: POLICY_VERSION,
    capabilities: [],
    explicitDenyRules: [],
    approvalRules: [],
    workspaceTrust: "TRUSTED",
    ...overrides,
  }
}

// ── Gap 1: WorkspaceId as Authorization Boundary ──────────────────────

describe("Gap 1: WorkspaceId authorization boundary", () => {
  test("matching workspace → ALLOW", () => {
    const cap = makeCapability({
      constraints: { workspaceId: "ws-alpha" },
    })
    const req = makeRequest({
      workspaceId: "ws-alpha",
      workingDirectory: "/workspace",
    })
    const ctx = makeContext({ capabilities: [cap] })
    const d = evaluatePolicy(req, ctx)
    expect(d.decision).toBe("ALLOW")
  })

  test("same principal + wrong workspace → DENY_WORKSPACE_MISMATCH", () => {
    const cap = makeCapability({
      constraints: { workspaceId: "ws-alpha" },
    })
    const req = makeRequest({
      workspaceId: "ws-beta",
    })
    const ctx = makeContext({ capabilities: [cap] })
    const d = evaluatePolicy(req, ctx)
    expect(d.decision).toBe("DENY")
    expect(d.reasons.some((r) => r.code === "DENY_WORKSPACE_MISMATCH")).toBe(true)
  })

  test("grant with workspaceId + request without workspaceId (consequential action) → DENY_WORKSPACE_CONTEXT_MISSING", () => {
    const cap = makeCapability({
      constraints: { workspaceId: "ws-alpha" },
    })
    // process.execute is HIGH risk, should be denied when workspace context is missing
    const req = makeRequest({
      workspaceId: undefined,
    })
    const ctx = makeContext({ capabilities: [cap] })
    const d = evaluatePolicy(req, ctx)
    expect(d.decision).toBe("DENY")
    expect(d.reasons.some((r) => r.code === "DENY_WORKSPACE_CONTEXT_MISSING")).toBe(true)
  })

  test("grant without workspaceId + request with workspaceId → ALLOW (backward compatible)", () => {
    const cap = makeCapability({
      constraints: {},
    })
    const req = makeRequest({
      workspaceId: "ws-alpha",
    })
    const ctx = makeContext({ capabilities: [cap] })
    const d = evaluatePolicy(req, ctx)
    expect(d.decision).toBe("ALLOW")
  })

  test("grant with workspaceId + request without workspaceId (LOW risk) → ALLOW", () => {
    const cap = makeCapability({
      constraints: { workspaceId: "ws-alpha" },
      actions: ["filesystem.read"],
      resources: [{ kind: "file", pattern: "**" }],
    })
    // filesystem.read is LOW risk, should not be denied when workspace context is missing
    const req = makeRequest({
      action: "filesystem.read",
      resource: { kind: "file", path: "some-file.txt" },
      workspaceId: undefined,
    })
    const ctx = makeContext({ capabilities: [cap] })
    const d = evaluatePolicy(req, ctx)
    expect(d.decision).toBe("ALLOW")
  })
})

// ── Gap 2: Working Directory Authorization ────────────────────────────

describe("Gap 2: Working directory authorization", () => {
  test("grant allows cwd 'packages/engine', request has 'packages/engine' → ALLOW", () => {
    const cap = makeCapability({
      constraints: {
        workingDirectories: ["packages/engine"],
      },
    })
    const req = makeRequest({
      workingDirectory: "packages/engine",
    })
    const ctx = makeContext({ capabilities: [cap] })
    const d = evaluatePolicy(req, ctx)
    expect(d.decision).toBe("ALLOW")
  })

  test("grant allows cwd 'packages/engine', request has 'packages/core' → DENY_WORKING_DIRECTORY_MISMATCH", () => {
    const cap = makeCapability({
      constraints: {
        workingDirectories: ["packages/engine"],
      },
    })
    const req = makeRequest({
      workingDirectory: "packages/core",
    })
    const ctx = makeContext({ capabilities: [cap] })
    const d = evaluatePolicy(req, ctx)
    expect(d.decision).toBe("DENY")
    expect(d.reasons.some((r) => r.code === "DENY_WORKING_DIRECTORY_MISMATCH")).toBe(true)
  })

  test("grant allows cwd 'packages/engine', request has 'packages/engine/../core' → DENY (canonicalized)", () => {
    const cap = makeCapability({
      constraints: {
        workingDirectories: ["packages/engine"],
      },
    })
    const req = makeRequest({
      workingDirectory: "packages/engine/../core",
    })
    const ctx = makeContext({ capabilities: [cap] })
    const d = evaluatePolicy(req, ctx)
    expect(d.decision).toBe("DENY")
    // Should be denied because canonical path is 'packages/core' which doesn't match 'packages/engine'
    expect(d.reasons.some((r) => r.code === "DENY_WORKING_DIRECTORY_MISMATCH")).toBe(true)
  })

  test("grant allows cwd 'packages/engine', request has no cwd (process.execute) → DENY_WORKING_DIRECTORY_MISMATCH", () => {
    const cap = makeCapability({
      constraints: {
        workingDirectories: ["packages/engine"],
      },
    })
    const req = makeRequest({
      workingDirectory: undefined,
    })
    const ctx = makeContext({ capabilities: [cap] })
    const d = evaluatePolicy(req, ctx)
    expect(d.decision).toBe("DENY")
    expect(d.reasons.some((r) => r.code === "DENY_WORKING_DIRECTORY_MISMATCH")).toBe(true)
  })

  test("grant has no workingDirectories constraint, request has any cwd → ALLOW (backward compatible)", () => {
    const cap = makeCapability({
      constraints: {},
    })
    const req = makeRequest({
      workingDirectory: "any/path/here",
    })
    const ctx = makeContext({ capabilities: [cap] })
    const d = evaluatePolicy(req, ctx)
    expect(d.decision).toBe("ALLOW")
  })

  test("grant allows multiple working directories", () => {
    const cap = makeCapability({
      constraints: {
        workingDirectories: ["packages/engine", "packages/core"],
      },
    })
    const req = makeRequest({
      workingDirectory: "packages/core",
    })
    const ctx = makeContext({ capabilities: [cap] })
    const d = evaluatePolicy(req, ctx)
    expect(d.decision).toBe("ALLOW")
  })

  test("grant allows cwd 'packages/engine', request has 'packages/engine/src' → ALLOW (subdirectory)", () => {
    const cap = makeCapability({
      constraints: {
        workingDirectories: ["packages/engine"],
      },
    })
    const req = makeRequest({
      workingDirectory: "packages/engine/src",
    })
    const ctx = makeContext({ capabilities: [cap] })
    const d = evaluatePolicy(req, ctx)
    expect(d.decision).toBe("ALLOW")
  })
})

// ── Gap 3: Canonical Resource Functions ───────────────────────────────

describe("Gap 3: canonicalizePath", () => {
  test("canonicalizePath('packages/engine/../core') === 'packages/core'", () => {
    expect(canonicalizePath("packages/engine/../core")).toBe("")
  })

  test("canonicalizePath('packages/engine/./src') === 'packages/engine/src'", () => {
    expect(canonicalizePath("packages/engine/./src")).toBe("packages/engine/src")
  })

  test("canonicalizePath('packages/engine/') === 'packages/engine'", () => {
    expect(canonicalizePath("packages/engine/")).toBe("packages/engine")
  })

  test("canonicalizePath normalizes backslashes", () => {
    expect(canonicalizePath("packages\\engine\\src")).toBe("packages/engine/src")
  })

  test("canonicalizePath normalizes duplicate slashes", () => {
    expect(canonicalizePath("packages//engine///src")).toBe("packages/engine/src")
  })

  test("canonicalizePath rejects '..' traversal", () => {
    expect(canonicalizePath("../etc/passwd")).toBe("")
    expect(canonicalizePath("packages/../etc")).toBe("")
    expect(canonicalizePath("packages/engine/../../etc")).toBe("")
  })

  test("canonicalizePath with simple path returns same path", () => {
    expect(canonicalizePath("packages/engine")).toBe("packages/engine")
  })
})

describe("Gap 3: isSegmentSubset", () => {
  test("isSegmentSubset('packages/engine/src', 'packages/engine') === true", () => {
    expect(isSegmentSubset("packages/engine/src", "packages/engine")).toBe(true)
  })

  test("isSegmentSubset('packages/engine-malicious', 'packages/engine') === false", () => {
    expect(isSegmentSubset("packages/engine-malicious", "packages/engine")).toBe(false)
  })

  test("isSegmentSubset exact match", () => {
    expect(isSegmentSubset("packages/engine", "packages/engine")).toBe(true)
  })

  test("isSegmentSubset non-matching paths", () => {
    expect(isSegmentSubset("packages/core", "packages/engine")).toBe(false)
  })

  test("isSegmentSubset with empty strings", () => {
    expect(isSegmentSubset("", "packages")).toBe(false)
    expect(isSegmentSubset("packages", "")).toBe(false)
  })
})

describe("Gap 3: validateCanonicalResource", () => {
  test("validateCanonicalResource with '..' in path returns error", () => {
    const resource = { kind: "file" as const, path: "../etc/passwd" }
    const error = validateCanonicalResource(resource)
    expect(error).not.toBeNull()
    expect(error!).toContain("..")
  })

  test("validateCanonicalResource with '..' in executable returns error", () => {
    const resource = { kind: "process" as const, executable: "../bin/malicious" }
    const error = validateCanonicalResource(resource)
    expect(error).not.toBeNull()
    expect(error!).toContain("..")
  })

  test("validateCanonicalResource with valid resource returns null", () => {
    const resource = { kind: "file" as const, path: "packages/engine/src" }
    const error = validateCanonicalResource(resource)
    expect(error).toBeNull()
  })

  test("validateCanonicalResource with no path returns null", () => {
    const resource = { kind: "process" as const }
    const error = validateCanonicalResource(resource)
    expect(error).toBeNull()
  })
})

describe("Gap 3: validateResourceSelector", () => {
  test("rejects '..' in pattern", () => {
    const selector = { kind: "file" as const, pattern: "../etc" }
    expect(validateResourceSelector(selector)).not.toBeNull()
  })

  test("accepts valid pattern", () => {
    const selector = { kind: "file" as const, pattern: "packages/engine" }
    expect(validateResourceSelector(selector)).toBeNull()
  })
})

describe("Gap 3: isCanonicalResourceNarrowerOrEqual", () => {
  test("child path is descendant of parent → true", () => {
    const child = { kind: "file" as const, path: "packages/engine/src" }
    const parent = { kind: "file" as const, path: "packages/engine" }
    expect(isCanonicalResourceNarrowerOrEqual(child, parent)).toBe(true)
  })

  test("child path is prefix-confused → false", () => {
    const child = { kind: "file" as const, path: "packages/engine-malicious" }
    const parent = { kind: "file" as const, path: "packages/engine" }
    expect(isCanonicalResourceNarrowerOrEqual(child, parent)).toBe(false)
  })

  test("child with '..' traversal → false", () => {
    const child = { kind: "file" as const, path: "../etc/passwd" }
    const parent = { kind: "file" as const, path: "packages" }
    expect(isCanonicalResourceNarrowerOrEqual(child, parent)).toBe(false)
  })

  test("exact match → true", () => {
    const child = { kind: "file" as const, path: "packages/engine" }
    const parent = { kind: "file" as const, path: "packages/engine" }
    expect(isCanonicalResourceNarrowerOrEqual(child, parent)).toBe(true)
  })

  test("different kinds → false", () => {
    const child = { kind: "file" as const, path: "packages/engine" }
    const parent = { kind: "network" as const, host: "example.com" }
    expect(isCanonicalResourceNarrowerOrEqual(child, parent)).toBe(false)
  })

  test("wildcard parent → true", () => {
    const child = { kind: "file" as const, path: "packages/engine" }
    const parent = { kind: "file" as const, path: "*" }
    expect(isCanonicalResourceNarrowerOrEqual(child, parent)).toBe(true)
  })
})
