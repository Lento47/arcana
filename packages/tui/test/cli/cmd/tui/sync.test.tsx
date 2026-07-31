/** @jsxImportSource @opentui/solid */
import { describe, expect, test } from "bun:test"
import { tmpdir } from "../../../fixture/fixture"
import { mount, wait } from "./sync-fixture"
import type { GlobalEvent } from "@arcana/sdk/v2"

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
})
