/** @jsxImportSource @opentui/solid */
import { describe, expect, test } from "bun:test"
import { tmpdir } from "../../../fixture/fixture"
import { mount, wait } from "./sync-fixture"
import type { GlobalEvent } from "@arcana/sdk/v2"
import { mergeSessionList, splitMessageWindow, SESSION_MESSAGE_WINDOW } from "../../../../src/context/sync"

function makeSession(id: string, title = id) {
  return {
    id,
    title,
    directory: "/tmp/arcana",
    version: "0",
    time: { created: 1, updated: 1 },
  }
}

function branchEvent(branch: string, workspace?: string): GlobalEvent {
  return {
    directory: "/tmp/other",
    project: "proj_test",
    workspace,
    payload: {
      id: `evt_vcs_${branch}`,
      type: "vcs.branch.updated",
      properties: { branch },
    },
  }
}

describe("tui sync", () => {
  test("splitMessageWindow keeps the newest window and reports overflow", () => {
    const messages = Array.from({ length: SESSION_MESSAGE_WINDOW + 5 }, (_, i) => ({ id: `m${i}` }))
    const { visible, removed } = splitMessageWindow(messages)
    expect(visible).toHaveLength(SESSION_MESSAGE_WINDOW)
    expect(removed).toHaveLength(5)
    expect(visible[0]?.id).toBe("m5")
    expect(visible.at(-1)?.id).toBe(`m${SESSION_MESSAGE_WINDOW + 4}`)
  })

  test("splitMessageWindow is a no-op at or under the window", () => {
    const messages = [{ id: "a" }, { id: "b" }]
    const { visible, removed } = splitMessageWindow(messages)
    expect(visible).toBe(messages)
    expect(removed).toEqual([])
  })

  test("mergeSessionList keeps local sessions missing from a stale fetch", () => {
    const current = [makeSession("a", "old-a"), makeSession("b", "local-only")]
    const incoming = [makeSession("a", "new-a"), makeSession("c", "incoming")]

    const merged = mergeSessionList(current as any, incoming as any)

    expect(merged.map((item) => item.id)).toEqual(["a", "b", "c"])
    expect(merged.find((item) => item.id === "a")?.title).toBe("new-a")
    expect(merged.find((item) => item.id === "b")?.title).toBe("local-only")
  })

  test("session.created and session.updated events keep the list authoritative", async () => {
    await using tmp = await tmpdir()
    await Bun.write(`${tmp.path}/kv.json`, "{}")
    const { app, emit, sync } = await mount(undefined, tmp.path)

    try {
      emit({
        directory: "/tmp/other",
        project: "proj_test",
        payload: {
          id: "evt_session_created",
          type: "session.created",
          properties: { info: makeSession("ses_new", "created") },
        },
      } as unknown as GlobalEvent)
      await wait(() => sync.data.session.some((item) => item.id === "ses_new"))

      emit({
        directory: "/tmp/other",
        project: "proj_test",
        payload: {
          id: "evt_session_updated",
          type: "session.updated",
          properties: { info: makeSession("ses_new", "renamed") },
        },
      } as unknown as GlobalEvent)
      await wait(() => sync.data.session.find((item) => item.id === "ses_new")?.title === "renamed")

      expect(sync.data.session.find((item) => item.id === "ses_new")).toMatchObject({
        id: "ses_new",
        title: "renamed",
      })
    } finally {
      app.renderer.destroy()
    }
  })

  test("pending session ids never trigger engine hydration requests", async () => {
    await using tmp = await tmpdir()
    await Bun.write(`${tmp.path}/kv.json`, "{}")
    const { app, sync, session } = await mount(undefined, tmp.path)

    try {
      const before = session.length
      await sync.session.sync("pending-5fbfd23a")
      await sync.session.resync("pending-5fbfd23a")

      expect(session.length).toBe(before)
      expect(session.slice(before).filter((request) => request.href.includes("pending-5fbfd23a"))).toEqual([])
    } finally {
      app.renderer.destroy()
    }
  })

  test("refresh scopes sessions by default and lists project sessions when disabled", async () => {
    await using tmp = await tmpdir()
    await Bun.write(`${tmp.path}/kv.json`, "{}")
    const { app, kv, sync, session } = await mount(undefined, tmp.path)

    try {
      expect(kv.get("session_directory_filter_enabled", true)).toBe(true)
      // The first /session call is the bootstrap call (fired in parallel with
      // project.sync() in src/context/sync.tsx:451-453 to save ~1 RTT of startup
      // latency). Before project.sync() resolves, project.data.instance.path is
      // empty and sessionListQuery() falls back to { scope: "project" }. So the
      // first call always has scope=project — the assertion below only covers
      // the post-disable refresh.

      kv.set("session_directory_filter_enabled", false)
      await sync.session.refresh()

      expect(session.at(-1)?.searchParams.get("scope")).toBe("project")
      expect(session.at(-1)?.searchParams.get("path")).toBeNull()
    } finally {
      app.renderer.destroy()
    }
  })

  test("vcs branch updates only apply for the active workspace", async () => {
    await using tmp = await tmpdir()
    await Bun.write(`${tmp.path}/kv.json`, "{}")
    const { app, emit, project, sync } = await mount(undefined, tmp.path)

    try {
      expect(sync.data.vcs?.branch).toBe("main")

      project.workspace.set("ws_a")
      emit(branchEvent("other", "ws_b"))
      await Bun.sleep(30)

      expect(sync.data.vcs?.branch).toBe("main")

      emit(branchEvent("feature", "ws_a"))
      await wait(() => sync.data.vcs?.branch === "feature")

      expect(sync.data.vcs?.branch).toBe("feature")
    } finally {
      app.renderer.destroy()
    }
  })

  test("approval.updated events upsert the durable approvals map (RB-01 sync seam)", async () => {
    await using tmp = await tmpdir()
    await Bun.write(`${tmp.path}/kv.json`, "{}")
    const { app, emit, sync } = await mount(undefined, tmp.path)

    try {
      const approval = {
        approvalId: "appr_test_1",
        version: 1,
        sessionId: "sess_1",
        workspaceId: "sess_1",
        requestHash: "hash-abc",
        contractRevision: 0,
        principalId: "agent:default",
        state: "PENDING",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      }
      // "approval.updated" is not yet part of the generated SDK union —
      // the sync store matches defensively by name (sync.tsx:462-467).
      emit({
        directory: "/tmp/other",
        project: "proj_test",
        payload: {
          id: "evt_approval_1",
          type: "approval.updated",
          properties: { sessionID: "sess_1", approval },
        },
      } as unknown as GlobalEvent)

      await wait(() => sync.data.approvals?.["appr_test_1"] !== undefined)
      expect(sync.data.approvals["appr_test_1"].state).toBe("PENDING")
      expect(sync.data.approvals["appr_test_1"].sessionId).toBe("sess_1")
      expect(sync.data.approvals["appr_test_1"].version).toBe(1)
    } finally {
      app.renderer.destroy()
    }
  })

  test("permission.routed replaces the pending request with its current decision surface", async () => {
    await using tmp = await tmpdir()
    await Bun.write(`${tmp.path}/kv.json`, "{}")
    const { app, emit, sync } = await mount(undefined, tmp.path)

    try {
      const request = {
        id: "per_route_1",
        sessionID: "ses_route_1",
        permission: "bash",
        patterns: ["git status"],
        metadata: {},
        always: ["git status"],
        routing: {
          route: "DESKTOP_PREFERRED",
          decisionSurface: "DESKTOP",
          localFallbackAllowed: true,
          desktopOnline: true,
        },
      }
      emit({
        directory: "/tmp/other",
        project: "proj_test",
        payload: { id: "evt_permission_asked", type: "permission.asked", properties: request },
      } as unknown as GlobalEvent)
      await wait(() => sync.data.permission["ses_route_1"]?.length === 1)

      emit({
        directory: "/tmp/other",
        project: "proj_test",
        payload: {
          id: "evt_permission_routed",
          type: "permission.routed",
          properties: {
            ...request,
            routing: { ...request.routing, decisionSurface: "LOCAL_TUI", desktopOnline: false },
          },
        },
      } as unknown as GlobalEvent)

      await wait(
        () => sync.data.permission["ses_route_1"]?.[0]?.routing?.decisionSurface === "LOCAL_TUI",
      )
      expect(sync.data.permission["ses_route_1"]).toHaveLength(1)
    } finally {
      app.renderer.destroy()
    }
  })

  test("stale permission.routed never resurrects a replied request", async () => {
    await using tmp = await tmpdir()
    await Bun.write(`${tmp.path}/kv.json`, "{}")
    const { app, emit, sync } = await mount(undefined, tmp.path)

    try {
      const request = {
        id: "per_stale_1",
        sessionID: "ses_stale_1",
        permission: "bash",
        patterns: ["git status"],
        metadata: {},
        always: ["git status"],
        routing: {
          route: "DESKTOP_PREFERRED",
          decisionSurface: "DESKTOP",
          localFallbackAllowed: true,
          desktopOnline: true,
        },
      }
      emit({
        directory: "/tmp/other",
        project: "proj_test",
        payload: { id: "evt_permission_asked_stale", type: "permission.asked", properties: request },
      } as unknown as GlobalEvent)
      await wait(() => sync.data.permission["ses_stale_1"]?.length === 1)

      emit({
        directory: "/tmp/other",
        project: "proj_test",
        payload: {
          id: "evt_permission_replied_stale",
          type: "permission.replied",
          properties: { sessionID: "ses_stale_1", requestID: "per_stale_1", reply: "once" },
        },
      } as unknown as GlobalEvent)
      await wait(() => (sync.data.permission["ses_stale_1"]?.length ?? 0) === 0)

      // The engine's routing monitor can publish an update that races past
      // the reply. Routed is update-only in the projection: a late event for
      // a settled request must not recreate the gate (nothing would ever
      // remove it again), and a routed event for an unknown request must not
      // create one either.
      emit({
        directory: "/tmp/other",
        project: "proj_test",
        payload: {
          id: "evt_permission_routed_stale",
          type: "permission.routed",
          properties: {
            ...request,
            routing: { ...request.routing, decisionSurface: "LOCAL_TUI", desktopOnline: false },
          },
        },
      } as unknown as GlobalEvent)
      emit({
        directory: "/tmp/other",
        project: "proj_test",
        payload: {
          id: "evt_permission_routed_unknown",
          type: "permission.routed",
          properties: { ...request, id: "per_never_asked", sessionID: "ses_unknown_1" },
        },
      } as unknown as GlobalEvent)
      await Bun.sleep(30)

      expect(sync.data.permission["ses_stale_1"]).toHaveLength(0)
      expect(sync.data.permission["ses_unknown_1"]).toBeUndefined()
    } finally {
      app.renderer.destroy()
    }
  })

  test("part updates, deltas, and removals advance the message part revision", async () => {
    await using tmp = await tmpdir()
    await Bun.write(`${tmp.path}/kv.json`, "{}")
    const { app, emit, sync } = await mount(undefined, tmp.path)
    const sessionID = "ses_part_revision"
    const messageID = "msg_part_revision"
    const partID = "prt_part_revision"

    try {
      emit({
        directory: "/tmp/other",
        payload: {
          id: "evt_part_created",
          type: "message.part.updated",
          properties: {
            sessionID,
            time: 1,
            part: { id: partID, sessionID, messageID, type: "text", text: "What" },
          },
        },
      } as unknown as GlobalEvent)
      await wait(() => sync.data.part_revision[messageID] === 1)
      expect(sync.data.part[messageID]?.[0]).toMatchObject({ text: "What" })

      emit({
        directory: "/tmp/other",
        payload: {
          id: "evt_part_delta",
          type: "message.part.delta",
          properties: { sessionID, messageID, partID, field: "text", delta: " kind" },
        },
      } as unknown as GlobalEvent)
      await wait(() => sync.data.part_revision[messageID] === 2)
      expect(sync.data.part[messageID]?.[0]).toMatchObject({ text: "What kind" })

      emit({
        directory: "/tmp/other",
        payload: {
          id: "evt_part_removed",
          type: "message.part.removed",
          properties: { sessionID, messageID, partID },
        },
      } as unknown as GlobalEvent)
      await wait(() => sync.data.part_revision[messageID] === 3)
      expect(sync.data.part[messageID]).toHaveLength(0)
    } finally {
      app.renderer.destroy()
    }
  })
})
