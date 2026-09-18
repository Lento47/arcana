/** @jsxImportSource @opentui/solid */
/**
 * The kit's first renderable layer: values, not placeholders.
 *
 * Each component is asserted on the frame it actually paints — a sparkline
 * ladder, a half gauge, a progress bar with its ETA, a titled card, and a
 * collapsible that hides its body while collapsed.
 */
import { expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { RGBA } from "@opentui/core"
import { TestTuiProviders } from "./fixture/tui-providers"
import { fallbackTheme } from "../src/theme"
import { BrailleChart } from "../src/ui/kit/braille-chart"
import { Breadcrumbs } from "../src/ui/kit/breadcrumbs"
import { Card } from "../src/ui/kit/card"
import { Digits } from "../src/ui/kit/digits-view"
import { Collapsible } from "../src/ui/kit/collapsible"
import { Gauge } from "../src/ui/kit/gauge-view"
import { Histogram } from "../src/ui/kit/histogram-view"
import { minimapRows } from "../src/ui/kit/minimap"
import { Minimap } from "../src/ui/kit/minimap-view"
import { Progress } from "../src/ui/kit/progress-view"
import { RadarView } from "../src/ui/kit/radar-view"
import { Sparkline } from "../src/ui/kit/sparkline-view"
import { type Column } from "../src/ui/kit/table"
import { Table } from "../src/ui/kit/table-view"
import { timelineCells } from "../src/ui/kit/timeline"
import { flattenTree } from "../src/ui/kit/tree"
import { Tree } from "../src/ui/kit/tree-view"
import { Waterfall } from "../src/ui/kit/waterfall-view"

test("kit components render their values, not placeholders", async () => {
  const app = await testRender(
    () => (
      <TestTuiProviders>
        <box flexDirection="column" width="100%" height="100%" gap={1}>
          <Sparkline values={[0, 1, 2, 3, 4, 5, 6, 7]} width={8} />
          <Gauge ratio={0.5} width={8} label="ctx" />
          <Progress ratio={0.25} width={12} label="update" etaMs={90_000} />
          <Card title="Seal">
            <text>authorized 14</text>
          </Card>
          <Collapsible title="Findings" expanded={true} hint="3" onToggle={() => {}}>
            <text>denied fs.write</text>
          </Collapsible>
          <Collapsible title="Hidden" expanded={false} hint="0" onToggle={() => {}}>
            <text>never rendered</text>
          </Collapsible>
        </box>
      </TestTuiProviders>
    ),
    { width: 60, height: 30 },
  )

  try {
    let frame = ""
    for (let attempt = 0; attempt < 12; attempt++) {
      await app.renderOnce()
      await app.flush()
      const next = app.captureCharFrame()
      if (next.trim().length > 0 && next === frame) break
      frame = next
      await Bun.sleep(20)
    }

    expect(frame).toContain("▁▂▃▄▅▆▇█")
    expect(frame).toContain("ctx 50%")
    expect(frame).toContain("update")
    expect(frame).toContain("eta 1m 30s")
    expect(frame).toContain("Seal")
    expect(frame).toContain("authorized 14")
    expect(frame).toContain("Findings")
    expect(frame).toContain("denied fs.write")
    expect(frame).toContain("Hidden")
    expect(frame).not.toContain("never rendered")
  } finally {
    app.renderer.destroy()
  }
})

test("histogram and braille chart render their series", async () => {
  const app = await testRender(
    () => (
      <TestTuiProviders>
        <box flexDirection="column" width="100%" height="100%" gap={1}>
          <Histogram
            buckets={[new Map([["deny", 2]]), new Map([["deny", 1], ["allow", 1]])]}
            height={4}
            order={["deny", "allow"]}
            colors={{ deny: RGBA.fromHex("#FF0000"), allow: RGBA.fromHex("#00FF00") }}
          />
          <BrailleChart values={[0, 1, 2, 3, 4, 5, 4, 3, 2, 1]} width={10} height={4} fill />
        </box>
      </TestTuiProviders>
    ),
    { width: 40, height: 20 },
  )

  try {
    let frame = ""
    for (let attempt = 0; attempt < 12; attempt++) {
      await app.renderOnce()
      await app.flush()
      const next = app.captureCharFrame()
      if (next.trim().length > 0 && next === frame) break
      frame = next
      await Bun.sleep(20)
    }

    expect(frame).toContain("█")
    const hasBrailleInk = frame
      .split("\n")
      .some((line) => [...line].some((char) => char >= "\u2801" && char <= "\u28FF"))
    expect(hasBrailleInk).toBe(true)
  } finally {
    app.renderer.destroy()
  }
})

test("waterfall paints spans and marks under lane labels", async () => {
  const rows = timelineCells({
    spans: [{ lane: "main", start: 0, end: 100, kind: "tool" }],
    marks: [{ lane: "main", at: 50, kind: "fail", glyph: "✗" }],
    lanes: ["main"],
    start: 0,
    end: 100,
    width: 12,
  })
  const app = await testRender(
    () => (
      <TestTuiProviders>
        <box flexDirection="column" width="100%" height="100%">
          <Waterfall
            rows={rows}
            labels={["main"]}
            labelWidth={6}
            colors={{ tool: RGBA.fromHex("#888888"), fail: RGBA.fromHex("#FF0000") }}
          />
        </box>
      </TestTuiProviders>
    ),
    { width: 40, height: 10 },
  )

  try {
    let frame = ""
    for (let attempt = 0; attempt < 12; attempt++) {
      await app.renderOnce()
      await app.flush()
      const next = app.captureCharFrame()
      if (next.trim().length > 0 && next === frame) break
      frame = next
      await Bun.sleep(20)
    }
    expect(frame).toContain("main")
    expect(frame).toContain("─")
    expect(frame).toContain("✗")
  } finally {
    app.renderer.destroy()
  }
})

test("the minimap strip carries marks in ink, not in glyph confetti", async () => {
  const theme = fallbackTheme("dark")
  const cells = minimapRows(
    [
      { kind: "ask" },
      { kind: "tool" },
      { kind: "tool", mark: "✗" },
      { kind: "prose" },
      { kind: "tool" },
      { kind: "compaction", mark: "┈" },
    ],
    4,
  )
  const app = await testRender(
    () => (
      <TestTuiProviders>
        <box flexDirection="row" width="100%" height="100%">
          <box flexGrow={1} />
          <Minimap cells={cells} bracket={{ from: 2, to: 2 }} />
        </box>
      </TestTuiProviders>
    ),
    { width: 20, height: 8 },
  )

  try {
    let frame = ""
    for (let attempt = 0; attempt < 12; attempt++) {
      await app.renderOnce()
      await app.flush()
      const next = app.captureCharFrame()
      if (next.trim().length > 0 && next === frame) break
      frame = next
      await Bun.sleep(20)
    }
    // The shape is flat and thin: hairline ticks and a half-cell thumb, never
    // the mark glyphs themselves.
    expect(frame).toContain("▕")
    expect(frame).toContain("▐")
    expect(frame).not.toContain("✗")
    expect(frame).not.toContain("┈")

    // Meaning is ink: the failure tick takes the fail colour, the compaction
    // tick the brand colour, density the context ink, the slice the primary.
    const spanInk = (glyph: string, color: RGBA) =>
      app
        .captureSpans()
        .lines.flatMap((line) => line.spans)
        .some((span) => span.text.includes(glyph) && (span.fg as RGBA).toInts().join() === color.toInts().join())
    expect(spanInk("▕", theme.spineFail)).toBe(true)
    expect(spanInk("▕", theme.spineBrand)).toBe(true)
    expect(spanInk("▕", theme.borderSubtle)).toBe(true)
    expect(spanInk("▐", theme.primary)).toBe(true)
  } finally {
    app.renderer.destroy()
  }
})

test("tree and breadcrumbs render rails, marks and crumbs", async () => {
  const rows = flattenTree(
    [
      {
        id: "root",
        label: "main session",
        children: [{ id: "kid", label: "audit anti-slop", mark: "△" }],
      },
    ],
    new Set(["root"]),
  )
  const app = await testRender(
    () => (
      <TestTuiProviders>
        <box flexDirection="column" width="100%" height="100%">
          <Breadcrumbs items={["main session", "audit anti-slop"]} />
          <Tree rows={rows} />
        </box>
      </TestTuiProviders>
    ),
    { width: 60, height: 12 },
  )

  try {
    let frame = ""
    for (let attempt = 0; attempt < 12; attempt++) {
      await app.renderOnce()
      await app.flush()
      const next = app.captureCharFrame()
      if (next.trim().length > 0 && next === frame) break
      frame = next
      await Bun.sleep(20)
    }
    expect(frame).toContain("main session")
    expect(frame).toContain("›")
    expect(frame).toContain("└─")
    expect(frame).toContain("audit anti-slop")
    expect(frame).toContain("△")
  } finally {
    app.renderer.destroy()
  }
})

test("table renders headers, cells, and the selected row", async () => {
  const columns: Array<Column<{ state: string; id: string }>> = [
    { key: "state", label: "state", width: 10, value: (row) => row.state },
    { key: "id", label: "id", width: 12, value: (row) => row.id },
  ]
  const app = await testRender(
    () => (
      <TestTuiProviders>
        <box flexDirection="column" width="100%" height="100%">
          <Table
            columns={columns}
            rows={[
              { state: "denied", id: "appr_0001" },
              { state: "approved", id: "appr_0002" },
            ]}
            selected={1}
          />
        </box>
      </TestTuiProviders>
    ),
    { width: 40, height: 10 },
  )

  try {
    let frame = ""
    for (let attempt = 0; attempt < 12; attempt++) {
      await app.renderOnce()
      await app.flush()
      const next = app.captureCharFrame()
      if (next.trim().length > 0 && next === frame) break
      frame = next
      await Bun.sleep(20)
    }
    expect(frame).toContain("state")
    expect(frame).toContain("denied")
    expect(frame).toContain("approved")
    expect(frame).toContain("appr_0002")
  } finally {
    app.renderer.destroy()
  }
})

test("digits paint block figures", async () => {
  const app = await testRender(
    () => (
      <TestTuiProviders>
        <box flexDirection="column" width="100%" height="100%">
          <Digits text="4.2" />
        </box>
      </TestTuiProviders>
    ),
    { width: 30, height: 10 },
  )

  try {
    let frame = ""
    for (let attempt = 0; attempt < 12; attempt++) {
      await app.renderOnce()
      await app.flush()
      const next = app.captureCharFrame()
      if (next.trim().length > 0 && next === frame) break
      frame = next
      await Bun.sleep(20)
    }
    expect(frame).toContain("█")
    expect(frame).toContain("▀")
  } finally {
    app.renderer.destroy()
  }
})

test("radar view paints rings, core, sweep and status blips", async () => {
  const app = await testRender(
    () => (
      <TestTuiProviders>
        <box flexDirection="column" width="100%" height="100%">
          <RadarView
            agents={[
              { id: "run", index: 1, state: "running", progress: 0.4 },
              { id: "ok", index: 2, state: "done", progress: 1 },
              { id: "bad", index: 3, state: "failed", progress: 1 },
            ]}
            width={41}
            height={21}
            sweep={Math.PI / 4}
          />
        </box>
      </TestTuiProviders>
    ),
    { width: 60, height: 26 },
  )

  try {
    let frame = ""
    for (let attempt = 0; attempt < 12; attempt++) {
      await app.renderOnce()
      await app.flush()
      const next = app.captureCharFrame()
      if (next.trim().length > 0 && next === frame) break
      frame = next
      await Bun.sleep(20)
    }
    expect(frame).toContain("◆")
    expect(frame).toContain("●")
    expect(frame).toContain("✓")
    expect(frame).toContain("✗")
    expect(frame).toContain("01")
    expect(frame).toContain("·")
  } finally {
    app.renderer.destroy()
  }
})

test("the minimap bracket is one bar over empty and inked rows", async () => {
  // Two entries in six rows leave empty stretches between the inked cells;
  // the visible slice must still read as one continuous scrollbar bar.
  const cells = minimapRows([{ kind: "tool" }, { kind: "prose" }], 6)
  const app = await testRender(
    () => (
      <TestTuiProviders>
        <box flexDirection="row" width="100%" height="100%">
          <box flexGrow={1} />
          <Minimap cells={cells} bracket={{ from: 3, to: 5 }} />
        </box>
      </TestTuiProviders>
    ),
    { width: 20, height: 8 },
  )

  try {
    let frame = ""
    for (let attempt = 0; attempt < 12; attempt++) {
      await app.renderOnce()
      await app.flush()
      const next = app.captureCharFrame()
      if (next.trim().length > 0 && next === frame) break
      frame = next
      await Bun.sleep(20)
    }
    const lines = frame.split("\n").map((line) => line.replace(/\s+$/, ""))
    // The bracket spans rows 3..5 — two empty slices and one inked — and all
    // three draw the same continuous bar.
    expect(lines.filter((line) => line.endsWith("▐"))).toHaveLength(3)
    // Density outside the slice still ticks with the hairline.
    expect(frame).toContain("▕")
  } finally {
    app.renderer.destroy()
  }
})
