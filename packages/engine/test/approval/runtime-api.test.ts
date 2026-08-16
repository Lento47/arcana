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
import { requestAsSession } from "./workspace-isolation.test"
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

/** Normalize a workspace path the way the subscriber registry stores it. */
const workspaceKey = (value: string) => value.replaceAll("\\", "/").replace(/\/+$/, "")

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
    // The store lives at <workspace>/.arcana/approvals.db; bare tmpdirs do
    // not carry the .arcana dir, so create it (seedWorkspace does the same).
    yield* Effect.promise(() => fs.mkdir(path.join(directory, ".arcana"), { recursive: true }))
    const record: ApprovalRecord = {
      approvalId: fixture.approvalId,
      version: fixture.version,
      sessionId,
      workspaceId: directory,
      requestHash: fixture.requestHash,
      contractRevision: fixture.contractRevision,
      state: "PENDING",
      // The mounted runtime binds commands to the authenticated surface
      // (LOCAL_TUI | DESKTOP | CENTRAL). The runtime API acts as the Desktop
      // surface, so command fixtures use a Desktop-routable route and a live
      // subscriber heartbeat.
      route: "DESKTOP_PREFERRED",
      localFallbackAllowed: true,
      expiresAt: "2099-01-01T00:00:00.000Z",
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      ...overrides,
    }
    approvalStoreForWorkspace(directory).saveApproval(record)
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

const heartbeat = (tmp: string) =>
  requestInDirectory("/desktop/heartbeat", tmp, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ subscriberId: `desktop-${Math.random().toString(36).slice(2)}`, deploymentMode: "LOCAL" }),
  })

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

  it.instance("GET /approvals/:id/affordances returns the runtime-derived read model", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const ws = yield* seedWorkspace(test.directory)
      const seeded = yield* seedRecord(ws.directory, ws.sessionId)
      yield* heartbeat(ws.directory)
      const response = yield* requestInDirectory(
        `/approvals/${seeded.approvalId}/affordances`,
        ws.directory,
      )
      expect(response.status).toBe(200)
      const body = (yield* json(response)) as Array<{
        action: string
        state: string
        surface: string
        expectedVersion?: number
        destructive?: boolean
      }>
      const approve = body.find((item) => item.action === "approve")
      expect(approve?.state).toBe("available")
      expect(approve?.surface).toBe("DESKTOP")
      expect(approve?.expectedVersion).toBe(fixture.version)
      expect(approve?.destructive).toBe(false)
      const revoke = body.find((item) => item.action === "revoke")
      expect(revoke?.destructive).toBe(true)
      const inspect = body.find((item) => item.action === "inspect")
      expect(inspect?.state).toBe("available")
    }),
  )

  it.instance("POST /approvals/:id/approve transitions PENDING to APPROVED with the derived operator", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const ws = yield* seedWorkspace(test.directory)
      const seeded = yield* seedRecord(ws.directory, ws.sessionId)
      yield* heartbeat(ws.directory)
      const response = yield* requestInDirectory(`/approvals/${seeded.approvalId}/approve`, ws.directory, {
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

  it.instance("operator receives exactly the authorized workspace, bound durably to the decision", () =>
    Effect.gen(function* () {
      // Regression for the release-blocking operatorIdentity defect: the
      // identity must carry the authoritatively resolved workspace (never the
      // undefined variable, never a wildcard fallback). The lifecycle refuses a
      // decision when operator.workspaceScope does not include the record's
      // workspaceId, so a passing approve proves the scope matched the
      // authorized workspace, and the durable record proves where it landed.
      const test = yield* TestInstance
      const ws = yield* seedWorkspace(test.directory)
      const seeded = yield* seedRecord(ws.directory, ws.sessionId)
      yield* heartbeat(ws.directory)
      const response = yield* requestAsSession(`/approvals/${seeded.approvalId}/approve`, ws.directory, ws.sessionId, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(commandBody()),
      })
      const body = (yield* json(response)) as { success: boolean; reason?: string; approval?: ApprovalRecord }
      expect(body.success, `approve refused: reason=${body.reason}`).toBe(true)
      expect(body.approval?.state).toBe("APPROVED")
      // The authorized workspace is the session's directory (a tmpdir), never
      // the process cwd and never a wildcard: assert the durable binding.
      expect(ws.directory).not.toBe(process.cwd())
      const record = approvalStoreForWorkspace(ws.directory).loadApproval(seeded.approvalId)!
      expect(record.state).toBe("APPROVED")
      expect(record.workspaceId).toBe(ws.directory)
    }),
  )

  it.instance("client-supplied approver identity cannot establish authority", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const ws = yield* seedWorkspace(test.directory)
      const seeded = yield* seedRecord(ws.directory, ws.sessionId)
      yield* heartbeat(ws.directory)
      const response = yield* requestInDirectory(`/approvals/${seeded.approvalId}/approve`, ws.directory, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(commandBody({ approvedBy: "root", operatorId: "root", actorUserId: "root" })),
      })
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
      const seeded = yield* seedRecord(ws.directory, ws.sessionId)
      yield* heartbeat(ws.directory)
      const first = yield* requestInDirectory(`/approvals/${seeded.approvalId}/approve`, ws.directory, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(commandBody()),
      })
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
      const seeded = yield* seedRecord(ws.directory, ws.sessionId)
      yield* heartbeat(ws.directory)
      const response = yield* requestInDirectory(`/approvals/${seeded.approvalId}/approve`, ws.directory, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(commandBody({ expectedRequestHash: "MUTATED-HASH" })),
      })
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
      const seeded = yield* seedRecord(ws.directory, ws.sessionId)
      yield* heartbeat(ws.directory)
      const version = yield* requestInDirectory(`/approvals/${seeded.approvalId}/approve`, ws.directory, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(commandBody({ expectedVersion: 99 })),
      })
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
      const seeded = yield* seedRecord(ws.directory, ws.sessionId)
      yield* heartbeat(ws.directory)
      const response = yield* requestInDirectory(`/approvals/${seeded.approvalId}/deny`, ws.directory, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(commandBody()),
      })
      const body = (yield* json(response)) as { success: boolean; approval: ApprovalRecord }
      expect(body.success).toBe(true)
      expect(body.approval.state).toBe("DENIED")
    }),
  )

  it.instance("POST /approvals/:id/revoke invalidates; zero effects can ever claim", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const ws = yield* seedWorkspace(test.directory)
      const seeded = yield* seedRecord(ws.directory, ws.sessionId)
      yield* heartbeat(ws.directory)
      const response = yield* requestInDirectory(`/approvals/${seeded.approvalId}/revoke`, ws.directory, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(commandBody()),
      })
      const body = (yield* json(response)) as { success: boolean; approval: ApprovalRecord }
      expect(body.success).toBe(true)
      expect(body.approval.state).toBe("INVALIDATED")

      const claim = yield* Effect.promise(async () => {
        const { SqliteScopedApprovalStore } = await import("@arcana/core/crypto/scoped-approval-adapter")
        const store = new SqliteScopedApprovalStore(`${ws.directory}/.arcana/approvals.db`)
        try {
          return Effect.runPromise(
            store.atomicClaim(seeded.approvalId, "exec-after-revoke", "evt", new Date().toISOString()),
          )
        } finally {
          store.close()
        }
      })
      expect(claim).toBeNull()
    }),
  )

  it.instance("session A cannot approve session B's approval via the runtime API", () =>
    Effect.gen(function* () {
      const tmp = yield* tmpdirScoped()
      const sessionB = yield* seedRecord(tmp, "sess-b", { workspaceId: "sess-b" })
      const response = yield* requestInDirectory(`/approvals/${sessionB.approvalId}/approve`, tmp, {
        method: "POST",
        headers: { "content-type": "application/json", "x-arcana-session": "sess-a" },
        body: JSON.stringify(commandBody()),
      })
      const body = (yield* json(response)) as { success: boolean; reason: string }
      expect(body.success).toBe(false)
      // The record lives in the routed workspace and is found; the session
      // header is a restriction, so the command is refused with the precise
      // session-isolation reason (same contract as workspace-isolation).
      expect(body.reason).toBe("approval belongs to another session")
      expect(approvalStoreForWorkspace(tmp).loadApproval(sessionB.approvalId)!.state).toBe("PENDING")
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
      expect(result.workspaceId).toBe(workspaceKey(ws.directory))
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
    // Prune only genuinely stale subscribers (default now). Pruning with a
    // future timestamp would evict live Desktop subscribers registered by
    // concurrently-running tests and break their routing gate.
    desktopSubscriberRegistry().prune()
  })
})
