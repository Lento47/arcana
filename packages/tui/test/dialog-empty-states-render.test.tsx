/** @jsxImportSource @opentui/solid */
/**
 * Empty states — a section that is absent is not an empty state.
 *
 * Both dialogs list collections that are empty on a cold session. The Status
 * LSP block used to render nothing at all when no server had attached, and the
 * Permissions "Recent approvals" box — its heading included — was gated on its
 * own contents, so on a fresh session the heading vanished with the list and
 * the section stopped existing. Each is pinned here against the `branding`
 * string it renders, and the four Status fallbacks are pinned to `COPY` in the
 * source so they cannot drift back into per-file literals.
 */
import { testRender } from "@opentui/solid"
import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { RouteProvider } from "../src/context/route"
import { SDKProvider } from "../src/context/sdk"
import { SyncContext } from "../src/context/sync"
import { COPY } from "../src/branding"
import { DialogStatus } from "../src/component/dialog-status"
import { DialogPermissions } from "../src/component/dialog-permissions"
import { TestTuiProviders } from "./fixture/tui-providers"

async function mount(tree: () => unknown) {
  const app = await testRender(tree as never, { width: 120, height: 40 })
  for (let attempt = 0; attempt < 50 && app.renderer.root.getChildren().length === 0; attempt++) {
    await Bun.sleep(10)
    await app.renderOnce()
  }
  for (let attempt = 0; attempt < 6; attempt++) {
    await Bun.sleep(30)
    await app.renderOnce()
  }
  return app
}

function StatusHarness(props: { lsp: unknown[] }) {
  const sync = {
    data: {
      mcp: {},
      lsp: props.lsp,
      formatter: [],
      config: { plugin: [] },
    },
  }
  return (
    <TestTuiProviders>
      <SyncContext.Provider value={sync as never}>
        <DialogStatus />
      </SyncContext.Provider>
    </TestTuiProviders>
  )
}

test("Status names the LSP empty state instead of rendering nothing", async () => {
  const app = await mount(() => <StatusHarness lsp={[]} />)
  try {
    const frame = app.captureCharFrame()
    // All four collections are empty, so all four say so — LSP included.
    expect(frame).toContain(COPY.dialog.noLspServers)
    expect(frame).toContain(COPY.dialog.noMcpServers)
    expect(frame).toContain(COPY.dialog.noFormatters)
    expect(frame).toContain(COPY.dialog.noPlugins)
  } finally {
    app.renderer.destroy()
  }
})

test("Status replaces the LSP empty state once a server attaches", async () => {
  const app = await mount(() => <StatusHarness lsp={[{ id: "typescript", root: "/repo", status: "connected" }]} />)
  try {
    const frame = app.captureCharFrame()
    expect(frame).toContain("1 LSP Server")
    expect(frame).toContain("typescript")
    expect(frame).not.toContain(COPY.dialog.noLspServers)
  } finally {
    app.renderer.destroy()
  }
})

test("Status empty states come from branding, not from per-file literals", () => {
  const source = readFileSync(join(import.meta.dir, "../src/component/dialog-status.tsx"), "utf8")
  for (const literal of ['"No MCP Servers"', '"No LSP Servers"', '"No Formatters"', '"No Plugins"']) {
    expect(source).not.toContain(literal)
  }
})

const pendingApproval = {
  version: 1,
  approvalId: "a1",
  sessionId: "ses-1",
  workspaceId: "ws-1",
  requestHash: "abcdef1234567890",
  contractRevision: 3,
  state: "PENDING",
  route: "DESKTOP_PREFERRED",
  expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  updatedAt: new Date(Date.now() - 60_000).toISOString(),
  createdAt: new Date(Date.now() - 60_000).toISOString(),
}

function PermissionsHarness() {
  const sync = {
    data: {
      approvals: { a1: pendingApproval },
      permission: {},
      governance: {},
      session: [],
    },
  }
  return (
    <TestTuiProviders>
      <RouteProvider initialRoute={{ type: "session", sessionID: "ses-1" }}>
        <SDKProvider url="http://engine.local">
          <SyncContext.Provider value={sync as never}>
            <DialogPermissions />
          </SyncContext.Provider>
        </SDKProvider>
      </RouteProvider>
    </TestTuiProviders>
  )
}

test("Permissions keeps the Recent approvals heading when nothing has settled", async () => {
  const app = await mount(() => <PermissionsHarness />)
  try {
    const frame = app.captureCharFrame()
    // The only approval is still PENDING, so the settled list is empty — the
    // heading stays and the body says why it is empty.
    expect(frame).toContain("1 approval gate waiting")
    expect(frame).toContain("Recent approvals")
    expect(frame).toContain(COPY.dialog.permissionsRecentEmpty)
  } finally {
    app.renderer.destroy()
  }
})
