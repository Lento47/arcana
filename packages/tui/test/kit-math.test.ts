import { describe, expect, test } from "bun:test"
import { bucketEvents, bucketTotal, barCells, stackCells, timeBuckets } from "../src/ui/kit/bars"
import { BrailleGrid, brailleSeries, plotSeries } from "../src/ui/kit/braille"
import { gaugeCells, labeledGauge } from "../src/ui/kit/gauge"
import { chunks, clamp01, extent, normalize } from "../src/ui/kit/scale"
import { SparkMean, sparkline, SPARK_GLYPHS } from "../src/ui/kit/sparkline"
import { burnSeries } from "../src/ui/kit/telemetry"

describe("kit scale", () => {
  test("clamp01 bounds and forgives non-finite input", () => {
    expect(clamp01(Number.NaN)).toBe(0)
    expect(clamp01(-1)).toBe(0)
    expect(clamp01(0.5)).toBe(0.5)
    expect(clamp01(2)).toBe(1)
  })

  test("extent ignores non-finite samples and reads empty as 0..0", () => {
    expect(extent([3, Number.NaN, 7, Number.POSITIVE_INFINITY])).toEqual({ min: 3, max: 7 })
    expect(extent([])).toEqual({ min: 0, max: 0 })
  })

  test("normalize is zero-baselined and clamped", () => {
    expect(normalize(50, 100)).toBe(0.5)
    expect(normalize(150, 100)).toBe(1)
    expect(normalize(50, 0)).toBe(0)
    expect(normalize(Number.NaN, 100)).toBe(0)
  })

  test("chunks splits evenly and the last chunk absorbs the remainder", () => {
    expect(chunks([1, 2, 3, 4], 2)).toEqual([[1, 2], [3, 4]])
    expect(chunks([1, 2, 3, 4, 5], 2)).toEqual([[1, 2, 3], [4, 5]])
    expect(chunks([1, 2], 4)).toEqual([[1], [2]])
    expect(chunks([1], 0)).toEqual([])
  })
})

describe("kit sparkline", () => {
  test("empty and zero-width series render nothing", () => {
    expect(sparkline([], 8)).toBe("")
    expect(sparkline([1, 2], 0)).toBe("")
  })

  test("a short series pads on the left so the newest sample is rightmost", () => {
    expect(sparkline([5], 4)).toBe("   █")
  })

  test("a monotonic ramp walks the glyph ladder", () => {
    // level = floor(value / max * 8), saturating at the eighth step.
    expect(sparkline([0, 1, 2, 3, 4, 5, 6, 7], 8)).toBe(SPARK_GLYPHS.join(""))
  })

  test("an all-zero series renders the lowest bar, never a full one", () => {
    expect(sparkline([0, 0, 0], 3)).toBe("▁▁▁")
  })

  test("non-finite samples are dropped, not painted", () => {
    expect(sparkline([Number.NaN, 4], 2)).toBe("▁█")
  })

  test("summary choice changes the bars", () => {
    // Two buckets over the same data: mean picks the middle of each chunk,
    // max takes the tallest sample.
    expect(sparkline([0, 10, 10, 10], 2, SparkMean)).toBe("▅█")
    expect(sparkline([0, 10, 10, 10], 2)).toBe("██")
  })
})

describe("kit braille", () => {
  test("dot bits follow the standard braille assignment", () => {
    const grid = new BrailleGrid(1, 1)
    grid.set(0, 0)
    expect(grid.render()[0]).toBe("⠁")
    grid.clear()
    grid.set(1, 0)
    expect(grid.render()[0]).toBe("⠈")
    grid.clear()
    grid.set(0, 3)
    expect(grid.render()[0]).toBe("⡀")
    grid.clear()
    for (let x = 0; x < 2; x++) for (let y = 0; y < 4; y++) grid.set(x, y)
    expect(grid.render()[0]).toBe("⣿")
  })

  test("out-of-bounds dots are dropped", () => {
    const grid = new BrailleGrid(1, 1)
    grid.set(-1, 0)
    grid.set(2, 0)
    grid.set(0, 4)
    expect(grid.render()[0]).toBe("⠀")
  })

  test("plot draws a continuous line", () => {
    const grid = new BrailleGrid(2, 1)
    grid.plot(0, 0, 3, 0)
    expect(grid.render()[0]).toBe("⠉⠉")
  })

  test("plotSeries spans the grid and keeps a zero baseline", () => {
    const grid = new BrailleGrid(2, 2)
    plotSeries(grid, [0, 1, 0, 1])
    const rows = grid.render()
    expect(rows).toHaveLength(2)
    expect(rows.join("")).not.toBe("\u2800".repeat(4))
  })

  test("brailleSeries on an empty series is blank, not broken", () => {
    expect(brailleSeries([], 2, 2)).toEqual(["\u2800".repeat(2), "\u2800".repeat(2)])
  })
})

describe("kit bars", () => {
  test("timeBuckets divides the range and the last bucket ends at the end", () => {
    expect(timeBuckets(0, 100, 4)).toEqual([
      { start: 0, end: 25 },
      { start: 25, end: 50 },
      { start: 50, end: 75 },
      { start: 75, end: 100 },
    ])
    expect(timeBuckets(10, 10, 4)).toEqual([])
    expect(timeBuckets(0, 100, 0)).toEqual([])
  })

  test("bucketEvents assigns half-open buckets and drops out-of-range events", () => {
    const buckets = bucketEvents(
      [
        { at: 0, kind: "deny" },
        { at: 24, kind: "allow" },
        { at: 25, kind: "deny" },
        { at: 99, kind: "approve" },
        { at: 100, kind: "deny" },
        { at: Number.NaN, kind: "deny" },
      ],
      0,
      100,
      4,
    )
    expect(buckets[0]!.get("deny")).toBe(1)
    expect(buckets[0]!.get("allow")).toBe(1)
    expect(buckets[1]!.get("deny")).toBe(1)
    expect(buckets[3]!.get("approve")).toBe(1)
    expect(bucketTotal(buckets[2]!)).toBe(0)
    expect(buckets.reduce((sum, bucket) => sum + bucketTotal(bucket), 0)).toBe(4)
  })

  test("barCells proportion, degenerate max, zero width", () => {
    expect(barCells(1, 2, 4)).toBe("██░░")
    expect(barCells(5, 0, 4)).toBe("░░░░")
    expect(barCells(1, 2, 0)).toBe("")
  })

  test("stackCells stacks bottom-up and scales to the tallest bucket", () => {
    const buckets = [new Map([["deny", 2]]), new Map([["deny", 1], ["allow", 1]])]
    expect(stackCells(buckets, 4, ["deny", "allow"])).toEqual([
      ["deny", "allow"],
      ["deny", "allow"],
      ["deny", "deny"],
      ["deny", "deny"],
    ])
  })

  test("stackCells keeps a lone decision visible against a tall bucket", () => {
    const rows = stackCells([new Map([["deny", 1]]), new Map([["deny", 10]])], 5, ["deny"])
    expect(rows[4]).toEqual(["deny", "deny"])
    expect(rows[0]).toEqual([null, "deny"])
    expect(rows.filter((row) => row[0] === "deny")).toHaveLength(1)
  })
})

describe("kit gauge", () => {
  test("ends are exact; the middle uses eighth blocks", () => {
    expect(gaugeCells(0, 4)).toBe("░░░░")
    expect(gaugeCells(1, 4)).toBe("████")
    expect(gaugeCells(0.5, 4)).toBe("██░░")
    expect(gaugeCells(0.625, 4)).toBe("██▌░")
    expect(gaugeCells(Number.NaN, 3)).toBe("░░░")
    expect(gaugeCells(0.5, 0)).toBe("")
  })

  test("labeledGauge never hides the value behind a clipped bar", () => {
    expect(labeledGauge(0.5, 4, "ctx")).toBe("██░░ ctx 50%")
    expect(labeledGauge(Number.NaN, 4)).toBe("░░░░ 0%")
  })
})

describe("kit telemetry", () => {
  test("burn keeps assistant turns with context, oldest to newest", () => {
    const messages = [
      { role: "user", tokens: { input: 5 } },
      { role: "assistant", tokens: { input: 100, output: 10 } },
      { role: "assistant", tokens: { input: 0, output: 0 } },
      { role: "assistant", tokens: { input: 200, output: 20, reasoning: 5 } },
    ]
    expect(burnSeries(messages)).toEqual([110, 225])
  })

  test("limit keeps the newest turns", () => {
    const messages = [1, 2, 3, 4].map((n) => ({ role: "assistant", tokens: { input: n * 10 } }))
    expect(burnSeries(messages, 2)).toEqual([30, 40])
  })
})
