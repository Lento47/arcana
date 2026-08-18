import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { Agent } from "../../src/agent/agent"
import { route } from "../../src/agent/router"

const root = join(import.meta.dir, "../..")
const taskText = () => readFileSync(join(root, "src/tool/task.txt"), "utf8").replace(/\r\n/g, "\n")
const buildText = () => readFileSync(join(root, "src/agent/prompt/build.txt"), "utf8").replace(/\r\n/g, "\n")
const agentSrc = () => readFileSync(join(root, "src/agent/agent.ts"), "utf8").replace(/\r\n/g, "\n")

describe("explicit subagent delegation guidance", () => {
  test("task tool description requires delegation on explicit requests", () => {
    const text = taskText()
    expect(text).toContain("Explicit subagent requests")
    expect(text).toContain("ONE task call per work item")
    expect(text).toContain("self-contained (handover)")
  })

  test("task tool description requires synthesis with attribution", () => {
    const text = taskText()
    expect(text).toContain("ONE synthesized final answer")
    expect(text).toContain("per-subagent attribution")
    expect(text).toContain("subagents finished")
  })

  test("build prompt treats subagent requests as directives", () => {
    const text = buildText()
    expect(text).toContain("Explicit subagent requests")
    expect(text).toContain('"use subagents", "delegate", "in parallel", and "split this up" are')
    expect(text).toContain("directives")
  })

  test("general agent routing includes subagent/parallel keywords", () => {
    const src = agentSrc()
    expect(src).toContain('"subagents"')
    expect(src).toContain('"parallel"')
    expect(src).toContain('"delegate"')
    expect(src).toContain('"split"')
  })
})

describe("router prefers the delegation-capable subagent", () => {
  const general = {
    name: "general",
    mode: "subagent",
    hidden: false,
    routing: {
      keywords: ["implement", "subagents", "subagent", "parallel", "delegate", "split"],
      priority: 1,
    },
  } as unknown as Agent.Info
  const explore = {
    name: "explore",
    mode: "subagent",
    hidden: false,
    routing: { keywords: ["search", "find", "explore"], priority: 0 },
  } as unknown as Agent.Info

  test('routes "use subagents in parallel" to general', () => {
    const result = route([explore, general], {
      prompt: "use subagents to split this up in parallel",
      description: "",
    })
    expect(result.agent.name).toBe("general")
  })

  test('routes "delegate each file" to general', () => {
    const result = route([explore, general], { prompt: "delegate each file to a subagent", description: "" })
    expect(result.agent.name).toBe("general")
  })

  test("keeps plain research routing to explore", () => {
    const result = route([explore, general], { prompt: "search the codebase for usages", description: "" })
    expect(result.agent.name).toBe("explore")
  })
})
