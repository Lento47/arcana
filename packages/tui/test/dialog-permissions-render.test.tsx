/** @jsxImportSource @opentui/solid */
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui"
import { testRender, useRenderer } from "@opentui/solid"
import { expect, test } from "bun:test"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { onCleanup } from "solid-js"
import { tmpdir } from "./fixture/fixture"
import { createTuiResolvedConfig } from "./fixture/tui-runtime"
import type { TuiKeybind } from "../src/config/keybind"
import { TestTuiContexts } from "./fixture/tui-environment"
import type { SessionGovernanceResponse } from "@arcana/sdk/v2"
import type { ApprovalRecord } from "@arcana/core/crypto/approval-lifecycle"

async function wait(fn: () => boolean, timeout = 2000) {
  const start = Date.now()
  while (!fn()) {
    if (Date.now() - start > timeout) throw new Error("timed out waiting for condition")
    await Bun.sleep(10)
  }
}

function governance(): SessionGovernanceResponse {
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

function approval(partial: Partial<ApprovalRecord> & { approvalId: string; state: ApprovalRecord["state"] }): ApprovalRecord {
  return {
    version: 1,
    sessionId: "ses-1",
    workspaceId: "ws-1",
    requestHash: "abcdef1234567890",
    contractRevision: 3,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 120_000).toISOString(),
    createdAt: new Date(Date.now() - 300_000).toISOString(),
    ...partial,
  }
}

test("DialogPermissions renders authorization, waiting, and activity sections", async () => {
  await using tmp = await tmpdir()
  const state = path.join(tmp.path, "state")
  await mkdir(state, { recursive: true })
  await Bun.write(path.join(state, "kv.json"), "{}")

  const [{ DialogProvider }, { SyncContext }, { KVProvider }, { ThemeProvider }, { TuiConfigProvider }, { ToastProvider }, { OpencodeKeymapProvider, registerOpencodeKeymap }, { DialogPermissions }, { RouteProvider }, { SDKProvider }] =
    await Promise.all([
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

  function Harness() {
    const renderer = useRenderer()
    const keymap = createDefaultOpenTuiKeymap(renderer)
    const resolvedConfig = createTuiResolvedConfig({})
    const off = registerOpencodeKeymap(keymap, renderer, resolvedConfig)
    onCleanup(off)

    const syncStub = {
      data: {
        approvals: {
          a1: approval({ approvalId: "a1", state: "CONSUMED", updatedAt: new Date(Date.now() - 120_000).toISOString() }),
          a2: approval({ approvalId: "a2", state: "DENIED", updatedAt: new Date(Date.now() - 300_000).toISOString() }),
          a3: approval({
            approvalId: "a3",
            state: "PENDING",
            route: "DESKTOP_PREFERRED",
            createdAt: new Date(Date.now() - 60_000).toISOString(),
            updatedAt: new Date(Date.now() - 60_000).toISOString(),
          }),
        },
        permission: {
          "ses-1": [
            {
              id: "req-1",
              sessionID: "ses-1",
              permission: "bash",
              patterns: [],
              metadata: { command: "git push" },
              always: [],
            },
          ],
        },
        governance: { "ses-1": governance() },
      },
    }

    return (
      <TestTuiContexts directory={tmp.path} paths={{ home: tmp.path, state, worktree: tmp.path }}>
        <OpencodeKeymapProvider keymap={keymap}>
          <RouteProvider initialRoute={{ type: "session", sessionID: "ses-1" }}>
            <TuiConfigProvider config={resolvedConfig}>
              <KVProvider>
                <ToastProvider>
                  <ThemeProvider mode="dark">
                    <SDKProvider url="http://engine.local">
                      <SyncContext.Provider value={syncStub as never}>
                        <DialogProvider>
                          <DialogPermissions />
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

  const app = await testRender(() => <Harness />, { kittyKeyboard: true })
  try {
    await wait(() => app.renderer.root.getChildren().length > 0)
    await app.waitForFrame((frame) => frame.includes("Permissions status"))
    await app.renderOnce()
    const frame = app.captureCharFrame()
    expect(frame).toContain("Permissions status")
    expect(frame).toContain("session ses-1 · governance COMPLETE")
    expect(frame).toContain("12 requests · 9 allowed · 2 denied · 1 approval required · 10 executed")
    expect(frame).toContain("⚠ 1 stale decision")
    expect(frame).toContain("1 permission request waiting")
    expect(frame).toContain("bash · git push")
    expect(frame).toContain("approval a3 · request abcdef12 · ")
    expect(frame).toContain("· desktop")
    expect(frame).toContain("[↻ resend]")
    expect(frame).toContain("Arcana Desktop decides the desktop-routed gates")
    expect(frame).toContain("Recent approvals")
    expect(frame).toContain("consumed a1 · request abcdef12")
    expect(frame).toContain("denied a2 · request abcdef12")
  } finally {
    app.renderer.destroy()
  }
})
