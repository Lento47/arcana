import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { authorizeAndExecuteEffect } from "@arcana/core/capability/pep"
import type { PolicyContext } from "@arcana/core/capability/pdp"
import type { CapabilityGrant } from "@arcana/core/capability/types"
import { InstanceRef } from "../../src/effect/instance-ref"
import { InstanceState } from "../../src/effect/instance-state"
import type { InstanceContext } from "../../src/project/instance-context"

// ── Regression: RB-01a exact-effect context preservation ─────────────
// Since 90de367c (RB-01a) the tool effect runs INSIDE executeExact.
// resolveExecute previously executed that effect via Effect.runPromise —
// a fresh runtime with default services — which dropped the caller's
// context (InstanceRef, WorkspaceRef, ...). Any tool effect reading
// InstanceState.context died with "InstanceRef not provided".
// The fix provides the caller's ambient context to the exact effect.

const NOW = "2026-07-31T12:00:00Z"

function makeCapability(): CapabilityGrant {
  return {
    id: "cap-001",
    schemaVersion: "1",
    principal: { kind: "agent", id: "agent:main" },
    issuer: { kind: "user", id: "user:owner" },
    actions: ["filesystem.read"],
    resources: [{ kind: "file", pattern: "/*" }],
    constraints: {},
    delegation: { allowed: true, maximumDepth: 3, currentDepth: 0 },
    status: "ACTIVE",
    createdEventId: "evt-001",
  }
}

function makeContext(): PolicyContext {
  return {
    now: NOW,
    policyVersion: "phase-c-v1",
    capabilities: [makeCapability()],
    explicitDenyRules: [],
    approvalRules: [],
    workspaceTrust: "TRUSTED",
  }
}

const request = {
  schemaVersion: "1" as const,
  requestId: "req-ctx-preserve",
  principalId: "agent:main",
  sessionId: "sess-ctx-preserve",
  tool: "read_file",
  action: "filesystem.read",
  resource: { kind: "file" as const, path: "/tmp/x" },
  args: { path: "/tmp/x" },
  provenance: [] as string[],
  sensitivity: [] as string[],
  requestedAt: NOW,
  nonce: "nonce-1",
}

const instanceCtx: InstanceContext = {
  directory: "C:\\test\\project",
  worktree: "C:\\test\\project",
  project: {
    id: "proj-test",
    name: "test",
    root: "C:\\test\\project",
    vcs: "none" as const,
  },
  startedAt: Date.now(),
}

describe("PEP resolveExecute context preservation", () => {
  test("executeExact effect sees the caller's InstanceRef (no fresh-runtime drop)", async () => {
    const effect = authorizeAndExecuteEffect(
      {
        request,
        executeExact: () =>
          Effect.gen(function* () {
            // Would die with "InstanceRef not provided" if the caller
            // context (InstanceRef) is dropped by resolveExecute.
            const ctx = yield* InstanceState.context
            return { ok: true, directory: ctx.directory }
          }),
      },
      { snapshot: () => Effect.succeed(makeContext()) },
    )

    const result = await Effect.runPromise(
      effect.pipe(Effect.provideService(InstanceRef, instanceCtx)),
    )

    expect(result.status).toBe("EXECUTED")
    if (result.status === "EXECUTED") {
      expect(result.value).toEqual({ ok: true, directory: "C:\\test\\project" })
    }
  })

  test("executeExact promise resolver also preserves context", async () => {
    const effect = authorizeAndExecuteEffect(
      {
        request: { ...request, requestId: "req-ctx-promise" },
        executeExact: () =>
          Effect.gen(function* () {
            const ctx = yield* InstanceState.context
            return { ok: true, directory: ctx.directory }
          }),
      },
      { snapshot: () => Effect.succeed(makeContext()) },
    )

    const result = await Effect.runPromise(
      effect.pipe(Effect.provideService(InstanceRef, instanceCtx)),
    )

    expect(result.status).toBe("EXECUTED")
    if (result.status === "EXECUTED") {
      expect(result.value).toEqual({ ok: true, directory: "C:\\test\\project" })
    }
  })

  test("no InstanceRef in caller context still fails closed (unchanged semantics)", async () => {
    const effect = authorizeAndExecuteEffect(
      {
        request: { ...request, requestId: "req-ctx-missing" },
        executeExact: () =>
          Effect.gen(function* () {
            const ctx = yield* InstanceState.context
            return { ok: true, directory: ctx.directory }
          }),
      },
      { snapshot: () => Effect.succeed(makeContext()) },
    )

    const result = await Effect.runPromise(effect)

    expect(result.status).toBe("EXECUTION_FAILED")
    if (result.status === "EXECUTION_FAILED") {
      expect(String(result.error)).toContain("InstanceRef not provided")
    }
  })
})
