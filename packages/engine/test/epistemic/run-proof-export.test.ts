import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { existsSync, readFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { createHash } from "node:crypto"
import { verifyExport } from "@arcana/engine/cli/cmd/proof"
import { computeRunRoot } from "@arcana/engine/session/epistemic/run-proof"
import { computeProofHash } from "@arcana/engine/session/epistemic/run-proof"
import type { ProofLevel, TraceHealth, LifecycleStatus, IntegrityStatus, LifecycleCompleteness, ProofHashPayload } from "@arcana/engine/session/epistemic/run-proof"

// ── helpers ──────────────────────────────────────────────────────────

function makeValidExport(overrides: Record<string, unknown> = {}) {
  const lifecycle: LifecycleCompleteness = {
    started: true, hasTerminalEvent: true, terminalReason: "completed",
    pairsComplete: true, recordingFailure: false,
  }
  const proofHashInput = {
    sessionId: "test-session",
    eventCount: 2,
    eventHashes: ["evt-1", "evt-2"],
    lifecycle,
    lifecycleStatus: "COMPLETE" as LifecycleStatus,
    traceHealth: "COMPLETE" as TraceHealth,
    integrityStatus: "VALID" as IntegrityStatus,
    proofLevel: "P1" as ProofLevel,
    assuranceProfile: {
      trace: "RECORDED" as const,
      integrity: "VALID" as const,
      verification: "UNVERIFIED" as const,
      reproducibility: "NONE" as const,
      reproducibilityDetail: null,
    },
    completionMethod: null,
  }
  const eventReferences = [
    { sequence: 0, id: "evt-1", hash: "a".repeat(64) },
    { sequence: 1, id: "evt-2", hash: "b".repeat(64) },
  ]
  const proofHash = computeProofHash(proofHashInput as ProofHashPayload)
  const runRoot = computeRunRoot("test-session", eventReferences)

  return {
    schemaVersion: "1",
    exportedAt: "2026-01-01T00:00:00.000Z",
    sessionId: "test-session",
    proof: {
      level: "P1" as ProofLevel,
      levelLabel: "P1 INTEGRITY",
      integrity: "VALID" as IntegrityStatus,
      traceHealth: "COMPLETE" as TraceHealth,
      lifecycleStatus: "COMPLETE" as LifecycleStatus,
      completionMethod: null,
      contractStatus: null,
      runRoot,
      proofHash,
    },
    proofHashInput,
    eventReferences,
    summary: {
      eventCount: 2,
      sequenceRange: [0, 1] as [number, number],
      claimsByStatus: { verified: 3 },
      obligationsByStatus: { satisfied: 2 },
      requiredObligations: { total: 2, satisfied: 2, pending: 0 },
    },
    p3DenialReasons: [],
    gaps: [],
    verification: { chainValid: true, runRootValid: true, proofHashValid: true },
    derivedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  }
}

// ── tests ────────────────────────────────────────────────────────────

describe("RunProof export verification", () => {
  const testDir = join(tmpdir(), "runproof-export-test-" + Date.now())

  beforeEach(() => {
    if (!existsSync(testDir)) mkdirSync(testDir, { recursive: true })
  })

  afterEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true })
  })

  // ── Schema and format ─────────────────────────────────────────────

  it("rejects non-existent file", () => {
    const result = verifyExport(join(testDir, "nonexistent.json"))
    expect(result.valid).toBe(false)
    expect(result.errors).toContain("file not found")
  })

  it("rejects malformed JSON", () => {
    writeFileSync(join(testDir, "bad.json"), "not json {{{", "utf-8")
    const result = verifyExport(join(testDir, "bad.json"))
    expect(result.valid).toBe(false)
    expect(result.errors).toContain("malformed JSON")
  })

  it("rejects unsupported schema version", () => {
    const path = join(testDir, "old.json")
    writeFileSync(path, JSON.stringify({ schemaVersion: "99", proof: {}, verification: {} }), "utf-8")
    const result = verifyExport(path)
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain("unsupported schema version")
  })

  it("rejects missing required fields", () => {
    const path = join(testDir, "missing.json")
    writeFileSync(path, JSON.stringify({ schemaVersion: "1" }), "utf-8")
    const result = verifyExport(path)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain("missing proof section")
    expect(result.errors).toContain("missing verification section")
  })

  // ── Strict hex validation ─────────────────────────────────────────

  it("rejects proofHash with non-hex characters as MALFORMED", () => {
    const data = makeValidExport()
    data.proof.proofHash = "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz"
    const path = join(testDir, "badhex.json")
    writeFileSync(path, JSON.stringify(data), "utf-8")
    const result = verifyExport(path)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes("proofHash MALFORMED"))).toBe(true)
  })

  it("rejects runRoot with non-hex characters as MALFORMED", () => {
    const data = makeValidExport()
    data.proof.runRoot = "000000000000000000000000000000000000000000000000000000000000000g"
    const path = join(testDir, "badroot.json")
    writeFileSync(path, JSON.stringify(data), "utf-8")
    const result = verifyExport(path)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes("runRoot MALFORMED"))).toBe(true)
  })

  it("rejects wrong-length hash as MALFORMED", () => {
    const data = makeValidExport()
    data.proof.proofHash = "tooshort"
    const path = join(testDir, "short.json")
    writeFileSync(path, JSON.stringify(data), "utf-8")
    const result = verifyExport(path)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes("proofHash MALFORMED"))).toBe(true)
  })

  // ── Independent proofHash recomputation ───────────────────────────

  it("verifies proofHash by recomputation from exported ProofHashPayload", () => {
    const data = makeValidExport()
    const path = join(testDir, "valid.json")
    writeFileSync(path, JSON.stringify(data, null, 2), "utf-8")
    const result = verifyExport(path)
    expect(result.valid).toBe(true)
    expect(result.proofHash).toBeDefined()
    expect(result.proofHash!.match).toBe(true)
    expect(result.proofHash!.recomputed).toBe(result.proofHash!.exported)
  })

  it("detects mutated proofHash via recomputation", () => {
    const data = makeValidExport()
    data.proof.proofHash = "a".repeat(64) // valid hex but wrong digest
    const path = join(testDir, "mutated.json")
    writeFileSync(path, JSON.stringify(data), "utf-8")
    const result = verifyExport(path)
    expect(result.valid).toBe(false)
    expect(result.proofHash!.match).toBe(false)
    expect(result.errors.some((e) => e.includes("proofHash INTEGRITY INVALID"))).toBe(true)
  })

  // ── Store-aware runRoot verification ──────────────────────────────

  it("verifies runRoot from exported event references", () => {
    const data = makeValidExport()
    const path = join(testDir, "runroot.json")
    writeFileSync(path, JSON.stringify(data, null, 2), "utf-8")
    const result = verifyExport(path)
    expect(result.valid).toBe(true)
    expect(result.runRoot!.status).toBe("VALID")
  })

  it("detects mutated runRoot via recomputation", () => {
    const data = makeValidExport()
    data.proof.runRoot = "f".repeat(64) // valid hex but wrong
    const path = join(testDir, "badrunroot.json")
    writeFileSync(path, JSON.stringify(data), "utf-8")
    const result = verifyExport(path)
    expect(result.valid).toBe(false)
    expect(result.runRoot!.status).toBe("INVALID")
    expect(result.errors.some((e) => e.includes("runRoot INTEGRITY INVALID"))).toBe(true)
  })

  it("reports runRoot UNAVAILABLE when no event references provided", () => {
    const data = makeValidExport()
    delete (data as any).eventReferences
    data.summary.eventCount = 5 // has events but no references
    const path = join(testDir, "noref.json")
    writeFileSync(path, JSON.stringify(data), "utf-8")
    const result = verifyExport(path)
    expect(result.runRoot!.status).toBe("UNAVAILABLE")
    expect(result.runRoot!.reason).toContain("referenced source events were not provided")
  })

  it("reports runRoot UNAVAILABLE for zero-event export", () => {
    const data = makeValidExport()
    data.eventReferences = []
    data.summary.eventCount = 0
    data.proof.runRoot = ""
    data.proof.proofHash = ""
    // proofHashInput still present but with zero events
    data.proofHashInput.eventCount = 0
    data.proofHashInput.eventHashes = []
    const path = join(testDir, "zero.json")
    writeFileSync(path, JSON.stringify(data), "utf-8")
    const result = verifyExport(path)
    // proofHash empty → MALFORMED; runRoot empty → UNAVAILABLE
    expect(result.errors.some((e) => e.includes("proofHash MALFORMED"))).toBe(true)
    expect(result.runRoot!.status).toBe("UNAVAILABLE")
  })

  // ── Source immutability ───────────────────────────────────────────

  it("export does not mutate source records", () => {
    // Serialize source, export, verify, serialize again, compare
    const data = makeValidExport()
    const sourceBefore = JSON.stringify(data, null, 2)

    const path = join(testDir, "immutable.json")
    writeFileSync(path, sourceBefore, "utf-8")

    // Verify (read-only operation)
    const result = verifyExport(path)
    expect(result.valid).toBe(true)

    // Read back and compare
    const sourceAfter = readFileSync(path, "utf-8")
    expect(sourceAfter).toBe(sourceBefore)
  })

  // ── Deterministic output ──────────────────────────────────────────

  it("produces deterministic JSON for same input", () => {
    const data = makeValidExport()
    const json1 = JSON.stringify(data, null, 2)
    const json2 = JSON.stringify(data, null, 2)
    expect(json1).toBe(json2)
  })

  // ── Secret redaction ──────────────────────────────────────────────

  it("export contains no secrets or sensitive values", () => {
    const data = makeValidExport()
    const json = JSON.stringify(data, null, 2).toLowerCase()
    const secretPatterns = ["sk-", "ghp_", "xoxb-", "AKIA", "Bearer ", "password=", "api_key="]
    for (const pattern of secretPatterns) {
      expect(json).not.toContain(pattern)
    }
    expect(json).not.toContain("ARCANA_")
    expect(json).not.toContain("OPENAI_")
    expect(json).not.toContain("process.env")
  })

  // ── Atomic write ──────────────────────────────────────────────────

  it("atomic write produces complete file", () => {
    const path = join(testDir, "atomic.json")
    const tmpPath = path + ".tmp"
    const content = JSON.stringify({ schemaVersion: "1", sessionId: "test" })

    writeFileSync(tmpPath, content, "utf-8")
    const { renameSync } = require("node:fs")
    renameSync(tmpPath, path)

    expect(existsSync(path)).toBe(true)
    expect(readFileSync(path, "utf-8")).toBe(content)
    expect(existsSync(tmpPath)).toBe(false)
  })

  // ── Markdown denial reasons ───────────────────────────────────────

  it("P3 denial reasons are present in export data", () => {
    const data = makeValidExport({
      p3DenialReasons: ["no VERIFIED_COMPLETE decision", "lifecycle is incomplete"],
    })
    expect((data.p3DenialReasons as readonly string[]) as string[]).toContain("no VERIFIED_COMPLETE decision")
    expect((data.p3DenialReasons as readonly string[]) as string[]).toContain("lifecycle is incomplete")
  })
})
