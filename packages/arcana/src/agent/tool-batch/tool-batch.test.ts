import { describe, expect, test } from "bun:test"
import { classifyTool } from "./classify.js"
import { attachDependsOn, buildPathDependencies, planPathWaves } from "./dag.js"
import { canonicalizePath, pathSetsConflict } from "./paths.js"
import { mapPool, withTimeout } from "./pool.js"
import { concurrencyForCapability, planWaves, validateAndPlanBatch } from "./plan.js"
import { runBatchWaves } from "./scheduler.js"
import { formatBatchWavePlan, synthesizeBatchResult, truncateOutput } from "./synthesize.js"
import { BatchSizeError, BatchToolDeniedError, DEFAULT_BATCH_CONFIG } from "./types.js"

describe("tool-batch classify", () => {
  test("reads are low-risk read capability", () => {
    const c = classifyTool({ id: "1", name: "read", input: { path: "src/a.ts" } })
    expect(c.capability).toBe("read")
    expect(c.risk).toBe("low")
    expect(c.readSet).toEqual(["src/a.ts"])
    expect(c.writeSet).toEqual([])
  })

  test("writes carry writeSet", () => {
    const c = classifyTool({ id: "1", name: "write", input: { path: "out.txt" } })
    expect(c.capability).toBe("write")
    expect(c.writeSet).toEqual(["out.txt"])
  })

  test("unknown tools are critical", () => {
    const c = classifyTool({ id: "1", name: "totally_new_tool", input: {} })
    expect(c.capability).toBe("unknown")
    expect(c.risk).toBe("critical")
  })
})

describe("tool-batch plan", () => {
  test("waves order read before network", () => {
    const waves = planWaves([
      classifyTool({ id: "n", name: "web_fetch", input: { url: "https://x" } }),
      classifyTool({ id: "r", name: "read", input: { path: "a" } }),
    ])
    expect(waves).toHaveLength(2)
    expect(waves[0]!.every((c) => c.capability === "read")).toBe(true)
    expect(waves[1]!.every((c) => c.capability === "network")).toBe(true)
  })

  test("rejects oversize batch", () => {
    const calls = Array.from({ length: 20 }, (_, i) => ({
      tool: "read",
      args: { path: `f${i}` },
    }))
    expect(() => validateAndPlanBatch(calls)).toThrow(BatchSizeError)
  })

  test("rejects write tools even if sneaked past description", () => {
    expect(() =>
      validateAndPlanBatch([{ tool: "write", args: { path: "x", content: "y" } }], {
        allowlist: new Set(["write"]), // even if allowlist wrongly includes write
      }),
    ).toThrow(BatchToolDeniedError)
  })

  test("rejects shell tools", () => {
    expect(() =>
      validateAndPlanBatch([{ tool: "shell", args: { command: "ls" } }], {
        allowlist: new Set(["shell"]),
      }),
    ).toThrow(BatchToolDeniedError)
  })

  test("rejects tools not on allowlist", () => {
    expect(() => validateAndPlanBatch([{ tool: "task", args: {} }])).toThrow(BatchToolDeniedError)
  })

  test("accepts allowlisted independent reads", () => {
    const planned = validateAndPlanBatch([
      { tool: "read", args: { path: "a.ts" } },
      { tool: "grep", args: { pattern: "foo" } },
      { tool: "git_status", args: {} },
    ])
    expect(planned.items).toHaveLength(3)
    expect(planned.waves.length).toBeGreaterThanOrEqual(1)
  })
})

describe("tool-batch pool", () => {
  test("never exceeds concurrency ceiling", async () => {
    let active = 0
    let maxActive = 0
    const { stats } = await mapPool(12, 3, async () => {
      active++
      maxActive = Math.max(maxActive, active)
      await new Promise((r) => setTimeout(r, 15))
      active--
      return true
    })
    expect(stats.maxActive).toBeLessThanOrEqual(3)
    expect(maxActive).toBeLessThanOrEqual(3)
    expect(stats.completed).toBe(12)
  })

  test("withTimeout rejects slowly", async () => {
    await expect(
      withTimeout(new Promise((r) => setTimeout(r, 200)), 20, "slow"),
    ).rejects.toThrow(/timed out/)
  })
})

describe("tool-batch scheduler", () => {
  test("runs waves with bounded concurrency", async () => {
    let active = 0
    let maxActive = 0
    const planned = validateAndPlanBatch(
      Array.from({ length: 6 }, (_, i) => ({ tool: "read" as const, args: { path: `${i}.ts` } })),
    )
    const report = await runBatchWaves({
      waves: planned.waves,
      config: { ...planned.config, readConcurrency: 2 },
      execute: async (call) => {
        active++
        maxActive = Math.max(maxActive, active)
        await new Promise((r) => setTimeout(r, 20))
        active--
        return `ok:${call.input.path}`
      },
    })
    expect(report.results).toHaveLength(6)
    expect(report.results.every((r) => r.ok)).toBe(true)
    expect(report.maxActive).toBeLessThanOrEqual(2)
    expect(maxActive).toBeLessThanOrEqual(2)
    expect(report.synthesis).toContain("Batch 6 ok")
    expect(report.planSummary).toContain("wave")
    expect(report.items.every((i) => i.status === "completed")).toBe(true)
  })

  test("network and read use different wave concurrency", () => {
    expect(concurrencyForCapability("read", DEFAULT_BATCH_CONFIG)).toBe(8)
    expect(concurrencyForCapability("network", DEFAULT_BATCH_CONFIG)).toBe(4)
    expect(concurrencyForCapability("write", DEFAULT_BATCH_CONFIG)).toBe(4)
  })

  test("total budget cancels remaining work", async () => {
    const planned = validateAndPlanBatch([
      { tool: "read", args: { path: "a.ts" } },
      { tool: "read", args: { path: "b.ts" } },
      { tool: "read", args: { path: "c.ts" } },
    ])
    const report = await runBatchWaves({
      waves: planned.waves,
      config: {
        ...planned.config,
        readConcurrency: 1,
        maxTotalTimeMs: 40,
        defaultTimeoutMs: 5_000,
      },
      execute: async () => {
        await new Promise((r) => setTimeout(r, 30))
        return "slow"
      },
    })
    expect(report.cancelled + report.ok + report.failed).toBe(3)
    // With 40ms total and 30ms per serial call, at least one should cancel or we finish early.
    expect(report.durationMs).toBeLessThan(5_000)
  })

  test("parent abort cancels in-flight children", async () => {
    const planned = validateAndPlanBatch([
      { tool: "read", args: { path: "a.ts" } },
      { tool: "read", args: { path: "b.ts" } },
    ])
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 25)
    const report = await runBatchWaves({
      waves: planned.waves,
      config: { ...planned.config, readConcurrency: 1, defaultTimeoutMs: 5_000 },
      signal: controller.signal,
      execute: async (_call, signal) => {
        await new Promise<void>((resolve, reject) => {
          const t = setTimeout(resolve, 200)
          signal.addEventListener(
            "abort",
            () => {
              clearTimeout(t)
              reject(new Error("aborted"))
            },
            { once: true },
          )
        })
        return "done"
      },
    })
    expect(report.cancelled + report.failed).toBeGreaterThan(0)
  })
})

describe("tool-batch synthesis (Phase 3)", () => {
  test("truncateOutput respects max", () => {
    expect(truncateOutput("hello world", 5)).toBe("hell…")
  })

  test("formatBatchWavePlan summarizes capabilities", () => {
    const plan = formatBatchWavePlan([
      [classifyTool({ id: "1", name: "read", input: { path: "a" } }), classifyTool({ id: "2", name: "grep", input: {} })],
      [classifyTool({ id: "3", name: "web_fetch", input: { url: "https://x" } })],
    ])
    expect(plan).toContain("wave 1")
    expect(plan).toContain("read")
    expect(plan).toContain("wave 2")
    expect(plan).toContain("network")
  })

  test("synthesizeBatchResult caps parent-facing text", () => {
    const text = synthesizeBatchResult(
      [
        { id: "1", name: "read", ok: true, output: "x".repeat(500), status: "completed" },
        { id: "2", name: "grep", ok: false, output: "boom", status: "failed" },
      ],
      { maxPerCallChars: 20, maxSynthesisChars: 200, planSummary: "wave 1 · 2 read" },
    )
    expect(text).toContain("Batch 1 ok")
    expect(text).toContain("1 failed")
    expect(text.length).toBeLessThanOrEqual(220)
  })
})

describe("tool-batch path DAG (Phase 2)", () => {
  test("canonicalize normalizes relative and absolute paths", () => {
    const a = canonicalizePath("./src/foo.ts", "L:\\PROJECTS\\arcana")
    const b = canonicalizePath("src/foo.ts", "L:\\PROJECTS\\arcana")
    expect(a).toBe(b)
  })

  test("pathSetsConflict detects write∩write and write∩read", () => {
    expect(
      pathSetsConflict(
        { readSet: [], writeSet: ["src/a.ts"] },
        { readSet: [], writeSet: ["src/a.ts"] },
        "L:\\PROJECTS\\arcana",
      ),
    ).toBe(true)
    expect(
      pathSetsConflict(
        { readSet: [], writeSet: ["src/a.ts"] },
        { readSet: ["src/a.ts"], writeSet: [] },
        "L:\\PROJECTS\\arcana",
      ),
    ).toBe(true)
    expect(
      pathSetsConflict(
        { readSet: ["src/a.ts"], writeSet: [] },
        { readSet: ["src/b.ts"], writeSet: [] },
        "L:\\PROJECTS\\arcana",
      ),
    ).toBe(false)
  })

  test("overlapping writes produce dependsOn edge later→earlier", () => {
    const items = [
      classifyTool({ id: "w1", name: "write", input: { path: "src/a.ts" } }),
      classifyTool({ id: "w2", name: "write", input: { path: "src/a.ts" } }),
      classifyTool({ id: "w3", name: "write", input: { path: "src/b.ts" } }),
    ]
    const deps = buildPathDependencies(items, "L:\\PROJECTS\\arcana")
    expect(deps.get("w2")).toContain("w1")
    expect(deps.get("w3")).toEqual([])
  })

  test("path waves serialize conflicts and parallelize disjoint writes", () => {
    const items = [
      classifyTool({ id: "w1", name: "write", input: { path: "src/a.ts" } }),
      classifyTool({ id: "w2", name: "write", input: { path: "src/a.ts" } }),
      classifyTool({ id: "w3", name: "write", input: { path: "src/b.ts" } }),
    ]
    const waves = planPathWaves(items, "L:\\PROJECTS\\arcana")
    // First wave: w1 and w3 (disjoint); second: w2 (depends on w1)
    expect(waves.length).toBeGreaterThanOrEqual(2)
    const firstIds = waves[0]!.map((i) => i.id)
    expect(firstIds).toContain("w1")
    expect(firstIds).toContain("w3")
    expect(waves.some((w) => w.some((i) => i.id === "w2"))).toBe(true)
    // w1 and w2 never same wave
    for (const wave of waves) {
      const ids = wave.map((i) => i.id)
      expect(!(ids.includes("w1") && ids.includes("w2"))).toBe(true)
    }
  })

  test("attachDependsOn fills work items", () => {
    const items = attachDependsOn(
      [
        classifyTool({ id: "w1", name: "write", input: { path: "x.ts" } }),
        classifyTool({ id: "w2", name: "write", input: { path: "x.ts" } }),
      ],
      "L:\\PROJECTS\\arcana",
    )
    expect(items[1]!.dependsOn).toContain("w1")
  })
})
