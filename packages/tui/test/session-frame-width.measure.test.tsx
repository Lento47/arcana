/**
 * Layout measurement: session frame vs spineProseWidth vs proposed W-6 fix.
 */
/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import type { Renderable } from "@opentui/core"
import { testRender } from "@opentui/solid"
import { displayWidth, truncate } from "../src/util/locale"
import { getSpineLayout, spineProseWidth, type SpineLayout } from "../src/shell/command-spine/spine-types"
import { buildStatusSegments } from "../src/shell/command-spine/spine-segments"
import { buildHeaderStatusItems, projectSessionCharter } from "../src/shell/command-spine/session-charter"
import { ThemeProvider } from "../src/context/theme"
import { ToastProvider } from "../src/ui/toast"
import { TuiConfigProvider } from "../src/config"
import { KVProvider } from "../src/context/kv"
import { TestTuiContexts } from "./fixture/tui-environment"
import { createTuiResolvedConfig } from "./fixture/tui-runtime"
import { SpineHeader } from "../src/shell/command-spine/spine-header"

function findById(root: Renderable, id: string): Renderable | undefined {
  if ((root as { id?: string }).id === id) return root
  for (const child of root.getChildren()) {
    const found = findById(child, id)
    if (found) return found
  }
  return undefined
}

function headerLineWidth(layout: SpineLayout) {
  const charter = projectSessionCharter({
    contractStatus: "proposed",
    proofLevel: "P1",
    integrityStatus: "VALID",
  })
  const status = buildHeaderStatusItems({
    live: "live",
    liveTone: "ok",
    charter,
    governed: { key: "governed", label: "1 governed", tone: "ok" },
    pending: 1,
  })
  const segments = buildStatusSegments({
    branch: "arcanagov",
    model: "gpt-4.1-mini",
    ctxPercent: 42,
    path: "L:/PROJECTS/arcana/packages/tui",
    sessionID: "sess_abcdef12",
  })
  const limits: Record<string, number> = {
    path: layout === "wide" ? 54 : layout === "compact" ? 42 : 0,
    model: layout === "wide" ? 22 : layout === "compact" ? 18 : 14,
    branch: layout === "wide" ? 18 : 14,
    agent: 11,
    session: 9,
    ctx: 8,
  }
  const parts = [
    "ARCANA",
    ...status.map((item) => item.label),
    ...segments
      .filter((s) => s.key !== "state" && (s.key !== "path" || layout === "wide" || layout === "compact"))
      .slice(0, layout === "minimal" ? 2 : layout === "narrow" ? 3 : layout === "compact" ? 4 : 5)
      .map((s) => {
        const cap = limits[s.key] ?? 12
        const value = cap > 0 ? truncate(s.value, cap) : ""
        return value ? `${s.label} ${value}` : ""
      })
      .filter(Boolean),
  ]
  return displayWidth(parts.join(" | "))
}

async function measureAt(width: number, opts: { scrollbar?: boolean } = {}) {
  const layout = getSpineLayout(width)
  const app = await testRender(
    () => (
      <box id="app" width={width} height={24} flexDirection="column">
        <box id="session-row" flexDirection="row" flexGrow={1} minHeight={0} width="100%">
          <box
            id="session-frame"
            flexGrow={1}
            minHeight={0}
            minWidth={0}
            paddingLeft={2}
            paddingRight={2}
            border={["left", "right"]}
          >
            <box id="spine" flexDirection="column" flexGrow={1} minHeight={0} minWidth={0} width="100%">
              <box id="inner-probe" width="100%" height={1} />
              <box id="entry" flexDirection="row" width="100%" paddingLeft={1} paddingRight={opts.scrollbar ? 1 : 0}>
                <box id="gutter" width={2} flexShrink={0} height={1} />
                <box id="content" flexGrow={1} minWidth={0} flexShrink={1} height={3}>
                  <box id="card" border={["left"]} paddingLeft={2} paddingRight={1} width="100%" minWidth={0}>
                    <box id="body-probe" width="100%" height={1} />
                  </box>
                </box>
              </box>
            </box>
          </box>
        </box>
      </box>
    ),
    { width, height: 24 },
  )
  for (let attempt = 0; attempt < 40 && !findById(app.renderer.root, "body-probe"); attempt++) {
    await Bun.sleep(10)
    await app.renderOnce()
  }
  await app.renderOnce()
  const bodyWidth = findById(app.renderer.root, "body-probe")?.width
  const probeWidth = findById(app.renderer.root, "inner-probe")?.width
  const claimed = spineProseWidth(width, layout, "chat", 2)
  const proposed = spineProseWidth(width - 6, layout, "chat", 2)
  const proposedNoFudge = Math.max(1, (probeWidth ?? 0) - 1 - 2 - 4)
  const result = {
    width,
    layout,
    probeWidth,
    bodyWidth,
    claimed,
    proposed,
    proposedNoFudge,
    claimedOvershoot: (claimed ?? 0) - (bodyWidth ?? 0),
    proposedDelta: (proposed ?? 0) - (bodyWidth ?? 0),
    headerNeed: headerLineWidth(layout),
    headerFit: headerLineWidth(layout) <= (probeWidth ?? 0),
  }
  app.renderer.destroy()
  return result
}

test("Yoga: exact overshoot and proposed W-6 wrap at 80/100/120", async () => {
  const rows = [await measureAt(80), await measureAt(100), await measureAt(120)]
  const withBar = await measureAt(80, { scrollbar: true })
  expect(rows[0]!.probeWidth).toBe(74)
  expect(rows[1]!.probeWidth).toBe(94)
  expect(rows[2]!.probeWidth).toBe(114)
  for (const row of rows) {
    expect(row.bodyWidth).toBeGreaterThan(0)
    expect(row.claimedOvershoot).toBeGreaterThanOrEqual(3)
    expect(row.proposed).toBeLessThanOrEqual(row.bodyWidth ?? 0)
  }
  expect(withBar.bodyWidth).toBeLessThan(rows[0]!.bodyWidth ?? 0)
  expect(rows[0]!.headerFit).toBe(false)
  expect(rows[1]!.headerFit).toBe(false)
  // Keep the numbers in the test failure message if anything drifts.
  expect({
    w80: rows[0],
    w100: rows[1],
    w120: rows[2],
    w80bar: withBar,
  }).toBeDefined()
})

test("live SpineHeader at 80 cols fits the session frame when contentWidth is passed", async () => {
  const width = 80
  const charter = projectSessionCharter({
    contractStatus: "proposed",
    proofLevel: "P1",
    integrityStatus: "VALID",
  })
  const app = await testRender(
    () => (
      <TestTuiContexts>
        <TuiConfigProvider config={createTuiResolvedConfig()}>
          <KVProvider>
            <ToastProvider>
              <ThemeProvider mode="dark">
              <box width={width} height={8} paddingLeft={2} paddingRight={2} border={["left", "right"]}>
                <SpineHeader
                  layout="narrow"
                  contentWidth={74}
                  segments={buildStatusSegments({
                    branch: "arcanagov",
                    model: "gpt-4.1-mini",
                    ctxPercent: 42,
                    path: "L:/PROJECTS/arcana/packages/tui",
                  })}
                  session={() => ({ id: "sess_1", title: "measure" })}
                  trust={{
                    state: "healthy",
                    connection: "connected",
                    trace: "COMPLETE",
                    integrity: "VALID",
                    proofLevel: "P1",
                    pendingApprovals: 1,
                    workspaceTrusted: true,
                    authorityActionsDisabled: false,
                  }}
                  charter={charter}
                  governed={{ key: "governed", label: "1 governed", tone: "ok" }}
                />
              </box>
              </ThemeProvider>
            </ToastProvider>
          </KVProvider>
        </TuiConfigProvider>
      </TestTuiContexts>
    ),
    { width, height: 8 },
  )
  for (let attempt = 0; attempt < 40; attempt++) {
    await Bun.sleep(10)
    await app.renderOnce()
    if (app.captureCharFrame().includes("ARCANA")) break
  }
  const frame = app.captureCharFrame()
  const lines = frame.split("\n").filter((line) => line.includes("ARCANA") || line.includes("live"))
  const headerLine = lines[0] ?? ""
  const visible = headerLine.replace(/\s+$/, "")
  app.renderer.destroy()
  expect(frame).toContain("ARCANA")
  expect(displayWidth(visible)).toBeLessThanOrEqual(80)
  expect(visible).not.toContain("L:/PROJECTS")
})
