/** @jsxImportSource @opentui/solid */
import { describe, expect, test } from "bun:test"
import type { GlobalEvent } from "@arcana/sdk/v2"
import { tmpdir } from "../../../fixture/fixture"
import { json, mount, wait } from "./sync-fixture"

const sessionID = "ses_live_protocol"
const userMessageID = "msg_live_user"
const assistantMessageID = "msg_live_assistant"
const partID = "prt_live_assistant"

const session = {
  id: sessionID,
  title: "live protocol",
  time: { created: 0, updated: 0 },
  version: "1.15.13",
  directory: "/tmp/opencode/packages/opencode",
}

function userMessage() {
  return {
    id: userMessageID,
    sessionID,
    role: "user" as const,
    agent: "build",
    time: { created: 1 },
    model: { providerID: "test", modelID: "test" },
  }
}

function assistantMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: assistantMessageID,
    sessionID,
    role: "assistant" as const,
    agent: "build",
    modelID: "model",
    providerID: "test",
    mode: "build",
    parentID: userMessageID,
    path: { cwd: session.directory, root: session.directory },
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created: 2 },
    ...overrides,
  }
}

function part(text: string) {
  return { id: partID, sessionID, messageID: assistantMessageID, type: "text" as const, text }
}

function global(payload: GlobalEvent["payload"]): GlobalEvent {
  return { directory: session.directory, project: "proj_test", payload }
}

function governanceResponse() {
  return {
    sessionId: sessionID,
    trace: {
      status: "COMPLETE",
      expectedCriticalEvents: 0,
      recordedCriticalEvents: 0,
      recordingErrors: [],
    },
    events: [],
    proof: {
      proofHash: "proof-live-protocol",
      runRoot: "run-root-live",
      derivedAt: "2026-08-02T12:00:01.000Z",
      eventCount: 0,
      lastSequence: 0,
      proofLevel: "P0",
      traceHealth: "COMPLETE",
      integrityStatus: "UNVERIFIED",
      lifecycleStatus: "INCOMPLETE",
      assuranceProfile: {
        trace: "RECORDED",
        integrity: "UNVERIFIED",
        verification: "UNVERIFIED",
        reproducibility: "NONE",
      },
      claimsByStatus: {},
      obligationsByStatus: {},
      gaps: [],
      authorizationProfile: {
        policyVersions: [],
        requests: 0,
        allowed: 0,
        denied: 0,
        approvalsRequired: 0,
        staleDecisions: 0,
        executed: 0,
        executionFailures: 0,
        unauthorizedExecutions: 0,
        capabilityViolations: 0,
        authorizationTraceHealth: "COMPLETE",
        orphanExecutions: 0,
        unmatchedAllows: 0,
        unmatchedRequests: 0,
        intentEnforcementMode: "REQUIRED",
        intentBindingsCreated: 0,
        intentTraceHealth: "COMPLETE",
      },
    },
  }
}

/**
 * BLK-TUI-06 / AUD-06: the 6-checkpoint live-stream protocol. The SSE channel
 * must hydrate, stream, delta, terminate, repair after a heartbeat gap, and
 * deliver durable governance/approval evidence -- without redundant REST
 * traffic or duplicated rows.
 */
describe("6-checkpoint live stream protocol (SSE)", () => {
  test("checkpoints 1-6 walk the full stream lifecycle through the real sync provider", async () => {
    await using tmp = await tmpdir()
    await Bun.write(`${tmp.path}/kv.json`, "{}")

    // Mutable engine-side ground truth (REST snapshot the SSE mirrors).
    let durableParts: ReturnType<typeof part>[] = []
    let durableMessages: unknown[] = [{ info: userMessage(), parts: [] }]
    let messageRequests = 0
    let governanceRequests = 0

    const { app, emit, sync } = await mount((url) => {
      if (url.pathname === `/session/${sessionID}`) return json(session)
      if (url.pathname === `/session/${sessionID}/message`) {
        messageRequests += 1
        return json(durableMessages)
      }
      if (url.pathname === `/session/${sessionID}/todo` || url.pathname === `/session/${sessionID}/diff`) {
        return json([])
      }
      if (url.pathname === `/session/${sessionID}/governance`) {
        governanceRequests += 1
        return json(governanceResponse())
      }
      return undefined
    }, tmp.path)

    try {
      // Checkpoint 1 -- bootstrap hydrate: REST session + messages + governance land.
      await sync.session.sync(sessionID)
      expect(sync.session.isSynced(sessionID)).toBe(true)
      expect(sync.data.message[sessionID]?.some((message) => message.id === userMessageID)).toBe(true)
      expect(sync.data.governance[sessionID]).toBeDefined()

      // Checkpoint 2 -- streaming message + part arrive over SSE while busy.
      const requestsAfterHydrate = messageRequests
      emit(
        global({
          id: "evt_msg_start",
          type: "message.updated",
          properties: { sessionID, info: assistantMessage() },
        }),
      )
      await wait(() => sync.data.message[sessionID]?.some((message) => message.id === assistantMessageID) ?? false)
      emit(
        global({
          id: "evt_part_start",
          type: "message.part.updated",
          properties: { sessionID, time: 2, part: part("Hello") },
        }),
      )
      await wait(() => (sync.data.part[assistantMessageID]?.[0] as { text?: string } | undefined)?.text === "Hello")
      expect(sync.data.part_revision[assistantMessageID]).toBe(1)
      // Streaming must not trigger REST traffic.
      expect(messageRequests).toBe(requestsAfterHydrate)

      // Checkpoint 3 -- part deltas stream in place and bump revision without refetch.
      emit(
        global({
          id: "evt_delta_1",
          type: "message.part.delta",
          properties: { sessionID, messageID: assistantMessageID, partID, partType: "text", field: "text", delta: " world" },
        }),
      )
      emit(
        global({
          id: "evt_delta_2",
          type: "message.part.delta",
          properties: { sessionID, messageID: assistantMessageID, partID, partType: "text", field: "text", delta: "!" },
        }),
      )
      await wait(
        () => (sync.data.part[assistantMessageID]?.[0] as { text?: string } | undefined)?.text === "Hello world!",
      )
      expect(sync.data.part_revision[assistantMessageID]).toBe(3)
      expect(messageRequests).toBe(requestsAfterHydrate)

      // Checkpoint 4 -- terminal message + idle status stop the stream and converge.
      // The engine persists the completed message before publishing finish, so
      // the turn-end reconcile (which reads REST) converges to it.
      durableParts = [part("Hello world! (durable)")]
      durableMessages = [
        { info: userMessage(), parts: [] },
        { info: assistantMessage({ finish: "stop", time: { created: 2, completed: 3 } }), parts: durableParts },
      ]
      emit(
        global({
          id: "evt_msg_terminal",
          type: "message.updated",
          properties: {
            sessionID,
            info: assistantMessage({ finish: "stop", time: { created: 2, completed: 3 } }),
          },
        }),
      )
      emit(
        global({
          id: "evt_status_idle",
          type: "session.status",
          properties: { sessionID, status: { type: "idle" } },
        }),
      )
      await wait(() => sync.data.session_status[sessionID]?.type === "idle")
      const terminal = sync.data.message[sessionID]?.find((message) => message.id === assistantMessageID)
      expect((terminal as { finish?: string } | undefined)?.finish).toBe("stop")
      expect((terminal?.time as { completed?: number })?.completed).toBe(3)
      // Turn-end converge: the durable superset replaces the streamed prefix.
      expect((sync.data.part[assistantMessageID]?.[0] as { text?: string } | undefined)?.text).toBe(
        "Hello world! (durable)",
      )

      // Checkpoint 5 -- heartbeat-gap repair converges to durable REST truth.
      // The engine gained a durable message while the stream was down; the
      // frozen local prefix ("Hello world!") is replaced by the durable
      // superset, and the missing durable row appears with no duplicates.
      durableMessages = [
        { info: userMessage(), parts: [] },
        { info: assistantMessage({ finish: "stop", time: { created: 2, completed: 3 } }), parts: durableParts },
        { info: { ...assistantMessage(), id: "msg_live_durable", time: { created: 4, completed: 5 } }, parts: [] },
      ]
      const revisionBeforeResync = sync.data.part_revision[assistantMessageID]
      await sync.session.resync(sessionID)
      expect(sync.session.isSynced(sessionID)).toBe(true)
      const idsAfterResync = sync.data.message[sessionID]!.map((message) => message.id)
      expect(idsAfterResync).toContain("msg_live_durable")
      expect(new Set(idsAfterResync).size).toBe(idsAfterResync.length)
      expect((sync.data.part[assistantMessageID]?.[0] as { text?: string } | undefined)?.text).toBe(
        "Hello world! (durable)",
      )
      // Idempotent converge: a resync with no new content does not churn revisions.
      expect(sync.data.part_revision[assistantMessageID]).toBe(revisionBeforeResync!)

      // Checkpoint 6 -- durable approval + governance evidence over the same channel.
      emit(
        {
          directory: session.directory,
          project: "proj_test",
          payload: {
          id: "evt_approval",
          type: "approval.updated",
          properties: {
            sessionID,
            approval: {
              approvalId: "appr_live_1",
              version: 1,
              sessionId: sessionID,
              workspaceId: sessionID,
              requestHash: "hash-live-1",
              contractRevision: 1,
              state: "PENDING",
              expiresAt: new Date(Date.now() + 60_000).toISOString(),
              updatedAt: new Date().toISOString(),
              createdAt: new Date().toISOString(),
            },
          },
          },
        } as unknown as GlobalEvent,
      )
      emit(
        {
          directory: session.directory,
          project: "proj_test",
          payload: {
          id: "evt_gov",
          type: "governance.recorded",
          properties: {
            sessionID,
            event: {
              id: "evt_gov_live_1",
              sessionId: sessionID,
              eventType: "authorization.allowed",
              timestamp: "2026-08-02T12:00:01.000Z",
              sequence: 1,
              actor: "policy:pdp",
              payload: { requestId: "req-live-1" },
            },
          },
          },
        } as unknown as GlobalEvent,
      )
      await wait(() => sync.data.approvals?.["appr_live_1"] !== undefined)
      await wait(() => sync.data.governance[sessionID]?.events.some((event) => event.id === "evt_gov_live_1") ?? false)
      expect(sync.data.approvals["appr_live_1"].state).toBe("PENDING")
      // The live governance event survives the post-commit authoritative refresh.
      expect(sync.data.governance[sessionID]!.events.map((event) => event.id)).toContain("evt_gov_live_1")
      expect(governanceRequests).toBeGreaterThan(0)
    } finally {
      app.renderer.destroy()
    }
  })
})
