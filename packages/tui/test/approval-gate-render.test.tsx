/** @jsxImportSource @opentui/solid */
/**
 * The inline approval gate must render the exact request it is asking about.
 * Live gates showed "request unavailable / snapshot unavailable · fail-closed"
 * because the resolved snapshot was never attached to the spine entry.
 */
import { expect, test } from "bun:test"
import { testRender, type JSX } from "@opentui/solid"
import type { ApprovalRecord } from "@arcana/core/crypto/approval-lifecycle"
import { ThemeProvider } from "../src/context/theme"
import { ToastProvider } from "../src/ui/toast"
import { TuiConfigProvider } from "../src/config"
import { KVProvider } from "../src/context/kv"
import { ArgsProvider } from "../src/context/args"
import { ExitProvider } from "../src/context/exit"
import { SDKProvider } from "../src/context/sdk"
import { ProjectProvider } from "../src/context/project"
import { SyncProvider } from "../src/context/sync"
import { SpineApprovalGate } from "../src/shell/command-spine/spine-approval-gate"
import { approvalToSpineEntry } from "../src/shell/command-spine/approval-spine-adapter"
import { resolveApprovalSnapshot } from "../src/shell/command-spine/approval-snapshot"
import type { GovernanceEventRecord } from "../src/shell/types"
import { TestTuiContexts } from "./fixture/tui-environment"
import { createTuiResolvedConfig } from "./fixture/tui-runtime"
import { createEventSource, createFetch, directory } from "./fixture/tui-sdk"

const REQUEST_HASH = "e8093c29f14cb1b0aa"

const RECORD: ApprovalRecord = {
  approvalId: "appr_gate_render",
  version: 1,
  sessionId: "ses_f591be0c",
  workspaceId: "ses_f591be0c",
  requestHash: REQUEST_HASH,
  contractRevision: 6,
  state: "PENDING",
  principalId: "agent:build",
  expiresAt: "2099-09-16T01:14:04.684Z",
  updatedAt: "2026-09-16T00:44:04.684Z",
  createdAt: "2026-09-16T00:44:04.684Z",
}

function event(type: string, payload: Record<string, unknown>): GovernanceEventRecord {
  return {
    id: `${type}:1`,
    sequence: 12,
    sessionId: "ses_f591be0c",
    timestamp: "2026-09-16T00:44:04.000Z",
    previousHash: "prev",
    hash: "hash",
    actor: { kind: "policy", id: "pep" },
    type,
    payload,
  } as unknown as GovernanceEventRecord
}

const EVENTS: GovernanceEventRecord[] = [
  event("authorization.requested", {
    requestHash: REQUEST_HASH,
    tool: "mcp",
    action: "network.write",
    principalId: "agent:build",
    reason: "use MCP firecrawl",
  }),
  event("authorization.approval_required", {
    requestHash: REQUEST_HASH,
    decision: { riskClass: "HIGH", policyVersion: "phase-c-v1", capabilityIds: ["cap-1"] },
  }),
]

function withProviders(component: () => JSX.Element, onEmit?: (emit: (event: unknown) => void) => void) {
  const calls = createFetch()
  const events = createEventSource()
  onEmit?.((event) => events.emit(event as never))
  return (
    <TestTuiContexts>
      <ExitProvider exit={() => {}}>
        <ArgsProvider>
          <TuiConfigProvider config={createTuiResolvedConfig()}>
            <KVProvider>
              <SDKProvider url="http://test" directory={directory} fetch={calls.fetch} events={events.source}>
                <ProjectProvider>
                  <SyncProvider>
                    <ToastProvider>
                      <ThemeProvider mode="dark">{component()}</ThemeProvider>
                    </ToastProvider>
                  </SyncProvider>
                </ProjectProvider>
              </SDKProvider>
            </KVProvider>
          </TuiConfigProvider>
        </ArgsProvider>
      </ExitProvider>
    </TestTuiContexts>
  )
}

async function captureGate(events: GovernanceEventRecord[]) {
  const snapshot = resolveApprovalSnapshot(RECORD, events)
  const entry = approvalToSpineEntry(RECORD, snapshot)
  const app = await testRender(
    () =>
      withProviders(() => (
        <box width="100%" height="100%" flexDirection="column">
          <SpineApprovalGate entry={entry} snapshot={snapshot} layout="wide" focused={false} contentWidth={96} />
        </box>
      )),
    { width: 96, height: 16 },
  )
  try {
    for (let i = 0; i < 4; i++) {
      await app.renderOnce()
      await new Promise((resolve) => setTimeout(resolve, 50))
      await app.flush()
      await app.renderOnce()
    }
    return app.captureCharFrame()
  } finally {
    app.renderer.destroy()
  }
}

test("gate renders tool/action/reason/request from the exact request", async () => {
  const frame = await captureGate(EVENTS)

  expect(frame).toContain("mcp")
  expect(frame).toContain("network.write")
  expect(frame).toContain("use MCP firecrawl")
  expect(frame).toContain("e809…b0aa")
  expect(frame).toContain("r6")
  expect(frame).not.toContain("snapshot unavailable")
  expect(frame).not.toContain("unavailable · fail-closed")
  // No durable record for this request yet: no precedent, not a guess.
  expect(frame).not.toContain("precedent")
})

test("gate shows the precedent for the exact request decided before", async () => {
  const snapshot = resolveApprovalSnapshot(RECORD, EVENTS)
  const entry = approvalToSpineEntry(RECORD, snapshot)
  let emit: ((event: unknown) => void) | undefined
  const app = await testRender(
    () =>
      withProviders(
        () => (
          <box width="100%" height="100%" flexDirection="column">
            <SpineApprovalGate entry={entry} snapshot={snapshot} layout="wide" focused={false} contentWidth={96} />
          </box>
        ),
        (push) => {
          emit = push
        },
      ),
    { width: 96, height: 18 },
  )
  try {
    for (let i = 0; i < 4; i++) {
      await app.renderOnce()
      await Bun.sleep(40)
      await app.flush()
    }
    const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000 - 3_600_000).toISOString()
    emit!({
      directory: "/tmp/gate-render",
      project: "proj_gate_render",
      payload: {
        id: "evt_approval_prior",
        type: "approval.updated",
        properties: {
          sessionID: RECORD.sessionId,
          approval: {
            ...RECORD,
            approvalId: "appr_gate_render_prior",
            state: "DENIED",
            riskClass: "HIGH",
            updatedAt: twoDaysAgo,
            createdAt: twoDaysAgo,
          },
        },
      },
    })
    for (let i = 0; i < 4; i++) {
      await app.renderOnce()
      await Bun.sleep(40)
      await app.flush()
    }
    const frame = app.captureCharFrame()
    expect(frame).toContain("precedent · denied")
    expect(frame).toContain("HIGH")
  } finally {
    app.renderer.destroy()
  }
})

test("gate keeps record facts even without governance correlation", async () => {
  const frame = await captureGate([])

  // The fail-closed note stays honest when correlation is missing...
  expect(frame).toContain("snapshot unavailable · fail-closed · press v to inspect")
  // ...but the durable record still supplies the exact request and expiry.
  expect(frame).toContain("e809…b0aa")
  expect(frame).not.toContain("unknown")
})
