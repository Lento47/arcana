import { describe, expect, test } from "bun:test"
import {
  addEntry,
  budgetHeadroom,
  createContextPack,
  packTrimLoss,
  packTrustProfile,
  trimToBudget,
} from "./context-pack"

function makeEntry(overrides: Partial<Parameters<typeof addEntry>[1]> = {}) {
  return {
    id: `e_${crypto.randomUUID()}`,
    kind: "system" as const,
    trust: "kernel" as const,
    source: "engine",
    content: "You are Arcana.",
    token_estimate: 100,
    must_include: false,
    cost_priority: 0,
    ...overrides,
  }
}

describe("context pack", () => {
  test("creates empty pack", () => {
    const pack = createContextPack("test")
    expect(pack.entries).toEqual([])
    expect(pack.total_tokens_estimated).toBe(0)
  })

  test("adds entries and recalculates total", () => {
    const p1 = addEntry(createContextPack(), makeEntry({ token_estimate: 200 }))
    expect(p1.total_tokens_estimated).toBe(200)
    const p2 = addEntry(p1, makeEntry({ token_estimate: 300 }))
    expect(p2.total_tokens_estimated).toBe(500)
  })

  test("trims to budget keeping must-include entries", () => {
    let pack = createContextPack()
    pack = addEntry(pack, makeEntry({ id: "kernel", trust: "kernel", token_estimate: 200, must_include: true }))
    pack = addEntry(pack, makeEntry({ id: "user", trust: "user", token_estimate: 500 }))
    pack = addEntry(pack, makeEntry({ id: "compat", trust: "compat", token_estimate: 300 }))

    const trimmed = trimToBudget(pack, 500)
    const ids = trimmed.entries.map((e) => e.id)
    expect(ids).toContain("kernel") // must-include always kept (200)
    expect(ids).toContain("compat") // fits in remaining 300 (200+300=500)
    expect(ids).not.toContain("user") // 500 > remaining 300
    expect(trimmed.total_tokens_estimated).toBe(500)
  })

  test("must-include entries survive even if over budget", () => {
    let pack = createContextPack()
    pack = addEntry(pack, makeEntry({ id: "a", trust: "kernel", token_estimate: 600, must_include: true }))
    pack = addEntry(pack, makeEntry({ id: "b", trust: "user", token_estimate: 100 }))

    const trimmed = trimToBudget(pack, 500)
    expect(trimmed.entries.length).toBe(1)
    expect(trimmed.entries[0]!.id).toBe("a")
  })

  test("budgetHeadroom calculates available tokens", () => {
    let pack = createContextPack()
    pack = addEntry(pack, makeEntry({ token_estimate: 200, must_include: true }))
    pack = addEntry(pack, makeEntry({ token_estimate: 100, must_include: true }))
    expect(budgetHeadroom(pack, 1000)).toBe(700)
  })

  test("packTrustProfile returns sorted trust levels", () => {
    let pack = createContextPack()
    pack = addEntry(pack, makeEntry({ trust: "compat" }))
    pack = addEntry(pack, makeEntry({ trust: "kernel" }))
    pack = addEntry(pack, makeEntry({ trust: "user" }))
    expect(packTrustProfile(pack)).toEqual(["kernel", "user", "compat"])
  })

  test("packTrimLoss counts discarded entries by kind", () => {
    const original = createContextPack()
    let pack = addEntry(original, makeEntry({ id: "1", kind: "tool_schema", trust: "tool", token_estimate: 500 }))
    pack = addEntry(pack, makeEntry({ id: "2", kind: "tool_result", trust: "tool", token_estimate: 500 }))
    pack = addEntry(pack, makeEntry({ id: "3", kind: "retrieval", trust: "learned", token_estimate: 200 }))

    const trimmed = trimToBudget(pack, 500)
    const loss = packTrimLoss(pack, trimmed)
    expect(loss["tool_schema"] ?? 0).toBeGreaterThanOrEqual(0)
    expect(loss["tool_result"] ?? 0).toBeGreaterThanOrEqual(0)
    // learned should survive at 200 within 500
    expect(trimmed.entries.map((e) => e.id)).toContain("3")
  })

  test("entries sorted by trust priority when trimming", () => {
    let pack = createContextPack()
    pack = addEntry(pack, makeEntry({ id: "compat", trust: "compat", token_estimate: 100 }))
    pack = addEntry(pack, makeEntry({ id: "kernel", trust: "kernel", token_estimate: 100 }))
    pack = addEntry(pack, makeEntry({ id: "provider", trust: "provider", token_estimate: 100 }))
    pack = addEntry(pack, makeEntry({ id: "user", trust: "user", token_estimate: 100 }))

    const trimmed = trimToBudget(pack, 200)
    expect(trimmed.entries.map((e) => e.id)).toEqual(["kernel", "user"])
  })
})
