import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { Database } from "bun:sqlite"
import { createHash } from "node:crypto"
import { spawnSync } from "node:child_process"
import path from "node:path"
import {
  deriveDeterministicReplay,
} from "@arcana/engine/session/epistemic/deterministic-replay"
import {
  extractReplayCallMetadata,
  extractReplayReturnMetadata,
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

// ── End-to-end replay fixture ────────────────────────────────────────
//
// This test simulates a controlled session that ran:
//   bun test packages/engine/test/epistemic/event-hash.test.ts
//
// The session emitted structured invocation metadata (not inferred),
// and the tool.returned recorded the real exit code and output digests.
//
// The deterministic replay re-executes the same command under the
// current policy and verifies the outcome matches.

describe("P2 End-to-End Replay Fixture", () => {
  let db: Database
  const originalPath = process.env.PATH

  beforeEach(() => {
    db = makeTestDB()
    // The fixture re-executes `bun test ...` and the replay environment check
    // resolves `bun` via PATH. Bootstrap it from the running executable so the
    // suite does not depend on bun being on PATH.
    process.env.PATH = `${path.dirname(process.execPath)}${path.delimiter}${originalPath ?? ""}`
  })
  afterEach(() => {
    db.close()
    if (originalPath === undefined) delete process.env.PATH
    else process.env.PATH = originalPath
  })

  it("earns P2 for a real bounded command with structured invocation", () => {
    // ── Step 1: Record the session events as they would have been emitted ──
    //
    // The session ran: bun test packages/engine/test/epistemic/event-hash.test.ts
    // Structured invocation was captured at the terminal-tool boundary.

    const cwd = process.cwd()
    const testFile = "packages/engine/test/epistemic/event-hash.test.ts"
    const command = `bun test ${testFile}`
    const executable = "bun"
    const args = ["test", testFile]

    // session.started
    insertEvent(db, { id: "e1", sequence: 0, sessionId: "fixture-s1", type: "session.started", payload: { modelId: "test-model" } })

    // tool.called with structured invocation metadata
    insertEvent(db, {
      id: "e2", sequence: 1, sessionId: "fixture-s1", type: "tool.called",
      payload: {
        callID: "call-001",
        tool: "terminal",
        providerExecuted: false,
        replay: {
          executable,
          arguments: args,
          cwd,
          timeout: 30000,
          policyVersion: CURRENT_POLICY_VERSION,
          policyDecision: "ELIGIBLE",
          refusalReason: null,
          inferredInvocation: false,
          shellWrapped: false,
        },
      },
    })

    // tool.returned with raw boundary digests
    // (In production these come from extractReplayReturnMetadata.
    //  Here we compute them from the actual command output.)
    const expectedOutput = `bun test v1.3.14 (0d9b296a)\n\npackages\\engine\\test\\epistemic\\event-hash.test.ts:\n(pass) computeEventHash > produces a deterministic hash for the same input [0.23ms]\n(pass) computeEventHash > produces different hashes for different inputs [0.04ms]\n(pass) computeEventHash > hash changes when id changes [0.03ms]\n(pass) computeEventHash > hash changes when payload changes [0.03ms]\n(pass) computeEventHash > raw string payload differs from parsed-and-reserialized [0.06ms]\n(pass) computeEventHash > global chain verification across interleaved sessions [0.14ms]\n(pass) computeEventHash > session-filtered events have non-contiguous previousHash references [0.09ms]\n(pass) computeEventHash > changing session_id does not affect hash (v1 limitation) [0.03ms]\n(pass) computeEventHash > hash includes id, sequence, timestamp, previousHash, actorKind, actorId, type, payload [0.15ms]\n\n 9 pass\n 0 fail\n 24 expect() calls\nRan 9 tests across 1 file. [424.00ms]`

    // We don't know the exact output format from bun's test runner (timestamps,
    // timings vary), so we record the normalizedOutputDigest as what the
    // replay will compute from its own execution. For the fixture, we use
    // a placeholder that the replay will compare against.
    //
    // The key insight: in production, extractReplayReturnMetadata computes
    // the digest from the real output. Here, we pre-compute what the replay
    // will produce by running the command ourselves.

    // Run the exact structured invocation now to get the real output for digest computation.
    const recorded = spawnSync(executable, args, {
      cwd,
      timeout: 30000,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    })
    const realOutput = recorded.stdout ?? ""
    const realStderr = recorded.stderr ?? ""
    const realExitCode = recorded.status ?? 1

    const rawStdoutDigest = createHash("sha256").update(realOutput).digest("hex")
    const normalized = realOutput.replace(/\s+$/g, "").replace(/\n{3,}/g, "\n\n")
    const normalizedOutputDigest = createHash("sha256").update(normalized).digest("hex")

    insertEvent(db, {
      id: "e3", sequence: 2, sessionId: "fixture-s1", type: "tool.returned",
      payload: {
        callID: "call-001",
        title: "terminal",
        hasOutput: realOutput.length > 0,
        replay: {
          exitCode: realExitCode,
          rawStdoutDigest,
          rawStderrDigest: createHash("sha256").update(realStderr).digest("hex"),
          normalizedOutputDigest,
          normalizationProfile: "terminal-output-v1",
          duration: 424,
          timeoutStatus: "COMPLETED",
        },
      },
    })

    // session.completed
    insertEvent(db, { id: "e4", sequence: 3, sessionId: "fixture-s1", type: "session.completed", payload: { reason: "normal" }, previousHash: "prev" })

    // ── Step 2: Derive deterministic replay ──────────────────────────────

    const result = deriveDeterministicReplay(db, "fixture-s1")

    // ── Step 3: Verify P2 is earned ─────────────────────────────────────

    // Coverage
    expect(result.coverage.replayableHistoricalSteps).toBe(1)
    expect(result.coverage.declaredReplaySubset).toBe(1)
    expect(result.coverage.successfullyReproduced).toBe(1)
    expect(result.coverage.excluded).toBe(0)
    expect(result.coverage.reproducibility).toBe("FULL")

    // The single step must be SUCCESS
    expect(result.steps).toHaveLength(1)
    expect(result.steps[0]!.status).toBe("SUCCESS")
    expect(result.steps[0]!.exitCodeMatch).toBe(true)
    expect(result.steps[0]!.outputDigestMatch).toBe(true)
    expect(result.steps[0]!.policyDrift).not.toBeNull()
    expect(result.steps[0]!.policyDrift!.policyDrift).toBe(false) // no drift

    // P2 must be earned
    expect(result.p2Eligible).toBe(true)
    expect(result.status).toBe("SUCCESS")
    expect(result.unauthorizedMutation).toBe(false)
    expect(result.environmentCompatibility).toBe("COMPATIBLE")

    // Metadata integrity
    expect(result.schemaVersion).toBe("1")
    expect(result.sourceSessionId).toBe("fixture-s1")
    expect(result.refusalReasons).toHaveLength(0)
  })

  it("refuses P2 when output digest mismatches", () => {
    const cwd = process.cwd()

    insertEvent(db, { id: "e1", sequence: 0, sessionId: "fixture-s2", type: "session.started" })
    insertEvent(db, {
      id: "e2", sequence: 1, sessionId: "fixture-s2", type: "tool.called",
      payload: {
        callID: "call-002",
        tool: "terminal",
        replay: {
          executable: "node",
          arguments: ["-e", "console.log('expected')"],
          cwd,
          timeout: 5000,
          policyVersion: CURRENT_POLICY_VERSION,
          policyDecision: "ELIGIBLE",
          refusalReason: null,
          inferredInvocation: false,
          shellWrapped: false,
        },
      },
    })
    // Record WRONG digest — will mismatch
    insertEvent(db, {
      id: "e3", sequence: 2, sessionId: "fixture-s2", type: "tool.returned",
      payload: {
        callID: "call-002",
        title: "terminal",
        hasOutput: true,
        replay: {
          exitCode: 0,
          rawStdoutDigest: "0000000000000000000000000000000000000000000000000000000000000000",
          rawStderrDigest: "0000000000000000000000000000000000000000000000000000000000000000",
          normalizedOutputDigest: "0000000000000000000000000000000000000000000000000000000000000000",
          normalizationProfile: "terminal-output-v1",
          duration: 10,
          timeoutStatus: "COMPLETED",
        },
      },
    })

    const result = deriveDeterministicReplay(db, "fixture-s2")

    expect(result.p2Eligible).toBe(false)
    expect(result.status).toBe("FAILED")
    expect(result.coverage.successfullyReproduced).toBe(0)
    expect(result.coverage.reproducibility).toBe("NONE")
    expect(result.steps[0]!.outputDigestMatch).toBe(false)
  })

  it("refuses P2 when policy drifts to stricter", () => {
    const cwd = process.cwd()

    insertEvent(db, { id: "e1", sequence: 0, sessionId: "fixture-s3", type: "session.started" })
    insertEvent(db, {
      id: "e2", sequence: 1, sessionId: "fixture-s3", type: "tool.called",
      payload: {
        callID: "call-003",
        tool: "terminal",
        // Historical: ELIGIBLE with inferred invocation
        replay: {
          executable: "bun",
          arguments: ["test"],
          cwd,
          timeout: 5000,
          policyVersion: "replay-policy-v1",
          policyDecision: "ELIGIBLE",
          refusalReason: null,
          inferredInvocation: true, // was OK under v1, now refused under v2
          shellWrapped: false,
        },
      },
    })

    const result = deriveDeterministicReplay(db, "fixture-s3")

    expect(result.p2Eligible).toBe(false)
    expect(result.steps[0]!.policyDrift).not.toBeNull()
    expect(result.steps[0]!.policyDrift!.policyDrift).toBe(true)
    expect(result.steps[0]!.policyDrift!.originalDecision).toBe("ELIGIBLE")
    expect(result.steps[0]!.policyDrift!.currentDecision).toBe("REFUSED")
    expect(result.steps[0]!.status).toBe("REFUSED")
  })

  it("coverage report is explicit about what P2 covers", () => {
    const cwd = process.cwd()

    insertEvent(db, { id: "e1", sequence: 0, sessionId: "fixture-s4", type: "session.started" })

    // Tool 1: file_read → EXCLUDED (no replay metadata)
    insertEvent(db, { id: "e2", sequence: 1, sessionId: "fixture-s4", type: "tool.called", payload: { callID: "c1", tool: "file_read" } })

    // Tool 2: terminal with inferred invocation → REFUSED
    insertEvent(db, { id: "e3", sequence: 2, sessionId: "fixture-s4", type: "tool.called", payload: {
      callID: "c2", tool: "terminal",
      replay: extractReplayCallMetadata("terminal", { command: "tsc --noEmit" }),
    } })

    // Tool 3: terminal with structured invocation → ELIGIBLE
    insertEvent(db, { id: "e4", sequence: 3, sessionId: "fixture-s4", type: "tool.called", payload: {
      callID: "c3", tool: "terminal",
      replay: extractReplayCallMetadata("terminal", {
        executable: "node", arguments: ["-e", "console.log(42)"], cwd, timeout: 5000, command: "node -e 'console.log(42)'",
      }),
    } })
    // Run the exact structured invocation to get real output.
    const nodeResult = spawnSync("node", ["-e", "console.log(42)"], {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    })
    const output = nodeResult.stdout ?? ""
    const stderr = nodeResult.stderr ?? ""
    const norm = output.replace(/\s+$/g, "").replace(/\n{3,}/g, "\n\n")
    insertEvent(db, { id: "e5", sequence: 4, sessionId: "fixture-s4", type: "tool.returned", payload: {
      callID: "c3", title: "terminal", hasOutput: output.length > 0,
      replay: {
        exitCode: nodeResult.status ?? 1,
        rawStdoutDigest: createHash("sha256").update(output).digest("hex"),
        rawStderrDigest: createHash("sha256").update(stderr).digest("hex"),
        normalizedOutputDigest: createHash("sha256").update(norm).digest("hex"),
        normalizationProfile: "terminal-output-v1",
        duration: 50,
        timeoutStatus: "COMPLETED",
      },
    } })

    insertEvent(db, { id: "e6", sequence: 5, sessionId: "fixture-s4", type: "session.completed", payload: { reason: "normal" }, previousHash: "prev" })

    const result = deriveDeterministicReplay(db, "fixture-s4")

    // Coverage report is explicit
    // file_read has no replay metadata → EXCLUDED (not counted as replayable)
    // tsc --noEmit has replay metadata but inferred → REFUSED (counted)
    // node -e has replay metadata and structured → SUCCESS (counted)
    expect(result.coverage.replayableHistoricalSteps).toBe(2)
    expect(result.coverage.excluded).toBe(1) // file_read
    expect(result.coverage.declaredReplaySubset).toBe(1) // only structured
    expect(result.coverage.successfullyReproduced).toBe(1)
    expect(result.coverage.reproducibility).toBe("FULL")

    // P2 is earned for the declared subset (1 command)
    expect(result.p2Eligible).toBe(true)

    // But the report is honest about coverage
    expect(result.steps).toHaveLength(3)
    expect(result.steps[0]!.status).toBe("EXCLUDED")
    expect(result.steps[1]!.status).toBe("REFUSED")
    expect(result.steps[2]!.status).toBe("SUCCESS")
  })
})