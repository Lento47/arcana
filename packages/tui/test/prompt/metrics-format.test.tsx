/** @jsxImportSource @opentui/solid */
import { RGBA } from "@opentui/core"
import { testRender, type JSX } from "@opentui/solid"
import { describe, expect, test } from "bun:test"
import { displayWidth } from "../../src/util/locale"
import {
  formatMetricsBorder,
  formatSessionMetrics,
  METRICS_BORDER_OVERHEAD,
} from "../../src/component/prompt/metrics"
import { PromptMetricsBorder } from "../../src/component/prompt/metrics-border"
import { RoundBorder } from "../../src/ui/chrome"

const reference = {
  elapsedSeconds: 4 * 60 + 12,
  inputTokens: 12_400,
  outputTokens: 3_100,
  totalTokens: 42_800,
  ttftMs: 340,
  cacheReadTokens: 8_200,
  cacheWriteTokens: 2_100,
  costUsd: 0.08,
}

describe("command-spine metrics formatting", () => {
  test("matches the wide reference ordering and spacing", () => {
    const text = formatSessionMetrics(reference)
    expect(text).toBe(
      `⌬ 4m 12s  ·  12.4k↓  3.1k↑  ·  42.8k total  ·  340ms ttft  ·  8.2k↺  ·  2.1k↻  ·  ${new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(0.08)}`,
    )
  })

  test("uses priority collapse without wrapping", () => {
    const text = formatSessionMetrics(reference, 50)
    expect(text).toContain("⌬ 4m 12s")
    expect(text).toContain("42.8k total")
    expect(text).toContain("$0.08")
    expect(text).not.toContain("ttft")
    expect(text).not.toContain("↺")
    expect(text).not.toContain("↻")
    expect(displayWidth(text)).toBeLessThanOrEqual(50)
    expect(text).not.toContain("\n")
  })

  test("keeps context pressure visible after optional details collapse", () => {
    const text = formatSessionMetrics({ ...reference, pressure: "compact now" }, 45)
    expect(text).toContain("ctx now")
    expect(text).not.toContain("ttft")
    expect(displayWidth(text)).toBeLessThanOrEqual(45)
  })
})

describe("rounded metrics border", () => {
  function renderBorder(width: number, metrics: string): JSX.Element {
    return (
      <box width={width} height={1}>
        <PromptMetricsBorder frameWidth={() => width} metrics={() => metrics} color={RGBA.fromHex("#ffffff")} />
      </box>
    )
  }

  test("renders as one non-wrapping OpenTUI row", async () => {
    const width = 80
    const app = await testRender(() => renderBorder(width, formatSessionMetrics(reference)), { width, height: 2 })
    try {
      await app.renderOnce()
      const frame = app.captureCharFrame()
      const lines = frame.split("\n").filter((line) => line.trim().length > 0)
      expect(lines).toHaveLength(1)
      expect(displayWidth(lines[0]!)).toBe(width)
      expect(lines[0]!.startsWith("╰")).toBe(true)
      expect(lines[0]!.endsWith("╯")).toBe(true)
    } finally {
      app.renderer.destroy()
    }
  })

  test("owns the full width and keeps both corners", () => {
    const metrics = formatSessionMetrics(reference)
    const width = displayWidth(metrics) + METRICS_BORDER_OVERHEAD
    const line = formatMetricsBorder(metrics, width)
    expect(displayWidth(line)).toBe(width)
    expect(line.startsWith("╰")).toBe(true)
    expect(line.endsWith("╯")).toBe(true)
    expect(line).toContain(metrics)
    expect(line).not.toContain("\n")
  })

  test("truncates metrics before the closing corner at narrow widths", () => {
    const line = formatMetricsBorder(formatSessionMetrics(reference), 24)
    expect(displayWidth(line)).toBe(24)
    expect(line.startsWith("╰")).toBe(true)
    expect(line.endsWith("╯")).toBe(true)
  })

  test("OpenTUI top and side border keeps rounded top corners", async () => {
    const width = 24
    const app = await testRender(
      () => (
        <box width={width} height={3} border={["top", "left", "right"]} customBorderChars={RoundBorder}>
          <text>prompt</text>
        </box>
      ),
      { width, height: 3 },
    )
    try {
      await app.renderOnce()
      const frame = app.captureCharFrame()
      expect(frame).toContain("╭")
      expect(frame).toContain("╮")
    } finally {
      app.renderer.destroy()
    }
  })
})
