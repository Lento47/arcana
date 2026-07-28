import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { Database } from "bun:sqlite"
import { createHash } from "node:crypto"
import {
  deriveDeterministicReplay,
  checkEnvironmentCompatibility,
} from "@arcana/engine/session/epistemic/deterministic-replay"
import {
  extractReplayCallMetadata,
  extractReplayReturnMetadata,
  parseCommandString,
} from "@arcana/engine/session/epistemic/replay-metadata"

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

// ── extractReplayCallMetadata tests ──────────────────────────────────

describe("extractReplayCallMetadata", () => {
  it("extracts terminal command info", () => {
    const meta = extractReplayCallMetadata("terminal", {
      command: "bun test packages/engine/test/epistemic",
      cwd: "/tmp/test",
      timeout: 30000,
    })
    expect(meta.executable).toBe("bun")
    expect(meta.arguments).toEqual(["test", "packages/engine/test/epistemic"])
    expect(meta.cwd).toBe("/tmp/test")
    expect(meta.timeout).toBe(30000)
    expect(meta.policyDecision).toBe("ELIGIBLE")
    expect(meta.refusalReason).toBeNull()
  })

  it("refuses dangerous commands", () => {
    const meta = extractReplayCallMetadata("terminal", {
      command: "npm install lodash",
    })
    expect(meta.policyDecision).toBe("REFUSED")
    expect(meta.refusalReason).toContain("dangerous_pattern")
  })

  it("returns NOT_APPLICABLE for non-terminal tools", () => {
    const meta = extractReplayCallMetadata("file_read", { path: "/tmp" })
    expect(meta.policyDecision).toBe("NOT_APPLICABLE")
    expect(meta.executable).toBeNull()
  })

  it("refuses when no command in input", () => {
    const meta = extractReplayCallMetadata("terminal", { cwd: "/tmp" })
    expect(meta.policyDecision).toBe("REFUSED")
    expect(meta.refusalReason).toBe("no_command_in_input")
  })

  it("classifies tsc --noEmit as eligible", () => {
    const meta = extractReplayCallMetadata("terminal", { command: "tsc --noEmit" })
    expect(meta.policyDecision).toBe("ELIGIBLE")
    expect(meta.executable).toBe("tsc")
    expect(meta.arguments).toEqual(["--noEmit"])
  })

  it("refuses commands with secrets", () => {
    const meta = extractReplayCallMetadata("terminal", {
      command: "curl -H 'Authorization: sk-abcdefghijklmnopqrstuvwxyz'",
    })
    expect(meta.policyDecision).toBe("REFUSED")
    expect(meta.refusalReason).toBe("contains_secret")
  })
})

// ── extractReplayReturnMetadata tests ────────────────────────────────

describe("extractReplayReturnMetadata", () => {
  it("computes digests from output", () => {
    const meta = extractReplayReturnMetadata({}, "hello world", { exitCode: 0 }, Date.now() - 100, Date.now())
    expect(meta.exitCode).toBe(0)
    expect(meta.stdoutDigest).toHaveLength(64)
    expect(meta.stderrDigest).toHaveLength(64)
    expect(meta.normalizedOutputDigest).toHaveLength(64)
    expect(meta.duration).toBeGreaterThanOrEqual(90)
    expect(meta.timeoutStatus).toBe("COMPLETED")
  })

  it("detects timeout status", () => {
    const meta = extractReplayReturnMetadata({}, "output", { timedOut: true }, Date.now() - 100, Date.now())
    expect(meta.timeoutStatus).toBe("TIMED_OUT")
  })

  it("uses metadata exitCode over input", () => {
    const meta = extractReplayReturnMetadata({ exitCode: 1 }, "output", { exitCode: 0 }, null, Date.now())
    expect(meta.exitCode).toBe(0)
  })

  it("returns null duration when no start time", () => {
    const meta = extractReplayReturnMetadata({}, "output", {}, null, Date.now())
    expect(meta.duration).toBeNull()
  })
})

// ── parseCommandString tests ─────────────────────────────────────────

describe("parseCommandString", () => {
  it("parses simple command", () => {
    const result = parseCommandString("bun test packages/engine")
    expect(result).toEqual({ executable: "bun", args: ["test", "packages/engine"] })
  })

  it("handles quoted arguments", () => {
    const result = parseCommandString('tsc --noEmit --project "tsconfig.json"')
    expect(result).toEqual({ executable: "tsc", args: ["--noEmit", "--project", "tsconfig.json"] })
  })

  it("returns null for empty", () => {
    expect(parseCommandString("")).toBeNull()
    expect(parseCommandString("   ")).toBeNull()
  })
})

// ── deriveDeterministicReplay tests ──────────────────────────────────

describe("Deterministic Replay", () => {
  let db: Database

  beforeEach(() => { db = makeTestDB() })
  afterEach(() => { db.close() })

  // ── 1. Current-format events (no replay metadata) are refused ────

  it("refuses tool.called events without replay metadata", () => {
    insertEvent(db, { id: "e1", sequence: 0, sessionId: "s1", type: "session.started" })
    insertEvent(db, { id: "e2", sequence: 1, sessionId: "s1", type: "tool.called", payload: { tool: "terminal", callID: "c1" } })
    insertEvent(db, { id: "e3", sequence: 2, sessionId: "s1", type: "tool.returned", payload: { callID: "c1", title: "test", hasOutput: true } })
    insertEvent(db, { id: "e4", sequence: 3, sessionId: "s1", type: "session.completed", payload: { reason: "normal" }, previousHash: "prev" })

    const result = deriveDeterministicReplay(db, "s1")
    expect(result.status).toBe("REFUSED")
    expect(result.p2Eligible).toBe(false)
    expect(result.steps).toHaveLength(1)
    expect(result.steps[0]!.status).toBe("REFUSED")
  })

  // ── 2. Enriched events with ELIGIBLE policy (dry-run) ────────────

  it("accepts enriched ELIGIBLE events in dry-run mode", () => {
    const cwd = process.cwd()
    insertEvent(db, { id: "e1", sequence: 0, sessionId: "s1", type: "session.started" })
    insertEvent(db, { id: "e2", sequence: 1, sessionId: "s1", type: "tool.called", payload: {
      callID: "c1", tool: "terminal", providerExecuted: false,
      replay: { executable: "node", arguments: ["-e", "console.log(42)"], cwd, timeout: 5000, policyDecision: "ELIGIBLE", refusalReason: null },
    } })
    insertEvent(db, { id: "e3", sequence: 2, sessionId: "s1", type: "tool.returned", payload: {
      callID: "c1", title: "terminal", hasOutput: true,
      replay: { exitCode: 0, stdoutDigest: "abc123", stderrDigest: "def456", normalizedOutputDigest: "abc123", duration: 50, timeoutStatus: "COMPLETED" },
    } })
    insertEvent(db, { id: "e4", sequence: 3, sessionId: "s1", type: "session.completed", payload: { reason: "normal" }, previousHash: "prev" })

    const result = deriveDeterministicReplay(db, "s1", { dryRun: true })
    expect(result.steps).toHaveLength(1)
    expect(result.steps[0]!.status).toBe("SKIPPED")
    expect(result.steps[0]!.policyDecision).toBe("ELIGIBLE")
    expect(result.steps[0]!.originalExitCode).toBe(0)
    expect(result.steps[0]!.originalOutputDigest).toBe("abc123")
  })

  // ── 3. Refused policy events ─────────────────────────────────────

  it("refuses events with REFUSED policy decision", () => {
    insertEvent(db, { id: "e1", sequence: 0, sessionId: "s1", type: "session.started" })
    insertEvent(db, { id: "e2", sequence: 1, sessionId: "s1", type: "tool.called", payload: {
      callID: "c1", tool: "terminal",
      replay: { executable: "curl", arguments: ["https://example.com"], cwd: "/tmp", timeout: 5000, policyDecision: "REFUSED", refusalReason: "dangerous_pattern:curl" },
    } })
    insertEvent(db, { id: "e3", sequence: 2, sessionId: "s1", type: "tool.returned", payload: { callID: "c1", title: "terminal", hasOutput: true } })

    const result = deriveDeterministicReplay(db, "s1")
    expect(result.steps[0]!.status).toBe("REFUSED")
    expect(result.steps[0]!.refusalReason).toContain("dangerous_pattern")
  })

  // ── 4. NOT_APPLICABLE tools ──────────────────────────────────────

  it("refuses non-terminal tools as NOT_APPLICABLE", () => {
    insertEvent(db, { id: "e1", sequence: 0, sessionId: "s1", type: "session.started" })
    insertEvent(db, { id: "e2", sequence: 1, sessionId: "s1", type: "tool.called", payload: {
      callID: "c1", tool: "file_read",
      replay: { executable: null, arguments: [], cwd: null, timeout: null, policyDecision: "NOT_APPLICABLE", refusalReason: null },
    } })
    insertEvent(db, { id: "e3", sequence: 2, sessionId: "s1", type: "tool.returned", payload: { callID: "c1", title: "file_read", hasOutput: true } })

    const result = deriveDeterministicReplay(db, "s1")
    expect(result.steps[0]!.status).toBe("REFUSED")
    expect(result.steps[0]!.refusalReason).toContain("not applicable")
  })

  // ── 5. No tool.called events ─────────────────────────────────────

  it("handles session with no tool.called events", () => {
    insertEvent(db, { id: "e1", sequence: 0, sessionId: "s1", type: "session.started" })
    insertEvent(db, { id: "e2", sequence: 1, sessionId: "s1", type: "session.completed", payload: { reason: "normal" }, previousHash: "prev" })

    const result = deriveDeterministicReplay(db, "s1")
    expect(result.status).toBe("REFUSED")
    expect(result.steps).toHaveLength(0)
  })

  // ── 6. Missing session ───────────────────────────────────────────

  it("handles missing session", () => {
    const result = deriveDeterministicReplay(db, "nonexistent")
    expect(result.status).toBe("REFUSED")
    expect(result.schemaVersion).toBe("1")
  })

  // ── 7. Dry-run mode ──────────────────────────────────────────────

  it("marks eligible steps as SKIPPED in dry-run", () => {
    insertEvent(db, { id: "e1", sequence: 0, sessionId: "s1", type: "session.started" })
    insertEvent(db, { id: "e2", sequence: 1, sessionId: "s1", type: "tool.called", payload: {
      callID: "c1", tool: "terminal",
      replay: { executable: "node", arguments: ["-e", "console.log(1)"], cwd: process.cwd(), timeout: 5000, policyDecision: "ELIGIBLE", refusalReason: null },
    } })
    insertEvent(db, { id: "e3", sequence: 2, sessionId: "s1", type: "tool.returned", payload: {
      callID: "c1", title: "terminal", hasOutput: true,
      replay: { exitCode: 0, stdoutDigest: "abc", stderrDigest: "def", normalizedOutputDigest: "abc", duration: 10, timeoutStatus: "COMPLETED" },
    } })

    const result = deriveDeterministicReplay(db, "s1", { dryRun: true })
    expect(result.steps[0]!.status).toBe("SKIPPED")
  })

  // ── 8. Tool.called without tool.returned ──────────────────────────

  it("handles tool.called without matching tool.returned", () => {
    insertEvent(db, { id: "e1", sequence: 0, sessionId: "s1", type: "session.started" })
    insertEvent(db, { id: "e2", sequence: 1, sessionId: "s1", type: "tool.called", payload: {
      callID: "c1", tool: "terminal",
      replay: { executable: "tsc", arguments: ["--noEmit"], cwd: "/tmp", timeout: 5000, policyDecision: "ELIGIBLE", refusalReason: null },
    } })
    // No tool.returned

    const result = deriveDeterministicReplay(db, "s1")
    // Paired call has null return → no exit code/digest → REFUSED
    expect(result.steps[0]!.status).toBe("REFUSED")
    expect(result.steps[0]!.refusalReason).toContain("no recorded exit code")
  })

  // ── 9. Schema version ────────────────────────────────────────────

  it("always produces schema version 1", () => {
    const result = deriveDeterministicReplay(db, "s1")
    expect(result.schemaVersion).toBe("1")
  })

  // ── 10. Replay ID uniqueness ─────────────────────────────────────

  it("generates unique replay IDs", () => {
    const r1 = deriveDeterministicReplay(db, "s1")
    const r2 = deriveDeterministicReplay(db, "s1")
    expect(r1.replayId).not.toBe(r2.replayId)
  })

  // ── 11. Does not mutate source events ────────────────────────────

  it("does not mutate source events", () => {
    insertEvent(db, { id: "e1", sequence: 0, sessionId: "s1", type: "session.started" })
    insertEvent(db, { id: "e2", sequence: 1, sessionId: "s1", type: "tool.called", payload: {
      callID: "c1", tool: "terminal",
      replay: { executable: "echo", arguments: ["test"], cwd: "/tmp", timeout: 5000, policyDecision: "ELIGIBLE", refusalReason: null },
    } })

    const before = db.query("SELECT * FROM events ORDER BY sequence").all()
    deriveDeterministicReplay(db, "s1")
    const after = db.query("SELECT * FROM events ORDER BY sequence").all()
    expect(JSON.stringify(after)).toBe(JSON.stringify(before))
  })

  // ── 12. Environment compatibility ────────────────────────────────

  it("detects compatible environment for available tools", () => {
    expect(checkEnvironmentCompatibility("node", null)).toBe("COMPATIBLE")
  })

  it("detects drifted environment for missing directory", () => {
    expect(checkEnvironmentCompatibility("node", "/nonexistent/path/12345")).toBe("DRIFTED")
  })

  it("reports unknown for null executable", () => {
    expect(checkEnvironmentCompatibility(null, null)).toBe("UNKNOWN")
  })

  // ── 13. P2 eligibility ───────────────────────────────────────────

  it("reports p2Eligible=false when all refused", () => {
    const result = deriveDeterministicReplay(db, "s1")
    expect(result.p2Eligible).toBe(false)
  })

  // ── 14. Interleaved sessions ─────────────────────────────────────

  it("only processes events for target session", () => {
    insertEvent(db, { id: "e1", sequence: 0, sessionId: "s1", type: "session.started" })
    insertEvent(db, { id: "e2", sequence: 1, sessionId: "s2", type: "tool.called", payload: {
      callID: "c1", tool: "terminal",
      replay: { executable: "bun", arguments: ["test"], cwd: "/tmp", timeout: 5000, policyDecision: "ELIGIBLE", refusalReason: null },
    } })
    insertEvent(db, { id: "e3", sequence: 2, sessionId: "s1", type: "session.completed", payload: { reason: "normal" }, previousHash: "prev" })

    const result = deriveDeterministicReplay(db, "s1")
    expect(result.steps).toHaveLength(0)
  })

  // ── 15. Unauthorized mutation flag ───────────────────────────────

  it("reports unauthorizedMutation=false when no mutation", () => {
    const result = deriveDeterministicReplay(db, "s1")
    expect(result.unauthorizedMutation).toBe(false)
  })

  // ── 16. Mixed eligibility ────────────────────────────────────────

  it("handles mixed eligibility correctly", () => {
    insertEvent(db, { id: "e1", sequence: 0, sessionId: "s1", type: "session.started" })
    // NOT_APPLICABLE
    insertEvent(db, { id: "e2", sequence: 1, sessionId: "s1", type: "tool.called", payload: {
      callID: "c1", tool: "file_read",
      replay: { executable: null, arguments: [], cwd: null, timeout: null, policyDecision: "NOT_APPLICABLE", refusalReason: null },
    } })
    // REFUSED
    insertEvent(db, { id: "e3", sequence: 2, sessionId: "s1", type: "tool.called", payload: {
      callID: "c2", tool: "terminal",
      replay: { executable: "curl", arguments: ["https://example.com"], cwd: "/tmp", timeout: 5000, policyDecision: "REFUSED", refusalReason: "dangerous_pattern:curl" },
    } })

    const result = deriveDeterministicReplay(db, "s1")
    expect(result.steps).toHaveLength(2)
    expect(result.steps[0]!.status).toBe("REFUSED")
    expect(result.steps[1]!.status).toBe("REFUSED")
    expect(result.status).toBe("REFUSED")
  })
})
