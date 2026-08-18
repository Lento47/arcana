/**
 * approval.resend — re-broadcast a PENDING approval to its decision surface
 * after a missed notification (Arcana Desktop offline at creation, reconnected
 * after a drop, etc.).
 *
 * Contract:
 *   - Strictly idempotent: the durable store is only READ, never written.
 *     A re-send can never create a duplicate record, bump the version, or
 *     race a CAS guard.
 *   - PENDING only: a settled approval (APPROVED/DENIED/CONSUMED/EXPIRED/
 *     INVALIDATED) has no pending request to re-send and returns
 *     success:false.
 *   - Missing records 404.
 *   - The response reports whether a live Desktop subscriber exists, so the
 *     operator sees "re-sent, desktop offline" instead of silent loss.
 */
import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import fs from "fs/promises"
import path from "path"
import type { ApprovalRecord } from "@arcana/core/crypto/approval-lifecycle"
import { Session } from "@/session/session"
import { approvalStoreForWorkspace } from "../../src/approval/command"
import { TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { httpApiLayer, requestInDirectory } from "../server/httpapi-layer"
import { requestAsSession } from "./workspace-isolation.test"

const it = testEffect(Layer.mergeAll(Session.defaultLayer, httpApiLayer))

const fixture = {
  approvalId: "appr_resend_1",
  requestHash: "hash-resend-abc-123",
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
    yield* Effect.promise(() => fs.mkdir(path.join(directory, ".arcana"), { recursive: true }))
    const record: ApprovalRecord = {
      approvalId: fixture.approvalId,
      version: fixture.version,
      sessionId,
      workspaceId: directory,
      requestHash: fixture.requestHash,
      contractRevision: fixture.contractRevision,
      state: "PENDING",
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

const resendUrl = (sessionId: string, approvalId: string) =>
  `/api/session/${sessionId}/approval/${approvalId}/resend`

const heartbeat = (tmp: string) =>
  requestInDirectory("/desktop/heartbeat", tmp, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ subscriberId: `desktop-${Math.random().toString(36).slice(2)}`, deploymentMode: "LOCAL" }),
  })

function json(response: { json: unknown }) {
  return (response as { json: Effect.Effect<unknown> }).json
}

describe("approval.resend: idempotent re-notification", () => {
  it.instance("re-publishes a PENDING approval without touching the durable record", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const ws = yield* seedWorkspace(test.directory)
      const seeded = yield* seedRecord(ws.directory, ws.sessionId)

      const response = yield* requestAsSession(
        resendUrl(ws.sessionId, seeded.approvalId),
        ws.directory,
        ws.sessionId,
        { method: "POST" },
      )
      expect(response.status).toBe(200)
      const body = (yield* json(response)) as {
        success: boolean
        approval: ApprovalRecord
        resendAt: string
        desktopOnline: boolean
      }
      expect(body.success).toBe(true)
      expect(body.approval.approvalId).toBe(seeded.approvalId)
      expect(body.approval.state).toBe("PENDING")
      // The record is unchanged: same version, same hash — no duplicate.
      expect(body.approval.version).toBe(fixture.version)
      expect(body.approval.requestHash).toBe(fixture.requestHash)
      expect(typeof body.resendAt).toBe("string")
      expect(body.desktopOnline).toBe(false)

      // The store still holds exactly one record at the original version.
      const records = approvalStoreForWorkspace(ws.directory).loadAllApprovals()
      expect(records.filter((r) => r.approvalId === seeded.approvalId)).toHaveLength(1)
      expect(records[0].version).toBe(fixture.version)
    }),
  )

  it.instance("a second re-send is a no-op on the store (never duplicates)", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const ws = yield* seedWorkspace(test.directory)
      const seeded = yield* seedRecord(ws.directory, ws.sessionId)

      yield* requestAsSession(resendUrl(ws.sessionId, seeded.approvalId), ws.directory, ws.sessionId, {
        method: "POST",
      })
      yield* requestAsSession(resendUrl(ws.sessionId, seeded.approvalId), ws.directory, ws.sessionId, {
        method: "POST",
      })

      const records = approvalStoreForWorkspace(ws.directory).loadAllApprovals()
      expect(records).toHaveLength(1)
      expect(records[0].version).toBe(fixture.version)
    }),
  )

  it.instance("reports desktopOnline when a live Desktop subscriber exists", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const ws = yield* seedWorkspace(test.directory)
      const seeded = yield* seedRecord(ws.directory, ws.sessionId)
      yield* heartbeat(ws.directory)

      const response = yield* requestAsSession(
        resendUrl(ws.sessionId, seeded.approvalId),
        ws.directory,
        ws.sessionId,
        { method: "POST" },
      )
      const body = (yield* json(response)) as { success: boolean; desktopOnline: boolean }
      expect(body.success).toBe(true)
      expect(body.desktopOnline).toBe(true)
    }),
  )

  it.instance("rejects settled approvals — nothing pending to re-send", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const ws = yield* seedWorkspace(test.directory)
      const settled = yield* seedRecord(ws.directory, ws.sessionId, { state: "CONSUMED" })

      const response = yield* requestAsSession(
        resendUrl(ws.sessionId, settled.approvalId),
        ws.directory,
        ws.sessionId,
        { method: "POST" },
      )
      expect(response.status).toBe(200)
      const body = (yield* json(response)) as { success: boolean; reason: string }
      expect(body.success).toBe(false)
      expect(body.reason).toContain("nothing to re-send")
    }),
  )

  it.instance("404 for an unknown approval id", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const ws = yield* seedWorkspace(test.directory)
      const response = yield* requestAsSession(resendUrl(ws.sessionId, "does-not-exist"), ws.directory, ws.sessionId, {
        method: "POST",
      })
      expect(response.status).toBe(404)
    }),
  )
})
