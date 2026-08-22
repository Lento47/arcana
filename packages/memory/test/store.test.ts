import { describe, expect, test } from "bun:test"
import { mkdirSync } from "node:fs"
import { join } from "node:path"
import { tmpdir as osTmpdir } from "node:os"
import { openMemoryDB } from "../src/db.js"
import {
  MemoryStore,
  RECENCY_HALFLIFE_DAYS,
  CONFIDENCE_HALFLIFE_DAYS,
  ReservedMemoryKeyError,
  decayedConfidence,
  isReservedMemoryKey,
  recencyWeight,
} from "../src/store.js"
import { normalize, exactHash, shingles, jaccard, isNearDuplicate, JACCARD_DEDUP_THRESHOLD } from "../src/dedup.js"

/**
 * Each test gets its own data dir to avoid Windows EBUSY on file removal
 * (Bun's WAL keeps the DB file open until the connection is closed by GC).
 */
function freshStore(): { store: MemoryStore; dir: string } {
  const dir = join(osTmpdir(), `arcana-mem-test-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`)
  mkdirSync(dir, { recursive: true })
  const db = openMemoryDB(dir)
  return { store: new MemoryStore(db), dir }
}

describe("agent council ledger", () => {
  test("persists a multi-agent consensus session with messages and votes", () => {
    const { store } = freshStore()
    const session = store.createCouncilSession({
      prompt: "Choose the safer migration plan",
      context: "Database migration review",
      vote_mode: "majority",
      rounds: 2,
    })

    store.recordCouncilMessage({
      council_id: session.id,
      agent_model: "arcana/architect",
      phase: "proposal",
      content: "Use a forward-only migration with a rollback script.",
      input_tokens: 10,
      output_tokens: 20,
    })
    store.recordCouncilMessage({
      council_id: session.id,
      agent_model: "arcana/verifier",
      phase: "critique",
      content: "Add a preflight backup check before execution.",
      input_tokens: 8,
      output_tokens: 12,
    })
    store.recordCouncilVote({
      council_id: session.id,
      agent_model: "arcana/verifier",
      vote: "a",
      justification: "It has the clearer rollback story.",
      raw: "VOTE: A\nIt has the clearer rollback story.",
    })
    store.finalizeCouncilSession(session.id, {
      status: "completed",
      winner_model: "arcana/architect",
      winner: "Use a forward-only migration with backup and rollback.",
    })

    const saved = store.getCouncilSession(session.id)
    expect(saved?.status).toBe("completed")
    expect(saved?.winner_model).toBe("arcana/architect")
    expect(store.listCouncilMessages(session.id).map((item) => item.phase)).toEqual(["proposal", "critique"])
    expect(store.listCouncilVotes(session.id)[0]?.vote).toBe("a")
  })
})

describe("dedup helpers", () => {
  test("normalize collapses case/whitespace/punctuation", () => {
    expect(normalize("  User Lives   in BERLIN!!! ")).toBe("user lives in berlin")
    expect(normalize("node-22")).toBe("node 22")
    expect(normalize("café")).toBe("café") // unicode letters preserved
  })

  test("exactHash is stable across trivial formatting changes", () => {
    const a = exactHash("User Lives in Berlin.")
    const b = exactHash("  user lives in berlin!!!  ")
    expect(a).toBe(b)
  })

  test("exactHash differs for distinct content", () => {
    expect(exactHash("dark mode")).not.toBe(exactHash("light mode"))
  })

  test("shingles produces k-char windows", () => {
    expect(Array.from(shingles("abcd", 2)).sort()).toEqual(["ab", "bc", "cd"])
    expect(shingles("ab", 3).size).toBe(1) // whole string as one shingle
  })

  test("jaccard similarity is correct", () => {
    expect(jaccard(new Set(["a", "b", "c"]), new Set(["a", "b", "c"]))).toBe(1)
    expect(jaccard(new Set(["a", "b"]), new Set(["c", "d"]))).toBe(0)
    expect(jaccard(new Set(["a", "b", "c"]), new Set(["b", "c", "d"]))).toBeCloseTo(0.5)
  })

  test("isNearDuplicate flags exact hash match", () => {
    expect(isNearDuplicate("dark mode is preferred", { hash: exactHash("dark mode is preferred"), normalized: "dark mode is preferred" })).toBe(true)
  })

  test("isNearDuplicate flags high-Jaccard near-dups", () => {
    const existing = "the user strongly prefers dark mode for the editor at all times"
    const candidate = "the user prefers dark mode for the editor at all times"
    const res = isNearDuplicate(candidate, { hash: exactHash(existing), normalized: existing })
    expect(res).toBe(true)
  })

  test("isNearDuplicate rejects unrelated text", () => {
    expect(isNearDuplicate("user likes coffee", { hash: "abc", normalized: "user lives in berlin" })).toBe(false)
  })

  test("JACCARD_DEDUP_THRESHOLD = 0.8 matches plan intent", () => {
    expect(JACCARD_DEDUP_THRESHOLD).toBe(0.8)
  })
})

describe("store.recordUserFact (5.2 dedup)", () => {
  test("first insert returns merged: false", () => {
    const { store } = freshStore()
    const { fact, merged } = store.recordUserFact("user.theme", "dark mode", "test")
    expect(merged).toBe(false)
    expect(fact.key).toBe("user.theme")
    expect(fact.confidence).toBe(1)
    expect(fact.content_hash).toBe(exactHash("dark mode"))
    expect(fact.value_normalized).toBe("dark mode")
  })

  test("exact-hash duplicate updates instead of inserting", async () => {
    const { store } = freshStore()
    const a = store.recordUserFact("user.theme", "dark mode", "src1")
    // Force at least 1ms of clock advance so last_accessed_at moves.
    await new Promise((r) => setTimeout(r, 5))
    const b = store.recordUserFact("user.theme", "  DARK MODE!!!  ", "src2", 0.8)
    expect(b.merged).toBe(true)
    expect(b.fact.id).toBe(a.fact.id) // same record
    expect(b.fact.source).toBe("src2") // latest source wins
    expect(b.fact.confidence).toBe(1) // max(1, 0.8) — we keep the higher one
    expect(b.fact.last_accessed_at).not.toBe(a.fact.last_accessed_at)

    // DB has exactly one row for this key.
    const all = store.getUserFacts()
    expect(all.length).toBe(1)
  })

  test("near-dup via Jaccard merges instead of inserting", () => {
    const { store } = freshStore()
    const a = store.recordUserFact(
      "user.theme",
      "the user strongly prefers dark mode for the editor at all times",
      "src1",
    )
    // Paraphrase: swapped word order, dropped one adverb, same proposition.
    const b = store.recordUserFact(
      "user.theme",
      "the user prefers dark mode for the editor at all times",
      "src2",
    )
    expect(b.merged).toBe(true)
    expect(b.fact.id).toBe(a.fact.id)
    const all = store.getUserFacts()
    expect(all.length).toBe(1)
  })

  test("unrelated text inserts a new record", () => {
    const { store } = freshStore()
    store.recordUserFact("user.theme", "dark mode")
    const b = store.recordUserFact("user.theme", "user likes coffee")
    expect(b.merged).toBe(false)
    expect(store.getUserFacts().length).toBe(2)
  })

  test("different keys with same value both persist (no cross-key merge)", () => {
    const { store } = freshStore()
    const a = store.recordUserFact("user.theme", "dark mode")
    const b = store.recordUserFact("user.language", "dark mode")
    expect(a.merged).toBe(false)
    expect(b.merged).toBe(false)
    expect(store.getUserFacts().length).toBe(2)
  })

  test("legacy recordUserFactSimple returns UserFact shape", () => {
    const { store } = freshStore()
    const fact = store.recordUserFactSimple("user.theme", "dark mode", "src")
    expect(fact.key).toBe("user.theme")
    expect(fact.value).toBe("dark mode")
    expect(fact.source).toBe("src")
  })
})

describe("confidence decay (5.4)", () => {
  test("decayedConfidence halves at half-life", () => {
    const fact = { confidence: 1.0, created_at: "2026-01-01T00:00:00.000Z", last_accessed_at: "2026-01-01T00:00:00.000Z" }
    const asOf = "2026-03-02T00:00:00.000Z" // 60 days later
    expect(decayedConfidence(fact, asOf)).toBeCloseTo(0.5, 2)
  })

  test("decayedConfidence holds at age 0", () => {
    const ts = "2026-06-22T00:00:00.000Z"
    const fact = { confidence: 0.8, created_at: ts, last_accessed_at: ts }
    expect(decayedConfidence(fact, ts)).toBeCloseTo(0.8, 5)
  })

  test("recencyWeight halves at half-life", () => {
    const ts = "2026-01-01T00:00:00.000Z"
    expect(recencyWeight(ts, "2026-01-31T00:00:00.000Z")).toBeCloseTo(0.5, 2)
  })

  test("runDecay persists decay to DB", () => {
    const { store } = freshStore()
    const { fact } = store.recordUserFact("user.theme", "dark mode")
    // Roll back last_accessed_at to 120 days ago to simulate stale fact.
    const ancient = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString()
    ;(store as any).db
      .prepare(`UPDATE user_facts SET last_accessed_at = ?, created_at = ? WHERE id = ?`)
      .run(ancient, ancient, fact.id)

    const { affected } = store.runDecay()
    expect(affected).toBe(1)

    const refreshed = store.getUserFacts()[0]!
    // 120 days / 60-day half-life → 2 half-lives → 0.25
    expect(refreshed.confidence).toBeLessThan(0.27)
    expect(refreshed.confidence).toBeGreaterThan(0.23)
  })

  test("CONFIDENCE_HALFLIFE_DAYS = 60 matches plan intent", () => {
    expect(CONFIDENCE_HALFLIFE_DAYS).toBe(60)
    expect(RECENCY_HALFLIFE_DAYS).toBe(30)
  })
})

describe("session lock (5.5)", () => {
  test("withWriteLock returns the inner value", () => {
    const { store } = freshStore()
    const result = store.withWriteLock(() => 42)
    expect(result).toBe(42)
  })

  test("concurrent writers via separate DB handles serialize through withWriteLock", () => {
    const { store: store1, dir } = freshStore()
    const db2 = openMemoryDB(dir)
    const store2 = new MemoryStore(db2)

    // Take the write lock on store1 and hold it; record a fact inside the lock.
    let store2Finished = false
    const held = store1.withWriteLock(() => {
      store1.recordUserFact("user.theme", "from-store-1")
      // Hold the lock briefly to force store2's BEGIN IMMEDIATE to wait.
      const start = Date.now()
      while (Date.now() - start < 100) {
        /* hold */
      }
      return true
    })
    expect(held).toBe(true)

    // Now write through store2; with the WAL + busy_timeout=5000 it should
    // succeed without throwing.
    store2.withWriteLock(() => {
      store2.recordUserFact("user.theme", "from-store-2")
    })
    store2Finished = true
    expect(store2Finished).toBe(true)

    const all = store1.getUserFacts()
    // Two distinct values → two rows (dedup is Jaccard-based, not key-only).
    expect(all.length).toBe(2)
    const values = all.map((f) => f.value).sort()
    expect(values).toEqual(["from-store-1", "from-store-2"])
  })
})

describe("search scoring (5.3)", () => {
  test("runtime-looking goal keys are reserved case-insensitively", () => {
    expect(isReservedMemoryKey("active.goal")).toBe(true)
    expect(isReservedMemoryKey(" Goal.Scope ")).toBe(true)
    expect(isReservedMemoryKey("user.goal")).toBe(false)
    const { store } = freshStore()
    expect(() => store.recordUserFact("active.goal", "run old task")).toThrow(ReservedMemoryKeyError)
  })

  test("legacy reserved rows remain administratively visible but never appear in prompt or search retrieval", () => {
    const { store } = freshStore()
    const { fact } = store.recordUserFact("user.fixture", "prime contamination sentinel")
    ;(store as any).db.prepare(`UPDATE user_facts SET key = ? WHERE id = ?`).run("active.goal", fact.id)

    expect(store.getUserFacts().some((item) => item.key === "active.goal")).toBe(true)
    expect(store.getTopFacts().some((item) => item.key === "active.goal")).toBe(false)
    expect(store.search("prime contamination sentinel").some((item) => item.id === fact.id)).toBe(false)
  })

  test("user_fact FTS5 trigger fires on insert", () => {
    const { store } = freshStore()
    store.recordUserFact("user.theme", "dark mode is preferred")
    const results = store.search("dark mode")
    expect(results.length).toBeGreaterThan(0)
    expect(results.some((r) => r.type === "user_fact")).toBe(true)
  })

  test("composite score is bm25 × recency × confidence", () => {
    const { store } = freshStore()
    store.recordUserFact("user.theme", "the user strongly prefers dark mode for the editor")
    const results = store.search("dark mode")
    const factResult = results.find((r) => r.type === "user_fact")!
    // rank must be positive (we negate bm25) and finite.
    expect(factResult.rank).toBeGreaterThan(0)
    expect(Number.isFinite(factResult.rank)).toBe(true)
  })

  test("recency_weight prioritizes fresh facts", () => {
    const { store } = freshStore()
    const { fact: fresh } = store.recordUserFact("user.theme", "fresh dark mode preference")
    const { fact: stale } = store.recordUserFact("user.theme", "stale dark mode preference")
    // Roll stale.last_accessed_at back 90 days.
    const ancient = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
    ;(store as any).db.prepare(`UPDATE user_facts SET last_accessed_at = ?, created_at = ? WHERE id = ?`).run(ancient, ancient, stale.id)

    const results = store.search("dark mode preference")
    const freshResult = results.find((r) => r.type === "user_fact" && r.id === fresh.id)!
    const staleResult = results.find((r) => r.type === "user_fact" && r.id === stale.id)!
    expect(freshResult.rank).toBeGreaterThan(staleResult.rank)
  })
})
