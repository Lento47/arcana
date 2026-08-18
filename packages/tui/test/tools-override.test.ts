import { describe, expect, test } from "bun:test"
import {
  disabledToolCount,
  nextToolState,
  toolEnabled,
  toolsOverrideKey,
  toolsPayload,
} from "../src/util/tools-override"
import { readProjectConfig, setAgentPrompt, soulFilePath } from "../src/util/config-edit"
import { join } from "node:path"
import os from "node:os"
import { mkdtemp, writeFile, rm } from "node:fs/promises"

const makeTmpDir = () => mkdtemp(join(os.tmpdir(), "tui-test-"))

describe("tools-override", () => {
  test("KV key is scoped per session", () => {
    expect(toolsOverrideKey("ses_1")).toBe("tools_override_ses_1")
    expect(toolsOverrideKey("ses_2")).not.toBe(toolsOverrideKey("ses_1"))
  })

  test("effective state defaults to enabled", () => {
    expect(toolEnabled(undefined, "read")).toBe(true)
    expect(toolEnabled({}, "read")).toBe(true)
    expect(toolEnabled({ read: false }, "read")).toBe(false)
    expect(toolEnabled({ read: false }, "other")).toBe(true)
  })

  test("toggle flips the effective state and writes explicit values", () => {
    expect(nextToolState(undefined, "edit")).toBe(false)
    expect(nextToolState({ edit: false }, "edit")).toBe(true)
  })

  test("payload only carries explicit overrides", () => {
    expect(toolsPayload(undefined)).toBeUndefined()
    expect(toolsPayload({})).toBeUndefined()
    expect(toolsPayload({ read: true, edit: false })).toEqual({ read: true, edit: false })
  })

  test("disabled count only counts explicit offs", () => {
    expect(disabledToolCount(undefined)).toBe(0)
    expect(disabledToolCount({ read: true, edit: false, write: false })).toBe(2)
  })
})

describe("config-edit", () => {
  test("sets and replaces an agent prompt", () => {
    const { updated, changed } = setAgentPrompt(undefined, "build", "You are an expert")
    expect(changed).toBe(true)
    expect(updated.agent).toEqual({ build: { prompt: "You are an expert" } })

    const second = setAgentPrompt(updated, "build", "New prompt")
    expect(second.changed).toBe(true)
    expect((second.updated.agent as Record<string, { prompt: string }>).build.prompt).toBe("New prompt")
  })

  test("empty prompt removes the override", () => {
    const { updated } = setAgentPrompt(undefined, "build", "Custom")
    const removed = setAgentPrompt(updated, "build", "   ")
    expect(removed.changed).toBe(true)
    expect((removed.updated.agent as Record<string, Record<string, unknown>>).build.prompt).toBeUndefined()
  })

  test("no change when the prompt is identical", () => {
    const { updated, changed } = setAgentPrompt({ agent: { build: { prompt: "Same" } } }, "build", "Same")
    expect(changed).toBe(false)
    expect(updated).toEqual({ agent: { build: { prompt: "Same" } } })
  })

  test("preserves unrelated config and $schema", () => {
    const config = { $schema: "https://opencode.ai/config.json", model: "x/y" }
    const { updated } = setAgentPrompt(config, "plan", "Plan first")
    expect(updated.$schema).toBe("https://opencode.ai/config.json")
    expect(updated.model).toBe("x/y")
  })

  test("reads a project config file and round-trips through disk", async () => {
    const dir = await makeTmpDir()
    const configPath = join(dir, "opencode.json")
    try {
      await writeFile(configPath, JSON.stringify({ agent: { build: { prompt: "Old" } } }))
      const config = await readProjectConfig(configPath)
      expect(config?.agent).toEqual({ build: { prompt: "Old" } })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test("missing config file reads as undefined", async () => {
    const dir = await makeTmpDir()
    try {
      expect(await readProjectConfig(join(dir, "nope.json"))).toBeUndefined()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test("soul file path lives in the config dir", () => {
    expect(soulFilePath("~/.config/arcana")).toBe("~/.config/arcana/SOUL.md")
    expect(soulFilePath("C:/Users/me/.config/arcana/")).toBe("C:/Users/me/.config/arcana/SOUL.md")
  })
})
