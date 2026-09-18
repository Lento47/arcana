import { describe, expect, test } from "bun:test"
import { radarGrid, type RadarAgent } from "../src/ui/kit/radar"

function agent(overrides: Partial<RadarAgent> & { id: string }): RadarAgent {
  return { index: 1, state: "running", progress: 0, ...overrides }
}

describe("radarGrid", () => {
  test("grid dimensions and the core", () => {
    const grid = radarGrid({ width: 21, height: 11, sweep: 0, agents: [] })
    expect(grid.rows.length).toBe(11)
    for (const row of grid.rows) expect(row.length).toBe(21)
    expect(grid.rows[5]![10]).toEqual({ char: "◆", tone: "core" })
    expect(grid.placements).toEqual([])
  })

  test("range rings are dotted at the three fractions", () => {
    const grid = radarGrid({ width: 41, height: 21, sweep: 0, agents: [] })
    const rings = grid.rows.flat().filter((cell) => cell?.tone === "ring")
    expect(rings.length).toBeGreaterThan(30)
  })

  test("agents take deterministic slots around the wave", () => {
    const agents = [1, 2, 3, 4].map((index) => agent({ id: `a${index}`, index, progress: 0.5 }))
    const grid = radarGrid({ width: 41, height: 21, sweep: Math.PI / 4, agents })
    expect(grid.placements.map((placement) => placement.id)).toEqual(["a1", "a2", "a3", "a4"])
    const [top, right, bottom, left] = grid.placements
    expect(top!.angle).toBeCloseTo(-Math.PI / 2)
    expect(right!.angle).toBeCloseTo(0)
    expect(bottom!.angle).toBeCloseTo(Math.PI / 2)
    expect(left!.angle).toBeCloseTo(Math.PI)
    expect(top!.y).toBeLessThan(right!.y)
    expect(bottom!.y).toBeGreaterThan(right!.y)
    expect(left!.x).toBeLessThan(right!.x)
  })

  test("progress moves a running blip outward; settled work pins the rim", () => {
    const near = radarGrid({ width: 41, height: 21, sweep: 0, agents: [agent({ id: "near", progress: 0.05 })] })
    const far = radarGrid({ width: 41, height: 21, sweep: 0, agents: [agent({ id: "far", progress: 0.95 })] })
    expect(far.placements[0]!.radius).toBeGreaterThan(near.placements[0]!.radius)
    for (const state of ["done", "failed"] as const) {
      const settled = radarGrid({ width: 41, height: 21, sweep: 0, agents: [agent({ id: state, state, progress: 0 })] })
      expect(settled.placements[0]!.radius).toBe(1)
    }
  })

  test("a blip paints its status glyph at its placement", () => {
    const agents = [
      agent({ id: "run", state: "running", progress: 0.8 }),
      agent({ id: "wait", state: "waiting", progress: 0.8 }),
      agent({ id: "ok", state: "done", progress: 0.8 }),
      agent({ id: "bad", state: "failed", progress: 0.8 }),
    ]
    const grid = radarGrid({ width: 41, height: 21, sweep: Math.PI / 4, agents })
    const glyphs: Record<string, string> = { running: "●", waiting: "○", done: "✓", failed: "✗" }
    for (const placement of grid.placements) {
      const state = agents.find((candidate) => candidate.id === placement.id)!.state
      expect(grid.rows[placement.y]![placement.x]).toEqual({ char: glyphs[state], tone: state })
    }
  })

  test("the sweep lights a running blip when it passes", () => {
    const top = agent({ id: "top", index: 1, state: "running", progress: 0.8 })
    const cold = radarGrid({ width: 41, height: 21, sweep: 0, agents: [top] })
    const hot = radarGrid({ width: 41, height: 21, sweep: -Math.PI / 2, agents: [top] })
    const [coldBlip] = cold.placements
    const [hotBlip] = hot.placements
    expect(cold.rows[coldBlip!.y]![coldBlip!.x]!.char).toBe("●")
    expect(hot.rows[hotBlip!.y]![hotBlip!.x]!.char).toBe("◉")
  })

  test("the sweep sits on the east and west rim as it rotates", () => {
    const east = radarGrid({ width: 41, height: 21, sweep: 0, agents: [] })
    const west = radarGrid({ width: 41, height: 21, sweep: Math.PI, agents: [] })
    const sweepColumns = (grid: ReturnType<typeof radarGrid>) =>
      grid.rows.flatMap((row, y) => row.map((cell, x) => (cell?.tone === "sweep" ? x : -1))).filter((x) => x >= 0)
    expect(Math.max(...sweepColumns(east))).toBeGreaterThan(38)
    expect(Math.min(...sweepColumns(west))).toBeLessThan(2)
  })

  test("degenerate sizes and non-finite inputs do not throw", () => {
    const grid = radarGrid({
      width: 1,
      height: 1,
      sweep: Number.NaN,
      agents: [agent({ id: "x", index: 0, progress: Number.NaN })],
    })
    expect(grid.rows.length).toBe(1)
    expect(grid.placements.length).toBe(1)
    expect(grid.rows[0]![0]).toEqual({ char: "◆", tone: "core" })
  })
})
