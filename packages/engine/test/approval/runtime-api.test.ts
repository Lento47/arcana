/**
 * Mounted-runtime conformance for the runtime approval contract
 * (contracts/approval-api.v1.yaml). Requests and expected responses are the
 * shared fixture suite (contracts/fixtures/runtime-approval.v1.json), which
 * the generated SDK client test consumes as well.
 */
import { afterEach, describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import fs from "fs/promises"
import path from "path"
import type { ApprovalRecord } from "@arcana/core/crypto/approval-lifecycle"
import { Session } from "@/session/session"
import { approvalStoreForWorkspace } from "../../src/approval/command"
import { desktopSubscriberRegistry } from "../../src/approval/desktop-subscribers"
import { tmpdirScoped } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { httpApiLayer, requestInDirectory } from "../server/httpapi-layer"

const it = testEffect(Layer.mergeAll(Session.defaultLayer, httpApiLayer))

const fixture = {
  approvalId: "appr_fixture_1",
  requestHash: "hash-fixture-abc-123",
  contractRevision: 1,
  version: 1,
}

const seedRecord = (directory: string, overrides: Partial<ApprovalRecord> = {}) =>
  Effect.gen(function* () {
    yield* Effect.promise(() => fs.mkdir(path.join(directory, ".arcana"), { recursive: true }))
    const record: ApprovalRecord = {
      approvalId: fixture.approvalId,
      version: fixture.version,
      sessionId: "sess-a",
      workspaceId: "sess-a",
      requestHash: fixture.requestHash,
      contractRevision: fixture.contractRevision,
      state: "PENDING",
      expiresAt: "2099-01-01T00:00:00.000Z",
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      ...overrides,
    }
    approvalStoreForWorkspace(directory).saveApproval(record)
    return record
  })

/** Desktop-routed approval + a live Desktop subscriber: the runtime surface may decide it. */
const seedDesktopApproval = (directory: string, overrides: Partial<ApprovalRecord> = {}) =>
  Effect.gen(function* () {
    const record = yield* seedRecord(directory, { route: "DESKTOP_REQUIRED", ...overrides })
    desktopSubscriberRegistry().heartbeat({
      subscriberId: "runtime-test-desktop",
      workspaceId: directory,
      deploymentMode: "LOCAL",
    })
    return record
  })

function commandBody(extra: Record<string, unknown> = {}) {
  return {
    expectedVersion: fixture.version,
    expectedRequestHash: fixture.requestHash,
    expectedContractRevision: fixture.contractRevision,
    ...extra,
  }
}

function json(response: { json: unknown }) {
  return (response as { json: Effect.Effect<unknown> }).json
}

describe("runtime API: /approvals contract conformance", () => {
  it.live("GET /approvals lists durable records for the routed workspace", () =>
    Effect.gen(function* () {
      const tmp = yield* tmpdirScoped()
      const seeded = yield* seedRecord(tmp)
      const response = yield* requestInDirectory("/approvals", tmp)
      expect(response.status).toBe(200)
      const body = (yield* json(response)) as ApprovalRecord[]
      expect(body.map((r) => r.approvalId)).toContain(seeded.approvalId)
      expect(body[0]).toHaveProperty("requestHash")
    }),
  )

  it.live("GET /approvals/:id returns one record; missing records 404", () =>
    Effect.gen(function* () {
      const tmp = yield* tmpdirScoped()
      const seeded = yield* seedRecord(tmp)
      const ok = yield* requestInDirectory(`/approvals/${seeded.approvalId}`, tmp)
      expect(ok.status).toBe(200)
      expect(((yield* json(ok)) as ApprovalRecord).approvalId).toBe(seeded.approvalId)

      const missing = yield* requestInDirectory("/approvals/does-not-exist", tmp)
      expect(missing.status).toBe(404)
    }),
  )

  it.live("POST /approvals/:id/approve transitions PENDING to APPROVED with the derived operator", () =>
    Effect.gen(function* () {
      const tmp = yield* tmpdirScoped()
      const seeded = yield* seedDesktopApproval(tmp)
      const response = yield* requestInDirectory(`/approvals/${seeded.approvalId}/approve`, tmp, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(commandBody()),
      })
      expect(response.status).toBe(200)
      const body = (yield* json(response)) as { success: boolean; approval: ApprovalRecord }
      expect(body.success).toBe(true)
      expect(body.approval.state).toBe("APPROVED")
      expect(body.approval.approvedBy).toBe("local-operator")
    }),
  )

  it.live("client-supplied approver identity cannot establish authority", () =>
    Effect.gen(function* () {
      const tmp = yield* tmpdirScoped()
      const seeded = yield* seedDesktopApproval(tmp)
      const response = yield* requestInDirectory(`/approvals/${seeded.approvalId}/approve`, tmp, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(commandBody({ approvedBy: "root", operatorId: "root", actorUserId: "root" })),
      })
      const record = approvalStoreForWorkspace(tmp).loadApproval(seeded.approvalId)!
      expect(record.approvedBy).not.toBe("root")
      if (response.status === 200) {
        const body = (yield* json(response)) as { success: boolean; approval: ApprovalRecord }
        if (body.success) expect(body.approval.approvedBy).toBe("local-operator")
      } else {
        expect(record.state).toBe("PENDING")
      }
    }),
  )

  it.live("duplicate approve is refused deterministically; no second transition", () =>
    Effect.gen(function* () {
      const tmp = yield* tmpdirScoped()
      const seeded = yield* seedDesktopApproval(tmp)
      const first = yield* requestInDirectory(`/approvals/${seeded.approvalId}/approve`, tmp, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(commandBody()),
      })
      expect(((yield* json(first)) as { success: boolean }).success).toBe(true)

      const second = yield* requestInDirectory(`/approvals/${seeded.approvalId}/approve`, tmp, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(commandBody()),
      })
      const secondBody = (yield* json(second)) as { success: boolean; reason: string }
      expect(secondBody.success).toBe(false)
      expect(secondBody.reason).toContain("not actionable")
      expect(approvalStoreForWorkspace(tmp).loadApproval(seeded.approvalId)!.version).toBe(2)
    }),
  )

  it.live("changed request hash is machine-readable stale and executes zero effects", () =>
    Effect.gen(function* () {
      const tmp = yield* tmpdirScoped()
      const seeded = yield* seedDesktopApproval(tmp)
      const response = yield* requestInDirectory(`/approvals/${seeded.approvalId}/approve`, tmp, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(commandBody({ expectedRequestHash: "MUTATED-HASH" })),
      })
      const body = (yield* json(response)) as { success: boolean; stale?: boolean }
      expect(body.success).toBe(false)
      expect(body.stale).toBe(true)
      expect(approvalStoreForWorkspace(tmp).loadApproval(seeded.approvalId)!.state).toBe("PENDING")
    }),
  )

  it.live("changed version and contract revision are machine-readable stale", () =>
    Effect.gen(function* () {
      const tmp = yield* tmpdirScoped()
      const seeded = yield* seedDesktopApproval(tmp)
      const version = yield* requestInDirectory(`/approvals/${seeded.approvalId}/approve`, tmp, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(commandBody({ expectedVersion: 99 })),
      })
      expect((yield* json(version)) as { stale: boolean }).toMatchObject({ success: false, stale: true })

      const revision = yield* requestInDirectory(`/approvals/${seeded.approvalId}/approve`, tmp, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(commandBody({ expectedContractRevision: 99 })),
      })
      expect((yield* json(revision)) as { stale: boolean }).toMatchObject({ success: false, stale: true })
      expect(approvalStoreForWorkspace(tmp).loadApproval(seeded.approvalId)!.state).toBe("PENDING")
    }),
  )

  it.live("POST /approvals/:id/deny denies without executing", () =>
    Effect.gen(function* () {
      const tmp = yield* tmpdirScoped()
      const seeded = yield* seedDesktopApproval(tmp)
      const response = yield* requestInDirectory(`/approvals/${seeded.approvalId}/deny`, tmp, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(commandBody()),
      })
      const body = (yield* json(response)) as { success: boolean; approval: ApprovalRecord }
      expect(body.success).toBe(true)
      expect(body.approval.state).toBe("DENIED")
    }),
  )

  it.live("POST /approvals/:id/revoke invalidates; zero effects can ever claim", () =>
    Effect.gen(function* () {
      const tmp = yield* tmpdirScoped()
      const seeded = yield* seedDesktopApproval(tmp)
      const response = yield* requestInDirectory(`/approvals/${seeded.approvalId}/revoke`, tmp, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(commandBody()),
      })
      const body = (yield* json(response)) as { success: boolean; approval: ApprovalRecord }
      expect(body.success).toBe(true)
      expect(body.approval.state).toBe("INVALIDATED")

      const { SqliteScopedApprovalStore } = yield* Effect.promise(() =>
        import("@arcana/core/crypto/scoped-approval-adapter"),
      )
      const scopedStore = new SqliteScopedApprovalStore(`${tmp}/.arcana/approvals.db`)
      const claim = yield* scopedStore
        .atomicClaim(seeded.approvalId, "exec-after-revoke", "evt", new Date().toISOString())
        .pipe(Effect.ensuring(Effect.sync(() => scopedStore.close())))
      expect(claim).toBeNull()
    }),
  )

  it.live("session A cannot approve session B's approval via the runtime API", () =>
    Effect.gen(function* () {
      const tmp = yield* tmpdirScoped()
      const sessionB = yield* seedDesktopApproval(tmp, { sessionId: "sess-b", workspaceId: "sess-b" })
      const response = yield* requestInDirectory(`/approvals/${sessionB.approvalId}/approve`, tmp, {
        method: "POST",
        headers: { "content-type": "application/json", "x-arcana-session": "sess-a" },
        body: JSON.stringify(commandBody()),
      })
      const body = (yield* json(response)) as { success: boolean; reason: string }
      expect(body.success).toBe(false)
      expect(body.reason).toBe("approval belongs to another session")
      expect(approvalStoreForWorkspace(tmp).loadApproval(sessionB.approvalId)!.state).toBe("PENDING")
    }),
  )

  it.live("CENTRAL_REQUIRED approvals reject local decisions through the HTTP surface too", () =>
    Effect.gen(function* () {
      const tmp = yield* tmpdirScoped()
      const seeded = yield* seedRecord(tmp, { route: "CENTRAL_REQUIRED" })
      const response = yield* requestInDirectory(`/approvals/${seeded.approvalId}/approve`, tmp, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(commandBody()),
      })
      const body = (yield* json(response)) as { success: boolean; reason: string }
      expect(body.success).toBe(false)
      expect(body.reason).toBe("approval requires central authority")
    }),
  )

  it.live("LOCAL_TUI-default approvals cannot be decided from the DESKTOP runtime surface", () =>
    Effect.gen(function* () {
      const tmp = yield* tmpdirScoped()
      const seeded = yield* seedRecord(tmp)
      const response = yield* requestInDirectory(`/approvals/${seeded.approvalId}/approve`, tmp, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(commandBody()),
      })
      expect(response.status).toBe(200)
      const body = (yield* json(response)) as { success: boolean; reason: string }
      expect(body.success).toBe(false)
      expect(body.reason).toBe("approval requires the local TUI")
      expect(approvalStoreForWorkspace(tmp).loadApproval(seeded.approvalId)!.state).toBe("PENDING")
    }),
  )

  it.live("desktop heartbeat registers a live subscriber; approval stays durable", () =>
    Effect.gen(function* () {
      const tmp = yield* tmpdirScoped()
      const seeded = yield* seedRecord(tmp, { route: "DESKTOP_REQUIRED" })
      const heartbeat = yield* requestInDirectory("/desktop/heartbeat", tmp, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subscriberId: "desktop-test-1", deploymentMode: "LOCAL" }),
      })
      expect(heartbeat.status).toBe(200)
      const result = (yield* json(heartbeat)) as { workspaceId: string; ttlMs: number }
      expect(result.workspaceId).toBe(tmp)
      expect(result.ttlMs).toBeGreaterThan(0)
      expect(desktopSubscriberRegistry().isOnline(tmp)).toBe(true)
      expect(approvalStoreForWorkspace(tmp).loadApproval(seeded.approvalId)!.state).toBe("PENDING")
    }),
  )

  it.live("GET /sessions, GET /sessions/:id, and GET /proofs/:id answer the contract", () =>
    Effect.gen(function* () {
      const tmp = yield* tmpdirScoped()
      const sessions = yield* requestInDirectory("/sessions", tmp)
      expect(sessions.status).toBe(200)
      expect(Array.isArray(yield* json(sessions))).toBe(true)

      const missingSession = yield* requestInDirectory("/sessions/ses_missing", tmp)
      expect(missingSession.status).toBe(404)

      const missingProof = yield* requestInDirectory("/proofs/ses_missing", tmp)
      expect(missingProof.status).toBe(404)
    }),
  )

  afterEach(() => {
    desktopSubscriberRegistry().prune(Date.now() + 100_000)
  })
})
