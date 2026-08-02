import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { Database } from "@arcana/core/database/database"
import { SqliteGrantStore } from "@arcana/core/capability/grant-store-sqlite"
import { revokeWithCascade, type RuntimeGrantStore } from "@arcana/core/capability/runtime-delegation"
import {
  OPERATOR_REVOKE,
  PARENT_REVOKED,
  revokeCapabilityWithCascade,
} from "@arcana/engine/session/capability-revocation"
import type { CapabilityGrant } from "@arcana/core/capability/types"

const sessionId = "session-revoke-sqlite"

function makeGrant(overrides: Partial<CapabilityGrant> = {}): CapabilityGrant {
  return {
    id: "cap-parent",
    schemaVersion: "1",
    principal: { kind: "agent", id: "agent:main" },
    issuer: { kind: "policy", id: "test" },
    actions: ["filesystem.read"],
    resources: [{ kind: "file", pattern: "**" }],
    constraints: { sessionId },
    delegation: { allowed: true, maximumDepth: 2, currentDepth: 0 },
    status: "ACTIVE",
    createdEventId: "evt-parent",
    ...overrides,
  }
}

describe("capability revocation cascade (SQLite store)", () => {
  test("revokes the parent and its descendant with durable evidence, leaving siblings untouched", async () => {
    const emitted: Array<{ capabilityId: string; reason: string }> = []
    await Effect.runPromise(
      Effect.gen(function* () {
        const database = yield* Database.Service
        const store = new SqliteGrantStore(database)

        yield* store.putGrant(makeGrant({ id: "cap-parent" }))
        yield* store.putGrant(
          makeGrant({
            id: "cap-child",
            issuer: { kind: "parent_capability", id: "cap-parent" },
            delegation: { allowed: false, maximumDepth: 0, currentDepth: 1 },
          }),
        )
        yield* store.putGrant(
          makeGrant({
            id: "cap-sibling",
            delegation: { allowed: false, maximumDepth: 0, currentDepth: 0 },
          }),
        )

        const result = yield* revokeCapabilityWithCascade(
          {
            loadGrant: (capabilityId) =>
              store.getGrantById(capabilityId).pipe(Effect.catch(() => Effect.succeed(null))),
            revokeCascade: (grantId, revokedEventId) =>
              // CAST BOUNDARY #9 — revokeWithCascade needs RuntimeGrantStore's
              // transaction member but only uses getAllGrants + updateStatus.
              revokeWithCascade(
                grantId,
                store as unknown as RuntimeGrantStore,
                revokedEventId,
              ).pipe(Effect.catch(() => Effect.succeed({ revokedIds: [] as string[] }))),
            emitRevoked: ({ capabilityId, reason }) => {
              emitted.push({ capabilityId, reason })
              return Effect.void
            },
          },
          { sessionId, capabilityId: "cap-parent" },
        )

        expect([...result.revokedIds].sort()).toEqual(["cap-child", "cap-parent"])
        expect(emitted).toEqual([
          { capabilityId: "cap-parent", reason: OPERATOR_REVOKE },
          { capabilityId: "cap-child", reason: PARENT_REVOKED },
        ])

        const parent = yield* store.getGrantById("cap-parent")
        const child = yield* store.getGrantById("cap-child")
        const sibling = yield* store.getGrantById("cap-sibling")
        expect(parent?.status).toBe("REVOKED")
        expect(child?.status).toBe("REVOKED")
        expect(sibling?.status).toBe("ACTIVE")
        expect(parent?.revokedEventId).toContain("evt-capability-revoked:")
      }).pipe(Effect.provide(Database.layerFromPath(":memory:"))),
    )
  })
})
