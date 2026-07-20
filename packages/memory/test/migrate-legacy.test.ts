import { describe, expect, test } from "bun:test"
import { Database } from "bun:sqlite"
import { mkdirSync } from "node:fs"
import { join } from "node:path"
import { tmpdir as osTmpdir } from "node:os"
import { openMemoryDB } from "../src/db.js"
import { MemoryStore } from "../src/store.js"

/**
 * Regression: older memory.db files had user_facts without content_hash /
 * value_normalized / last_accessed_at. openMemoryDB used to CREATE INDEX on
 * content_hash before ALTER TABLE ADD COLUMN, which threw:
 *   "no such column: content_hash"
 * and blocked `arcana memory push` (and every other memory open).
 */
describe("legacy user_facts migration", () => {
  test("opens a pre-dedup user_facts table and adds missing columns", () => {
    const dir = join(osTmpdir(), `arcana-mem-legacy-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`)
    mkdirSync(dir, { recursive: true })
    const file = join(dir, "memory.db")

    const raw = new Database(file, { create: true })
    raw.exec(`
      CREATE TABLE user_facts (
        id TEXT PRIMARY KEY,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        source TEXT,
        confidence REAL DEFAULT 1.0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      INSERT INTO user_facts (id, key, value, source, confidence, created_at, updated_at)
      VALUES ('legacy-1', 'user.theme', 'dark', NULL, 1.0, '2020-01-01T00:00:00.000Z', '2020-01-01T00:00:00.000Z');
    `)
    raw.close()

    const db = openMemoryDB(dir)
    const cols = (db.prepare(`PRAGMA table_info(user_facts)`).all() as Array<{ name: string }>).map((c) => c.name)
    expect(cols).toContain("content_hash")
    expect(cols).toContain("value_normalized")
    expect(cols).toContain("last_accessed_at")

    const store = new MemoryStore(db)
    const facts = store.getUserFacts()
    expect(facts).toHaveLength(1)
    expect(facts[0]!.key).toBe("user.theme")

    // INSERT path that references content_hash must succeed after migration.
    const { fact, merged } = store.recordUserFact("user.lang", "en")
    expect(merged).toBe(false)
    expect(fact.content_hash).toBeTruthy()
    expect(store.getUserFacts()).toHaveLength(2)
  })
})
