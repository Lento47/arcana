import { describe, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Database } from "bun:sqlite"
import { Effect } from "effect"
import type { AuthorizationRequest } from "../capability/types"
import { POLICY_VERSION } from "../capability/types"
import { computeRequestHash } from "../capability/request-hash"
import { SqliteApprovalStore } from "./approval-store-sqlite"
import { SqliteScopedApprovalStore } from "./scoped-approval-adapter"
import {
  buildApprovalRequestSnapshot,
  canonicalJson,
  redactSensitiveArguments,
  resourceToCanonicalString,
  type ApprovalRequestSnapshot,
} from "./approval-request-snapshot"

function tmpDbPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "arcana-approval-snapshot-"))
  return path.join(dir, ".arcana", "approvals.db")
}

function makeRequest(overrides: Partial<AuthorizationRequest> = {}): AuthorizationRequest {
  return {
    schemaVersion: "1",
    requestId: "req-1",
    principalId: "agent:main",
    sessionId: "sess-a",
    tool: "git.push",
    action: "git.push",
    resource: { kind: "git", path: "origin/main", host: "github.com" },
    arguments: ["origin", "main"],
    provenance: ["SYSTEM_POLICY"],
    sensitivity: ["PRIVATE"],
    requestedAt: "2026-08-02T00:00:00.000Z",
    nonce: "nonce-1",
    ...overrides,
  }
}

const args = {
  branch: "main",
  force: false,
  remote: "origin",
  apiToken: "sk-live-abc123",
  headers: { authorization: "Bearer deadbeef" },
}

describe("ApprovalRequestSnapshot builder", () => {
  test("projects the exact reviewable request with defaults", () => {
    const request = makeRequest()
    const hash = computeRequestHash(request)
    const snapshot = buildApprovalRequestSnapshot(
      request,
      { approvalId: "appr_1", requestHash: hash, contractRevision: 1, riskClass: "HIGH" },
      args,
    )

    expect(snapshot.schemaVersion).toBe("1")
    expect(snapshot.approvalId).toBe("appr_1")
    expect(snapshot.requestHash).toBe(hash)
    expect(snapshot.action).toBe("git.push")
    expect(snapshot.resource).toContain("kind=git")
    expect(snapshot.resource).toContain("path=origin/main")
    expect(snapshot.principalId).toBe("agent:main")
    expect(snapshot.capability).toBe("approval-cap-appr_1")
    expect(snapshot.policyVersion).toBe(POLICY_VERSION)
    expect(snapshot.contractRevision).toBe(1)
    expect(snapshot.riskClass).toBe("HIGH")
  })

  test("canonical json is deterministic", () => {
    const a = canonicalJson({ b: 1, a: { z: true, y: [3, 2, 1] } })
    const b = canonicalJson({ a: { y: [3, 2, 1], z: true }, b: 1 })
    expect(a).toBe(b)
  })

  test("resource render preserves every selector field", () => {
    const s = resourceToCanonicalString({ kind: "network", host: "api.example.com", path: "/v1/users" })
    expect(s).toBe("kind=network path=/v1/users host=api.example.com")
  })
})

describe("sensitive argument redaction", () => {
  test("replaces sensitive values with explicit markers, never drops fields", () => {
    const redacted = redactSensitiveArguments(args) as Record<string, unknown>

    expect(redacted.branch).toBe("main")
    expect(redacted.remote).toBe("origin")
    expect((redacted.apiToken as any).redacted).toBe(true)
    expect((redacted.apiToken as any).path).toBe("apiToken")
    expect((redacted.headers as any).authorization.redacted).toBe(true)
    expect((redacted.headers as any).authorization.path).toBe("headers.authorization")
    expect(Object.keys(redacted)).toContain("apiToken")
    expect(Object.keys((redacted.headers as any))).toContain("authorization")
  })

  test("redaction is deterministic (same input, same marker)", () => {
    expect(canonicalJson(redactSensitiveArguments(args))).toBe(canonicalJson(redactSensitiveArguments(args)))
  })

  test("snapshot arguments never contain the raw secret", () => {
    const snapshot = buildApprovalRequestSnapshot(
      makeRequest(),
      { approvalId: "appr_1", requestHash: computeRequestHash(makeRequest()), contractRevision: 1, riskClass: "LOW" },
      args,
    )
    expect(snapshot.arguments).not.toContain("sk-live-abc123")
    expect(snapshot.arguments).not.toContain("Bearer deadbeef")
    expect(snapshot.arguments).toContain('"redacted":true')
  })
})

describe("ApprovalRequestSnapshot verification (fail closed)", () => {
  function seed(dbPath: string): { record: ReturnType<typeof makeRecord>; snapshot: ApprovalRequestSnapshot } {
    const request = makeRequest()
    const requestHash = computeRequestHash(request)
    const snapshot = buildApprovalRequestSnapshot(
      request,
      { approvalId: "appr_1", requestHash, contractRevision: 1, riskClass: "HIGH" },
      args,
    )
    const record = makeRecord("appr_1", requestHash)
    const store = new SqliteApprovalStore(dbPath)
    store.saveApproval(record)
    store.saveApprovalSnapshot({ approvalId: "appr_1", request, args, snapshot })
    store.close()
    return { record, snapshot }
  }

  test("a stored snapshot verifies and returns the freshly rebuilt projection", () => {
    const dbPath = tmpDbPath()
    fs.mkdirSync(path.dirname(dbPath), { recursive: true })
    const { record } = seed(dbPath)

    const store = new SqliteApprovalStore(dbPath)
    const verification = store.getVerifiedSnapshot("appr_1", record)
    store.close()

    expect(verification.status).toBe("ok")
    if (verification.status === "ok") {
      expect(verification.snapshot.requestHash).toBe(record.requestHash)
      expect(verification.snapshot.arguments).toContain('"redacted":true')
      expect(verification.snapshot.arguments).not.toContain("sk-live-abc123")
    }

    fs.rmSync(path.dirname(path.dirname(dbPath)), { recursive: true, force: true })
  })

  test("a missing snapshot fails closed", () => {
    const dbPath = tmpDbPath()
    fs.mkdirSync(path.dirname(dbPath), { recursive: true })
    const request = makeRequest()
    const requestHash = computeRequestHash(request)
    const store = new SqliteApprovalStore(dbPath)
    store.saveApproval(makeRecord("appr_none", requestHash))

    const verification = store.getVerifiedSnapshot("appr_none", makeRecord("appr_none", requestHash))
    store.close()

    expect(verification.status).toBe("missing")

    fs.rmSync(path.dirname(path.dirname(dbPath)), { recursive: true, force: true })
  })

  test("a request hash mismatch (changed request) fails closed", () => {
    const dbPath = tmpDbPath()
    fs.mkdirSync(path.dirname(dbPath), { recursive: true })
    const { snapshot } = seed(dbPath)

    const store = new SqliteApprovalStore(dbPath)
    // Record's requestHash disagrees with the stored immutable request.
    const record = makeRecord("appr_1", "0".repeat(64))
    const verification = store.getVerifiedSnapshot("appr_1", record)
    store.close()

    expect(verification.status).toBe("tampered")
    expect(snapshot.requestHash).not.toBe("0".repeat(64))

    fs.rmSync(path.dirname(path.dirname(dbPath)), { recursive: true, force: true })
  })

  test("a tampered stored projection fails closed", () => {
    const dbPath = tmpDbPath()
    fs.mkdirSync(path.dirname(dbPath), { recursive: true })
    const { record } = seed(dbPath)

    // Corrupt the stored projection through an independent connection.
    const raw = new Database(dbPath)
    raw.run("UPDATE approval_request_snapshots SET snapshot_json = ? WHERE approval_id = 'appr_1'", ['{"schemaVersion":"1","approvalId":"appr_1","forged":true}'])
    raw.close()

    const store = new SqliteApprovalStore(dbPath)
    const verification = store.getVerifiedSnapshot("appr_1", record)
    store.close()

    expect(verification.status).toBe("tampered")

    fs.rmSync(path.dirname(path.dirname(dbPath)), { recursive: true, force: true })
  })

  test("a tampered stored args projection fails closed", () => {
    const dbPath = tmpDbPath()
    fs.mkdirSync(path.dirname(dbPath), { recursive: true })
    const { record } = seed(dbPath)

    const raw = new Database(dbPath)
    raw.run("UPDATE approval_request_snapshots SET args_json = ? WHERE approval_id = 'appr_1'", [JSON.stringify({ branch: "pwned" })])
    raw.close()

    const store = new SqliteApprovalStore(dbPath)
    const verification = store.getVerifiedSnapshot("appr_1", record)
    store.close()

    expect(verification.status).toBe("tampered")

    fs.rmSync(path.dirname(path.dirname(dbPath)), { recursive: true, force: true })
  })
})

describe("atomic snapshot write (putApprovalWithSnapshot)", () => {
  test("writes approval + snapshot in one transaction and verifies on read", () => {
    const dbPath = tmpDbPath()
    fs.mkdirSync(path.dirname(dbPath), { recursive: true })

    const request = makeRequest()
    const requestHash = computeRequestHash(request)
    const scoped = new SqliteScopedApprovalStore(dbPath)
    Effect.runSync(
      scoped.putApprovalWithSnapshot(
        {
          id: "appr_atomic",
          requestId: "appr_atomic",
          requestHash,
          principalId: request.principalId,
          sessionId: request.sessionId,
          decision: "PENDING",
          actions: ["git.push"],
          resource: request.resource,
          contractRevision: 1,
          riskClass: "HIGH",
          maxUses: 1,
          usesConsumed: 0,
          expiresAt: "2099-01-01T00:00:00.000Z",
          createdEventId: "evt-atomic",
        },
        {
          request,
          args,
          snapshot: buildApprovalRequestSnapshot(
            request,
            { approvalId: "appr_atomic", requestHash, contractRevision: 1, riskClass: "HIGH" },
            args,
          ),
        },
      ),
    )
    scoped.close()

    const lifecycle = new SqliteApprovalStore(dbPath)
    const record = lifecycle.loadApproval("appr_atomic")!
    expect(record.requestHash).toBe(requestHash)
    const verification = lifecycle.getVerifiedSnapshot("appr_atomic", record)
    expect(verification.status).toBe("ok")
    lifecycle.close()

    fs.rmSync(path.dirname(path.dirname(dbPath)), { recursive: true, force: true })
  })

  test("snapshot survives store reopen and stays verified (immutability)", () => {
    const dbPath = tmpDbPath()
    fs.mkdirSync(path.dirname(dbPath), { recursive: true })

    const request = makeRequest()
    const requestHash = computeRequestHash(request)
    const scoped = new SqliteScopedApprovalStore(dbPath)
    Effect.runSync(
      scoped.putApprovalWithSnapshot(
        {
          id: "appr_restart",
          requestId: "appr_restart",
          requestHash,
          principalId: request.principalId,
          sessionId: request.sessionId,
          decision: "PENDING",
          actions: ["git.push"],
          resource: request.resource,
          contractRevision: 2,
          riskClass: "CRITICAL",
          maxUses: 1,
          usesConsumed: 0,
          expiresAt: "2099-01-01T00:00:00.000Z",
          createdEventId: "evt-restart",
        },
        {
          request,
          args,
          snapshot: buildApprovalRequestSnapshot(
            request,
            { approvalId: "appr_restart", requestHash, contractRevision: 2, riskClass: "CRITICAL" },
            args,
          ),
        },
      ),
    )
    scoped.close()

    // Restart: fresh store over the same file.
    const lifecycle = new SqliteApprovalStore(dbPath)
    const record = lifecycle.loadApproval("appr_restart")!
    const first = lifecycle.getVerifiedSnapshot("appr_restart", record)
    expect(first.status).toBe("ok")
    const second = lifecycle.getVerifiedSnapshot("appr_restart", record)
    expect(second.status).toBe("ok")
    if (first.status === "ok" && second.status === "ok") {
      expect(canonicalJson(first.snapshot)).toBe(canonicalJson(second.snapshot))
    }
    lifecycle.close()

    fs.rmSync(path.dirname(path.dirname(dbPath)), { recursive: true, force: true })
  })
})

function makeRecord(approvalId: string, requestHash: string) {
  return {
    approvalId,
    version: 1,
    sessionId: "sess-a",
    workspaceId: "ws-a",
    requestHash,
    contractRevision: 1,
    principalId: "agent:main",
    state: "PENDING" as const,
    riskClass: "HIGH" as const,
    expiresAt: "2099-01-01T00:00:00.000Z",
    updatedAt: "2026-08-02T00:00:00.000Z",
    createdAt: "2026-08-02T00:00:00.000Z",
  }
}
