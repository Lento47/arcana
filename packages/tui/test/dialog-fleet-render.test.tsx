/** @jsxImportSource @opentui/solid */
/**
 * `/fleet` reads the wave from the engine's own child links.
 *
 * The scope's blips are task tool parts (`state.metadata.sessionId`) and the
 * legend rows carry the child's real activity; the frame is asserted where the
 * operator reads it. A child that was never referenced by a task part must not
 * appear — the fleet is the delegation, not the session store.
 */
import { expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { DialogFleet } from "../src/ui/dialog-fleet"
import { ArgsProvider } from "../src/context/args"
import { RouteProvider } from "../src/context/route"
import { SDKProvider } from "../src/context/sdk"
import { SyncContext } from "../src/context/sync"
import { TestTuiProviders } from "./fixture/tui-providers"

const ROOT = "ses_root"
const EXPLORE = "ses_explore"
const REVIEW = "ses_review"
/** A child of the root that no task part ever linked — must stay off the radar. */
const ORPHAN = "ses_orphan"

const sessions = [
  { id: ROOT, title: "Root", time: { created: 0, updated: 0 } },
  { id: EXPLORE, parentID: ROOT, title: "explore", time: { created: 1_000, updated: 2_000 } },
  { id: REVIEW, parentID: ROOT, title: "review", time: { created: 2_000, updated: 3_000 } },
  { id: ORPHAN, parentID: ROOT, title: "orphan", time: { created: 3_000, updated: 4_000 } },
]

const syncStub = {
  ready: true,
  data: {
    session: sessions,
    session_status: { [EXPLORE]: { type: "busy" }, [REVIEW]: { type: "idle" }, [ORPHAN]: { type: "busy" } },
    message: {
      [ROOT]: [{ id: "msg_root" }],
      [EXPLORE]: [{ id: "msg_a1" }, { id: "msg_a2" }],
    },
    part: {
      msg_root: [
        { type: "tool", tool: "task", state: { status: "running", metadata: { sessionId: EXPLORE } } },
        { type: "tool", tool: "task", state: { status: "completed", metadata: { sessionId: REVIEW } } },
      ],
      msg_a1: [
        {
          type: "tool",
          tool: "read",
          state: { status: "completed", title: "packages/tui/src/app.tsx", metadata: {} },
        },
      ],
      msg_a2: [
        {
          type: "tool",
          tool: "grep",
          state: { status: "completed", title: "session_status", metadata: {} },
        },
      ],
    },
  },
  session: { upsert: () => {}, forget: () => {} },
}

async function capture(): Promise<string[]> {
  const app = await testRender(
    () => (
      <TestTuiProviders>
        <ArgsProvider>
          <RouteProvider initialRoute={{ type: "session", sessionID: ROOT }}>
            <SDKProvider url="http://test" fetch={(() => new Response("[]")) as unknown as typeof fetch}>
              <SyncContext.Provider value={syncStub as never}>
                <DialogFleet />
              </SyncContext.Provider>
            </SDKProvider>
          </RouteProvider>
        </ArgsProvider>
      </TestTuiProviders>
    ),
    { width: 110, height: 30 },
  )
  try {
    let lines: string[] = []
    for (let i = 0; i < 40; i++) {
      await Bun.sleep(15)
      await app.renderOnce()
      await app.flush()
      await app.renderOnce()
      lines = app.captureCharFrame().split("\n")
      if (lines.some((line) => line.includes("explore"))) break
    }
    return lines.map((line) => line.replace(/\s+$/, ""))
  } finally {
    app.renderer.destroy()
  }
}

test("the fleet shows linked children with live activity, never orphans", async () => {
  const lines = await capture()
  const frame = lines.join("\n")

  expect(frame).toContain("Fleet")
  // Totals from session status: one busy, one settled.
  expect(frame).toContain("1 running")
  expect(frame).toContain("1 done")

  const explore = lines.find((line) => line.includes("explore"))
  expect(explore).toBeDefined()
  expect(explore!).toContain("01")
  expect(explore!).toContain("●")
  expect(explore!).toContain("2 steps")
  expect(explore!).toContain("session_status")

  const review = lines.find((line) => line.includes("review"))
  expect(review).toBeDefined()
  expect(review!).toContain("02")
  expect(review!).toContain("✓")

  // The scope paints its core; the orphan is not part of the delegation.
  expect(frame).toContain("◆")
  expect(frame).not.toContain("orphan")
})
