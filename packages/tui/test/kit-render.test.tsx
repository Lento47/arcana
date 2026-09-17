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
import { BrailleChart } from "../src/ui/kit/braille-chart"
import { Card } from "../src/ui/kit/card"
import { Collapsible } from "../src/ui/kit/collapsible"
import { Gauge } from "../src/ui/kit/gauge-view"
import { Histogram } from "../src/ui/kit/histogram-view"
import { Progress } from "../src/ui/kit/progress-view"
import { Sparkline } from "../src/ui/kit/sparkline-view"
import { timelineCells } from "../src/ui/kit/timeline"
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
