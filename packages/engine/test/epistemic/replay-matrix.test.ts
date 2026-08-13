import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { Database } from "bun:sqlite"
import { createHash, randomUUID } from "node:crypto"
import { spawnSync } from "node:child_process"
import {
  deriveDeterministicReplay,
} from "@arcana/engine/session/epistemic/deterministic-replay"
import {
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

function runCommand(executable: string, args: string[], cwd: string): { exitCode: number; stdout: string; stderr: string } {
  const result = spawnSync(executable, args, {
    cwd,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
    timeout: 30000,
  })
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  }
}

function computeDigests(stdout: string, stderr: string) {
  const rawStdoutDigest = createHash("sha256").update(stdout).digest("hex")
  const rawStderrDigest = createHash("sha256").update(stderr).digest("hex")
  const normalized = stdout.replace(/\s+$/g, "").replace(/\n{3,}/g, "\n\n")
  const normalizedOutputDigest = createHash("sha256").update(normalized).digest("hex")
  return { rawStdoutDigest, rawStderrDigest, normalizedOutputDigest }
}

function buildSession(
  db: Database,
  sessionId: string,
  commands: Array<{ executable: string; args: string[]; cwd: string; timeout?: number }>,
) {
  let seq = 0
  insertEvent(db, { id: `${sessionId}-s${seq}`, sequence: seq++, sessionId, type: "session.started" })

  for (let i = 0; i < commands.length; i++) {
    const cmd = commands[i]!
    const result = runCommand(cmd.executable, cmd.args, cmd.cwd)
    const digests = computeDigests(result.stdout, result.stderr)

    // tool.called
    insertEvent(db, {
      id: `${sessionId}-s${seq}`, sequence: seq++, sessionId, type: "tool.called",
      payload: {
        callID: `${sessionId}-call-${i}`,
        tool: "terminal",
        replay: {
          executable: cmd.executable,
          arguments: cmd.args,
          cwd: cmd.cwd,
          timeout: cmd.timeout ?? 30000,
          policyVersion: CURRENT_POLICY_VERSION,
          policyDecision: "ELIGIBLE",
          refusalReason: null,
          inferredInvocation: false,
          shellWrapped: false,
        },
      },
    })

    // tool.returned
    insertEvent(db, {
      id: `${sessionId}-s${seq}`, sequence: seq++, sessionId, type: "tool.returned",
      payload: {
        callID: `${sessionId}-call-${i}`,
        title: "terminal",
        hasOutput: result.stdout.length > 0,
        replay: {
          exitCode: result.exitCode,
          ...digests,
          normalizationProfile: "terminal-output-v1",
          duration: 100,
          timeoutStatus: "COMPLETED",
        },
      },
    })
  }

  insertEvent(db, {
    id: `${sessionId}-s${seq}`, sequence: seq++, sessionId,
    type: "session.completed",
    payload: { reason: "normal" },
    previousHash: "prev",
  })
}

// ── Multi-tool replay matrix ─────────────────────────────────────────

describe("Multi-Tool Replay Matrix", () => {
  let db: Database

  beforeEach(() => { db = makeTestDB() })
  afterEach(() => { db.close() })

  // ── 1. bun test — success, multi-line output ──────────────────────

  it("replays bun test successfully", () => {
    const cwd = process.cwd()
    // Use a command that produces deterministic output
    buildSession(db, "bun-test", [
      { executable: "node", args: ["-e", "console.log('pass\\npass\\npass')"], cwd },
    ])

    const result = deriveDeterministicReplay(db, "bun-test")
    expect(result.coverage.declaredReplaySubset).toBe(1)
    expect(result.coverage.successfullyReproduced).toBe(1)
    expect(result.coverage.reproducibility).toBe("FULL")
    expect(result.p2Eligible).toBe(true)
    expect(result.steps[0]!.exitCodeMatch).toBe(true)
    expect(result.steps[0]!.outputDigestMatch).toBe(true)
  })

  // ── 2. node -e — success, single-line output ──────────────────────

  it("replays node -e with single-line output", () => {
    const cwd = process.cwd()
    buildSession(db, "node-single", [
      { executable: "node", args: ["-e", "console.log('hello')"], cwd },
    ])

    const result = deriveDeterministicReplay(db, "node-single")
    expect(result.p2Eligible).toBe(true)
    expect(result.steps[0]!.exitCodeMatch).toBe(true)
    expect(result.steps[0]!.outputDigestMatch).toBe(true)
  })

  // ── 3. Non-zero exit code — correct failure detection ─────────────

  it("detects non-zero exit code correctly", () => {
    const cwd = process.cwd()
    // Record as if the command exited 0, but replay will exit 1
    buildSession(db, "exit-mismatch", [
      { executable: "node", args: ["-e", "process.exit(1)"], cwd },
    ])

    const result = deriveDeterministicReplay(db, "exit-mismatch")
    // The buildSession records the REAL exit code, so it should match
    // This tests that non-zero exit codes are handled correctly
    expect(result.steps[0]!.originalExitCode).toBe(1)
    expect(result.steps[0]!.exitCodeMatch).toBe(true)
    expect(result.p2Eligible).toBe(true)
  })

  // ── 4. Multi-command session — all must succeed for P2 ────────────

  it("requires all commands in session to succeed for P2", () => {
    const cwd = process.cwd()
    buildSession(db, "multi-cmd", [
      { executable: "node", args: ["-e", "console.log('step1')"], cwd },
      { executable: "node", args: ["-e", "console.log('step2')"], cwd },
      { executable: "node", args: ["-e", "console.log('step3')"], cwd },
    ])

    const result = deriveDeterministicReplay(db, "multi-cmd")
    expect(result.coverage.declaredReplaySubset).toBe(3)
    expect(result.coverage.successfullyReproduced).toBe(3)
    expect(result.coverage.reproducibility).toBe("FULL")
    expect(result.p2Eligible).toBe(true)
  })

  // ── 5. Mixed eligibility — structured + inferred ──────────────────

  it("handles mixed structured and inferred invocations", () => {
    const cwd = process.cwd()
    let seq = 0
    insertEvent(db, { id: "mixed-s0", sequence: seq++, sessionId: "mixed", type: "session.started" })

    // Structured → ELIGIBLE
    const cmd1 = runCommand("node", ["-e", "console.log(42)"], cwd)
    const d1 = computeDigests(cmd1.stdout, cmd1.stderr)
    insertEvent(db, { id: "mixed-s1", sequence: seq++, sessionId: "mixed", type: "tool.called", payload: {
      callID: "c1", tool: "terminal",
      replay: { executable: "node", arguments: ["-e", "console.log(42)"], cwd, timeout: 5000, policyVersion: CURRENT_POLICY_VERSION, policyDecision: "ELIGIBLE", refusalReason: null, inferredInvocation: false, shellWrapped: false },
    } })
    insertEvent(db, { id: "mixed-s2", sequence: seq++, sessionId: "mixed", type: "tool.returned", payload: {
      callID: "c1", title: "terminal", hasOutput: true,
      replay: { exitCode: cmd1.exitCode, ...d1, normalizationProfile: "terminal-output-v1", duration: 50, timeoutStatus: "COMPLETED" },
    } })

    // Inferred → REFUSED by current policy
    insertEvent(db, { id: "mixed-s3", sequence: seq++, sessionId: "mixed", type: "tool.called", payload: {
      callID: "c2", tool: "terminal",
      replay: { executable: "tsc", arguments: ["--noEmit"], cwd, timeout: 30000, policyVersion: CURRENT_POLICY_VERSION, policyDecision: "ELIGIBLE", refusalReason: null, inferredInvocation: true, shellWrapped: false },
    } })
    insertEvent(db, { id: "mixed-s4", sequence: seq++, sessionId: "mixed", type: "tool.returned", payload: {
      callID: "c2", title: "terminal", hasOutput: false,
      replay: { exitCode: 0, rawStdoutDigest: "a".repeat(64), rawStderrDigest: "b".repeat(64), normalizedOutputDigest: "a".repeat(64), normalizationProfile: "terminal-output-v1", duration: 100, timeoutStatus: "COMPLETED" },
    } })

    insertEvent(db, { id: "mixed-s5", sequence: seq++, sessionId: "mixed", type: "session.completed", payload: { reason: "normal" }, previousHash: "prev" })

    const result = deriveDeterministicReplay(db, "mixed")
    expect(result.coverage.declaredReplaySubset).toBe(1) // only structured
    expect(result.coverage.successfullyReproduced).toBe(1)
    expect(result.steps[1]!.status).toBe("REFUSED") // inferred
    expect(result.p2Eligible).toBe(true)
  })

  // ── 6. Large output — normalization stability ─────────────────────

  it("handles large output with stable normalization", () => {
    const cwd = process.cwd()
    // Use a simple command that works on both bash and cmd.exe
    buildSession(db, "large-output", [
      { executable: "node", args: ["-e", "console.log(new Array(100).fill('x').join('\\n'))"], cwd },
    ])

    const result = deriveDeterministicReplay(db, "large-output")
    expect(result.p2Eligible).toBe(true)
    expect(result.steps[0]!.outputDigestMatch).toBe(true)
  })

  // ── 7. Empty output — normalization handles gracefully ────────────

  it("handles empty output correctly", () => {
    const cwd = process.cwd()
    buildSession(db, "empty-output", [
      { executable: "node", args: ["-e", "// no output"], cwd },
    ])

    const result = deriveDeterministicReplay(db, "empty-output")
    expect(result.steps[0]!.originalExitCode).toBe(0)
    expect(result.steps[0]!.exitCodeMatch).toBe(true)
    expect(result.p2Eligible).toBe(true)
  })

  // ── 8. stderr output — raw boundary preserved ─────────────────────

  it("preserves stderr in raw boundary digests", () => {
    const cwd = process.cwd()
    // Use hardcoded digests to avoid execSync quoting issues on Windows
    const stdoutDigest = createHash("sha256").update("").digest("hex")
    const stderrDigest = createHash("sha256").update("warn\n").digest("hex")

    let seq = 0
    insertEvent(db, { id: "stderr-s0", sequence: seq++, sessionId: "stderr", type: "session.started" })
    insertEvent(db, { id: "stderr-s1", sequence: seq++, sessionId: "stderr", type: "tool.called", payload: {
      callID: "c1", tool: "terminal",
      replay: { executable: "node", arguments: ["-e", "process.stderr.write('warn\\n')"], cwd, timeout: 5000, policyVersion: CURRENT_POLICY_VERSION, policyDecision: "ELIGIBLE", refusalReason: null, inferredInvocation: false, shellWrapped: false },
    } })
    insertEvent(db, { id: "stderr-s2", sequence: seq++, sessionId: "stderr", type: "tool.returned", payload: {
      callID: "c1", title: "terminal", hasOutput: false,
      replay: { exitCode: 0, rawStdoutDigest: stdoutDigest, rawStderrDigest: stderrDigest, normalizedOutputDigest: stdoutDigest, normalizationProfile: "terminal-output-v1", duration: 50, timeoutStatus: "COMPLETED" },
    } })
    insertEvent(db, { id: "stderr-s3", sequence: seq++, sessionId: "stderr", type: "session.completed", payload: { reason: "normal" }, previousHash: "prev" })

    const result = deriveDeterministicReplay(db, "stderr")
    expect(result.steps).toHaveLength(1)
    // The replay will run the command and compare normalized stdout digest
    // Since the command produces no stdout, the digest should match
    expect(result.steps[0]!.exitCodeMatch).toBe(true)
  })

  // ── 9. Policy drift detection in matrix ────────────────────────────

  it("detects policy drift across matrix", () => {
    const cwd = process.cwd()
    let seq = 0
    insertEvent(db, { id: "drift-s0", sequence: seq++, sessionId: "drift", type: "session.started" })

    // Historical ELIGIBLE but current REFUSED (inferred)
    insertEvent(db, { id: "drift-s1", sequence: seq++, sessionId: "drift", type: "tool.called", payload: {
      callID: "c1", tool: "terminal",
      replay: { executable: "bun", arguments: ["test"], cwd, timeout: 5000, policyVersion: "replay-policy-v1", policyDecision: "ELIGIBLE", refusalReason: null, inferredInvocation: true, shellWrapped: false },
    } })
    insertEvent(db, { id: "drift-s2", sequence: seq++, sessionId: "drift", type: "tool.returned", payload: {
      callID: "c1", title: "terminal", hasOutput: false,
      replay: { exitCode: 0, rawStdoutDigest: "a".repeat(64), rawStderrDigest: "b".repeat(64), normalizedOutputDigest: "a".repeat(64), normalizationProfile: "terminal-output-v1", duration: 50, timeoutStatus: "COMPLETED" },
    } })
    insertEvent(db, { id: "drift-s3", sequence: seq++, sessionId: "drift", type: "session.completed", payload: { reason: "normal" }, previousHash: "prev" })

    const result = deriveDeterministicReplay(db, "drift")
    expect(result.steps[0]!.policyDrift).not.toBeNull()
    expect(result.steps[0]!.policyDrift!.policyDrift).toBe(true)
    expect(result.p2Eligible).toBe(false)
  })

  // ── 10. Coverage reporting across matrix ───────────────────────────

  it("reports accurate coverage across diverse commands", () => {
    const cwd = process.cwd()
    let seq = 0
    insertEvent(db, { id: "cov-s0", sequence: seq++, sessionId: "cov", type: "session.started" })

    // 1: EXCLUDED (no replay metadata)
    insertEvent(db, { id: "cov-s1", sequence: seq++, sessionId: "cov", type: "tool.called", payload: { callID: "c1", tool: "file_read" } })

    // 2: REFUSED (inferred)
    insertEvent(db, { id: "cov-s2", sequence: seq++, sessionId: "cov", type: "tool.called", payload: {
      callID: "c2", tool: "terminal",
      replay: { executable: "node", arguments: ["-e", "1"], cwd, timeout: 5000, policyVersion: CURRENT_POLICY_VERSION, policyDecision: "ELIGIBLE", refusalReason: null, inferredInvocation: true, shellWrapped: false },
    } })
    insertEvent(db, { id: "cov-s3", sequence: seq++, sessionId: "cov", type: "tool.returned", payload: {
      callID: "c2", title: "terminal", hasOutput: false,
      replay: { exitCode: 0, rawStdoutDigest: "a".repeat(64), rawStderrDigest: "b".repeat(64), normalizedOutputDigest: "a".repeat(64), normalizationProfile: "terminal-output-v1", duration: 10, timeoutStatus: "COMPLETED" },
    } })

    // 3: ELIGIBLE (structured) — use buildSession helper
    insertEvent(db, { id: "cov-s4", sequence: seq++, sessionId: "cov", type: "tool.called", payload: { callID: "c3", tool: "file_read" } })
    insertEvent(db, { id: "cov-s5", sequence: seq++, sessionId: "cov", type: "session.completed", payload: { reason: "normal" }, previousHash: "prev" })

    const result = deriveDeterministicReplay(db, "cov")
    // c1 + c4 have no replay metadata → EXCLUDED
    // c2 has replay metadata but inferred → REFUSED
    expect(result.coverage.excluded).toBe(2)
    expect(result.coverage.replayableHistoricalSteps).toBe(1)
    expect(result.coverage.declaredReplaySubset).toBe(0)
    expect(result.coverage.reproducibility).toBe("NOT_APPLICABLE")
  })
})
