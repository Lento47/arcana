import { describe, expect, test } from "bun:test"
import type { ApprovalRecord } from "@arcana/core/crypto/approval-lifecycle"
import { HttpApprovalOperatorService } from "../src/shell/command-spine/approval-http-bridge"
import { createApprovalShellController } from "../src/shell/command-spine/approval-shell-controller"
import {
  approvalActionBindingsEnabled,
  approvalToSpineEntry,
  isApprovalActionable,
  isApprovalTerminal,
} from "../src/shell/command-spine/approval-spine-adapter"

const SESSION = { sessionId: "sess_1", workspaceId: "ws_1", operatorId: "local-operator" }

function baseApproval(overrides: Partial<ApprovalRecord> = {}): ApprovalRecord {
  return {
    approvalId: "appr_lifecycle_1",
    version: 1,
    sessionId: SESSION.sessionId,
    workspaceId: SESSION.workspaceId,
    requestHash: "request-hash-abc",
    contractRevision: 2,
    state: "PENDING",
    expiresAt: "2099-01-01T00:00:00.000Z",
    updatedAt: "2026-08-02T00:00:00.000Z",
    createdAt: "2026-08-02T00:00:00.000Z",
    ...overrides,
  }
}

/**
 * Minimal engine-side lifecycle twin: the TUI posts APPROVE_ONCE/DENY over
 * HTTP; the engine store performs the exact-request revalidation and flips
 * state. CLAIM/CONSUME/REVOKE are engine surfaces (not TUI keyboard), so the
 * test simulates them the way the durable sync channel would deliver them.
 */
function makeEngineTwin() {
  let store = baseApproval()
  const fetchImpl = async (url: RequestInfo | URL, init?: RequestInit) => {
    expect(String(url)).toContain("/api/session/sess_1/approval/appr_lifecycle_1/command")
    const body = JSON.parse(String(init?.body)) as {
      command: "APPROVE_ONCE" | "DENY"
      expectedVersion: number
      expectedRequestHash: string
      expectedContractRevision: number
    }
    if (body.expectedVersion !== store.version) {
      return json({ success: false, reason: `stale version ${body.expectedVersion} != ${store.version} - STALE` })
    }
    if (body.expectedRequestHash !== store.requestHash) {
      return json({ success: false, reason: "request hash changed - STALE", stale: true })
    }
    if (body.expectedContractRevision !== store.contractRevision) {
      return json({ success: false, reason: "contract revision changed - STALE", stale: true })
    }
    if (store.state !== "PENDING") {
      return json({ success: false, reason: `approval is ${store.state}, not PENDING - ALREADY_DECIDED` })
    }
    if (body.command === "APPROVE_ONCE") {
      store = {
        ...store,
        version: store.version + 1,
        state: "APPROVED",
        approvedBy: SESSION.operatorId,
        updatedAt: "2026-08-02T00:00:01.000Z",
      }
    } else {
      store = {
        ...store,
        version: store.version + 1,
        state: "DENIED",
        approvedBy: SESSION.operatorId,
        updatedAt: "2026-08-02T00:00:01.000Z",
      }
    }
    return json({ success: true, approval: store })
  }

  const bridge = new HttpApprovalOperatorService({
    baseUrl: "http://runtime.test",
    fetch: fetchImpl as unknown as typeof fetch,
    getSessionId: () => SESSION.sessionId,
    getWorkspaceId: () => SESSION.workspaceId,
    getApprovals: () => [store],
  })

  return {
    get record() {
      return store
    },
    bridge,
    /** Engine-side claim after approval (delivered to the TUI over sync). */
    claim(executionId: string) {
      store = { ...store, version: store.version + 1, state: "CLAIMED", executionId, updatedAt: "2026-08-02T00:00:02.000Z" }
    },
    /** Engine-side consume after the effect ran (delivered over sync). */
    consume(executionId: string) {
      store = { ...store, version: store.version + 1, state: "CONSUMED", executionId, updatedAt: "2026-08-02T00:00:03.000Z" }
    },
    /** Workspace-operator revoke (Desktop/central surface; delivered over sync). */
    revoke(revokedBy: string) {
      store = { ...store, version: store.version + 1, state: "INVALIDATED", revokedBy, updatedAt: "2026-08-02T00:00:04.000Z" }
    },
  }
}

function json(data: unknown): Response {
  return new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } })
}

describe("approval lifecycle via spine keys (a approve / d deny / v inspect)", () => {
  test("a on a focused PENDING approval drives PENDING -> APPROVED and renders the approved row", async () => {
    const engine = makeEngineTwin()
    const controller = createApprovalShellController({
      service: engine.bridge,
      session: SESSION,
      getApproval: () => engine.record,
    })

    // The shell's `a` handler sends exactly the focused record's revalidation fields.
    const result = await controller.approveOnce({
      approvalId: engine.record.approvalId,
      expectedVersion: engine.record.version,
      expectedRequestHash: engine.record.requestHash,
      expectedContractRevision: engine.record.contractRevision,
    })

    expect(result.status).toBe("APPROVED")
    expect(engine.record.state).toBe("APPROVED")
    expect(engine.record.version).toBe(2)

    const entry = approvalToSpineEntry(engine.record)
    expect(entry.kind).toBe("ok")
    expect(entry.label).toBe("approved")
    expect(entry.summary).toContain("approved once")
    expect(entry.summary).toContain("local-operator")
    expect(entry.id).toBe(`approval:${engine.record.approvalId}:2`)
    expect(isApprovalActionable(engine.record)).toBe(false)
  })

  test("d on a focused PENDING approval drives PENDING -> DENIED with zero effects and renders the denied row", async () => {
    const engine = makeEngineTwin()
    const controller = createApprovalShellController({
      service: engine.bridge,
      session: SESSION,
      getApproval: () => engine.record,
    })

    const result = await controller.deny({
      approvalId: engine.record.approvalId,
      expectedVersion: engine.record.version,
      expectedRequestHash: engine.record.requestHash,
      expectedContractRevision: engine.record.contractRevision,
    })

    expect(result.status).toBe("DENIED")
    expect(engine.record.state).toBe("DENIED")
    expect(engine.record.executionId).toBeUndefined()

    const entry = approvalToSpineEntry(engine.record)
    expect(entry.kind).toBe("fail")
    expect(entry.label).toBe("denied")
    expect(isApprovalTerminal(engine.record)).toBe(true)
  })

  test("runbook v -> a -> watch CLAIMED -> CONSUMED: the spine row tracks every engine transition", async () => {
    const engine = makeEngineTwin()
    const controller = createApprovalShellController({
      service: engine.bridge,
      session: SESSION,
      getApproval: () => engine.record,
    })

    // v: inspection is read-only and available before the decision.
    controller.inspect(engine.record.approvalId)
    expect(controller.getInspectingApprovalId()).toBe(engine.record.approvalId)
    expect(
      approvalActionBindingsEnabled({
        composerFocused: false,
        gatesOpen: false,
        submitting: false,
        focusedApproval: engine.record,
      }),
    ).toBe(true)

    // a: approve once through the spine-key command path.
    await controller.approveOnce({
      approvalId: engine.record.approvalId,
      expectedVersion: engine.record.version,
      expectedRequestHash: engine.record.requestHash,
      expectedContractRevision: engine.record.contractRevision,
    })
    expect(approvalToSpineEntry(engine.record).label).toBe("approved")

    // Engine claims the approval when the authorized tool starts.
    engine.claim("exe_0001")
    const claimedEntry = approvalToSpineEntry(engine.record)
    expect(claimedEntry.label).toBe("executing")
    expect(claimedEntry.summary).toContain("exe_0001")
    expect(claimedEntry.body).toContain("exe_0001")

    // Engine consumes the approval after the effect completes.
    engine.consume("exe_0001")
    const consumedEntry = approvalToSpineEntry(engine.record)
    expect(consumedEntry.label).toBe("consumed")
    expect(consumedEntry.summary).toContain("consumed")
    expect(isApprovalTerminal(engine.record)).toBe(true)

    // Inspection stays available on every state (runbook: watch it go CLAIMED -> CONSUMED).
    for (const state of ["APPROVED", "CLAIMED", "CONSUMED"] as const) {
      expect(
        approvalActionBindingsEnabled({
          composerFocused: false,
          gatesOpen: false,
          submitting: false,
          focusedApproval: { ...engine.record, state },
        }),
      ).toBe(false)
    }
  })

  test("revoke is refused at the TUI keyboard and an INVALIDATED record renders terminal with no retry", async () => {
    const engine = makeEngineTwin()
    const controller = createApprovalShellController({
      service: engine.bridge,
      session: SESSION,
      getApproval: () => engine.record,
    })

    // REVOKE is a workspace-operator/Desktop command; the TUI surface refuses it.
    const revoked = await engine.bridge.submitCommand({
      approvalId: engine.record.approvalId,
      command: "REVOKE",
      expectedVersion: engine.record.version,
      expectedRequestHash: engine.record.requestHash,
      expectedContractRevision: engine.record.contractRevision,
    })
    expect(revoked.success).toBe(false)

    // The durable sync channel delivers the revocation produced elsewhere.
    engine.revoke("workspace-operator")
    expect(engine.record.state).toBe("INVALIDATED")
    expect(engine.record.revokedBy).toBe("workspace-operator")

    const entry = approvalToSpineEntry(engine.record)
    expect(entry.kind).toBe("fail")
    expect(entry.label).toBe("invalidated")
    expect(entry.summary).toContain("invalidated")
    expect(isApprovalActionable(engine.record)).toBe(false)
    expect(isApprovalTerminal(engine.record)).toBe(true)

    // a/d must never reach the engine for a revoked approval: the shell gate blocks it.
    expect(
      approvalActionBindingsEnabled({
        composerFocused: false,
        gatesOpen: false,
        submitting: false,
        focusedApproval: engine.record,
      }),
    ).toBe(false)
    const retry = await controller.approveOnce({
      approvalId: engine.record.approvalId,
      expectedVersion: engine.record.version,
      expectedRequestHash: engine.record.requestHash,
      expectedContractRevision: engine.record.contractRevision,
    })
    expect(retry.status).toBe("ERROR")
    expect(retry.error).toContain("not actionable")
  })

  test("stale exact-request fields surface the engine reason without inventing success", async () => {
    const engine = makeEngineTwin()

    // The engine store advanced to version 2 while the TUI still holds 1.
    engine.claim("exe_stale")
    const stale = await engine.bridge.approveOnce({
      approvalId: engine.record.approvalId,
      expectedVersion: 1,
      expectedRequestHash: engine.record.requestHash,
      expectedContractRevision: engine.record.contractRevision,
    })

    expect(stale.status).toBe("ERROR")
    expect(stale.error).toContain("STALE")
    expect(engine.record.state).toBe("CLAIMED")
    // A changed request hash is refused the same way (PENDING record).
    const engine2 = makeEngineTwin()
    const staleHash = await engine2.bridge.approveOnce({
      approvalId: engine2.record.approvalId,
      expectedVersion: engine2.record.version,
      expectedRequestHash: "OLD-HASH",
      expectedContractRevision: engine2.record.contractRevision,
    })
    expect(staleHash.status).toBe("ERROR")
    expect(staleHash.error).toContain("STALE")
    expect(engine2.record.state).toBe("PENDING")
  })
})
