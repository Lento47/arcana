/**
 * Workspace and session isolation for the runtime API (ARC-REV-005/006).
 *
 * The authoritative workspace comes from the session-bound directory. Query
 * parameters are narrowing selectors at most; they can never broaden an
 * authenticated operator's scope across workspaces.
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

const seedWorkspace = (directory: string) =>
  Effect.gen(function* () {
    yield* Effect.promise(() => fs.mkdir(path.join(directory, ".arcana"), { recursive: true }))
    const info = yield* Session.Service.use((svc) => svc.create({}))
    return { directory, sessionId: info.id }
  })

const seedApproval = (directory: string, sessionId: string, overrides: Partial<ApprovalRecord> = {}) =>
  Effect.gen(function* () {
    const record: ApprovalRecord = {
      approvalId: `appr_${directory.replace(/[^a-zA-Z0-9]/g, "").slice(-8)}`,
      version: 1,
      sessionId,
      workspaceId: directory,
      requestHash: `hash-${sessionId}`,
      contractRevision: 1,
      state: "PENDING",
      route: "DESKTOP_REQUIRED",
      expiresAt: "2099-01-01T00:00:00.000Z",
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      ...overrides,
    }
    approvalStoreForWorkspace(directory).saveApproval(record)
    desktopSubscriberRegistry().heartbeat({
      subscriberId: "isolation-test-desktop",
      workspaceId: directory,
      deploymentMode: "LOCAL",
    })
    return record
  })

function commandBody(record: ApprovalRecord) {
  return {
    expectedVersion: record.version,
    expectedRequestHash: record.requestHash,
    expectedContractRevision: record.contractRevision,
  }
}

function json(response: { json: unknown }) {
  return (response as { json: Effect.Effect<unknown> }).json
}

export function requestAsSession(route: string, directory: string, sessionId: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  headers.set("x-arcana-session", sessionId)
  return requestInDirectory(route, directory, { ...init, headers })
}

describe("runtime API workspace isolation", () => {
  it.instance("operator A cannot list workspace B sessions", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const wsA = yield* seedWorkspace(test.directory)
      const dirB = yield* tmpdirScoped()
      const wsB = yield* provideInstance(dirB)(seedWorkspace(dirB))

      const response = yield* requestAsSession("/sessions", wsA.directory, wsA.sessionId)
      expect(response.status).toBe(200)
      const sessions = (yield* json(response)) as Array<{ id: string; directory: string }>
      expect(sessions.map((item) => item.id)).toContain(wsA.sessionId)
      expect(sessions.map((item) => item.id)).not.toContain(wsB.sessionId)
      for (const session of sessions) {
        expect(session.directory).toBe(wsA.directory)
      }
    }),
  )

  it.instance("operator A cannot decide workspace B approvals, even with a directory query", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const wsA = yield* seedWorkspace(test.directory)
      const dirB = yield* tmpdirScoped()
      const wsB = yield* provideInstance(dirB)(seedWorkspace(dirB))
      const recordB = yield* seedApproval(wsB.directory, wsB.sessionId)

      const response = yield* requestAsSession(
        `/approvals/${recordB.approvalId}/approve?directory=${encodeURIComponent(wsB.directory)}`,
        wsA.directory,
        wsA.sessionId,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(commandBody(recordB)),
        },
      )
      const body = (yield* json(response)) as { success: boolean; reason: string }
      expect(body.success).toBe(false)
      expect(body.reason).toBe("approval not found")
      expect(approvalStoreForWorkspace(wsB.directory).loadApproval(recordB.approvalId)!.state).toBe("PENDING")
    }),
  )

  it.instance("operator A cannot retrieve workspace B proofs", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const wsA = yield* seedWorkspace(test.directory)
      const dirB = yield* tmpdirScoped()
      const wsB = yield* provideInstance(dirB)(seedWorkspace(dirB))

      const response = yield* requestAsSession(`/proofs/${wsB.sessionId}`, wsA.directory, wsA.sessionId)
      expect(response.status).toBe(404)
    }),
  )

  it.instance("query parameters cannot broaden authenticated scope for approval reads", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const wsA = yield* seedWorkspace(test.directory)
      const dirB = yield* tmpdirScoped()
      const wsB = yield* provideInstance(dirB)(seedWorkspace(dirB))
      const recordB = yield* seedApproval(wsB.directory, wsB.sessionId)

      // A's operator asks for B's directory explicitly; the response must
      // stay scoped to A's approval store.
      const response = yield* requestAsSession(
        `/approvals?directory=${encodeURIComponent(wsB.directory)}`,
        wsA.directory,
        wsA.sessionId,
      )
      expect(response.status).toBe(200)
      const approvals = (yield* json(response)) as Array<{ approvalId: string }>
      expect(approvals.map((item) => item.approvalId)).not.toContain(recordB.approvalId)

      const single = yield* requestAsSession(
        `/approvals/${recordB.approvalId}?directory=${encodeURIComponent(wsB.directory)}`,
        wsA.directory,
        wsA.sessionId,
      )
      expect(single.status).toBe(404)
    }),
  )

  it.instance("within one workspace, session A still cannot decide session B's approval", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const ws = yield* seedWorkspace(test.directory)
      const sessionB = yield* Session.Service.use((svc) => svc.create({}))
      const recordB = yield* seedApproval(ws.directory, sessionB.id)

      const response = yield* requestAsSession(
        `/approvals/${recordB.approvalId}/approve`,
        ws.directory,
        ws.sessionId,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(commandBody(recordB)),
        },
      )
      const body = (yield* json(response)) as { success: boolean; reason: string }
      expect(body.success).toBe(false)
      expect(body.reason).toBe("approval belongs to another session")
      expect(approvalStoreForWorkspace(ws.directory).loadApproval(recordB.approvalId)!.state).toBe("PENDING")
    }),
  )

  afterEach(() => {
    desktopSubscriberRegistry().prune(Date.now() + 100_000)
  })
})
