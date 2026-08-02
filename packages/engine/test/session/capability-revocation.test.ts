import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import {
  OPERATOR_REVOKE,
  PARENT_REVOKED,
  revokeCapabilityWithCascade,
  type CapabilityRevocationDeps,
} from "@arcana/engine/session/capability-revocation"
import type { CapabilityGrant } from "@arcana/core/capability/types"

function makeGrant(overrides: Partial<CapabilityGrant> = {}): CapabilityGrant {
  return {
    id: "cap-root",
    schemaVersion: "1",
    principal: { kind: "agent", id: "agent:main" },
    issuer: { kind: "policy", id: "test" },
    actions: ["filesystem.read"],
    resources: [{ kind: "file", pattern: "**" }],
    constraints: { sessionId: "session-revoke" },
    delegation: { allowed: true, maximumDepth: 2, currentDepth: 0 },
    status: "ACTIVE",
    createdEventId: "evt-root",
    ...overrides,
  }
}

function makeDeps(overrides: Partial<CapabilityRevocationDeps> = {}) {
  const calls = { loads: 0, cascades: 0, emits: 0 }
  const deps: CapabilityRevocationDeps = {
    loadGrant: () => {
      calls.loads++
      return Effect.succeed(makeGrant())
    },
    revokeCascade: () => {
      calls.cascades++
      return Effect.succeed({ revokedIds: ["cap-root", "cap-child"] })
    },
    emitRevoked: () => {
      calls.emits++
      return Effect.void
    },
    ...overrides,
  }
  return { deps, calls }
}

describe("capability revocation workflow", () => {
  test("revokes the grant and descendants, emitting evidence with reasons", async () => {
    const emitted: Array<{ capabilityId: string; reason: string }> = []
    const { deps, calls } = makeDeps({
      emitRevoked: ({ capabilityId, reason }) => {
        emitted.push({ capabilityId, reason })
        return Effect.void
      },
    })

    const result = await Effect.runPromise(
      revokeCapabilityWithCascade(deps, {
        sessionId: "session-revoke",
        capabilityId: "cap-root",
      }),
    )
    expect(result.revokedIds).toEqual(["cap-root", "cap-child"])
    expect(calls.cascades).toBe(1)
    expect(emitted).toEqual([
      { capabilityId: "cap-root", reason: OPERATOR_REVOKE },
      { capabilityId: "cap-child", reason: PARENT_REVOKED },
    ])
  })

  test("is a no-op for an unknown grant", async () => {
    const { deps, calls } = makeDeps({
      loadGrant: () => Effect.succeed(null),
    })
    const result = await Effect.runPromise(
      revokeCapabilityWithCascade(deps, {
        sessionId: "session-revoke",
        capabilityId: "missing",
      }),
    )
    expect(result.revokedIds).toEqual([])
    expect(calls.cascades).toBe(0)
    expect(calls.emits).toBe(0)
  })

  test("is a no-op for a grant owned by a different session", async () => {
    const { deps, calls } = makeDeps({
      loadGrant: () =>
        Effect.succeed(makeGrant({ constraints: { sessionId: "session-other" } })),
    })
    const result = await Effect.runPromise(
      revokeCapabilityWithCascade(deps, {
        sessionId: "session-revoke",
        capabilityId: "cap-root",
      }),
    )
    expect(result.revokedIds).toEqual([])
    expect(calls.cascades).toBe(0)
    expect(calls.emits).toBe(0)
  })

  test("is a no-op for an already-revoked grant", async () => {
    const { deps, calls } = makeDeps({
      loadGrant: () => Effect.succeed(makeGrant({ status: "REVOKED" })),
    })
    const result = await Effect.runPromise(
      revokeCapabilityWithCascade(deps, {
        sessionId: "session-revoke",
        capabilityId: "cap-root",
      }),
    )
    expect(result.revokedIds).toEqual([])
    expect(calls.cascades).toBe(0)
    expect(calls.emits).toBe(0)
  })
})
