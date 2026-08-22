import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import fs from "fs/promises"
import os from "os"
import path from "path"
import { getAdapter, registerAdapter } from "../../src/control-plane/adapters"
import { ArcanaLocalAdapter } from "../../src/control-plane/adapters/arcana-local"
import { ProjectV2 } from "@arcana/core/project"
import type { WorkspaceInfo } from "../../src/control-plane/types"

function info(projectID: WorkspaceInfo["projectID"], type: string): WorkspaceInfo {
  return {
    id: "workspace-test" as WorkspaceInfo["id"],
    type,
    name: "workspace-test",
    branch: null,
    directory: null,
    extra: null,
    projectID,
  }
}

function adapter(dir: string) {
  return {
    name: dir,
    description: dir,
    configure(input: WorkspaceInfo) {
      return input
    },
    async create() {},
    async remove() {},
    target() {
      return {
        type: "local" as const,
        directory: dir,
      }
    },
  }
}

describe("control-plane/adapters", () => {
  test("isolates custom adapters by project", async () => {
    const type = `demo-${Math.random().toString(36).slice(2)}`
    const one = ProjectV2.ID.make(`project-${Math.random().toString(36).slice(2)}`)
    const two = ProjectV2.ID.make(`project-${Math.random().toString(36).slice(2)}`)
    registerAdapter(one, type, adapter("/one"))
    registerAdapter(two, type, adapter("/two"))

    expect(await (await getAdapter(one, type)).target(info(one, type))).toEqual({
      type: "local",
      directory: "/one",
    })
    expect(await (await getAdapter(two, type)).target(info(two, type))).toEqual({
      type: "local",
      directory: "/two",
    })
  })

  test("latest install wins within a project", async () => {
    const type = `demo-${Math.random().toString(36).slice(2)}`
    const id = ProjectV2.ID.make(`project-${Math.random().toString(36).slice(2)}`)
    registerAdapter(id, type, adapter("/one"))

    expect(await (await getAdapter(id, type)).target(info(id, type))).toEqual({
      type: "local",
      directory: "/one",
    })

    registerAdapter(id, type, adapter("/two"))

    expect(await (await getAdapter(id, type)).target(info(id, type))).toEqual({
      type: "local",
      directory: "/two",
    })
  })

  test("arcana-local adapter is registered as a builtin", async () => {
    const adapter = await getAdapter(ProjectV2.ID.global, "arcana-local")
    expect(adapter.name).toBe("Arcana Workspace")
  })

  describe("arcana-local adapter", () => {
    let originalHome: string | undefined
    const tmpHome = path.join(os.tmpdir(), `arcana-local-test-${Date.now()}`)

    beforeEach(() => {
      originalHome = process.env.ARCANA_HOME
      process.env.ARCANA_HOME = tmpHome
    })

    afterEach(async () => {
      if (originalHome === undefined) delete process.env.ARCANA_HOME
      else process.env.ARCANA_HOME = originalHome
      await fs.rm(tmpHome, { recursive: true, force: true })
    })

    test("configure derives a directory under the arcana home", async () => {
      const configured = await ArcanaLocalAdapter.configure(
        info(ProjectV2.ID.global, "arcana-local"),
        undefined,
      )
      expect(configured.directory).toBe(path.join(tmpHome, "workspaces", "workspace-test"))
      expect(configured.name).toBe("workspace-test")
    })

    test("create and target round-trip", async () => {
      const configured = await ArcanaLocalAdapter.configure(
        { ...info(ProjectV2.ID.global, "arcana-local"), name: "fresh" },
        undefined,
      )
      await ArcanaLocalAdapter.create(configured, {})
      const target = await ArcanaLocalAdapter.target(configured, undefined)
      const directory = configured.directory!
      expect(target).toEqual({ type: "local", directory })
      const stat = await fs.stat(directory)
      expect(stat.isDirectory()).toBe(true)
    })

    test("list discovers existing workspaces", async () => {
      await ArcanaLocalAdapter.create(
        await ArcanaLocalAdapter.configure(
          { ...info(ProjectV2.ID.global, "arcana-local"), name: "one" },
          undefined,
        ),
        {},
      )
      await ArcanaLocalAdapter.create(
        await ArcanaLocalAdapter.configure(
          { ...info(ProjectV2.ID.global, "arcana-local"), name: "two" },
          undefined,
        ),
        {},
      )
      expect(ArcanaLocalAdapter.list).toBeDefined()
      const listed = await ArcanaLocalAdapter.list!({ instance: undefined })
      const names = listed.map((item) => item.name).sort()
      expect(names).toEqual(["one", "two"])
    })

    test("remove only deletes empty workspace directories", async () => {
      const configured = await ArcanaLocalAdapter.configure(
        { ...info(ProjectV2.ID.global, "arcana-local"), name: "persisted" },
        undefined,
      )
      await ArcanaLocalAdapter.create(configured, {})
      await fs.writeFile(path.join(configured.directory!, "keep.txt"), "data")
      await ArcanaLocalAdapter.remove(configured, undefined)
      const stat = await fs.stat(configured.directory!).catch(() => undefined)
      expect(stat).toBeDefined()
      await fs.rm(configured.directory!, { recursive: true, force: true })
    })
  })
})
