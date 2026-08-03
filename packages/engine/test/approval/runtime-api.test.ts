/**
 * Mounted-runtime conformance for the runtime approval contract
 * (contracts/approval-api.v1.yaml), exercised through the workspace and
 * session authority boundary:
 *
 *  - The authoritative workspace is the session-bound directory (x-arcana-session)
 *    or the trusted local runtime directory. Query/header directories never
 *    grant authority.
 *  - Decisions carry the operator's authorized workspace scope (never wildcard).
 */
import { afterEach, describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import fs from "fs/promises"
import path from "path"
import type { ApprovalRecord } from "@arcana/core/crypto/approval-lifecycle"
import { Session } from "@/session/session"
import { approvalStoreForWorkspace } from "../../src/approval/command"
import { desktopSubscriberRegistry } from "../../src/approval/desktop-subscribers"
import { TestInstance, provideInstance, tmpdirScoped } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { httpApiLayer, requestInDirectory } from "../server/httpapi-layer"

const it = testEffect(Layer.mergeAll(Session.defaultLayer, httpApiLayer))

const fixture = {
  approvalId: "appr_fixture_1",
  requestHash: "hash-fixture-abc-123",
  contractRevision: 1,
  version: 1,
}

/** Boot the instance for `directory` and create a session bound to it. */
const seedWorkspace = (directory: string) =>
  Effect.gen(function* () {
    yield* Effect.promise(() => fs.mkdir(path.join(directory, ".arcana"), { recursive: true }))
    const info = yield* Session.Service.use((svc) => svc.create({}))
    return { directory, sessionId: info.id }
  })

const seedRecord = (
  directory: string,
  sessionId: string,
  overrides: Partial<ApprovalRecord> = {},
) =>
  Effect.gen(function* () {
    const record: ApprovalRecord = {
      approvalId: fixture.approvalId,
      version: fixture.version,
      sessionId,
      workspaceId: directory,
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
const seedDesktopApproval = (directory: string, sessionId: string, overrides: Partial<ApprovalRecord> = {}) =>
  Effect.gen(function* () {
    const record = yield* seedRecord(directory, sessionId, { route: "DESKTOP_REQUIRED", ...overrides })
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

function requestAsSession(
  route: string,
  directory: string,
  sessionId: string,
  init: RequestInit = {},
) {
  const headers = new Headers(init.headers)
  headers.set("x-arcana-session", sessionId)
  return requestInDirectory(route, directory, { ...init, headers })
}

describe("runtime API: /approvals contract conformance", () => {
  it.instance("GET /approvals lists durable records for the routed workspace", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const ws = yield* seedWorkspace(test.directory)
      const seeded = yield* seedRecord(ws.directory, ws.sessionId)
      const response = yield* requestAsSession("/approvals", ws.directory, ws.sessionId)
      expect(response.status).toBe(200)
      const body = (yield* json(response)) as ApprovalRecord[]
      expect(body.map((r) => r.approvalId)).toContain(seeded.approvalId)
      expect(body[0]).toHaveProperty("requestHash")
    }),
  )

  it.instance("GET /approvals/:id returns one record; missing records 404", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const ws = yield* seedWorkspace(test.directory)
      const seeded = yield* seedRecord(ws.directory, ws.sessionId)
      const ok = yield* requestAsSession(`/approvals/${seeded.approvalId}`, ws.directory, ws.sessionId)
      expect(ok.status).toBe(200)
      expect(((yield* json(ok)) as ApprovalRecord).approvalId).toBe(seeded.approvalId)

      const missing = yield* requestAsSession("/approvals/does-not-exist", ws.directory, ws.sessionId)
      expect(missing.status).toBe(404)
    }),
  )

  it.instance("POST /approvals/:id/approve transitions PENDING to APPROVED with the derived operator", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const ws = yield* seedWorkspace(test.directory)
      const seeded = yield* seedDesktopApproval(ws.directory, ws.sessionId)
      const response = yield* requestAsSession(
        `/approvals/${seeded.approvalId}/approve`,
        ws.directory,
        ws.sessionId,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(commandBody()),
        },
      )
      expect(response.status).toBe(200)
      const body = (yield* json(response)) as { success: boolean; approval: ApprovalRecord }
      expect(body.success).toBe(true)
      expect(body.approval.state).toBe("APPROVED")
      expect(body.approval.approvedBy).toBe("local-operator")
    }),
  )

  it.instance("client-supplied approver identity cannot establish authority", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const ws = yield* seedWorkspace(test.directory)
      const seeded = yield* seedDesktopApproval(ws.directory, ws.sessionId)
      const response = yield* requestAsSession(
        `/approvals/${seeded.approvalId}/approve`,
        ws.directory,
        ws.sessionId,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(commandBody({ approvedBy: "root", operatorId: "root", actorUserId: "root" })),
        },
      )
      const record = approvalStoreForWorkspace(ws.directory).loadApproval(seeded.approvalId)!
      expect(record.approvedBy).not.toBe("root")
      if (response.status === 200) {
        const body = (yield* json(response)) as { success: boolean; approval: ApprovalRecord }
        if (body.success) expect(body.approval.approvedBy).toBe("local-operator")
      } else {
        expect(record.state).toBe("PENDING")
      }
    }),
  )

  it.instance("duplicate approve is refused deterministically; no second transition", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const ws = yield* seedWorkspace(test.directory)
      const seeded = yield* seedDesktopApproval(ws.directory, ws.sessionId)
      const first = yield* requestAsSession(
        `/approvals/${seeded.approvalId}/approve`,
        ws.directory,
        ws.sessionId,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(commandBody()),
        },
      )
      expect(((yield* json(first)) as { success: boolean }).success).toBe(true)

      const second = yield* requestAsSession(
        `/approvals/${seeded.approvalId}/approve`,
        ws.directory,
        ws.sessionId,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(commandBody()),
        },
      )
      const secondBody = (yield* json(second)) as { success: boolean; reason: string }
      expect(secondBody.success).toBe(false)
      expect(secondBody.reason).toContain("not actionable")
      expect(approvalStoreForWorkspace(ws.directory).loadApproval(seeded.approvalId)!.version).toBe(2)
    }),
  )

  it.instance("changed request hash is machine-readable stale and executes zero effects", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const ws = yield* seedWorkspace(test.directory)
      const seeded = yield* seedDesktopApproval(ws.directory, ws.sessionId)
      const response = yield* requestAsSession(
        `/approvals/${seeded.approvalId}/approve`,
        ws.directory,
        ws.sessionId,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(commandBody({ expectedRequestHash: "MUTATED-HASH" })),
        },
      )
      const body = (yield* json(response)) as { success: boolean; stale?: boolean }
      expect(body.success).toBe(false)
      expect(body.stale).toBe(true)
      expect(approvalStoreForWorkspace(ws.directory).loadApproval(seeded.approvalId)!.state).toBe("PENDING")
    }),
  )

  it.instance("changed version and contract revision are machine-readable stale", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const ws = yield* seedWorkspace(test.directory)
      const seeded = yield* seedDesktopApproval(ws.directory, ws.sessionId)
      const version = yield* requestAsSession(
        `/approvals/${seeded.approvalId}/approve`,
        ws.directory,
        ws.sessionId,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(commandBody({ expectedVersion: 99 })),
        },
      )
      expect((yield* json(version)) as { stale: boolean }).toMatchObject({ success: false, stale: true })

      const revision = yield* requestAsSession(
        `/approvals/${seeded.approvalId}/approve`,
        ws.directory,
        ws.sessionId,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(commandBody({ expectedContractRevision: 99 })),
        },
      )
      expect((yield* json(revision)) as { stale: boolean }).toMatchObject({ success: false, stale: true })
      expect(approvalStoreForWorkspace(ws.directory).loadApproval(seeded.approvalId)!.state).toBe("PENDING")
    }),
  )

  it.instance("POST /approvals/:id/deny denies without executing", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const ws = yield* seedWorkspace(test.directory)
      const seeded = yield* seedDesktopApproval(ws.directory, ws.sessionId)
      const response = yield* requestAsSession(
        `/approvals/${seeded.approvalId}/deny`,
        ws.directory,
        ws.sessionId,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(commandBody()),
        },
      )
      const body = (yield* json(response)) as { success: boolean; approval: ApprovalRecord }
      expect(body.success).toBe(true)
      expect(body.approval.state).toBe("DENIED")
    }),
  )

  it.instance("POST /approvals/:id/revoke invalidates; zero effects can ever claim", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const ws = yield* seedWorkspace(test.directory)
      const seeded = yield* seedDesktopApproval(ws.directory, ws.sessionId)
      const response = yield* requestAsSession(
        `/approvals/${seeded.approvalId}/revoke`,
        ws.directory,
        ws.sessionId,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(commandBody()),
        },
      )
      const body = (yield* json(response)) as { success: boolean; approval: ApprovalRecord }
      expect(body.success).toBe(true)
      expect(body.approval.state).toBe("INVALIDATED")

      const { SqliteScopedApprovalStore } = yield* Effect.promise(() =>
        import("@arcana/core/crypto/scoped-approval-adapter"),
      )
      const scopedStore = new SqliteScopedApprovalStore(`${ws.directory}/.arcana/approvals.db`)
      const claim = yield* scopedStore
        .atomicClaim(seeded.approvalId, "exec-after-revoke", "evt", new Date().toISOString())
        .pipe(Effect.ensuring(Effect.sync(() => scopedStore.close())))
      expect(claim).toBeNull()
    }),
  )

  it.instance("session A cannot approve session B's approval via the runtime API", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const wsA = yield* seedWorkspace(test.directory)
      const dirB = yield* tmpdirScoped()
      const wsB = yield* provideInstance(dirB)(seedWorkspace(dirB))
      const sessionB = yield* seedDesktopApproval(wsB.directory, wsB.sessionId)
      const response = yield* requestAsSession(
        `/approvals/${sessionB.approvalId}/approve`,
        wsA.directory,
        wsA.sessionId,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(commandBody()),
        },
      )
      const body = (yield* json(response)) as { success: boolean; reason: string }
      expect(body.success).toBe(false)
      expect(body.reason).toBe("approval not found")
      expect(approvalStoreForWorkspace(wsB.directory).loadApproval(sessionB.approvalId)!.state).toBe("PENDING")
    }),
  )

  it.instance("CENTRAL_REQUIRED approvals reject local decisions through the HTTP surface too", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const ws = yield* seedWorkspace(test.directory)
      const seeded = yield* seedRecord(ws.directory, ws.sessionId, { route: "CENTRAL_REQUIRED" })
      const response = yield* requestAsSession(
        `/approvals/${seeded.approvalId}/approve`,
        ws.directory,
        ws.sessionId,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(commandBody()),
        },
      )
      const body = (yield* json(response)) as { success: boolean; reason: string }
      expect(body.success).toBe(false)
      expect(body.reason).toBe("approval requires central authority")
    }),
  )

  it.instance("LOCAL_TUI-default approvals cannot be decided from the DESKTOP runtime surface", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const ws = yield* seedWorkspace(test.directory)
      const seeded = yield* seedRecord(ws.directory, ws.sessionId)
      const response = yield* requestAsSession(
        `/approvals/${seeded.approvalId}/approve`,
        ws.directory,
        ws.sessionId,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(commandBody()),
        },
      )
      expect(response.status).toBe(200)
      const body = (yield* json(response)) as { success: boolean; reason: string }
      expect(body.success).toBe(false)
      expect(body.reason).toBe("approval requires the local TUI")
      expect(approvalStoreForWorkspace(ws.directory).loadApproval(seeded.approvalId)!.state).toBe("PENDING")
    }),
  )

  it.instance("desktop heartbeat registers a live subscriber; approval stays durable", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const ws = yield* seedWorkspace(test.directory)
      const seeded = yield* seedRecord(ws.directory, ws.sessionId, { route: "DESKTOP_REQUIRED" })
      const heartbeat = yield* requestAsSession(
        "/desktop/heartbeat",
        ws.directory,
        ws.sessionId,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ subscriberId: "desktop-test-1", deploymentMode: "LOCAL" }),
        },
      )
      expect(heartbeat.status).toBe(200)
      const result = (yield* json(heartbeat)) as { workspaceId: string; ttlMs: number }
      expect(result.workspaceId).toBe(ws.directory)
      expect(result.ttlMs).toBeGreaterThan(0)
      expect(desktopSubscriberRegistry().isOnline(ws.directory)).toBe(true)
      expect(approvalStoreForWorkspace(ws.directory).loadApproval(seeded.approvalId)!.state).toBe("PENDING")
    }),
  )

  it.instance("GET /sessions, GET /sessions/:id, and GET /proofs/:id answer the contract", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const ws = yield* seedWorkspace(test.directory)
      const sessions = yield* requestAsSession("/sessions", ws.directory, ws.sessionId)
      expect(sessions.status).toBe(200)
      const listed = (yield* json(sessions)) as Array<{ id: string }>
      expect(Array.isArray(listed)).toBe(true)
      expect(listed.map((item) => item.id)).toContain(ws.sessionId)

      const missingSession = yield* requestAsSession("/sessions/ses_missing", ws.directory, ws.sessionId)
      expect(missingSession.status).toBe(404)

      const missingProof = yield* requestAsSession("/proofs/ses_missing", ws.directory, ws.sessionId)
      expect(missingProof.status).toBe(404)
    }),
  )

  afterEach(() => {
    desktopSubscriberRegistry().prune(Date.now() + 100_000)
  })
})
