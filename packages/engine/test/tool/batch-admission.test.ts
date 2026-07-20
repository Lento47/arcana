import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import {
  classifyToolName,
  extractLockedPaths,
  pathLockStats,
  resetPathLockStatsForTest,
  resetToolAdmissionStatsForTest,
  toolAdmissionStats,
  withPathLocks,
  withToolAdmission,
} from "../../src/tool/batch"

describe("tool batch classify", () => {
  test("maps known tools to capabilities", () => {
    expect(classifyToolName("read")).toBe("read")
    expect(classifyToolName("grep")).toBe("read")
    expect(classifyToolName("webfetch")).toBe("network")
    expect(classifyToolName("edit")).toBe("write")
    expect(classifyToolName("bash")).toBe("shell")
    expect(classifyToolName("mystery")).toBe("unknown")
  })

  test("extracts locked paths from write tool args", () => {
    const paths = extractLockedPaths("write", { filePath: "L:\\PROJECTS\\arcana\\a.ts" })
    expect(paths.length).toBe(1)
    expect(paths[0]).toContain("a.ts")
  })
})

describe("tool batch path locks", () => {
  test("same path serializes exclusive holders", async () => {
    resetPathLockStatsForTest()
    let active = 0
    let maxActive = 0
    const path = "L:/tmp/phase2-same.ts"

    const work = () =>
      withPathLocks(
        [path],
        Effect.gen(function* () {
          active++
          maxActive = Math.max(maxActive, active)
          yield* Effect.sleep("40 millis")
          active--
        }),
      )

    await Effect.runPromise(Effect.all([work(), work(), work()], { concurrency: "unbounded" }))
    expect(maxActive).toBe(1)
  })

  test("disjoint paths run in parallel", async () => {
    resetPathLockStatsForTest()
    let active = 0
    let maxActive = 0

    const work = (p: string) =>
      withPathLocks(
        [p],
        Effect.gen(function* () {
          active++
          maxActive = Math.max(maxActive, active)
          yield* Effect.sleep("50 millis")
          active--
        }),
      )

    await Effect.runPromise(
      Effect.all(
        [work("L:/tmp/phase2-a.ts"), work("L:/tmp/phase2-b.ts"), work("L:/tmp/phase2-c.ts")],
        { concurrency: "unbounded" },
      ),
    )
    expect(maxActive).toBeGreaterThan(1)
  })
})

describe("tool batch admission", () => {
  test("same-file writes serialize even with write concurrency > 1", async () => {
    resetToolAdmissionStatsForTest()
    resetPathLockStatsForTest()
    let active = 0
    let maxActive = 0
    const filePath = "L:/tmp/phase2-overlap.ts"

    const work = (name: string) =>
      withToolAdmission(
        name,
        Effect.gen(function* () {
          active++
          maxActive = Math.max(maxActive, active)
          yield* Effect.sleep("40 millis")
          active--
          return name
        }),
        { input: { filePath } },
      )

    await Effect.runPromise(
      Effect.all([work("write"), work("edit"), work("write")], { concurrency: "unbounded" }),
    )

    expect(maxActive).toBe(1)
  })

  test("disjoint file writes may run concurrently", async () => {
    resetToolAdmissionStatsForTest()
    resetPathLockStatsForTest()
    let active = 0
    let maxActive = 0

    const work = (filePath: string) =>
      withToolAdmission(
        "write",
        Effect.gen(function* () {
          active++
          maxActive = Math.max(maxActive, active)
          yield* Effect.sleep("50 millis")
          active--
          return filePath
        }),
        { input: { filePath } },
      )

    await Effect.runPromise(
      Effect.all(
        [work("L:/tmp/phase2-w1.ts"), work("L:/tmp/phase2-w2.ts"), work("L:/tmp/phase2-w3.ts")],
        { concurrency: "unbounded" },
      ),
    )

    expect(maxActive).toBeGreaterThan(1)
    expect(maxActive).toBeLessThanOrEqual(toolAdmissionStats().limits.write)
  })

  test("reads may run concurrently up to pool limit", async () => {
    resetToolAdmissionStatsForTest()
    let active = 0
    let maxActive = 0

    const work = (i: number) =>
      withToolAdmission(
        "read",
        Effect.gen(function* () {
          active++
          maxActive = Math.max(maxActive, active)
          yield* Effect.sleep("40 millis")
          active--
          return i
        }),
      )

    await Effect.runPromise(
      Effect.all(Array.from({ length: 6 }, (_, i) => work(i)), { concurrency: "unbounded" }),
    )

    expect(maxActive).toBeGreaterThan(1)
    expect(maxActive).toBeLessThanOrEqual(8)
  })
})
