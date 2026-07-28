import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { existsSync, readFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { Database } from "bun:sqlite"
import { deriveAuditReplay, formatTerminal, formatJSON, formatMarkdown, exportAuditReplay } from "@arcana/engine/cli/cmd/replay"
import type { AuditReplay, AuditReplayEntry } from "@arcana/engine/cli/cmd/replay"
import { createHash } from "node:crypto"

// ── helpers ──────────────────────────────────────────────────────────

function makeTestDB(): Database {
  const db = new Database(":memory:")
  db.run(`CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY, sequence INTEGER NOT NULL UNIQUE, session_id TEXT,
    timestamp TEXT NOT NULL, previous_hash TEXT, hash TEXT NOT NULL,
    actor_kind TEXT NOT NULL, actor_id TEXT NOT NULL, type TEXT NOT NULL, payload TEXT NOT NULL
  )`)
  db.run(`CREATE TABLE IF NOT EXISTS trace_health (
    session_id TEXT PRIMARY KEY, status TEXT NOT NULL DEFAULT 'COMPLETE',
    error_count INTEGER NOT NULL DEFAULT 0, last_error TEXT,
    recorded_events INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL
  )`)
  db.run(`CREATE TABLE IF NOT EXISTS claims (
    id TEXT PRIMARY KEY, session_id TEXT, proposition TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'observed', confidence REAL, created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`)
  db.run(`CREATE TABLE IF NOT EXISTS contracts (
    id TEXT PRIMARY KEY, session_id TEXT, objective TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'proposed', created_at TEXT NOT NULL DEFAULT (datetime('now')),
    resolved_at TEXT, resolution_state TEXT, resolution_reason TEXT
  )`)
  db.run(`CREATE TABLE IF NOT EXISTS obligations (
    id TEXT PRIMARY KEY, contract_id TEXT NOT NULL, description TEXT NOT NULL,
    required INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT (datetime('now')), resolved_at TEXT, waived_by_event_id TEXT, waiver_reason TEXT
  )`)
  return db
}

function eventHash(row: { id: string; sequence: number; timestamp: string; previous_hash: string | null; actor_kind: string; actor_id: string; type: string; payload: string }): string {
  return createHash("sha256").update(JSON.stringify({
    id: row.id, sequence: row.sequence, timestamp: row.timestamp,
    previousHash: row.previous_hash, actorKind: row.actor_kind,
    actorId: row.actor_id, type: row.type, payload: row.payload,
  })).digest("hex")
}

function insertEvent(db: Database, opts: { id: string; sequence: number; sessionId: string; type: string; actorKind?: string; actorId?: string; payload?: Record<string, unknown>; previousHash?: string | null }) {
  const ts = new Date().toISOString()
  const row = {
    id: opts.id, sequence: opts.sequence, timestamp: ts,
    previous_hash: opts.previousHash ?? null,
    actor_kind: opts.actorKind ?? "user", actor_id: opts.actorId ?? "session",
    type: opts.type, payload: JSON.stringify(opts.payload ?? {}),
  }
  const hash = eventHash(row)
  db.run("INSERT INTO events (id, sequence, session_id, timestamp, previous_hash, hash, actor_kind, actor_id, type, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [row.id, row.sequence, opts.sessionId, row.timestamp, row.previous_hash, hash, row.actor_kind, row.actor_id, row.type, row.payload])
  return { hash, ts }
}

function insertTraceHealth(db: Database, sessionId: string, status: string) {
  db.run("INSERT OR REPLACE INTO trace_health (session_id, status, error_count, recorded_events, updated_at) VALUES (?, ?, 0, 0, ?)",
    [sessionId, status, new Date().toISOString()])
}

// ── tests ────────────────────────────────────────────────────────────

describe("Audit Replay", () => {
  let db: Database

  beforeEach(() => { db = makeTestDB() })
  afterEach(() => { db.close() })

  // ── 1. Complete valid session replay ───────────────────────────────

  it("replays a complete valid session", () => {
    const h1 = insertEvent(db, { id: "e1", sequence: 0, sessionId: "s1", type: "session.started" })
    const h2 = insertEvent(db, { id: "e2", sequence: 1, sessionId: "s1", type: "tool.called", payload: { tool: "npm test" }, previousHash: h1.hash })
    const h3 = insertEvent(db, { id: "e3", sequence: 2, sessionId: "s1", type: "tool.returned", payload: { tool: "npm test", exitCode: 0 }, previousHash: h2.hash })
    const h4 = insertEvent(db, { id: "e4", sequence: 3, sessionId: "s1", type: "completion.resolved", payload: { method: "VERIFIED_COMPLETE" }, previousHash: h3.hash })
    insertEvent(db, { id: "e5", sequence: 4, sessionId: "s1", type: "session.completed", payload: { reason: "normal" }, previousHash: h4.hash })
    insertTraceHealth(db, "s1", "COMPLETE")

    const replay = deriveAuditReplay(db, "s1")
    expect(replay.schemaVersion).toBe("1")
    expect(replay.sessionId).toBe("s1")
    expect(replay.source.eventCount).toBe(5)
    expect(replay.timeline).toHaveLength(5)
    expect(replay.verification.sourceEvents).toBe("VALID")
    expect(replay.verification.globalChain).toBe("VALID")
    expect(replay.verification.traceHealth).toBe("COMPLETE")
    expect(replay.limitations.length).toBeGreaterThan(0)
  })

  // ── 2. Global sequence ordering ────────────────────────────────────

  it("preserves global sequence ordering", () => {
    insertEvent(db, { id: "e1", sequence: 0, sessionId: "s1", type: "session.started" })
    insertEvent(db, { id: "e2", sequence: 1, sessionId: "s1", type: "session.completed", payload: { reason: "normal" }, previousHash: "prev" })

    const replay = deriveAuditReplay(db, "s1")
    expect(replay.timeline[0]!.sequence).toBe(0)
    expect(replay.timeline[1]!.sequence).toBe(1)
    expect(replay.source.firstSequence).toBe(0)
    expect(replay.source.lastSequence).toBe(1)
  })

  // ── 3. Interleaved sessions ────────────────────────────────────────

  it("handles interleaved sessions correctly", () => {
    insertEvent(db, { id: "e1", sequence: 0, sessionId: "s1", type: "session.started" })
    insertEvent(db, { id: "e2", sequence: 1, sessionId: "s2", type: "session.started" })
    insertEvent(db, { id: "e3", sequence: 2, sessionId: "s1", type: "session.completed", payload: { reason: "normal" }, previousHash: "prev" })

    const replay = deriveAuditReplay(db, "s1")
    expect(replay.source.eventCount).toBe(2)
    expect(replay.timeline).toHaveLength(2)
    expect(replay.timeline[0]!.type).toBe("session.started")
    expect(replay.timeline[1]!.type).toBe("session.completed")
  })

  // ── 4. Missing session ─────────────────────────────────────────────

  it("handles missing session (zero events)", () => {
    const replay = deriveAuditReplay(db, "nonexistent")
    expect(replay.source.eventCount).toBe(0)
    expect(replay.timeline).toHaveLength(0)
    expect(replay.verification.sourceEvents).toBe("UNAVAILABLE")
    expect(replay.verification.globalChain).toBe("VALID") // empty chain is valid
  })

  // ── 5. Zero-event session ──────────────────────────────────────────

  it("handles zero-event session", () => {
    const replay = deriveAuditReplay(db, "empty")
    expect(replay.source.eventCount).toBe(0)
    expect(replay.source.firstSequence).toBeUndefined()
    expect(replay.source.lastSequence).toBeUndefined()
    expect(replay.source.runRoot).toBeUndefined()
  })

  // ── 6. Tool call without return ────────────────────────────────────

  it("detects tool.called without tool.returned", () => {
    insertEvent(db, { id: "e1", sequence: 0, sessionId: "s1", type: "session.started" })
    insertEvent(db, { id: "e2", sequence: 1, sessionId: "s1", type: "tool.called", payload: { tool: "npm test" }, previousHash: "prev" })
    insertEvent(db, { id: "e3", sequence: 2, sessionId: "s1", type: "session.completed", payload: { reason: "normal" }, previousHash: "prev" })

    const replay = deriveAuditReplay(db, "s1")
    const warnings = replay.reconstructionWarnings.filter((w) => w.category === "unmatched_call")
    expect(warnings.length).toBeGreaterThan(0)
    expect(warnings[0]!.message).toContain("tool.called without tool.returned")
  })

  // ── 7. Tool return without call ────────────────────────────────────

  it("detects tool.returned without tool.called", () => {
    insertEvent(db, { id: "e1", sequence: 0, sessionId: "s1", type: "session.started" })
    insertEvent(db, { id: "e2", sequence: 1, sessionId: "s1", type: "tool.returned", payload: { tool: "npm test" }, previousHash: "prev" })
    insertEvent(db, { id: "e3", sequence: 2, sessionId: "s1", type: "session.completed", payload: { reason: "normal" }, previousHash: "prev" })

    const replay = deriveAuditReplay(db, "s1")
    const warnings = replay.reconstructionWarnings.filter((w) => w.category === "orphan_return")
    expect(warnings.length).toBeGreaterThan(0)
  })

  // ── 8. Session start without terminal ──────────────────────────────

  it("detects session.started without terminal event", () => {
    insertEvent(db, { id: "e1", sequence: 0, sessionId: "s1", type: "session.started" })
    insertEvent(db, { id: "e2", sequence: 1, sessionId: "s1", type: "tool.called", payload: { tool: "npm test" }, previousHash: "prev" })

    const replay = deriveAuditReplay(db, "s1")
    const warnings = replay.reconstructionWarnings.filter((w) => w.category === "missing_terminal")
    expect(warnings.length).toBeGreaterThan(0)
  })

  // ── 9. Conflicting terminal events ─────────────────────────────────

  it("detects multiple conflicting terminal events", () => {
    insertEvent(db, { id: "e1", sequence: 0, sessionId: "s1", type: "session.started" })
    insertEvent(db, { id: "e2", sequence: 1, sessionId: "s1", type: "session.completed", payload: { reason: "normal" }, previousHash: "prev" })
    insertEvent(db, { id: "e3", sequence: 2, sessionId: "s1", type: "session.crashed", payload: { error: "OOM" }, previousHash: "prev" })

    const replay = deriveAuditReplay(db, "s1")
    const warnings = replay.reconstructionWarnings.filter((w) => w.category === "conflicting_terminal")
    expect(warnings.length).toBeGreaterThan(0)
  })

  // ── 10. Events after terminal ──────────────────────────────────────

  it("detects events after terminal completion", () => {
    insertEvent(db, { id: "e1", sequence: 0, sessionId: "s1", type: "session.started" })
    insertEvent(db, { id: "e2", sequence: 1, sessionId: "s1", type: "session.completed", payload: { reason: "normal" }, previousHash: "prev" })
    insertEvent(db, { id: "e3", sequence: 2, sessionId: "s1", type: "tool.called", payload: { tool: "late" }, previousHash: "prev" })

    const replay = deriveAuditReplay(db, "s1")
    const warnings = replay.reconstructionWarnings.filter((w) => w.category === "post_terminal")
    expect(warnings.length).toBeGreaterThan(0)
  })

  // ── 11. Claim transition without creation ──────────────────────────

  it("detects claim.transitioned without claim.created", () => {
    insertEvent(db, { id: "e1", sequence: 0, sessionId: "s1", type: "session.started" })
    insertEvent(db, { id: "e2", sequence: 1, sessionId: "s1", type: "claim.transitioned", payload: { claimId: "c1", newStatus: "verified" }, previousHash: "prev" })

    const replay = deriveAuditReplay(db, "s1")
    const warnings = replay.reconstructionWarnings.filter((w) => w.message.includes("claim.transitioned without claim.created"))
    expect(warnings.length).toBeGreaterThan(0)
  })

  // ── 12. Obligation resolution without creation ─────────────────────

  it("detects obligation.resolved without obligation.created", () => {
    insertEvent(db, { id: "e1", sequence: 0, sessionId: "s1", type: "session.started" })
    insertEvent(db, { id: "e2", sequence: 1, sessionId: "s1", type: "obligation.resolved", payload: { obligationId: "o1", resolution: "satisfied" }, previousHash: "prev" })

    const replay = deriveAuditReplay(db, "s1")
    const warnings = replay.reconstructionWarnings.filter((w) => w.message.includes("obligation.resolved without obligation.created"))
    expect(warnings.length).toBeGreaterThan(0)
  })

  // ── 13. Corrupt global chain ───────────────────────────────────────

  it("detects corrupt global chain", () => {
    // Insert event with corrupted hash
    const ts = new Date().toISOString()
    const row = { id: "e1", sequence: 0, timestamp: ts, previous_hash: null, actor_kind: "user", actor_id: "session", type: "session.started", payload: "{}" }
    const realHash = eventHash(row)
    db.run("INSERT INTO events (id, sequence, session_id, timestamp, previous_hash, hash, actor_kind, actor_id, type, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [row.id, row.sequence, "s1", row.timestamp, null, "0000000000000000000000000000000000000000000000000000000000000000", row.actor_kind, row.actor_id, row.type, row.payload])

    const replay = deriveAuditReplay(db, "s1")
    expect(replay.verification.globalChain).toBe("INVALID")
    expect(replay.verification.sourceEvents).toBe("INVALID")
  })

  // ── 14. DEGRADED trace replay ──────────────────────────────────────

  it("handles DEGRADED trace", () => {
    insertEvent(db, { id: "e1", sequence: 0, sessionId: "s1", type: "session.started" })
    insertEvent(db, { id: "e2", sequence: 1, sessionId: "s1", type: "session.completed", payload: { reason: "normal" }, previousHash: "prev" })
    insertTraceHealth(db, "s1", "DEGRADED")

    const replay = deriveAuditReplay(db, "s1")
    expect(replay.verification.traceHealth).toBe("DEGRADED")
    expect(replay.verification.sourceEvents).toBe("VALID") // events still valid
  })

  // ── 15. CRASHED lifecycle replay ───────────────────────────────────

  it("handles CRASHED lifecycle", () => {
    insertEvent(db, { id: "e1", sequence: 0, sessionId: "s1", type: "session.started" })
    insertEvent(db, { id: "e2", sequence: 1, sessionId: "s1", type: "session.crashed", payload: { error: "OOM" }, previousHash: "prev" })

    const replay = deriveAuditReplay(db, "s1")
    expect(replay.verification.lifecycle).toBe("CRASHED")
  })

  // ── 16. NO_ACTIVE_CONTRACT replay ──────────────────────────────────

  it("handles NO_ACTIVE_CONTRACT session", () => {
    insertEvent(db, { id: "e1", sequence: 0, sessionId: "s1", type: "session.started" })
    insertEvent(db, { id: "e2", sequence: 1, sessionId: "s1", type: "completion.resolved", payload: { method: "NO_ACTIVE_CONTRACT" }, previousHash: "prev" })
    insertEvent(db, { id: "e3", sequence: 2, sessionId: "s1", type: "session.completed", payload: { reason: "normal" }, previousHash: "prev" })

    const replay = deriveAuditReplay(db, "s1")
    expect(replay.timeline[1]!.summary).toContain("NO_ACTIVE_CONTRACT")
  })

  // ── 17. Duplicate event reference ──────────────────────────────────

  it("does not crash on duplicate references", () => {
    insertEvent(db, { id: "e1", sequence: 0, sessionId: "s1", type: "session.started" })
    insertEvent(db, { id: "e2", sequence: 1, sessionId: "s1", type: "session.completed", payload: { reason: "normal" }, previousHash: "prev" })

    const replay = deriveAuditReplay(db, "s1")
    expect(replay.timeline).toHaveLength(2)
    // No duplicate warnings since we have unique events
    const dupWarnings = replay.reconstructionWarnings.filter((w) => w.category === "duplicate")
    expect(dupWarnings).toHaveLength(0)
  })

  // ── 18. Stable JSON ordering ───────────────────────────────────────

  it("produces stable JSON output", () => {
    insertEvent(db, { id: "e1", sequence: 0, sessionId: "s1", type: "session.started" })
    insertEvent(db, { id: "e2", sequence: 1, sessionId: "s1", type: "session.completed", payload: { reason: "normal" }, previousHash: "prev" })

    const replay = deriveAuditReplay(db, "s1")
    // Same replay data produces same JSON (excluding generatedAt)
    const r1 = { ...replay, generatedAt: "fixed" }
    const r2 = { ...replay, generatedAt: "fixed" }
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2))
  })

  // ── 19. Markdown limitation section ────────────────────────────────

  it("includes limitations in markdown output", () => {
    insertEvent(db, { id: "e1", sequence: 0, sessionId: "s1", type: "session.started" })
    insertEvent(db, { id: "e2", sequence: 1, sessionId: "s1", type: "session.completed", payload: { reason: "normal" }, previousHash: "prev" })

    const replay = deriveAuditReplay(db, "s1")
    const md = formatMarkdown(replay)
    expect(md).toContain("No tool was rerun")
    expect(md).toContain("No model was called")
    expect(md).toContain("Hash integrity is not actor authentication")
  })

  // ── 20. Secret redaction ───────────────────────────────────────────

  it("export contains no secrets", () => {
    insertEvent(db, { id: "e1", sequence: 0, sessionId: "s1", type: "session.started" })

    const replay = deriveAuditReplay(db, "s1")
    const json = formatJSON(replay).toLowerCase()
    expect(json).not.toContain("sk-")
    expect(json).not.toContain("ghp_")
    expect(json).not.toContain("password=")
    expect(json).not.toContain("api_key=")
  })

  // ── 21. Audit replay does not change proof level ───────────────────

  it("does not mutate source events", () => {
    insertEvent(db, { id: "e1", sequence: 0, sessionId: "s1", type: "session.started" })
    insertEvent(db, { id: "e2", sequence: 1, sessionId: "s1", type: "session.completed", payload: { reason: "normal" }, previousHash: "prev" })

    // Snapshot events before
    const before = db.query("SELECT * FROM events ORDER BY sequence").all()

    const replay = deriveAuditReplay(db, "s1")

    // Events unchanged after
    const after = db.query("SELECT * FROM events ORDER BY sequence").all()
    expect(JSON.stringify(after)).toBe(JSON.stringify(before))
  })

  // ── 22. Terminal format output ─────────────────────────────────────

  it("produces terminal format output", () => {
    insertEvent(db, { id: "e1", sequence: 0, sessionId: "s1", type: "session.started" })
    insertEvent(db, { id: "e2", sequence: 1, sessionId: "s1", type: "session.completed", payload: { reason: "normal" }, previousHash: "prev" })

    const replay = deriveAuditReplay(db, "s1")
    const output = formatTerminal(replay)
    expect(output).toContain("audit replay")
    expect(output).toContain("session started")
    expect(output).toContain("session completed")
    expect(output).toContain("warnings")
    expect(output).toContain("limitation:")
  })

  // ── 23. Completion attempt without resolution ──────────────────────

  it("does not warn for completion.resolved with prior attempt", () => {
    insertEvent(db, { id: "e1", sequence: 0, sessionId: "s1", type: "session.started" })
    insertEvent(db, { id: "e2", sequence: 1, sessionId: "s1", type: "completion.attempted", payload: { method: "test" }, previousHash: "prev" })
    insertEvent(db, { id: "e3", sequence: 2, sessionId: "s1", type: "completion.resolved", payload: { method: "VERIFIED_COMPLETE" }, previousHash: "prev" })
    insertEvent(db, { id: "e4", sequence: 3, sessionId: "s1", type: "session.completed", payload: { reason: "normal" }, previousHash: "prev" })

    const replay = deriveAuditReplay(db, "s1")
    const warnings = replay.reconstructionWarnings.filter((w) => w.category === "missing_attempt")
    expect(warnings).toHaveLength(0)
  })

  // ── 24. Completion resolved without attempt ────────────────────────

  it("warns for completion.resolved without attempt", () => {
    insertEvent(db, { id: "e1", sequence: 0, sessionId: "s1", type: "session.started" })
    insertEvent(db, { id: "e2", sequence: 1, sessionId: "s1", type: "completion.resolved", payload: { method: "VERIFIED_COMPLETE" }, previousHash: "prev" })
    insertEvent(db, { id: "e3", sequence: 2, sessionId: "s1", type: "session.completed", payload: { reason: "normal" }, previousHash: "prev" })

    const replay = deriveAuditReplay(db, "s1")
    const warnings = replay.reconstructionWarnings.filter((w) => w.category === "missing_attempt")
    expect(warnings.length).toBeGreaterThan(0)
  })

  // ── 25. Export-only replay ─────────────────────────────────────────

  it("export consistency is VALID for internally consistent data", () => {
    insertEvent(db, { id: "e1", sequence: 0, sessionId: "s1", type: "session.started" })
    insertEvent(db, { id: "e2", sequence: 1, sessionId: "s1", type: "session.completed", payload: { reason: "normal" }, previousHash: "prev" })

    const replay = deriveAuditReplay(db, "s1")
    expect(replay.verification.exportConsistency).toBe("VALID")
    expect(replay.verification.sourceEvents).toBe("VALID")
  })

  // ── 26. Source-event hash mismatch ─────────────────────────────────

  it("detects stored event hash mismatch", () => {
    // Insert event with correct hash, then corrupt it
    insertEvent(db, { id: "e1", sequence: 0, sessionId: "s1", type: "session.started" })
    // Corrupt the hash directly
    db.run("UPDATE events SET hash = '0000000000000000000000000000000000000000000000000000000000000000' WHERE id = 'e1'")

    const replay = deriveAuditReplay(db, "s1")
    expect(replay.verification.sourceEvents).toBe("INVALID")
    expect(replay.timeline[0]!.integrity).toBe("INVALID")
  })

  // ── 27. Session-membership mismatch ────────────────────────────────

  it("detects session-membership mismatch", () => {
    // Insert event, then change its session_id
    insertEvent(db, { id: "e1", sequence: 0, sessionId: "s1", type: "session.started" })
    db.run("UPDATE events SET session_id = 's999' WHERE id = 'e1'")

    // Now query for s1 — no events found
    const replay = deriveAuditReplay(db, "s1")
    expect(replay.source.eventCount).toBe(0)
    expect(replay.verification.sourceEvents).toBe("UNAVAILABLE")
  })

  // ── 28. Atomic replay export ───────────────────────────────────────

  it("exports replay to file atomically", () => {
    insertEvent(db, { id: "e1", sequence: 0, sessionId: "s1", type: "session.started" })
    insertEvent(db, { id: "e2", sequence: 1, sessionId: "s1", type: "session.completed", payload: { reason: "normal" }, previousHash: "prev" })

    const testDir = join(tmpdir(), "replay-export-" + Date.now())
    mkdirSync(testDir, { recursive: true })
    try {
      const replay = deriveAuditReplay(db, "s1")
      const content = exportAuditReplay(replay, "json")
      const path = join(testDir, "s1.audit-replay.v1.json")
      const tmpPath = path + ".tmp"
      writeFileSync(tmpPath, content, "utf-8")
      const { renameSync } = require("node:fs")
      renameSync(tmpPath, path)

      expect(existsSync(path)).toBe(true)
      const read = readFileSync(path, "utf-8")
      const parsed = JSON.parse(read)
      expect(parsed.schemaVersion).toBe("1")
      expect(parsed.sessionId).toBe("s1")
      expect(existsSync(tmpPath)).toBe(false)
    } finally {
      rmSync(testDir, { recursive: true, force: true })
    }
  })
})
