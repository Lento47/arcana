/** @jsxImportSource @opentui/solid */
/**
 * The subagent footer is one content row, and it is one row at every width.
 *
 * It renders in both shells, in every subagent session, and nothing tested it.
 * Two defects were found by dumping frames rather than by reading the JSX.
 *
 * The first was structural: the `mesh` group and each action chip are `box`
 * elements holding several `<text>` siblings, and an OpenTUI `box` is a
 * **column** unless told otherwise. The footer therefore drew four rows — the
 * border, then `mesh · run 2/2 · done · ctx 45.0K / 23% · $0.04 parent prev
 * next`, then ` Gilded`, then ` ◎` — pushing everything above it up by two rows.
 *
 * The second only appeared once it fit on one row: at widths where it fit on
 * one row but not in the columns available, yoga shared the deficit among every
 * shrinkable child, so the identity group lost letters while the telemetry kept
 * its columns (`mesGild◎`, `· ctx 45.0...3%`), and below that the row's segments
 * painted over each other and over the chips (`/ 2parent0.04prev`). Segments
 * are now whole or absent, so these tests assert on the presence and absence of
 * whole segments rather than on a rendered width.
 */
import { expect, test } from "bun:test"
import { testRender, useRenderer } from "@opentui/solid"
import { onCleanup } from "solid-js"
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui"
import { OpencodeKeymapProvider, registerOpencodeKeymap } from "../src/keymap"
import { TuiConfigProvider } from "../src/config"
import { KVProvider } from "../src/context/kv"
import { ToastProvider } from "../src/ui/toast"
import { ThemeProvider } from "../src/context/theme"
import { RouteProvider } from "../src/context/route"
import { SDKProvider } from "../src/context/sdk"
import { SyncContext } from "../src/context/sync"
import { TestTuiContexts } from "./fixture/tui-environment"
import { createTuiResolvedConfig } from "./fixture/tui-runtime"
import { SubagentFooter } from "../src/routes/session/subagent-footer"

const PARENT = "ses-parent"
const CHILD = "ses-child"
const SIBLING = "ses-sibling"

/** The telemetry the fixture's assistant message produces, as the row draws it. */
const CONTEXT_RUN = "· ctx 45.0K / 23% · $0.04"
const CONTEXT_RUN_NARROW = CONTEXT_RUN

function syncStub(agent: string) {
  return {
    data: {
      session: [
        { id: SIBLING, parentID: PARENT, title: `@${agent} subagent one`, time: { created: 1 } },
        { id: CHILD, parentID: PARENT, title: `@${agent} subagent two`, time: { created: 2 } },
      ],
      message: {
        [CHILD]: [
          { id: "m1", role: "tool", toolName: "read", content: "read src/app.tsx" },
          {
            id: "m2",
            role: "assistant",
            providerID: "prov",
            modelID: "model-a",
            tokens: { input: 40_000, output: 5_000 },
          },
        ],
        [PARENT]: [],
      },
      provider: [{ id: "prov", models: { "model-a": { name: "some-model", limit: { context: 200_000 } } } }],
      config: {},
    },
    session: { get: () => ({ id: CHILD, title: `@${agent} subagent two`, parentID: PARENT, cost: 0.04 }) },
  }
}

/**
 * The footer is mounted in both shells as the last row of a column; the test
 * mounts it the same way, so a footer that grows shows up as extra rows rather
 * than as a shifted neighbour.
 */
async function mountFooter(width: number, agent = "Gilded") {
  function Harness() {
    const renderer = useRenderer()
    const keymap = createDefaultOpenTuiKeymap(renderer)
    const config = createTuiResolvedConfig({})
    onCleanup(registerOpencodeKeymap(keymap, renderer, config))
    return (
      <TestTuiContexts>
        <OpencodeKeymapProvider keymap={keymap}>
          <TuiConfigProvider config={config}>
            <KVProvider>
              <ToastProvider>
                <ThemeProvider mode="dark">
                  <SDKProvider url="http://engine.local">
                    <SyncContext.Provider value={syncStub(agent) as never}>
                      <RouteProvider initialRoute={{ type: "session", sessionID: CHILD }}>
                        <box flexDirection="column" width="100%" height="100%">
                          <SubagentFooter />
                        </box>
                      </RouteProvider>
                    </SyncContext.Provider>
                  </SDKProvider>
                </ThemeProvider>
              </ToastProvider>
            </KVProvider>
          </TuiConfigProvider>
        </OpencodeKeymapProvider>
      </TestTuiContexts>
    )
  }

  const app = await testRender(() => <Harness />, { width, height: 20 })
  for (let attempt = 0; attempt < 20; attempt++) {
    await Bun.sleep(15)
    await app.renderOnce()
  }
  return app
}

function rows(frame: string): string[] {
  return frame.split("\n").filter((line) => line.trim().length > 0)
}

/**
 * The row's content line. The top border was removed (the composer frame
 * below already separates the surfaces), so the footer is exactly one row;
 * a footer that grows still shows up here as extra rows.
 */
function row(app: Awaited<ReturnType<typeof mountFooter>>): string {
  const lines = rows(app.captureCharFrame())
  expect(lines.length).toBe(1)
  return lines[0]!
}

test("the footer is one content row, from wide to very narrow", async () => {
  // 20 is past the point where the identity group alone overruns: the row is
  // expected to clip at its right edge, never to grow or wrap.
  for (const width of [140, 120, 100, 80, 60, 44, 30, 20]) {
    const app = await mountFooter(width)
    try {
      // The pre-fix frame was four rows at every one of these widths.
      expect(rows(app.captureCharFrame()).length).toBe(1)
    } finally {
      app.renderer.destroy()
    }
  }
})

test("the identity, the run and the status share the row", async () => {
  const app = await mountFooter(60)
  try {
    const line = row(app)
    // Each of these was on a row of its own before the direction fix.
    expect(line).toContain("mesh")
    expect(line).toContain("Gilded")
    expect(line).toContain("◎")
    expect(line).toContain("· run 2/2")
    expect(line).toContain("· done")
    expect(line.indexOf("mesh")).toBeLessThan(line.indexOf("Gilded"))
    expect(line.indexOf("Gilded")).toBeLessThan(line.indexOf("· run 2/2"))
  } finally {
    app.renderer.destroy()
  }
})

test("a wide terminal draws the whole readout, chips included", async () => {
  const app = await mountFooter(140)
  try {
    const line = row(app)
    expect(line).toContain("mesh Gilded ◎ · run 2/2 · done")
    expect(line).toContain(CONTEXT_RUN)
    for (const chip of ["parent", "prev", "next"]) expect(line).toContain(chip)
    // The chips are the row's right edge, and the readout keeps clear of them.
    expect(line.indexOf(CONTEXT_RUN)).toBeLessThan(line.indexOf("parent"))
  } finally {
    app.renderer.destroy()
  }
})

test("below the fit point the segments go whole, the chips first", async () => {
  const app = await mountFooter(60)
  try {
    const line = row(app)
    // The chips are static affordances with keyboard equivalents; the context
    // run is state with no other home in this shell, so it outlives them.
    expect(line).toContain(CONTEXT_RUN)
    expect(line).not.toContain("parent")
    expect(line).not.toContain("prev")
    expect(line).not.toContain("next")
  } finally {
    app.renderer.destroy()
  }
})

test("a narrow terminal drops the context run rather than shred it", async () => {
  const app = await mountFooter(44)
  try {
    const line = row(app)
    expect(line).toContain("mesh Gilded ◎ · run 2/2 · done")
    // Nothing of the telemetry survives: `ctx 45.0...3%` is a segment to decode,
    // not to read, and it was what the footer drew at this width.
    expect(line).not.toContain("ctx")
    expect(line).not.toContain("...")
    expect(line).not.toContain(CONTEXT_RUN_NARROW)
  } finally {
    app.renderer.destroy()
  }
})

test("a long agent name costs the segments beside it, not the row", async () => {
  const app = await mountFooter(60, "Verylongagentname")
  try {
    const line = row(app)
    expect(line).toContain("mesh Verylongagentname ◎")
    // The name is reserved at its real width, so what follows is what fits —
    // and the group keeps its own spaces rather than losing them to a shrink.
    expect(line).toContain("· run 2/2")
    expect(line).not.toContain("meshVerylongagentname")
  } finally {
    app.renderer.destroy()
  }
})
