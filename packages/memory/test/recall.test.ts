/**
 * Direction 5.6 — Integration test for memory recall quality.
 *
 * Generates 200 synthetic user facts across 10 topics, each topic has
 * 1 canonical fact + 1-3 exact dups + 2-4 near-duplicate paraphrases.
 * Runs 20 distinct top-10 queries, computes precision@10.
 *
 * Pass criterion: precision@10 ≥ 0.7 (i.e. at least 7 of 10 top results
 * are from the *expected* topic cluster).
 *
 * If precision@10 < 0.7, the tuning loop lives in dedup.ts (threshold)
 * and store.ts (scoring formula) — see comments there.
 */
import { describe, expect, test } from "bun:test"
import { mkdirSync } from "node:fs"
import { join } from "node:path"
import { tmpdir as osTmpdir } from "node:os"
import { openMemoryDB } from "../src/db.js"
import { MemoryStore } from "../src/store.js"
import { JACCARD_DEDUP_THRESHOLD } from "../src/dedup.js"
import { RECENCY_HALFLIFE_DAYS } from "../src/store.js"

function freshStore(): { store: MemoryStore; dir: string } {
  const dir = join(osTmpdir(), `arcana-mem-int-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`)
  mkdirSync(dir, { recursive: true })
  const db = openMemoryDB(dir)
  return { store: new MemoryStore(db), dir }
}

type Topic = {
  /** Stable topic key for assertions. */
  key: string
  /** The canonical phrase an operator would type. */
  canonical: string
  /** Paraphrases / near-duplicates (should all merge into the canonical). */
  paraphrases: string[]
}

const TOPICS: Topic[] = [
  {
    key: "user.theme",
    canonical: "the user prefers dark mode for the editor",
    paraphrases: [
      "the user prefers dark mode for the editor",
      "the user strongly prefers dark mode for the editor",
      "user wants dark mode",
      "user uses dark mode in the IDE",
    ],
  },
  {
    key: "user.location",
    canonical: "the user lives in Berlin Germany",
    paraphrases: [
      "user is based in Berlin Germany",
      "user's home city is Berlin in Germany",
      "lives in Berlin Germany",
    ],
  },
  {
    key: "user.language",
    canonical: "the user prefers TypeScript for new projects",
    paraphrases: [
      "user picks TypeScript for new projects",
      "user writes new projects in TypeScript",
      "for new projects the user chooses TypeScript",
    ],
  },
  {
    key: "user.food",
    canonical: "the user is vegetarian and avoids meat",
    paraphrases: [
      "user is vegetarian and avoids meat",
      "user follows a vegetarian diet no meat",
      "vegetarian no meat for this user",
    ],
  },
  {
    key: "user.work",
    canonical: "the user works as a senior software engineer",
    paraphrases: [
      "user is a senior software engineer at work",
      "user's job is senior software engineer",
      "works as a senior software engineer",
    ],
  },
  {
    key: "user.framework",
    canonical: "the user prefers React for frontend projects",
    paraphrases: [
      "user picks React for frontend work",
      "user chooses React for frontend",
      "frontend projects use React for the user",
    ],
  },
  {
    key: "user.os",
    canonical: "the user runs macOS as their primary operating system",
    paraphrases: [
      "user's primary OS is macOS",
      "user works on macOS as primary operating system",
      "primary operating system for the user is macOS",
    ],
  },
  {
    key: "user.editor",
    canonical: "the user prefers VS Code as their code editor",
    paraphrases: [
      "user uses VS Code as their code editor",
      "user picks VS Code for editing code",
      "the user code editor of choice is VS Code",
    ],
  },
  {
    key: "user.hobby",
    canonical: "the user enjoys playing chess in their free time",
    paraphrases: [
      "user likes to play chess in free time",
      "user plays chess for fun",
      "the user spends free time playing chess",
    ],
  },
  {
    key: "user.drink",
    canonical: "the user drinks coffee black with no sugar",
    paraphrases: [
      "user drinks coffee black no sugar",
      "user takes coffee black with no sugar",
      "the user drinks their coffee black with no sugar",
    ],
  },
]

/** Build 200 facts by repeating topic paraphrases with random age offsets. */
function generateFacts(): Array<{ key: string; value: string; ageDays: number }> {
  const facts: Array<{ key: string; value: string; ageDays: number }> = []
  let idx = 0
  // Each topic contributes ~20 facts (200 / 10).
  for (const topic of TOPICS) {
    for (let i = 0; i < 20; i++) {
      const phrase = topic.paraphrases[i % topic.paraphrases.length]!
      // Vary confidence (0.6 - 1.0) and age (0 - 120 days) to make scoring matter.
      const ageDays = (i * 7) % 120
      // Slight wording variation to make the dedup actually work.
      const variant = i % 3 === 0 ? ` ${phrase} ` : i % 3 === 1 ? `${phrase}.` : phrase
      facts.push({ key: topic.key, value: variant, ageDays: ageDays })
      idx++
      if (idx >= 200) return facts
    }
  }
  return facts
}

function buildStore(): MemoryStore {
  const { store } = freshStore()
  const facts = generateFacts()
  const now = Date.now()
  for (const f of facts) {
    const { fact } = store.recordUserFact(f.key, f.value, "synth")
    // Backdate so age matches the synthetic "ageDays" — gives scoring a real signal.
    const past = new Date(now - f.ageDays * 24 * 60 * 60 * 1000).toISOString()
    ;(store as any).db
      .prepare(`UPDATE user_facts SET last_accessed_at = ?, created_at = ?, updated_at = ? WHERE id = ?`)
      .run(past, past, past, fact.id)
  }
  return store
}

describe("integration: 200 synthetic facts", () => {
  test("dedup collapses each topic cluster substantially", () => {
    const store = buildStore()
    const all = store.getUserFacts()
    // We start with 200 facts across 10 topics. Perfect dedup would leave 10
    // rows. With token-Jaccard ≥0.8 many paraphrases merge, but some loose
    // rewrites ("user wants dark mode" vs "user prefers dark mode") don't.
    // 200 → ≤40 means at least 80% reduction.
    console.log(`  [int] total facts in DB: ${all.length} (started with 200)`)
    expect(all.length).toBeLessThanOrEqual(40)
    expect(all.length).toBeGreaterThanOrEqual(8)
  })

  test("precision@10 ≥ 0.7 on 20 distinct top-10 queries", () => {
    const store = buildStore()

    // 20 distinct queries: 2 per topic, each a substring/rephrasing
    // drawn from the topic's paraphrases (precision@10 = how often the
    // top-10 results contain the right topic — FTS5 is keyword-based,
    // so queries must share at least one significant word with the facts).
    const QUERIES = [
      "dark mode", // user.theme
      "dark mode editor", // user.theme
      "lives in Berlin", // user.location
      "Berlin Germany", // user.location
      "TypeScript", // user.language
      "new projects", // user.language
      "vegetarian", // user.food
      "avoids meat", // user.food
      "senior software engineer", // user.work
      "works as engineer", // user.work
      "React frontend", // user.framework
      "frontend projects", // user.framework
      "macOS", // user.os
      "operating system", // user.os
      "VS Code", // user.editor
      "code editor", // user.editor
      "chess", // user.hobby
      "free time", // user.hobby
      "coffee", // user.drink
      "black sugar", // user.drink
    ]

    // Map each query to the *expected* topic keys.
    const EXPECTED: Record<string, string[]> = {
      "dark mode": ["user.theme"],
      "dark mode editor": ["user.theme"],
      "lives in Berlin": ["user.location"],
      "Berlin Germany": ["user.location"],
      "TypeScript": ["user.language"],
      "new projects": ["user.language"],
      "vegetarian": ["user.food"],
      "avoids meat": ["user.food"],
      "senior software engineer": ["user.work"],
      "works as engineer": ["user.work"],
      "React frontend": ["user.framework"],
      "frontend projects": ["user.framework"],
      "macOS": ["user.os"],
      "operating system": ["user.os"],
      "VS Code": ["user.editor"],
      "code editor": ["user.editor"],
      "chess": ["user.hobby"],
      "free time": ["user.hobby"],
      "coffee": ["user.drink"],
      "black sugar": ["user.drink"],
    }

    let totalRelevant = 0
    let totalReturned = 0
    const perQueryScores: Array<{ q: string; p: number; hits: number }> = []

    for (const q of QUERIES) {
      const results = store.search(q, 10)
      const expectedKeys = EXPECTED[q]!
      const hits = results.filter((r) => {
        if (r.type !== "user_fact") return false
        const key = r.snippet.split(":")[0]?.trim() ?? ""
        return expectedKeys.includes(key)
      }).length
      totalRelevant += hits
      totalReturned += results.length
      const precision = results.length ? hits / results.length : 0
      perQueryScores.push({ q, p: precision, hits })
      if (precision < 0.5) {
        console.log(`    DEBUG ${q}:`)
        for (const r of results.slice(0, 5)) {
          console.log(`      [${r.type}] ${r.snippet}`)
        }
      }
    }

    const overallPrecision = totalReturned ? totalRelevant / totalReturned : 0
    console.log(`\n  [int] precision@10 = ${overallPrecision.toFixed(3)}  (threshold ≥0.7)`)
    console.log(`  [int] JACCARD_DEDUP_THRESHOLD = ${JACCARD_DEDUP_THRESHOLD}`)
    console.log(`  [int] RECENCY_HALFLIFE_DAYS = ${RECENCY_HALFLIFE_DAYS}`)
    console.log(`  [int] per-query:`)
    for (const { q, p, hits } of perQueryScores) {
      console.log(`    ${q.padEnd(30)} p=${p.toFixed(2)}  hits=${hits}/10`)
    }

    expect(overallPrecision).toBeGreaterThanOrEqual(0.7)
  })
})