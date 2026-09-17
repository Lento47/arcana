/** @jsxImportSource @opentui/solid */
/**
 * One rendering per fact, one elastic segment per row.
 *
 * The Waiting-now rows drew the guard warnings twice: `permissionRequestSummary`
 * appends them to the summary (`· ⚠ WHOLESALE REPLACEMENT · ⚠ destructive
 * patch`), and the row then drew the same warnings again as bracketed cells one
 * gap to the right. The cells were also the row's second elastic segment, so a
 * row narrower than the summary plus the cells did not merely lose the
 * duplication — yoga shared the deficit between the two segments and both
 * decoded. At a 40-column card:
 *
 *   ⚑ edit · src/ [        [      [
 *     engine/     WHOLESALEdestrucbackup
 *     session.ts  REPLACEMEtive   create
 *     · ⚠         NT]      patch] d]
 *
 * and the approval row above it came out as `◤ approval a3 · request        Resen`
 * with `abcdef12 · 5m left · desktop d` beneath.
 *
 * These are pinned at the widths the card actually takes:
 * `dialogWidth(term, "medium")`, capped at 60 columns, so every row in this
 * dialog is inside the range where the cells never fit.
 */
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui"
import { testRender, useRenderer } from "@opentui/solid"
import { expect, test } from "bun:test"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { onCleanup } from "solid-js"
import { tmpdir } from "./fixture/fixture"
import { createTuiResolvedConfig } from "./fixture/tui-runtime"
import { TestTuiContexts } from "./fixture/tui-environment"
import { dialogWidth } from "../src/util/geometry"

/**
 * The warning's first word — the phrase itself wraps at the space when the card
 * is narrow, which is a wrap and not a decode, so what is counted is the word
 * that cannot be broken.
 */
const WARNING = "WHOLESALE"
const ACTION = "Resend"
/** The counters above the row, which the overrun painted over. */
const COUNTERS = "12 requests · 9 allowed"
/** Where the card is capped at 60 columns, and where it is genuinely cramped. */
const WIDTHS = [100, 72, 60, 46]

async function wait(fn: () => boolean, timeout = 2000) {
  const start = Date.now()
  while (!fn()) {
    if (Date.now() - start > timeout) throw new Error("timed out waiting for condition")
    await Bun.sleep(10)
  }
}

function governance() {
  return {
    sessionId: "ses-1",
    trace: { status: "COMPLETE", expectedCriticalEvents: 3, recordedCriticalEvents: 3, recordingErrors: [] },
    events: [],
    proof: {
      proofHash: "",
      runRoot: "",
      derivedAt: "",
      eventCount: 0,
      lastSequence: 0,
      proofLevel: "P2",
      traceHealth: "COMPLETE",
      integrityStatus: "VALID",
      lifecycleStatus: "COMPLETE",
      assuranceProfile: { trace: "RECORDED", integrity: "VALID", verification: "VERIFIED", reproducibility: "FULL" },
      claimsByStatus: {},
      obligationsByStatus: {},
      gaps: [],
      authorizationProfile: {
        policyVersions: ["p1"],
        requests: 12,
        allowed: 9,
        denied: 2,
        approvalsRequired: 1,
        staleDecisions: 1,
        executed: 10,
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

/** One approval gate, one plain request, one under three edit guards. */
function syncStub() {
  return {
    data: {
      approvals: {
        a3: {
          version: 1,
          approvalId: "a3",
          sessionId: "ses-1",
          workspaceId: "ws-1",
          state: "PENDING",
          route: "DESKTOP_PREFERRED",
          requestHash: "abcdef1234567890",
          contractRevision: 3,
          expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
          createdAt: new Date(Date.now() - 60_000).toISOString(),
          updatedAt: new Date(Date.now() - 60_000).toISOString(),
        },
      },
      permission: {
        "ses-1": [
          {
            id: "req-1",
            sessionID: "ses-1",
            permission: "bash",
            patterns: [],
            metadata: { command: "git push origin main --force-with-lease" },
            always: [],
          },
          {
            id: "req-2",
            sessionID: "ses-1",
            permission: "edit",
            patterns: [],
            metadata: {
              filepath: "src/engine/session.ts",
              wholesale_replacement: true,
              destructive_patch: true,
              backup_created: true,
            },
            always: [],
          },
        ],
      },
      governance: { "ses-1": governance() },
    },
  }
}

/** The dialog as the app opens it: inside a card of `dialogWidth(term, "medium")`. */
async function shot(termWidth: number) {
  await using tmp = await tmpdir()
  const state = path.join(tmp.path, "state")
  await mkdir(state, { recursive: true })
  await Bun.write(path.join(state, "kv.json"), "{}")

  const [
    { DialogProvider },
    { SyncContext },
    { KVProvider },
    { ThemeProvider },
    { TuiConfigProvider },
    { ToastProvider },
    { OpencodeKeymapProvider, registerOpencodeKeymap },
    { DialogPermissions },
    { RouteProvider },
    { SDKProvider },
  ] = await Promise.all([
    import("../src/ui/dialog"),
    import("../src/context/sync"),
    import("../src/context/kv"),
    import("../src/context/theme"),
    import("../src/config"),
    import("../src/ui/toast"),
    import("../src/keymap"),
    import("../src/component/dialog-permissions"),
    import("../src/context/route"),
    import("../src/context/sdk"),
  ])

  const stub = syncStub()

  function Harness() {
    const renderer = useRenderer()
    const keymap = createDefaultOpenTuiKeymap(renderer)
    const off = registerOpencodeKeymap(keymap, renderer, createTuiResolvedConfig({}))
    onCleanup(off)

    return (
      <TestTuiContexts directory={tmp.path} paths={{ home: tmp.path, state, worktree: tmp.path }}>
        <OpencodeKeymapProvider keymap={keymap}>
          <RouteProvider initialRoute={{ type: "session", sessionID: "ses-1" }}>
            <TuiConfigProvider config={createTuiResolvedConfig({})}>
              <KVProvider>
                <ToastProvider>
                  <ThemeProvider mode="dark">
                    <SDKProvider url="http://engine.local">
                      <SyncContext.Provider value={stub as never}>
                        <DialogProvider>
                          <box width={dialogWidth(termWidth, "medium")} flexDirection="column">
                            <DialogPermissions />
                          </box>
                        </DialogProvider>
                      </SyncContext.Provider>
                    </SDKProvider>
                  </ThemeProvider>
                </ToastProvider>
              </KVProvider>
            </TuiConfigProvider>
          </RouteProvider>
        </OpencodeKeymapProvider>
      </TestTuiContexts>
    )
  }

  const app = await testRender(() => <Harness />, { kittyKeyboard: true, width: termWidth, height: 34 })
  try {
    await wait(() => app.renderer.root.getChildren().length > 0)
    await app.waitForFrame((frame) => frame.includes("Waiting now"))
    for (let attempt = 0; attempt < 4; attempt++) {
      await app.renderOnce()
      await app.flush()
      await Bun.sleep(20)
    }
    return app.captureCharFrame().split("\n")
  } finally {
    app.renderer.destroy()
  }
}

test("a guard warning is drawn once, not once as prose and once as a cell", async () => {
  for (const width of WIDTHS) {
    const frame = (await shot(width)).join("\n")
    expect(frame.split(WARNING).length - 1).toBe(1)
  }
})

test("the approval row's action is never cut in half", async () => {
  for (const width of WIDTHS) {
    const rows = await shot(width)
    expect(rows.some((row) => row.includes(ACTION))).toBe(true)
    // `Resen` on one row and `d` on the next is the shape being ruled out, and
    // the fused `5mResen` with it.
    expect(rows.filter((row) => /Resen/.test(row) && !row.includes(ACTION)).length).toBe(0)
    expect(rows.some((row) => /[^\s]Resen\b/.test(row))).toBe(false)
  }
})

test("the warnings are not also drawn as cells beside the summary", async () => {
  for (const width of WIDTHS) {
    const rows = await shot(width)
    // The cells were `[WHOLESALE REPLACEMENT]` and its neighbours; narrow, they
    // decoded into a stripe — `[WHOLESALE` over `NT]`, beside a `[backup` /
    // `create` / `d]` column — painted between the summary's own lines.
    expect(rows.some((row) => row.includes("[WHOLESALE") || row.includes("[backup"))).toBe(false)
    // And the summary's own lines are its own: the counters above them are
    // intact, not run through with fragments of a cell.
    expect(rows.some((row) => row.includes(COUNTERS))).toBe(true)
    expect(rows.some((row) => row.includes("trequest"))).toBe(false)
  }
})
