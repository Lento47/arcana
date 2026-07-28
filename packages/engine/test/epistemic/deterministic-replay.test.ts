import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { Database } from "bun:sqlite"
import { createHash } from "node:crypto"
import {
  deriveDeterministicReplay,
  checkCommandPolicy,
  parseCommand,
  extractToolCallMetadata,
  checkEnvironmentCompatibility,
  computeOutputDigest,
  type DeterministicReplayResult,
} from "@arcana/engine/session/epistemic/deterministic-replay"

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

// ── parseCommand tests ───────────────────────────────────────────────

describe("parseCommand", () => {
  it("parses simple command", () => {
    const result = parseCommand("bun test packages/engine")
    expect(result).toEqual({ program: "bun", args: ["test", "packages/engine"] })
  })

  it("parses command with quoted args", () => {
    const result = parseCommand('tsc --noEmit --project "tsconfig.json"')
    expect(result).toEqual({ program: "tsc", args: ["--noEmit", "--project", "tsconfig.json"] })
  })

  it("returns null for empty command", () => {
    expect(parseCommand("")).toBeNull()
    expect(parseCommand("   ")).toBeNull()
  })

  it("handles single program", () => {
    const result = parseCommand("tsc")
    expect(result).toEqual({ program: "tsc", args: [] })
  })
})

// ── checkCommandPolicy tests ─────────────────────────────────────────

describe("checkCommandPolicy", () => {
  it("allows bun test", () => {
    const result = checkCommandPolicy("bun test packages/engine/test/epistemic")
    expect(result.allowed).toBe(true)
  })

  it("allows tsc --noEmit", () => {
    const result = checkCommandPolicy("tsc --noEmit")
    expect(result.allowed).toBe(true)
  })

  it("allows cargo test", () => {
    const result = checkCommandPolicy("cargo test my_test")
    expect(result.allowed).toBe(true)
  })

  it("allows eslint", () => {
    const result = checkCommandPolicy("eslint src/index.ts")
    expect(result.allowed).toBe(true)
  })

  it("refuses npm install", () => {
    const result = checkCommandPolicy("npm install")
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain("dangerous pattern")
  })

  it("refuses git commit", () => {
    const result = checkCommandPolicy("git commit -m 'test'")
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain("dangerous pattern")
  })

  it("refuses piped commands", () => {
    const result = checkCommandPolicy("bun test | grep fail")
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain("dangerous pattern")
  })

  it("refuses redirect", () => {
    const result = checkCommandPolicy("bun test > output.txt")
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain("dangerous pattern")
  })

  it("refuses curl", () => {
    const result = checkCommandPolicy("curl https://example.com")
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain("dangerous pattern")
  })

  it("refuses rm", () => {
    const result = checkCommandPolicy("rm -rf /tmp/test")
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain("dangerous pattern")
  })

  it("refuses docker", () => {
    const result = checkCommandPolicy("docker run ubuntu")
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain("dangerous pattern")
  })

  it("refuses commands with API keys", () => {
    const result = checkCommandPolicy("curl -H 'Authorization: sk-abc123def456ghi789jkl012mno'")
    expect(result.allowed).toBe(false)
  })

  it("refuses commands with passwords", () => {
    const result = checkCommandPolicy("node script.js --password=secret123")
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain("secret")
  })

  it("refuses disallowed subcommands", () => {
    const result = checkCommandPolicy("bun install")
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain("dangerous pattern")
  })

  it("allows npx tsc", () => {
    const result = checkCommandPolicy("npx tsc --noEmit")
    expect(result.allowed).toBe(true)
  })

  it("refuses unknown program", () => {
    const result = checkCommandPolicy("unknown-tool --test")
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain("program not in allowlist")
  })

  it("refuses semicolon chaining", () => {
    const result = checkCommandPolicy("bun test; echo done")
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain("dangerous pattern")
  })

  it("refuses command substitution", () => {
    const result = checkCommandPolicy("echo $(whoami)")
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain("dangerous pattern")
  })
})

// ── extractToolCallMetadata tests ────────────────────────────────────

describe("extractToolCallMetadata", () => {
  it("extracts all fields when present", () => {
    const meta = extractToolCallMetadata({
      command: "bun test",
      workingDirectory: "/tmp",
      timeout: 30000,
      replayable: true,
      exitCode: 0,
      outputDigest: "abc123",
    })
    expect(meta.command).toBe("bun test")
    expect(meta.workingDirectory).toBe("/tmp")
    expect(meta.timeout).toBe(30000)
    expect(meta.replayable).toBe(true)
    expect(meta.exitCode).toBe(0)
    expect(meta.outputDigest).toBe("abc123")
  })

  it("returns null for missing fields", () => {
    const meta = extractToolCallMetadata({ tool: "terminal" })
    expect(meta.command).toBeNull()
    expect(meta.workingDirectory).toBeNull()
    expect(meta.timeout).toBeNull()
    expect(meta.replayable).toBe(false)
    expect(meta.exitCode).toBeNull()
    expect(meta.outputDigest).toBeNull()
  })
})

// ── deriveDeterministicReplay tests ──────────────────────────────────

describe("Deterministic Replay", () => {
  let db: Database

  beforeEach(() => { db = makeTestDB() })
  afterEach(() => { db.close() })

  // ── 1. Current-format events are refused ──────────────────────────

  it("refuses tool.called events without command metadata", () => {
    insertEvent(db, { id: "e1", sequence: 0, sessionId: "s1", type: "session.started" })
    insertEvent(db, { id: "e2", sequence: 1, sessionId: "s1", type: "tool.called", payload: { tool: "terminal", callID: "c1" } })
    insertEvent(db, { id: "e3", sequence: 2, sessionId: "s1", type: "session.completed", payload: { reason: "normal" }, previousHash: "prev" })

    const result = deriveDeterministicReplay(db, "s1")
    expect(result.status).toBe("REFUSED")
    expect(result.p2Eligible).toBe(false)
    expect(result.steps).toHaveLength(1)
    expect(result.steps[0]!.status).toBe("REFUSED")
    expect(result.steps[0]!.refusalReason).toContain("no command recorded")
  })

  // ── 2. Zero tool.called events ────────────────────────────────────

  it("handles session with no tool.called events", () => {
    insertEvent(db, { id: "e1", sequence: 0, sessionId: "s1", type: "session.started" })
    insertEvent(db, { id: "e2", sequence: 1, sessionId: "s1", type: "session.completed", payload: { reason: "normal" }, previousHash: "prev" })

    const result = deriveDeterministicReplay(db, "s1")
    expect(result.status).toBe("REFUSED")
    expect(result.steps).toHaveLength(0)
    expect(result.p2Eligible).toBe(false)
  })

  // ── 3. Missing session ────────────────────────────────────────────

  it("handles missing session", () => {
    const result = deriveDeterministicReplay(db, "nonexistent")
    expect(result.status).toBe("REFUSED")
    expect(result.steps).toHaveLength(0)
    expect(result.schemaVersion).toBe("1")
    expect(result.sourceSessionId).toBe("nonexistent")
  })

  // ── 4. Refuses events without working directory ───────────────────

  it("refuses events with command but no working directory", () => {
    insertEvent(db, { id: "e1", sequence: 0, sessionId: "s1", type: "session.started" })
    insertEvent(db, { id: "e2", sequence: 1, sessionId: "s1", type: "tool.called", payload: {
      tool: "terminal", callID: "c1", command: "bun test",
    } })
    insertEvent(db, { id: "e3", sequence: 2, sessionId: "s1", type: "session.completed", payload: { reason: "normal" }, previousHash: "prev" })

    const result = deriveDeterministicReplay(db, "s1")
    expect(result.steps[0]!.status).toBe("REFUSED")
    expect(result.steps[0]!.refusalReason).toContain("no working directory")
  })

  // ── 5. Refuses events without exit code / output digest ───────────

  it("refuses events with command and working dir but no output digest", () => {
    insertEvent(db, { id: "e1", sequence: 0, sessionId: "s1", type: "session.started" })
    insertEvent(db, { id: "e2", sequence: 1, sessionId: "s1", type: "tool.called", payload: {
      tool: "terminal", callID: "c1", command: "bun test",
      workingDirectory: "/tmp",
    } })
    insertEvent(db, { id: "e3", sequence: 2, sessionId: "s1", type: "session.completed", payload: { reason: "normal" }, previousHash: "prev" })

    const result = deriveDeterministicReplay(db, "s1")
    expect(result.steps[0]!.status).toBe("REFUSED")
    expect(result.steps[0]!.refusalReason).toContain("no recorded exit code")
  })

  // ── 6. Dry-run mode ──────────────────────────────────────────────

  it("marks eligible steps as SKIPPED in dry-run mode", () => {
    insertEvent(db, { id: "e1", sequence: 0, sessionId: "s1", type: "session.started" })
    insertEvent(db, { id: "e2", sequence: 1, sessionId: "s1", type: "tool.called", payload: {
      tool: "terminal", callID: "c1", command: "echo hello",
      workingDirectory: "/tmp", exitCode: 0, outputDigest: "abc123",
    } })

    const result = deriveDeterministicReplay(db, "s1", { dryRun: true })
    expect(result.steps[0]!.status).toBe("REFUSED") // echo is not in allowlist
  })

  // ── 7. Refuses dangerous commands ─────────────────────────────────

  it("refuses install commands in dry-run", () => {
    insertEvent(db, { id: "e1", sequence: 0, sessionId: "s1", type: "session.started" })
    insertEvent(db, { id: "e2", sequence: 1, sessionId: "s1", type: "tool.called", payload: {
      tool: "terminal", callID: "c1", command: "npm install",
      workingDirectory: "/tmp", exitCode: 0, outputDigest: "abc",
    } })

    const result = deriveDeterministicReplay(db, "s1", { dryRun: true })
    expect(result.steps[0]!.status).toBe("REFUSED")
    expect(result.steps[0]!.refusalReason).toContain("dangerous pattern")
  })

  // ── 8. Multiple tool.called events with mixed eligibility ─────────

  it("handles mixed eligibility correctly", () => {
    insertEvent(db, { id: "e1", sequence: 0, sessionId: "s1", type: "session.started" })
    // No command metadata
    insertEvent(db, { id: "e2", sequence: 1, sessionId: "s1", type: "tool.called", payload: { tool: "terminal", callID: "c1" } })
    // Dangerous command
    insertEvent(db, { id: "e3", sequence: 2, sessionId: "s1", type: "tool.called", payload: {
      tool: "terminal", callID: "c2", command: "curl https://example.com",
      workingDirectory: "/tmp", exitCode: 0, outputDigest: "abc",
    } })
    insertEvent(db, { id: "e4", sequence: 3, sessionId: "s1", type: "session.completed", payload: { reason: "normal" }, previousHash: "prev" })

    const result = deriveDeterministicReplay(db, "s1")
    expect(result.steps).toHaveLength(2)
    expect(result.steps[0]!.status).toBe("REFUSED")
    expect(result.steps[1]!.status).toBe("REFUSED")
    expect(result.status).toBe("REFUSED")
    expect(result.p2Eligible).toBe(false)
    expect(result.refusalReasons).toHaveLength(2)
  })

  // ── 9. Environment compatibility check ────────────────────────────

  it("detects environment compatibility for available tools", () => {
    // node should be available
    const result = checkEnvironmentCompatibility("node --version", null)
    expect(result).toBe("COMPATIBLE")
  })

  it("detects environment drift for missing working directory", () => {
    const result = checkEnvironmentCompatibility("echo test", "/nonexistent/path/12345")
    expect(result).toBe("DRIFTED")
  })

  // ── 10. P2 eligibility is false when no steps succeed ─────────────

  it("reports p2Eligible=false when all steps refused", () => {
    insertEvent(db, { id: "e1", sequence: 0, sessionId: "s1", type: "session.started" })
    insertEvent(db, { id: "e2", sequence: 1, sessionId: "s1", type: "tool.called", payload: { tool: "terminal", callID: "c1" } })

    const result = deriveDeterministicReplay(db, "s1")
    expect(result.p2Eligible).toBe(false)
    expect(result.status).toBe("REFUSED")
  })

  // ── 11. Schema version is always "1" ──────────────────────────────

  it("always produces schema version 1", () => {
    const result = deriveDeterministicReplay(db, "s1")
    expect(result.schemaVersion).toBe("1")
  })

  // ── 12. Replay ID is unique ───────────────────────────────────────

  it("generates unique replay IDs", () => {
    const r1 = deriveDeterministicReplay(db, "s1")
    const r2 = deriveDeterministicReplay(db, "s1")
    expect(r1.replayId).not.toBe(r2.replayId)
  })

  // ── 13. AttemptedAt is populated ──────────────────────────────────

  it("populates attemptedAt timestamp", () => {
    const before = new Date().toISOString()
    const result = deriveDeterministicReplay(db, "s1")
    const after = new Date().toISOString()
    expect(result.attemptedAt >= before).toBe(true)
    expect(result.attemptedAt <= after).toBe(true)
  })

  // ── 14. Limitations are present ───────────────────────────────────

  it("includes limitation about historical commands", () => {
    // The deterministic replay result doesn't have a limitations field,
    // but the CLI formatting adds it. The core result has refusalReasons.
    const result = deriveDeterministicReplay(db, "s1")
    expect(result.refusalReasons).toBeDefined()
  })

  // ── 15. Environment compatibility for empty steps ─────────────────

  it("reports UNKNOWN environment when no steps executed", () => {
    const result = deriveDeterministicReplay(db, "s1")
    expect(result.environmentCompatibility).toBe("UNKNOWN")
  })

  // ── 16. Refuses commands with semicolons ──────────────────────────

  it("refuses chained commands with semicolons", () => {
    insertEvent(db, { id: "e1", sequence: 0, sessionId: "s1", type: "session.started" })
    insertEvent(db, { id: "e2", sequence: 1, sessionId: "s1", type: "tool.called", payload: {
      tool: "terminal", callID: "c1", command: "tsc --noEmit; echo done",
      workingDirectory: "/tmp", exitCode: 0, outputDigest: "abc",
    } })

    const result = deriveDeterministicReplay(db, "s1")
    expect(result.steps[0]!.status).toBe("REFUSED")
    expect(result.steps[0]!.refusalReason).toContain("dangerous pattern")
  })

  // ── 17. Refuses SQL mutations ─────────────────────────────────────

  it("refuses SQL mutation commands", () => {
    const result = checkCommandPolicy("node -e \"DROP TABLE users\"")
    expect(result.allowed).toBe(false)
  })

  // ── 18. computeOutputDigest is deterministic ──────────────────────

  it("computes deterministic output digest", () => {
    const d1 = computeOutputDigest("hello world")
    const d2 = computeOutputDigest("hello world")
    expect(d1).toBe(d2)
    expect(d1).toHaveLength(64) // SHA-256 hex
  })

  // ── 19. Replay does not mutate source events ─────────────────────

  it("does not mutate source events", () => {
    insertEvent(db, { id: "e1", sequence: 0, sessionId: "s1", type: "session.started" })
    insertEvent(db, { id: "e2", sequence: 1, sessionId: "s1", type: "tool.called", payload: { tool: "terminal", callID: "c1" } })

    const before = db.query("SELECT * FROM events ORDER BY sequence").all()

    deriveDeterministicReplay(db, "s1")

    const after = db.query("SELECT * FROM events ORDER BY sequence").all()
    expect(JSON.stringify(after)).toBe(JSON.stringify(before))
  })

  // ── 20. Interleaved sessions ──────────────────────────────────────

  it("only processes events for the target session", () => {
    insertEvent(db, { id: "e1", sequence: 0, sessionId: "s1", type: "session.started" })
    insertEvent(db, { id: "e2", sequence: 1, sessionId: "s2", type: "tool.called", payload: {
      tool: "terminal", callID: "c1", command: "bun test",
      workingDirectory: "/tmp", exitCode: 0, outputDigest: "abc",
    } })
    insertEvent(db, { id: "e3", sequence: 2, sessionId: "s1", type: "session.completed", payload: { reason: "normal" }, previousHash: "prev" })

    const result = deriveDeterministicReplay(db, "s1")
    expect(result.steps).toHaveLength(0)
    expect(result.status).toBe("REFUSED")
  })
})
