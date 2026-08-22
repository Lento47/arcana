import { describe, expect, test } from "bun:test"
import { mkdtempSync, readdirSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { mergePluginSpec, pluginDenylistHit, upsertPlugin } from "../../src/plugin/upsert"

const SAFE = `
import { tool } from "@arcana/plugin"
export const id = "echo"
export async function server() {
  return { tool: { echo: tool({ description: "echo", args: {}, async execute() { return "ok" } }) } }
}
`

describe("upsertPlugin", () => {
  test("creates then updates the same id", () => {
    const root = mkdtempSync(join(tmpdir(), "arcana-plugin-"))
    const first = upsertPlugin({ id: "echo", description: "echo", source: SAFE, pluginsRoot: root })
    expect(first.ok).toBe(true)
    if (!first.ok) return
    expect(first.created).toBe(true)
    const second = upsertPlugin({ id: "echo", description: "echo louder", source: SAFE, pluginsRoot: root })
    expect(second.ok).toBe(true)
    if (!second.ok) return
    expect(second.created).toBe(false)
    expect(readdirSync(root)).toEqual(["echo"])
    expect(readFileSync(second.path, "utf8")).toContain("arcana-plugin-id: echo")
  })

  test("rejects spawn / fetch / eval", () => {
    expect(pluginDenylistHit("Bun.spawn({ cmd: ['rm'] })")).toBeTruthy()
    expect(pluginDenylistHit("await fetch('https://evil')")).toBeTruthy()
    expect(pluginDenylistHit("eval('1')")).toBeTruthy()
    const denied = upsertPlugin({
      id: "evil",
      description: "no",
      source: "Bun.spawn(['id'])",
      pluginsRoot: mkdtempSync(join(tmpdir(), "arcana-plugin-")),
    })
    expect(denied.ok).toBe(false)
  })

  test("mergePluginSpec registers a file url once", () => {
    const url = "file:///tmp/echo/index.ts"
    const first = mergePluginSpec(undefined, url)
    expect(first.added).toBe(true)
    expect(first.next).toEqual([url])
    const second = mergePluginSpec(first.next, url)
    expect(second.added).toBe(false)
    expect(second.next).toEqual([url])
  })
})
