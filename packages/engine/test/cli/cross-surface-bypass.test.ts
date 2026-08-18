/**
 * BLK-CLI-05 — CLI/TUI cross-surface bypass adversarial suite.
 *
 * The CLI (`arcana` command) and the TUI share the same runtime approval
 * service (`submitApprovalCommand`). There is NO CLI-only command that mutates
 * approval state — every operator decision converges on the durable approval
 * pipeline through the engine HTTP API. This suite asserts that invariant
 * adversarially:
 *
 *  1. CLI path cannot bypass PEP — every mutate-approval endpoint routes
 *     through `submitApprovalCommand`; no CLI-only shortcut exists.
 *  2. Client-supplied identity fields (`actorUserId`, `approvedBy`,
 *     `tenantId`) are ignored — the engine derives the operator from session
 *     metadata, never from the request body.
 *  3. Session isolation — CLI session A cannot act on session B's pending
 *     approvals.
 *  4. Every CLI-reachable mutate-approval surface routes through
 *     `submitApprovalCommand` (both session-scoped and runtime API endpoints).
 *  5. Fail-closed — every denied/bypassed fixture ends in explicit rejection
 *     (no silent success).
 *
 * The two surfaces tested here are the ones a CLI-originated call can reach:
 *  - Session-scoped API:  POST /api/session/:sessionID/approval/:approvalID/command
 *  - Runtime API:         POST /approvals/:approvalID/approve|deny|revoke
 * Both drive the same `submitApprovalCommand` service with a surface-bound
 * routing gate. The TUI pins the session-API contract
 * (packages/tui/test/approval-http-bridge.test.ts); this suite pins the
 * CLI-facing contract.
 */
import { describe, expect, test } from "bun:test"
import { Effect, Layer } from "effect"
import fs from "fs/promises"
import path from "path"
import type { ApprovalRecord } from "@arcana/core/crypto/approval-lifecycle"
import { Session } from "@/session/session"
import {
  submitApprovalCommand,
  approvalStoreForWorkspace,
} from "../../src/approval/command"
import { desktopSubscriberRegistry } from "../../src/approval/desktop-subscribers"
import { TestInstance, tmpdirScoped } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { httpApiLayer, requestInDirectory } from "../server/httpapi-layer"
import { requestAsSession } from "../approval/workspace-isolation.test"

const it = testEffect(Layer.mergeAll(Session.defaultLayer, httpApiLayer))

const FIXTURE = {
  approvalId: "appr_bypass_1",
  requestHash: "hash-bypass-abc-123",
  contractRevision: 1,
  version: 1,
}

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
    // The session-scoped handler passes workspaceId = sessionID to
    // submitApprovalCommand; engine-created records are session-scoped, so
    // workspaceId matches sessionId (not the directory path).
    const record: ApprovalRecord = {
      approvalId: FIXTURE.approvalId,
      version: FIXTURE.version,
      sessionId,
      workspaceId: sessionId,
      requestHash: FIXTURE.requestHash,
      contractRevision: FIXTURE.contractRevision,
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

function commandBody(extra: Record<string, unknown> = {}) {
  return {
    expectedVersion: FIXTURE.version,
    expectedRequestHash: FIXTURE.requestHash,
    expectedContractRevision: FIXTURE.contractRevision,
    ...extra,
  }
}

function json(response: { json: unknown }) {
  return (response as { json: Effect.Effect<unknown> }).json
}

const registerDesktop = (directory: string) =>
  Effect.gen(function* () {
    desktopSubscriberRegistry().heartbeat({
      subscriberId: `desktop-${Math.random().toString(36).slice(2)}`,
      workspaceId: directory,
      deploymentMode: "LOCAL",
    })
  })

describe("BLK-CLI-05: CLI/TUI cross-surface bypass adversarial suite", () => {
  it.instance("CLI-facing session command endpoint routes through submitApprovalCommand (APPROVE)", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const ws = yield* seedWorkspace(test.directory)
      const seeded = yield* seedRecord(ws.directory, ws.sessionId)
      const response = yield* requestAsSession(
        `/api/session/${ws.sessionId}/approval/${seeded.approvalId}/command`,
        ws.directory,
        ws.sessionId,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ command: "APPROVE_ONCE", ...commandBody() }),
        },
      )
      const body = (yield* json(response)) as { success: boolean; approval: ApprovalRecord }
      expect(body.success).toBe(true)
      expect(body.approval.state).toBe("APPROVED")
      expect(body.approval.approvedBy).toBe("operator")
    }),
  )

  it.instance("CLI-facing session command endpoint routes through submitApprovalCommand (DENY)", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const ws = yield* seedWorkspace(test.directory)
      const seeded = yield* seedRecord(ws.directory, ws.sessionId)
      const response = yield* requestAsSession(
        `/api/session/${ws.sessionId}/approval/${seeded.approvalId}/command`,
        ws.directory,
        ws.sessionId,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ command: "DENY", ...commandBody() }),
        },
      )
      const body = (yield* json(response)) as { success: boolean; approval: ApprovalRecord }
      expect(body.success).toBe(true)
      expect(body.approval.state).toBe("DENIED")
    }),
  )

  it.instance("client-supplied approvedBy is ignored on the session command surface", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const ws = yield* seedWorkspace(test.directory)
      const seeded = yield* seedRecord(ws.directory, ws.sessionId)
      const response = yield* requestAsSession(
        `/api/session/${ws.sessionId}/approval/${seeded.approvalId}/command`,
        ws.directory,
        ws.sessionId,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            command: "APPROVE_ONCE",
            ...commandBody(),
            approvedBy: "root",
          }),
        },
      )
      const body = (yield* json(response)) as { success: boolean; approval: ApprovalRecord }
      if (body.success) {
        expect(body.approval.approvedBy).toBe("operator")
        expect(body.approval.approvedBy).not.toBe("root")
      }
      const stored = approvalStoreForWorkspace(ws.directory).loadApproval(seeded.approvalId)!
      expect(stored.approvedBy).not.toBe("root")
    }),
  )

  it.instance("client-supplied actorUserId is ignored on the session command surface", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const ws = yield* seedWorkspace(test.directory)
      const seeded = yield* seedRecord(ws.directory, ws.sessionId)
      const response = yield* requestAsSession(
        `/api/session/${ws.sessionId}/approval/${seeded.approvalId}/command`,
        ws.directory,
        ws.sessionId,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            command: "APPROVE_ONCE",
            ...commandBody(),
            actorUserId: "attacker",
          }),
        },
      )
      const body = (yield* json(response)) as { success: boolean; approval: ApprovalRecord }
      if (body.success) {
        expect(body.approval.approvedBy).toBe("operator")
        expect(body.approval.approvedBy).not.toBe("attacker")
      }
      const stored = approvalStoreForWorkspace(ws.directory).loadApproval(seeded.approvalId)!
      expect(stored.approvedBy).not.toBe("attacker")
    }),
  )

  it.instance("client-supplied tenantId does not broaden approval scope", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const ws = yield* seedWorkspace(test.directory)
      const seeded = yield* seedRecord(ws.directory, ws.sessionId)
      const response = yield* requestAsSession(
        `/api/session/${ws.sessionId}/approval/${seeded.approvalId}/command`,
        ws.directory,
        ws.sessionId,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            command: "APPROVE_ONCE",
            ...commandBody(),
            tenantId: "foreign-tenant",
          }),
        },
      )
      const body = (yield* json(response)) as { success: boolean; approval: ApprovalRecord }
      if (body.success) {
        expect(body.approval.workspaceId).not.toBe("foreign-tenant")
      }
      const stored = approvalStoreForWorkspace(ws.directory).loadApproval(seeded.approvalId)!
      expect(stored.workspaceId).not.toBe("foreign-tenant")
    }),
  )

  it.instance("session A cannot approve session B's pending approval via the runtime API", () =>
    Effect.gen(function* () {
      const tmp = yield* tmpdirScoped()
      const sessionB = yield* seedRecord(tmp, "sess-b", { workspaceId: "sess-b" })
      yield* registerDesktop(tmp)
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

  it.instance("session A cannot deny session B's pending approval via the session command surface", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const ws = yield* seedWorkspace(test.directory)
      const otherSess = yield* Session.Service.use((svc) => svc.create({}))
      const seeded = yield* seedRecord(ws.directory, otherSess.id)
      const response = yield* requestAsSession(
        `/api/session/${ws.sessionId}/approval/${seeded.approvalId}/command`,
        ws.directory,
        ws.sessionId,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ command: "DENY", ...commandBody() }),
        },
      )
      const body = (yield* json(response)) as { success: boolean; reason: string }
      expect(body.success).toBe(false)
      expect(body.reason).toBe("approval belongs to another session")
      expect(approvalStoreForWorkspace(ws.directory).loadApproval(seeded.approvalId)!.state).toBe("PENDING")
    }),
  )

  it.instance("desktop can approve a real session-scoped record via the runtime API", () =>
    Effect.gen(function* () {
      const tmp = yield* tmpdirScoped()
      const session = yield* Session.Service.use((svc) => svc.create({}))
      // Real engine-created records are session-scoped: workspace_id is the
      // session id, never the directory path. The runtime handler must bind
      // the operator service to the record's durable workspace identity,
      // otherwise every desktop decision fails with
      // "approval belongs to another workspace".
      const seeded = yield* seedRecord(tmp, session.id, {
        route: "DESKTOP_REQUIRED",
      })
      yield* registerDesktop(tmp)
      const response = yield* requestInDirectory(
        `/approvals/${seeded.approvalId}/approve`,
        tmp,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(commandBody()),
        },
      )
      const body = (yield* json(response)) as {
        success: boolean
        approval?: ApprovalRecord
        reason?: string
      }
      expect(body.success).toBe(true)
      if (body.success) expect(body.approval!.state).toBe("APPROVED")
      expect(approvalStoreForWorkspace(tmp).loadApproval(seeded.approvalId)!.state).toBe(
        "APPROVED",
      )
    }),
  )

  it.instance("desktop affordances resolve for a real session-scoped record", () =>
    Effect.gen(function* () {
      const tmp = yield* tmpdirScoped()
      const session = yield* Session.Service.use((svc) => svc.create({}))
      const seeded = yield* seedRecord(tmp, session.id, {
        route: "DESKTOP_PREFERRED",
      })
      yield* registerDesktop(tmp)
      const response = yield* requestInDirectory(
        `/approvals/${seeded.approvalId}/affordances`,
        tmp,
        { method: "GET" },
      )
      const body = (yield* json(response)) as unknown[]
      expect(Array.isArray(body)).toBe(true)
      expect(body.length).toBeGreaterThan(0)
      expect(JSON.stringify(body)).not.toContain("WORKSPACE_MISMATCH")
    }),
  )

  it.instance("LOCAL_TUI-routed approval rejects the DESKTOP surface (CLI cannot claim Desktop)", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const ws = yield* seedWorkspace(test.directory)
      const seeded = yield* seedRecord(ws.directory, ws.sessionId, {
        route: "LOCAL_TUI",
        workspaceId: ws.directory,
      })
      const response = yield* requestInDirectory(`/approvals/${seeded.approvalId}/approve`, ws.directory, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(commandBody()),
      })
      const body = (yield* json(response)) as { success: boolean; reason: string }
      expect(body.success).toBe(false)
      expect(body.reason).toBe("approval requires the local TUI")
      expect(approvalStoreForWorkspace(ws.directory).loadApproval(seeded.approvalId)!.state).toBe("PENDING")
    }),
  )

  it.instance("stale requestHash is rejected with machine-readable stale (CLI cannot replay)", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const ws = yield* seedWorkspace(test.directory)
      const seeded = yield* seedRecord(ws.directory, ws.sessionId, { workspaceId: ws.directory })
      yield* registerDesktop(ws.directory)
      const response = yield* requestInDirectory(`/approvals/${seeded.approvalId}/approve`, ws.directory, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(commandBody({ expectedRequestHash: "REPLAYED-HASH" })),
      })
      const body = (yield* json(response)) as { success: boolean; stale?: boolean }
      expect(body.success).toBe(false)
      expect(body.stale).toBe(true)
      expect(approvalStoreForWorkspace(ws.directory).loadApproval(seeded.approvalId)!.state).toBe("PENDING")
    }),
  )

  it.instance("duplicate approve is refused deterministically — no CLI double-spend", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const ws = yield* seedWorkspace(test.directory)
      const seeded = yield* seedRecord(ws.directory, ws.sessionId, { workspaceId: ws.directory })
      yield* registerDesktop(ws.directory)
      const first = yield* requestInDirectory(`/approvals/${seeded.approvalId}/approve`, ws.directory, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(commandBody()),
      })
      expect(((yield* json(first)) as { success: boolean }).success).toBe(true)
      const second = yield* requestInDirectory(`/approvals/${seeded.approvalId}/approve`, ws.directory, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(commandBody()),
      })
      const secondBody = (yield* json(second)) as { success: boolean; reason: string }
      expect(secondBody.success).toBe(false)
      expect(secondBody.reason).toContain("not actionable")
      expect(approvalStoreForWorkspace(ws.directory).loadApproval(seeded.approvalId)!.version).toBe(2)
    }),
  )

  it.instance("submitApprovalCommand accepts only an operator it is given — the HTTP handler derives it (never the body)", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const ws = yield* seedWorkspace(test.directory)
      const seeded = yield* seedRecord(ws.directory, ws.sessionId)
      const forgedOp = {
        operatorId: "forged-admin",
        authenticatedAt: new Date().toISOString(),
        roles: ["admin"],
        workspaceScope: [ws.sessionId],
      }
      const response = submitApprovalCommand({
        sessionId: ws.sessionId,
        approvalId: seeded.approvalId,
        command: {
          command: "APPROVE_ONCE",
          expectedVersion: seeded.version,
          expectedRequestHash: seeded.requestHash,
          expectedContractRevision: seeded.contractRevision,
        },
        surface: "LOCAL_TUI",
        workspaceCwd: ws.directory,
        workspaceId: ws.sessionId,
        operator: forgedOp,
      })
      expect(response.success).toBe(true)
      if (response.success) {
        expect(response.approval.approvedBy).toBe("forged-admin")
      }
    }),
  )

  it.instance("submitApprovalCommand refuses a mismatched surface even with a forged operator", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const ws = yield* seedWorkspace(test.directory)
      const seeded = yield* seedRecord(ws.directory, ws.sessionId, { route: "LOCAL_TUI" })
      const forgedOp = {
        operatorId: "forged-admin",
        authenticatedAt: new Date().toISOString(),
        roles: ["admin"],
        workspaceScope: [ws.sessionId],
      }
      const response = submitApprovalCommand({
        sessionId: ws.sessionId,
        approvalId: seeded.approvalId,
        command: {
          command: "APPROVE_ONCE",
          expectedVersion: seeded.version,
          expectedRequestHash: seeded.requestHash,
          expectedContractRevision: seeded.contractRevision,
        },
        surface: "DESKTOP",
        workspaceCwd: ws.directory,
        workspaceId: ws.sessionId,
        operator: forgedOp,
      })
      expect(response.success).toBe(false)
      if (!response.success) {
        expect(response.reason).toBe("approval requires the local TUI")
      }
      expect(approvalStoreForWorkspace(ws.directory).loadApproval(seeded.approvalId)!.state).toBe("PENDING")
    }),
  )

  test("CLI command registry has no standalone approval-mutating subcommand (invariant check)", async () => {
    const cmdDir = path.resolve(__dirname, "../../src/cli/cmd")
    const approvalPattern = /^(approve|deny|revoke|approval|permission|govern)\.ts$/
    const files = await fs.readdir(cmdDir)
    const approvalCommands = files.filter((f) => approvalPattern.test(f))
    expect(approvalCommands).toEqual([])
  })
})
