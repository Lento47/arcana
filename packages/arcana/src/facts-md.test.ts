import { describe, expect, test } from "bun:test"
import { mkdirSync, writeFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import {
  parseLearnedIndex,
  renderFactsMd,
  parseFactsMd,
  factsForCloud,
  gatherFromLearned,
  type CompiledFact,
} from "./facts-md.js"

describe("FACTS.md", () => {
  test("parseLearnedIndex extracts wikilinks", () => {
    const md = `# LEARNED\n\n## Project\n- [[session-lock]] — PID file prevents concurrent sessions\n- [[run-budgets]] - Per-session safety limits\n`
    const rows = parseLearnedIndex(md)
    expect(rows).toHaveLength(2)
    expect(rows[0]!.slug).toBe("session-lock")
    expect(rows[0]!.summary).toContain("PID file")
  })

  test("render + parse round-trip", () => {
    const facts: CompiledFact[] = [
      {
        key: "user.theme",
        value: "dark mode",
        source: "cli",
        confidence: 1,
        origin: "user_facts",
        updatedAt: "2026-07-20T00:00:00.000Z",
      },
      {
        key: "learned.session-lock",
        value: "Session lock uses a PID file.",
        source: "learned/session-lock.md",
        confidence: 0.8,
        origin: "learned_wiki",
      },
    ]
    const md = renderFactsMd(facts, { projectRoot: "/tmp/proj" })
    expect(md).toContain("# FACTS")
    expect(md).toContain("### `user.theme`")
    expect(md).toContain("dark mode")
    const back = parseFactsMd(md)
    expect(back).toHaveLength(2)
    expect(back.find((f) => f.key === "user.theme")?.value).toBe("dark mode")
    expect(back.find((f) => f.key === "learned.session-lock")?.origin).toBe("learned_wiki")
  })

  test("reserved runtime keys cannot return through FACTS.md or cloud sync", () => {
    const reserved: CompiledFact = {
      key: "active.goal",
      value: "repeat an old objective",
      confidence: 1,
      origin: "user_facts",
    }
    const safe: CompiledFact = {
      key: "user.theme",
      value: "dark",
      confidence: 1,
      origin: "user_facts",
    }
    const parsed = parseFactsMd(renderFactsMd([reserved, safe]))
    expect(parsed.map((fact) => fact.key)).toEqual(["user.theme"])
    expect(factsForCloud([reserved, safe]).map((fact) => fact.key)).toEqual(["user.theme"])
  })

  test("gatherFromLearned reads index + wiki", () => {
    const root = join(tmpdir(), `arcana-facts-${Date.now()}`)
    const learned = join(root, ".arcana", "learned")
    mkdirSync(learned, { recursive: true })
    writeFileSync(
      join(root, ".arcana", "LEARNED.md"),
      `# LEARNED\n\n## Project\n- [[demo-fact]] — Demo summary from index\n`,
      "utf8",
    )
    writeFileSync(
      join(learned, "demo-fact.md"),
      `---\ntags: [demo]\n---\n# Demo\n\nFull wiki body for demo fact.\n`,
      "utf8",
    )
    const facts = gatherFromLearned(root)
    expect(facts.some((f) => f.key === "learned.demo-fact")).toBe(true)
    const demo = facts.find((f) => f.key === "learned.demo-fact")!
    expect(demo.value).toContain("Full wiki body")
    expect(demo.origin).toBe("learned_wiki")
    rmSync(root, { recursive: true, force: true })
  })
})
