import { cmd } from "../cmd"
import { outputJson } from "../../json-output"

export const ScrapCommand = cmd({
  command: "scrap",
  describe: "list all known projects",
  builder: (yargs) => yargs,
  async handler() {
    const { Project } = await import("@/project/project")
    const { makeRuntime } = await import("@arcana/core/effect/runtime")
    const runtime = makeRuntime(Project.Service, Project.defaultLayer)
    const list = await runtime.runPromise((project) => project.list())
    outputJson(list)
  },
})
