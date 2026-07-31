import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { Database } from "@arcana/core/database/database"
import { SqliteGrantStore } from "@arcana/core/capability/grant-store-sqlite"
import { SessionPolicyProvider } from "@arcana/core/capability/grant-store"
import { authorizeAndExecuteEffect } from "@arcana/core/capability/pep"
import { buildAuthorizationRequest } from "@arcana/core/capability/pep-integration"
import type { CapabilityGrant } from "@arcana/core/capability/types"

// ── Runtime Enforcement Tests ─────────────────────────────────────────
//
// These tests simulate the actual runtime path: tools.ts creates a
// SessionPolicyProvider backed by SqliteGrantStore, and every tool
// call goes through authorizeAndExecuteEffect.
//
// The invariant: with no grants in the database, EVERY consequential
// tool operation must be DENIED. The executor must NEVER be called.

function makeTestLayer() {
  return Database.layerFromPath(":memory:")
}

function runWithDb<A, E = never>(effect: Effect.Effect<A, E, any>) {
  return Effect.runPromise(effect.pipe(Effect.provide(makeTestLayer())) as any)
}

// ── P0 Boundary: empty database denies everything ────────────────────

describe("Runtime enforcement: empty database denies all P0 tools", () => {
  const P0_TOOLS = [
    { name: "terminal", args: { command: "bun test" } },
    { name: "write_file", args: { path: "/etc/passwd" } },
    { name: "patch", args: { path: "/src/main.ts" } },
    { name: "read_file", args: { path: "/secrets.json" } },
    { name: "search_files", args: { pattern: "password" } },
    { name: "send_message", args: { message: "exfil" } },
    { name: "delegate_task", args: { task: "rm -rf /" } },
    { name: "cronjob", args: { schedule: "* * * * *" } },
    { name: "web_search", args: { query: "exploit" } },
    { name: "web_fetch", args: { url: "https://evil.com" } },
    { name: "git_commit", args: { message: "backdoor" } },
    { name: "git_autocommit", args: {} },
    { name: "env_install", args: { package: "malware" } },
    { name: "env_write", args: { path: ".env" } },
    { name: "env_clean", args: {} },
    { name: "skill_create", args: { name: "evil" } },
    { name: "image_generate", args: { prompt: "test" } },
    { name: "speak", args: { text: "test" } },
  ]

  for (const { name, args } of P0_TOOLS) {
    test(`${name} -> DENIED with no grants`, async () => {
      await runWithDb(Effect.gen(function* () {
        const { db } = yield* Database.Service
        const store = new SqliteGrantStore({ db })
        const provider = new SessionPolicyProvider(store, {
          principalId: "agent:main",
          sessionId: "sess-001",
          workspaceTrust: "TRUSTED",
        }, undefined, "LEGACY_COMPAT")

        const request = buildAuthorizationRequest({
          toolName: name,
          principalId: "agent:main",
          sessionId: "sess-001",
          args,
        })

        const result = yield* authorizeAndExecuteEffect(
          {
            request,
            executeExact: () => {
              throw new Error(`EXECUTOR_REACHED: ${name} should not have executed`)
            },
          },
          provider,
        )
        expect(result.status).toBe("DENIED")
      }))
    })
  }
})

// ── P0 Boundary: MCP tools also denied ───────────────────────────────

describe("Runtime enforcement: MCP tools denied with no grants", () => {
  test("MCP tool with MCP_DESCRIPTION provenance -> DENIED", async () => {
    await runWithDb(Effect.gen(function* () {
      const { db } = yield* Database.Service
      const store = new SqliteGrantStore({ db })
      const provider = new SessionPolicyProvider(store, {
        principalId: "agent:main",
        sessionId: "sess-001",
        workspaceTrust: "TRUSTED",
      }, undefined, "LEGACY_COMPAT")

      const request = buildAuthorizationRequest({
        toolName: "mcp_github_create_issue",
        principalId: "agent:main",
        sessionId: "sess-001",
        args: { repo: "test", title: "test" },
        provenance: ["MCP_DESCRIPTION"],
      })

      const result = yield* authorizeAndExecuteEffect(
        {
          request,
          executeExact: () => {
            throw new Error("MCP executor should not have been reached")
          },
        },
        provider,
      )
      expect(result.status).toBe("DENIED")
    }))
  })
})

// ── P0 Boundary: granted tools execute ───────────────────────────────

describe("Runtime enforcement: seeded grants allow execution", () => {
  test("terminal with matching grant -> EXECUTED", async () => {
    await runWithDb(Effect.gen(function* () {
      const { db } = yield* Database.Service
      const store = new SqliteGrantStore({ db })

      const grant: CapabilityGrant = {
        id: "cap-terminal",
        schemaVersion: "1",
        principal: { kind: "agent", id: "agent:main" },
        issuer: { kind: "user", id: "user:owner" },
        actions: ["process.execute"],
        resources: [{ kind: "process", pattern: "*" }],
        constraints: {},
        delegation: { allowed: false, maximumDepth: 0, currentDepth: 0 },
        status: "ACTIVE",
        createdEventId: "evt-seed",
      }
      yield* store.putGrant(grant)

      const provider = new SessionPolicyProvider(store, {
        principalId: "agent:main",
        sessionId: "sess-001",
        workspaceTrust: "TRUSTED",
      }, undefined, "LEGACY_COMPAT")

      const request = buildAuthorizationRequest({
        toolName: "terminal",
        principalId: "agent:main",
        sessionId: "sess-001",
        args: { command: "bun test" },
        executable: "bun",
      })

      const result = yield* authorizeAndExecuteEffect(
        {
          request,
          executeExact: () => "tool-executed",
        },
        provider,
      )
      expect(result.status).toBe("EXECUTED")
      if (result.status === "EXECUTED") {
        expect(result.value).toBe("tool-executed")
      }
    }))
  })

  test("write_file without filesystem.write grant -> DENIED", async () => {
    await runWithDb(Effect.gen(function* () {
      const { db } = yield* Database.Service
      const store = new SqliteGrantStore({ db })

      const grant: CapabilityGrant = {
        id: "cap-terminal-only",
        schemaVersion: "1",
        principal: { kind: "agent", id: "agent:main" },
        issuer: { kind: "user", id: "user:owner" },
        actions: ["process.execute"],
        resources: [{ kind: "process", pattern: "*" }],
        constraints: {},
        delegation: { allowed: false, maximumDepth: 0, currentDepth: 0 },
        status: "ACTIVE",
        createdEventId: "evt-seed",
      }
      yield* store.putGrant(grant)

      const provider = new SessionPolicyProvider(store, {
        principalId: "agent:main",
        sessionId: "sess-001",
        workspaceTrust: "TRUSTED",
      }, undefined, "LEGACY_COMPAT")

      const request = buildAuthorizationRequest({
        toolName: "write_file",
        principalId: "agent:main",
        sessionId: "sess-001",
        args: { path: "/tmp/test" },
      })

      const result = yield* authorizeAndExecuteEffect(
        {
          request,
          executeExact: () => {
            throw new Error("should not execute")
          },
        },
        provider,
      )
      expect(result.status).toBe("DENIED")
    }))
  })

  test("CRITICAL action (git_push) -> APPROVAL_REQUIRED even with grant", async () => {
    await runWithDb(Effect.gen(function* () {
      const { db } = yield* Database.Service
      const store = new SqliteGrantStore({ db })

      const grant: CapabilityGrant = {
        id: "cap-push",
        schemaVersion: "1",
        principal: { kind: "agent", id: "agent:main" },
        issuer: { kind: "user", id: "user:owner" },
        actions: ["git.push"],
        resources: [{ kind: "git", pattern: "*" }],
        constraints: {},
        delegation: { allowed: false, maximumDepth: 0, currentDepth: 0 },
        status: "ACTIVE",
        createdEventId: "evt-seed",
      }
      yield* store.putGrant(grant)

      const provider = new SessionPolicyProvider(store, {
        principalId: "agent:main",
        sessionId: "sess-001",
        workspaceTrust: "TRUSTED",
      }, undefined, "LEGACY_COMPAT")

      const request = buildAuthorizationRequest({
        toolName: "git_push",
        principalId: "agent:main",
        sessionId: "sess-001",
        args: {},
      })

      const result = yield* authorizeAndExecuteEffect(
        {
          request,
          executeExact: () => {
            throw new Error("should not execute")
          },
        },
        provider,
      )
      expect(result.status).toBe("APPROVAL_REQUIRED")
    }))
  })
})

// ── P0 Boundary: revocation is immediate ─────────────────────────────

describe("Runtime enforcement: immediate revocation", () => {
  test("revoke grant -> next call is DENIED", async () => {
    await runWithDb(Effect.gen(function* () {
      const { db } = yield* Database.Service
      const store = new SqliteGrantStore({ db })

      const grant: CapabilityGrant = {
        id: "cap-revocable",
        schemaVersion: "1",
        principal: { kind: "agent", id: "agent:main" },
        issuer: { kind: "user", id: "user:owner" },
        actions: ["process.execute"],
        resources: [{ kind: "process", pattern: "*" }],
        constraints: {},
        delegation: { allowed: false, maximumDepth: 0, currentDepth: 0 },
        status: "ACTIVE",
        createdEventId: "evt-seed",
      }
      yield* store.putGrant(grant)

      const provider = new SessionPolicyProvider(store, {
        principalId: "agent:main",
        sessionId: "sess-001",
        workspaceTrust: "TRUSTED",
      }, undefined, "LEGACY_COMPAT")

      const request = buildAuthorizationRequest({
        toolName: "terminal",
        principalId: "agent:main",
        sessionId: "sess-001",
        args: {},
        executable: "bun",
      })

      // First call: should succeed
      const r1 = yield* authorizeAndExecuteEffect(
        { request, executeExact: () => "first" },
        provider,
      )
      expect(r1.status).toBe("EXECUTED")

      // Revoke
      yield* store.revokeGrant("cap-revocable", "evt-revoke")

      // Second call: must be denied
      const r2 = yield* authorizeAndExecuteEffect(
        { request, executeExact: () => "second" },
        provider,
      )
      expect(r2.status).toBe("DENIED")
    }))
  })
})

// ── P0 Boundary: storage failure is fail-closed ──────────────────────

describe("Runtime enforcement: storage failure -> DENY", () => {
  test("broken database -> all tools DENIED", async () => {
    const store = {
      getGrantsForPrincipal: () => Effect.fail({ _tag: "CapabilityGrantStoreError" as const, cause: new Error("connection lost") }),
      getGrantsForWorkspace: () => Effect.fail({ _tag: "CapabilityGrantStoreError" as const, cause: new Error("connection lost") }),
      putGrant: () => Effect.void,
      revokeGrant: () => Effect.succeed(false),
      exhaustGrant: () => Effect.succeed(false),
    }

    const provider = new SessionPolicyProvider(store as any, {
      principalId: "agent:main",
      sessionId: "sess-001",
      workspaceTrust: "TRUSTED",
    }, undefined, "LEGACY_COMPAT")

    const request = buildAuthorizationRequest({
      toolName: "terminal",
      principalId: "agent:main",
      sessionId: "sess-001",
      args: {},
    })

    const result = await Effect.runPromise(authorizeAndExecuteEffect(
      {
        request,
        executeExact: () => {
          throw new Error("should not execute")
        },
      },
      provider,
    ))
    expect(result.status).toBe("DENIED")
  })
})
