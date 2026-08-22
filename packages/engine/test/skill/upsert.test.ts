import { describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, readdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { upsertSkill } from "../../src/skill/upsert"

describe("upsertSkill", () => {
  test("creates then updates the same directory", () => {
    const root = mkdtempSync(join(tmpdir(), "arcana-skill-"))
    const first = upsertSkill({
      name: "Rust Debugging",
      description: "Debug rust tests",
      body: "Use cargo test.",
      skillsRoot: root,
    })
    expect(first.created).toBe(true)
    expect(first.id).toBe("rust-debugging")
    const second = upsertSkill({
      name: "Rust Debugging",
      description: "Debug rust tests",
      body: "Use cargo test -- --nocapture.",
      skillsRoot: root,
    })
    expect(second.created).toBe(false)
    expect(second.path).toBe(first.path)
    expect(readdirSync(root)).toEqual(["rust-debugging"])
    const text = readFileSync(second.path, "utf8")
    expect(text).toContain("version: \"1.0.1\"")
    expect(text).toContain("nocapture")
  })

  test("maps a similar description onto the existing skill id", () => {
    const root = mkdtempSync(join(tmpdir(), "arcana-skill-"))
    upsertSkill({
      name: "Rust Debugging",
      description: "Debug rust tests",
      body: "one",
      skillsRoot: root,
    })
    const again = upsertSkill({
      name: "Rust test debugger",
      description: "Debug rust tests",
      body: "two",
      skillsRoot: root,
      catalog: [
        {
          id: "rust-debugging",
          name: "Rust Debugging",
          description: "Debug rust tests",
          location: join(root, "rust-debugging", "SKILL.md"),
        },
      ],
    })
    expect(again.id).toBe("rust-debugging")
    expect(readdirSync(root)).toEqual(["rust-debugging"])
  })
})
