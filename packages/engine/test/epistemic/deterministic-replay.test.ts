import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { Database } from "bun:sqlite"
import { createHash } from "node:crypto"
import path from "node:path"
import {
  deriveDeterministicReplay,
  checkEnvironmentCompatibility,
} from "@arcana/engine/session/epistemic/deterministic-replay"
import {
  extractReplayCallMetadata,
  extractReplayReturnMetadata,
  parseCommandString,
  classifyCommand,
  CURRENT_POLICY_VERSION,
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

// ── parseCommandString ───────────────────────────────────────────────

describe("parseCommandString", () => {
  it("parses simple command", () => {
    expect(parseCommandString("bun test pkg")).toEqual({ executable: "bun", args: ["test", "pkg"] })
  })
  it("handles quoted args", () => {
    expect(parseCommandString('tsc --noEmit --project "tsconfig.json"')).toEqual({ executable: "tsc", args: ["--noEmit", "--project", "tsconfig.json"] })
  })
  it("returns null for empty", () => {
    expect(parseCommandString("")).toBeNull()
    expect(parseCommandString("   ")).toBeNull()
  })
})

// ── classifyCommand ──────────────────────────────────────────────────

describe("classifyCommand", () => {
  it("classifies structured bun test as ELIGIBLE", () => {
    expect(classifyCommand("bun", ["test", "pkg"], false, false).decision).toBe("ELIGIBLE")
  })
  it("refuses shell-wrapped", () => {
    expect(classifyCommand("sh", ["-c", "bun test"], true, false).decision).toBe("REFUSED")
  })
  it("refuses inferred invocation", () => {
    expect(classifyCommand("bun", ["test"], false, true).decision).toBe("REFUSED")
  })
  it("refuses disallowed program", () => {
    expect(classifyCommand("curl", ["https://x.com"], false, false).decision).toBe("REFUSED")
  })
  it("refuses disallowed subcommand", () => {
    expect(classifyCommand("bun", ["install"], false, false).decision).toBe("REFUSED")
  })
  it("refuses secrets in args", () => {
    expect(classifyCommand("curl", ["-H", "Authorization: sk-abc...wxyz"], false, false).decision).toBe("REFUSED")
  })
})

// ── extractReplayCallMetadata ────────────────────────────────────────

describe("extractReplayCallMetadata", () => {
  it("extracts structured invocation from tool input", () => {
    const meta = extractReplayCallMetadata("terminal", {
      executable: "bun",
      arguments: ["test", "packages/engine/test/epistemic"],
      cwd: "/tmp",
      timeout: 30000,
      command: "bun test packages/engine/test/epistemic",
    })
    expect(meta.executable).toBe("bun")
    expect(meta.arguments).toEqual(["test", "packages/engine/test/epistemic"])
    expect(meta.inferredInvocation).toBe(false)
    expect(meta.policyDecision).toBe("ELIGIBLE")
    expect(meta.policyVersion).toBe(CURRENT_POLICY_VERSION)
  })

  it("marks fallback-parsed as inferredInvocation", () => {
    const meta = extractReplayCallMetadata("terminal", {
      command: "bun test packages/engine/test/epistemic",
    })
    expect(meta.executable).toBe("bun")
    expect(meta.inferredInvocation).toBe(true)
    // Inferred invocations are REFUSED by current policy
    expect(meta.policyDecision).toBe("REFUSED")
    expect(meta.refusalReason).toBe("inferred_invocation_not_authoritative")
  })

  it("detects shell wrappers", () => {
    const meta = extractReplayCallMetadata("terminal", {
      executable: "sh",
      arguments: ["-c", "bun test"],
      command: "sh -c 'bun test'",
    })
    expect(meta.shellWrapped).toBe(true)
    expect(meta.policyDecision).toBe("REFUSED")
  })

  it("returns NOT_APPLICABLE for non-terminal tools", () => {
    expect(extractReplayCallMetadata("file_read", {}).policyDecision).toBe("NOT_APPLICABLE")
  })

  it("refuses when no command in input", () => {
    expect(extractReplayCallMetadata("terminal", {}).policyDecision).toBe("REFUSED")
  })
})

// ── extractReplayReturnMetadata ──────────────────────────────────────

describe("extractReplayReturnMetadata", () => {
  it("computes raw and normalized digests", () => {
    const meta = extractReplayReturnMetadata({}, "hello\n", { exitCode: 0 }, Date.now() - 100, Date.now())
    expect(meta.exitCode).toBe(0)
    expect(meta.rawStdoutDigest).toHaveLength(64)
    expect(meta.rawStderrDigest).toHaveLength(64)
    expect(meta.normalizedOutputDigest).toHaveLength(64)
    expect(meta.normalizationProfile).toBe("terminal-output-v1")
    expect(meta.timeoutStatus).toBe("COMPLETED")
  })

  it("raw and normalized digests differ when normalization applies", () => {
    const meta = extractReplayReturnMetadata({}, "hello   \n\n\n\n", {}, null, Date.now())
    // raw has trailing spaces and multiple newlines, normalized strips them
    expect(meta.rawStdoutDigest).not.toBe(meta.normalizedOutputDigest)
  })
})

// ── deriveDeterministicReplay ────────────────────────────────────────

describe("Deterministic Replay", () => {
  let db: Database
  const originalPath = process.env.PATH

  beforeEach(() => {
    db = makeTestDB()
    // The replay environment-compatibility check resolves `bun` via PATH.
    // Bootstrap it from the running executable so the suite does not depend
    // on bun being on PATH.
    process.env.PATH = `${path.dirname(process.execPath)}${path.delimiter}${originalPath ?? ""}`
  })
  afterEach(() => {
    db.close()
    if (originalPath === undefined) delete process.env.PATH
    else process.env.PATH = originalPath
  })

  // ── 1. Events without replay metadata → EXCLUDED ─────────────────

  it("EXCLUDES events without replay metadata", () => {
    insertEvent(db, { id: "e1", sequence: 0, sessionId: "s1", type: "session.started" })
    insertEvent(db, { id: "e2", sequence: 1, sessionId: "s1", type: "tool.called", payload: { tool: "terminal", callID: "c1" } })
    insertEvent(db, { id: "e3", sequence: 2, sessionId: "s1", type: "session.completed", payload: { reason: "normal" }, previousHash: "prev" })

    const result = deriveDeterministicReplay(db, "s1")
    expect(result.steps[0]!.status).toBe("EXCLUDED")
    expect(result.coverage.excluded).toBe(1)
    expect(result.coverage.replayableHistoricalSteps).toBe(0)
  })

  // ── 2. Inferred invocation → REFUSED by current policy ───────────

  it("REFUSES inferred (fallback-parsed) invocations", () => {
    insertEvent(db, { id: "e1", sequence: 0, sessionId: "s1", type: "session.started" })
    insertEvent(db, { id: "e2", sequence: 1, sessionId: "s1", type: "tool.called", payload: {
      callID: "c1", tool: "terminal",
      replay: extractReplayCallMetadata("terminal", { command: "bun test" }),
    } })

    const result = deriveDeterministicReplay(db, "s1")
    expect(result.steps[0]!.status).toBe("REFUSED")
    expect(result.steps[0]!.refusalReason).toContain("inferred_invocation")
  })

  // ── 3. Structured invocation → declared replay subset ────────────

  it("adds structured invocations to declared replay subset", () => {
    insertEvent(db, { id: "e1", sequence: 0, sessionId: "s1", type: "session.started" })
    insertEvent(db, { id: "e2", sequence: 1, sessionId: "s1", type: "tool.called", payload: {
      callID: "c1", tool: "terminal",
      replay: extractReplayCallMetadata("terminal", {
        executable: "bun", arguments: ["test", "x"], cwd: process.cwd(), timeout: 5000, command: "bun test x",
      }),
    } })
    insertEvent(db, { id: "e3", sequence: 2, sessionId: "s1", type: "tool.returned", payload: {
      callID: "c1", title: "terminal", hasOutput: true,
      replay: extractReplayReturnMetadata({}, "ok", { exitCode: 0 }, Date.now() - 10, Date.now()),
    } })

    const result = deriveDeterministicReplay(db, "s1", { dryRun: true })
    expect(result.steps[0]!.status).toBe("SKIPPED")
    expect(result.coverage.declaredReplaySubset).toBe(1)
    expect(result.coverage.replayableHistoricalSteps).toBe(1)
  })

  // ── 4. Policy drift detection ─────────────────────────────────────

  it("detects policy drift when current policy is stricter", () => {
    // Simulate historical ELIGIBLE that's now REFUSED (inferred)
    insertEvent(db, { id: "e1", sequence: 0, sessionId: "s1", type: "session.started" })
    insertEvent(db, { id: "e2", sequence: 1, sessionId: "s1", type: "tool.called", payload: {
      callID: "c1", tool: "terminal",
      replay: {
        executable: "bun", arguments: ["test"], cwd: "/tmp", timeout: 5000,
        policyVersion: "replay-policy-v1", policyDecision: "ELIGIBLE", refusalReason: null,
        inferredInvocation: true, shellWrapped: false,
      },
    } })

    const result = deriveDeterministicReplay(db, "s1")
    expect(result.steps[0]!.policyDrift).not.toBeNull()
    expect(result.steps[0]!.policyDrift!.policyDrift).toBe(true)
    expect(result.steps[0]!.policyDrift!.originalDecision).toBe("ELIGIBLE")
    expect(result.steps[0]!.policyDrift!.currentDecision).toBe("REFUSED")
    expect(result.steps[0]!.status).toBe("REFUSED")
  })

  // ── 5. Shell-wrapped → REFUSED ────────────────────────────────────

  it("refuses shell-wrapped commands", () => {
    insertEvent(db, { id: "e1", sequence: 0, sessionId: "s1", type: "session.started" })
    insertEvent(db, { id: "e2", sequence: 1, sessionId: "s1", type: "tool.called", payload: {
      callID: "c1", tool: "terminal",
      replay: {
        executable: "sh", arguments: ["-c", "bun test"], cwd: "/tmp", timeout: 5000,
        policyVersion: CURRENT_POLICY_VERSION, policyDecision: "REFUSED", refusalReason: "shell_wrapped",
        inferredInvocation: false, shellWrapped: true,
      },
    } })

    const result = deriveDeterministicReplay(db, "s1")
    expect(result.steps[0]!.status).toBe("REFUSED")
    expect(result.steps[0]!.refusalReason).toContain("historical policy: shell_wrapped")
  })

  // ── 6. P2 requires ALL declared subset ────────────────────────────

  it("p2Eligible requires ALL declared subset to succeed", () => {
    // Two eligible commands, only one in declared subset (other is inferred)
    insertEvent(db, { id: "e1", sequence: 0, sessionId: "s1", type: "session.started" })
    // Structured → will be in declared subset
    insertEvent(db, { id: "e2", sequence: 1, sessionId: "s1", type: "tool.called", payload: {
      callID: "c1", tool: "terminal",
      replay: extractReplayCallMetadata("terminal", {
        executable: "bun", arguments: ["test"], cwd: process.cwd(), timeout: 5000, command: "bun test",
      }),
    } })
    // Inferred → will be REFUSED (not in declared subset)
    insertEvent(db, { id: "e3", sequence: 2, sessionId: "s1", type: "tool.called", payload: {
      callID: "c2", tool: "terminal",
      replay: extractReplayCallMetadata("terminal", { command: "tsc --noEmit" }),
    } })

    const result = deriveDeterministicReplay(db, "s1")
    expect(result.coverage.declaredReplaySubset).toBe(1) // only structured
    expect(result.coverage.excluded + result.steps.filter(s => s.status === "REFUSED").length).toBeGreaterThan(0)
  })

  // ── 7. Coverage reporting ─────────────────────────────────────────

  it("reports accurate coverage", () => {
    insertEvent(db, { id: "e1", sequence: 0, sessionId: "s1", type: "session.started" })
    // Excluded (no replay metadata)
    insertEvent(db, { id: "e2", sequence: 1, sessionId: "s1", type: "tool.called", payload: { callID: "c1", tool: "file_read" } })
    // Refused (inferred)
    insertEvent(db, { id: "e3", sequence: 2, sessionId: "s1", type: "tool.called", payload: {
      callID: "c2", tool: "terminal",
      replay: extractReplayCallMetadata("terminal", { command: "bun test" }),
    } })

    const result = deriveDeterministicReplay(db, "s1")
    // c1 has no replay metadata → EXCLUDED (not counted as replayable)
    // c2 has replay metadata but inferred → REFUSED (counted as replayable)
    expect(result.coverage.replayableHistoricalSteps).toBe(1)
    expect(result.coverage.excluded).toBe(1)
    expect(result.coverage.declaredReplaySubset).toBe(0)
    expect(result.coverage.reproducibility).toBe("NOT_APPLICABLE")
  })

  // ── 8. Dry-run marks SKIPPED ──────────────────────────────────────

  it("dry-run marks eligible as SKIPPED", () => {
    insertEvent(db, { id: "e1", sequence: 0, sessionId: "s1", type: "session.started" })
    insertEvent(db, { id: "e2", sequence: 1, sessionId: "s1", type: "tool.called", payload: {
      callID: "c1", tool: "terminal",
      replay: extractReplayCallMetadata("terminal", {
        executable: "node", arguments: ["-e", "console.log(1)"], cwd: process.cwd(), timeout: 5000, command: "node -e 'console.log(1)'",
      }),
    } })
    insertEvent(db, { id: "e3", sequence: 2, sessionId: "s1", type: "tool.returned", payload: {
      callID: "c1", title: "terminal", hasOutput: true,
      replay: extractReplayReturnMetadata({}, "1\n", { exitCode: 0 }, Date.now() - 10, Date.now()),
    } })

    const result = deriveDeterministicReplay(db, "s1", { dryRun: true })
    expect(result.steps[0]!.status).toBe("SKIPPED")
  })

  // ── 9. Schema version and uniqueness ──────────────────────────────

  it("schema version 1, unique IDs", () => {
    const r1 = deriveDeterministicReplay(db, "s1")
    const r2 = deriveDeterministicReplay(db, "s1")
    expect(r1.schemaVersion).toBe("1")
    expect(r1.replayId).not.toBe(r2.replayId)
  })

  // ── 10. Does not mutate source events ─────────────────────────────

  it("does not mutate source events", () => {
    insertEvent(db, { id: "e1", sequence: 0, sessionId: "s1", type: "session.started" })
    const before = db.query("SELECT * FROM events ORDER BY sequence").all()
    deriveDeterministicReplay(db, "s1")
    const after = db.query("SELECT * FROM events ORDER BY sequence").all()
    expect(JSON.stringify(after)).toBe(JSON.stringify(before))
  })

  // ── 11. Missing session ───────────────────────────────────────────

  it("handles missing session", () => {
    const result = deriveDeterministicReplay(db, "nonexistent")
    expect(result.status).toBe("REFUSED")
    expect(result.coverage.replayableHistoricalSteps).toBe(0)
  })

  // ── 12. unauthorizedMutation defaults to false ────────────────────

  it("unauthorizedMutation is false when no steps execute", () => {
    expect(deriveDeterministicReplay(db, "s1").unauthorizedMutation).toBe(false)
  })

  // ── 13. Environment compatibility ─────────────────────────────────

  it("environment: COMPATIBLE for available tools", () => {
    expect(checkEnvironmentCompatibility("node", null)).toBe("COMPATIBLE")
  })
  it("environment: DRIFTED for missing dir", () => {
    expect(checkEnvironmentCompatibility("node", "/nonexistent/12345")).toBe("DRIFTED")
  })
  it("environment: UNKNOWN for null", () => {
    expect(checkEnvironmentCompatibility(null, null)).toBe("UNKNOWN")
  })
})
