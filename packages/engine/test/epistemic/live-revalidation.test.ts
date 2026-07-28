import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { Database } from "bun:sqlite"
import { createHash } from "node:crypto"
import {
  deriveRevalidation,
} from "@arcana/engine/session/epistemic/live-revalidation"

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
  return db
}

function eventHash(row: { id: string; sequence: number; timestamp: string; previous_hash: string | null; actor_kind: string; actor_id: string; type: string; payload: string }): string {
  return createHash("sha256").update(JSON.stringify({
    id: row.id, sequence: row.sequence, timestamp: row.timestamp,
    previousHash: row.previous_hash, actorKind: row.actor_kind,
    actorId: row.actor_id, type: row.type, payload: row.payload,
  })).digest("hex")
}

function insertEvent(db: Database, opts: {
  id: string; sequence: number; sessionId: string; type: string;
  actorKind?: string; actorId?: string;
  payload?: Record<string, unknown>; previousHash?: string | null
}) {
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

// ── tests ────────────────────────────────────────────────────────────

describe("Live Revalidation", () => {
  let db: Database

  beforeEach(() => { db = makeTestDB() })
  afterEach(() => { db.close() })

  // ── 1. Missing session → UNAVAILABLE ──────────────────────────────

  it("returns UNAVAILABLE for missing session", () => {
    const result = deriveRevalidation(db, "nonexistent")
    expect(result.status).toBe("UNAVAILABLE")
    expect(result.schemaVersion).toBe("1")
    expect(result.limitations.length).toBeGreaterThan(0)
  })

  // ── 2. Empty session → UNAVAILABLE ────────────────────────────────

  it("returns UNAVAILABLE for zero-event session", () => {
    const result = deriveRevalidation(db, "empty")
    expect(result.status).toBe("UNAVAILABLE")
  })

  // ── 3. Simple session → STILL_VALID ───────────────────────────────

  it("returns STILL_VALID for simple session with no obligations", () => {
    insertEvent(db, { id: "e1", sequence: 0, sessionId: "s1", type: "session.started" })
    insertEvent(db, { id: "e2", sequence: 1, sessionId: "s1", type: "session.completed", payload: { reason: "normal" }, previousHash: "prev" })

    const result = deriveRevalidation(db, "s1")
    expect(result.status).toBe("STILL_VALID")
    expect(result.environmentDrift).toHaveLength(0)
    expect(result.obligationResults).toHaveLength(0)
    expect(result.claimTransitions).toHaveLength(0)
  })

  // ── 4. Session with claims → CONFIRMED ────────────────────────────

  it("confirms historical claims", () => {
    insertEvent(db, { id: "e1", sequence: 0, sessionId: "s1", type: "session.started" })
    insertEvent(db, { id: "e2", sequence: 1, sessionId: "s1", type: "claim.created", payload: { claimId: "c1", level: "observed" } })
    insertEvent(db, { id: "e3", sequence: 2, sessionId: "s1", type: "claim.transitioned", payload: { claimId: "c1", newLevel: "verified" } })
    insertEvent(db, { id: "e4", sequence: 3, sessionId: "s1", type: "session.completed", payload: { reason: "normal" }, previousHash: "prev" })

    const result = deriveRevalidation(db, "s1")
    expect(result.claimTransitions).toHaveLength(1)
    expect(result.claimTransitions[0]!.claimId).toBe("c1")
    expect(result.claimTransitions[0]!.historicalLevel).toBe("verified")
    expect(result.claimTransitions[0]!.revalidationAction).toBe("CONFIRMED")
    expect(result.status).toBe("STILL_VALID")
  })

  // ── 5. Resolved obligation → STILL_SATISFIED ──────────────────────

  it("marks resolved obligations as STILL_SATISFIED", () => {
    insertEvent(db, { id: "e1", sequence: 0, sessionId: "s1", type: "session.started" })
    insertEvent(db, { id: "e2", sequence: 1, sessionId: "s1", type: "obligation.created", payload: { obligationId: "o1", description: "run tests", required: true } })
    insertEvent(db, { id: "e3", sequence: 2, sessionId: "s1", type: "obligation.resolved", payload: { obligationId: "o1" } })
    insertEvent(db, { id: "e4", sequence: 3, sessionId: "s1", type: "session.completed", payload: { reason: "normal" }, previousHash: "prev" })

    const result = deriveRevalidation(db, "s1")
    expect(result.obligationResults).toHaveLength(1)
    expect(result.obligationResults[0]!.revalidationStatus).toBe("STILL_SATISFIED")
    expect(result.status).toBe("STILL_VALID")
  })

  // ── 6. Unresolved required obligation → UNAVAILABLE ───────────────

  it("marks unresolved required obligations as UNAVAILABLE", () => {
    insertEvent(db, { id: "e1", sequence: 0, sessionId: "s1", type: "session.started" })
    insertEvent(db, { id: "e2", sequence: 1, sessionId: "s1", type: "obligation.created", payload: { obligationId: "o1", description: "deploy", required: true } })
    insertEvent(db, { id: "e3", sequence: 2, sessionId: "s1", type: "session.completed", payload: { reason: "normal" }, previousHash: "prev" })

    const result = deriveRevalidation(db, "s1")
    expect(result.obligationResults).toHaveLength(1)
    expect(result.obligationResults[0]!.revalidationStatus).toBe("UNAVAILABLE")
    expect(result.status).toBe("PARTIALLY_VALID")
  })

  // ── 7. Environment drift detection ────────────────────────────────

  it("detects environment drift for missing working directory", () => {
    insertEvent(db, { id: "e1", sequence: 0, sessionId: "s1", type: "session.started" })
    insertEvent(db, { id: "e2", sequence: 1, sessionId: "s1", type: "tool.called", payload: {
      callID: "c1", tool: "terminal",
      replay: { executable: "bun", arguments: ["test"], cwd: "/nonexistent/path/12345", timeout: 5000, policyDecision: "ELIGIBLE" },
    } })
    insertEvent(db, { id: "e3", sequence: 2, sessionId: "s1", type: "session.completed", payload: { reason: "normal" }, previousHash: "prev" })

    const result = deriveRevalidation(db, "s1")
    expect(result.environmentDrift.length).toBeGreaterThan(0)
    expect(result.environmentDrift[0]!.kind).toBe("environment")
    expect(result.environmentDrift[0]!.severity).toBe("CRITICAL")
    expect(result.status).toBe("INVALIDATED")
  })

  // ── 8. Schema version ─────────────────────────────────────────────

  it("always produces schema version 1", () => {
    expect(deriveRevalidation(db, "s1").schemaVersion).toBe("1")
  })

  // ── 9. Unique revalidation IDs ────────────────────────────────────

  it("generates unique revalidation IDs", () => {
    const r1 = deriveRevalidation(db, "s1")
    const r2 = deriveRevalidation(db, "s1")
    expect(r1.revalidationId).not.toBe(r2.revalidationId)
  })

  // ── 10. Does not mutate source events ─────────────────────────────

  it("does not mutate source events", () => {
    insertEvent(db, { id: "e1", sequence: 0, sessionId: "s1", type: "session.started" })
    const before = db.query("SELECT * FROM events ORDER BY sequence").all()
    deriveRevalidation(db, "s1")
    const after = db.query("SELECT * FROM events ORDER BY sequence").all()
    expect(JSON.stringify(after)).toBe(JSON.stringify(before))
  })

  // ── 11. Limitations always present ────────────────────────────────

  it("always includes limitations", () => {
    const result = deriveRevalidation(db, "s1")
    expect(result.limitations.length).toBeGreaterThan(0)
    expect(result.limitations.some(l => l.includes("does not re-execute") || l.includes("does not re-run") || l.includes("No events"))).toBe(true)
  })

  // ── 12. Multiple claims and obligations ────────────────────────────

  it("handles multiple claims and obligations", () => {
    insertEvent(db, { id: "e1", sequence: 0, sessionId: "s1", type: "session.started" })
    insertEvent(db, { id: "e2", sequence: 1, sessionId: "s1", type: "claim.created", payload: { claimId: "c1", level: "observed" } })
    insertEvent(db, { id: "e3", sequence: 2, sessionId: "s1", type: "claim.created", payload: { claimId: "c2", level: "assumed" } })
    insertEvent(db, { id: "e4", sequence: 3, sessionId: "s1", type: "obligation.created", payload: { obligationId: "o1", description: "test", required: true } })
    insertEvent(db, { id: "e5", sequence: 4, sessionId: "s1", type: "obligation.resolved", payload: { obligationId: "o1" } })
    insertEvent(db, { id: "e6", sequence: 5, sessionId: "s1", type: "session.completed", payload: { reason: "normal" }, previousHash: "prev" })

    const result = deriveRevalidation(db, "s1")
    expect(result.claimTransitions).toHaveLength(2)
    expect(result.obligationResults).toHaveLength(1)
    expect(result.obligationResults[0]!.revalidationStatus).toBe("STILL_SATISFIED")
    expect(result.status).toBe("STILL_VALID")
  })

  // ── 13. Timestamps are populated ──────────────────────────────────

  it("populates startedAt and completedAt", () => {
    const before = new Date().toISOString()
    const result = deriveRevalidation(db, "s1")
    const after = new Date().toISOString()
    expect(result.startedAt >= before).toBe(true)
    expect(result.completedAt <= after).toBe(true)
    expect(result.completedAt >= result.startedAt).toBe(true)
  })

  // ── 14. Historical RunProof is never mutated ──────────────────────

  it("never mutates historical RunProof", () => {
    insertEvent(db, { id: "e1", sequence: 0, sessionId: "s1", type: "session.started" })
    insertEvent(db, { id: "e2", sequence: 1, sessionId: "s1", type: "session.completed", payload: { reason: "normal" }, previousHash: "prev" })

    const r1 = deriveRevalidation(db, "s1")
    const r2 = deriveRevalidation(db, "s1")

    // Different revalidation IDs but same source data
    expect(r1.sourceSessionId).toBe(r2.sourceSessionId)
    expect(r1.revalidationId).not.toBe(r2.revalidationId)
  })
})
