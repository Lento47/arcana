import { expect, test } from "bun:test"
import { Effect } from "effect"
import { createEngine, type WorkflowExecutors } from "../../src/workflow/engine"
import type { WorkflowPlan, WorkflowSnapshot } from "../../src/workflow/schema"

function runWorkflow(plan: WorkflowPlan, overrides: Partial<WorkflowExecutors> = {}) {
  const snapshots: WorkflowSnapshot[] = []
  const engine = createEngine({
    runSubagent: (i) => Effect.succeed(`agent:${i.description}`),
    promptLLM: (p) => Effect.succeed(`llm:${p}`),
    onProgress: (s) => Effect.sync(() => snapshots.push(s)),
    ...overrides,
  })
  return Effect.runPromise(engine.execute(plan)).then((result) => ({ result, snapshots }))
}

const byId = <T extends { id: string }>(runs: T[], id: string) => runs.find((r) => r.id === id)!

test("independent steps are dispatched in parallel", async () => {
  const plan: WorkflowPlan = {
    title: "fan-out",
    description: "two independent agents then merge",
    steps: [
      { id: "a", type: "subagent", description: "a" },
      { id: "b", type: "subagent", description: "b" },
      { id: "c", type: "merge", description: "c", dependsOn: ["a", "b"], sources: ["a", "b"] },
    ],
  }
  const { result, snapshots } = await runWorkflow(plan)

  // A wave sets every ready step to "running" in one snapshot before executing —
  // so a snapshot with >=2 running proves they were dispatched together.
  const parallel = snapshots.some((s) => s.steps.filter((x) => x.status === "running").length >= 2)
  expect(parallel).toBe(true)

  expect(byId(result.runs, "c").status).toBe("completed")
  expect(result.outputs.c).toContain("agent:a")
  expect(result.outputs.c).toContain("agent:b")
})

test("condition skips the untaken branch", async () => {
  const plan: WorkflowPlan = {
    title: "branch",
    description: "branch on a prior output",
    steps: [
      { id: "a", type: "prompt", description: "a" },
      { id: "cond", type: "condition", description: "c", dependsOn: ["a"], condition: "a.includes('llm')", ifTrue: ["t"], ifFalse: ["f"] },
      { id: "t", type: "prompt", description: "t", dependsOn: ["cond"] },
      { id: "f", type: "prompt", description: "f", dependsOn: ["cond"] },
    ],
  }
  const { result } = await runWorkflow(plan)

  expect(byId(result.runs, "cond").output).toBe("true")
  expect(byId(result.runs, "t").status).toBe("completed")
  expect(byId(result.runs, "f").status).toBe("skipped")
})

test("skip propagates to steps that depend only on skipped steps", async () => {
  const plan: WorkflowPlan = {
    title: "propagate",
    description: "false branch skips a chain",
    steps: [
      { id: "cond", type: "condition", description: "c", condition: "false", ifTrue: ["t1"], ifFalse: [] },
      { id: "t1", type: "prompt", description: "t1", dependsOn: ["cond"] },
      { id: "t2", type: "prompt", description: "t2", dependsOn: ["t1"] },
    ],
  }
  const { result } = await runWorkflow(plan)

  expect(byId(result.runs, "t1").status).toBe("skipped")
  expect(byId(result.runs, "t2").status).toBe("skipped")
})

test("a failing step is isolated; independent steps still complete", async () => {
  const plan: WorkflowPlan = {
    title: "isolate",
    description: "one agent fails",
    steps: [
      { id: "good", type: "subagent", description: "good" },
      { id: "bad", type: "subagent", description: "bad" },
      { id: "c", type: "merge", description: "c", dependsOn: ["good", "bad"], sources: ["good", "bad"] },
    ],
  }
  const { result } = await runWorkflow(plan, {
    runSubagent: (i) => (i.description === "bad" ? Effect.fail(new Error("boom")) : Effect.succeed(`agent:${i.description}`)),
  })

  expect(byId(result.runs, "good").status).toBe("completed")
  expect(byId(result.runs, "bad").status).toBe("failed")
  expect(byId(result.runs, "bad").error).toBe("boom")
  // merge still runs (a failed dep is "resolved") and includes the surviving output
  expect(byId(result.runs, "c").status).toBe("completed")
  expect(result.outputs.c).toBe("agent:good")
})

test("a dependency cycle fails the involved steps instead of hanging", async () => {
  const plan: WorkflowPlan = {
    title: "cycle",
    description: "x and y depend on each other",
    steps: [
      { id: "x", type: "prompt", description: "x", dependsOn: ["y"] },
      { id: "y", type: "prompt", description: "y", dependsOn: ["x"] },
    ],
  }
  const { result } = await runWorkflow(plan)
  expect(byId(result.runs, "x").status).toBe("failed")
  expect(byId(result.runs, "y").status).toBe("failed")
})
