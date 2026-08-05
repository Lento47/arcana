/**
 * Audit PR-2: approval.detail — the durable approval record plus its VERIFIED
 * immutable request snapshot (action, resource, arguments, capability, policy
 * version). The runtime recomputes the canonical request hash and requires it
 * to equal the record's requestHash; missing or tampered snapshots FAIL CLOSED
 * with ApprovalSnapshotUnavailableError (422), never a silently stale snapshot.
 */
import { describe, expect } from "bun:test"
import { Database } from "bun:sqlite"
import { Effect, Layer } from "effect"
import fs from "fs/promises"
import path from "path"
import type { ApprovalRecord } from "@arcana/core/crypto/approval-lifecycle"
import type { AuthorizationRequest } from "@arcana/core/capability/types"
import { computeRequestHash } from "@arcana/core/capability/request-hash"
import { buildApprovalRequestSnapshot } from "@arcana/core/crypto/approval-request-snapshot"
import { Session } from "@/session/session"
import { approvalStoreForWorkspace } from "../../src/approval/command"
import { TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { httpApiLayer } from "../server/httpapi-layer"
import { requestAsSession } from "./workspace-isolation.test"

const it = testEffect(Layer.mergeAll(Session.defaultLayer, httpApiLayer))

const approvalId = "appr_detail_1"

function makeRequest(): AuthorizationRequest {
  return {
    schemaVersion: "1",
    requestId: "req-detail-1",
    principalId: "agent:main",
    sessionId: "sess-detail",
    tool: "git.push",
    action: "git.push",
    resource: { kind: "git", path: "origin/main", host: "github.com" },
    arguments: ["origin", "main"],
    provenance: ["SYSTEM_POLICY"],
    sensitivity: ["PRIVATE"],
    requestedAt: "2026-08-02T00:00:00.000Z",
    nonce: "nonce-detail",
  }
}

const args = {
  branch: "main",
  force: false,
  apiToken: "sk-live-abc123",
}

function makeRecord(directory: string, sessionId: string, requestHash: string): ApprovalRecord {
  return {
    approvalId,
    version: 1,
    sessionId,
    workspaceId: directory,
    requestHash,
    contractRevision: 1,
    principalId: "agent:main",
    state: "PENDING",
    route: "LOCAL_TUI",
    localFallbackAllowed: true,
    riskClass: "HIGH",
    expiresAt: "2099-01-01T00:00:00.000Z",
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  }
}

function json(response: { json: unknown }) {
  return (response as { json: Effect.Effect<unknown> }).json
}

describe("approval.detail: verified immutable request snapshot", () => {
  it.instance("returns the approval + verified snapshot with hash parity", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      yield* Effect.promise(() => fs.mkdir(path.join(test.directory, ".arcana"), { recursive: true }))
      const info = yield* Session.Service.use((svc) => svc.create({}))

      const request = makeRequest()
      const requestHash = computeRequestHash(request)
      const store = approvalStoreForWorkspace(test.directory)
      store.saveApproval(makeRecord(test.directory, info.id, requestHash))
      store.saveApprovalSnapshot({
        approvalId,
        request,
        args,
        snapshot: buildApprovalRequestSnapshot(
          request,
          { approvalId, requestHash, contractRevision: 1, riskClass: "HIGH" },
          args,
        ),
      })

      const response = yield* requestAsSession(
        `/api/session/${info.id}/approval/${approvalId}/detail`,
        test.directory,
        info.id,
      )
      expect(response.status).toBe(200)
      const body = (yield* json(response)) as {
        approval: ApprovalRecord
        snapshot: {
          requestHash: string
          action: string
          resource: string
          arguments: string
          capability: string
          policyVersion: string
          contractRevision: number
          riskClass: string
        }
        snapshotVerified: boolean
      }

      // Hash parity: the snapshot is bound to the exact record hash.
      expect(body.snapshotVerified).toBe(true)
      expect(body.approval.approvalId).toBe(approvalId)
      expect(body.snapshot.requestHash).toBe(requestHash)
      expect(body.snapshot.requestHash).toBe(body.approval.requestHash)
      // The snapshot commits to the full reviewable action.
      expect(body.snapshot.action).toBe("git.push")
      expect(body.snapshot.resource).toContain("kind=git")
      expect(body.snapshot.arguments).toContain('"branch":"main"')
      // Sensitive argument values are redacted with an explicit marker.
      expect(body.snapshot.arguments).not.toContain("sk-live-abc123")
      expect(body.snapshot.arguments).toContain('"redacted":true')
      expect(body.snapshot.capability).toBe(`approval-cap-${approvalId}`)
      expect(body.snapshot.contractRevision).toBe(1)
      expect(body.snapshot.riskClass).toBe("HIGH")
    }),
  )

  it.instance("fails closed (422 snapshot_missing) when the record has no snapshot", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      yield* Effect.promise(() => fs.mkdir(path.join(test.directory, ".arcana"), { recursive: true }))
      const info = yield* Session.Service.use((svc) => svc.create({}))

      const request = makeRequest()
      const requestHash = computeRequestHash(request)
      approvalStoreForWorkspace(test.directory).saveApproval(makeRecord(test.directory, info.id, requestHash))

      const response = yield* requestAsSession(
        `/api/session/${info.id}/approval/${approvalId}/detail`,
        test.directory,
        info.id,
      )
      expect(response.status).toBe(422)
      const body = (yield* json(response)) as { reason: string }
      expect(body.reason).toBe("snapshot_missing")
    }),
  )

  it.instance("fails closed (422 snapshot_tampered) when the stored projection was changed", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      yield* Effect.promise(() => fs.mkdir(path.join(test.directory, ".arcana"), { recursive: true }))
      const info = yield* Session.Service.use((svc) => svc.create({}))

      const request = makeRequest()
      const requestHash = computeRequestHash(request)
      const store = approvalStoreForWorkspace(test.directory)
      store.saveApproval(makeRecord(test.directory, info.id, requestHash))
      store.saveApprovalSnapshot({
        approvalId,
        request,
        args,
        snapshot: buildApprovalRequestSnapshot(
          request,
          { approvalId, requestHash, contractRevision: 1, riskClass: "HIGH" },
          args,
        ),
      })

      // Corrupt the stored projection through an independent connection.
      const raw = new Database(path.join(test.directory, ".arcana", "approvals.db"))
      raw.run("UPDATE approval_request_snapshots SET snapshot_json = ? WHERE approval_id = ?", ['{"forged":true}', approvalId])
      raw.close()

      const response = yield* requestAsSession(
        `/api/session/${info.id}/approval/${approvalId}/detail`,
        test.directory,
        info.id,
      )
      expect(response.status).toBe(422)
      const body = (yield* json(response)) as { reason: string }
      expect(body.reason).toBe("snapshot_tampered")
    }),
  )

  it.instance("returns 404 for an unknown approval", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      yield* Effect.promise(() => fs.mkdir(path.join(test.directory, ".arcana"), { recursive: true }))
      const info = yield* Session.Service.use((svc) => svc.create({}))

      const response = yield* requestAsSession(
        `/api/session/${info.id}/approval/appr_does_not_exist/detail`,
        test.directory,
        info.id,
      )
      expect(response.status).toBe(404)
    }),
  )
})
