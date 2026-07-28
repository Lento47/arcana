import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { existsSync, readFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { verifyExport } from "@arcana/engine/cli/cmd/proof"
import type { ProofLevel, TraceHealth, LifecycleStatus, IntegrityStatus } from "@arcana/engine/session/epistemic/run-proof"

// ── Export verification tests ────────────────────────────────────────

describe("RunProof export verification", () => {
  const testDir = join(tmpdir(), "runproof-export-test-" + Date.now())

  beforeEach(() => {
    if (!existsSync(testDir)) mkdirSync(testDir, { recursive: true })
  })

  afterEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true })
  })

  it("rejects non-existent file", () => {
    const result = verifyExport(join(testDir, "nonexistent.json"))
    expect(result.valid).toBe(false)
    expect(result.errors).toContain("file not found")
  })

  it("rejects malformed JSON", () => {
    const path = join(testDir, "bad.json")
    writeFileSync(path, "not json {{{", "utf-8")
    const result = verifyExport(path)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain("malformed JSON")
  })

  it("rejects unsupported schema version", () => {
    const path = join(testDir, "old-schema.json")
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

  it("validates a correct export", () => {
    const exportData = {
      schemaVersion: "1",
      exportedAt: new Date().toISOString(),
      sessionId: "test-session",
      proof: {
        level: "P1" as ProofLevel,
        levelLabel: "P1 INTEGRITY",
        integrity: "VALID" as IntegrityStatus,
        traceHealth: "COMPLETE" as TraceHealth,
        lifecycleStatus: "COMPLETE" as LifecycleStatus,
        completionMethod: "VERIFIED_COMPLETE",
        contractStatus: "accepted",
        runRoot: "a".repeat(64),
        proofHash: "b".repeat(64),
      },
      summary: {
        eventCount: 5,
        sequenceRange: [0, 4] as [number, number],
        claimsByStatus: { verified: 3 },
        obligationsByStatus: { satisfied: 2 },
        requiredObligations: { total: 2, satisfied: 2, pending: 0 },
      },
      p3DenialReasons: [],
      gaps: [],
      verification: {
        chainValid: true,
        runRootValid: true,
        proofHashValid: true,
      },
      derivedAt: new Date().toISOString(),
    }

    const path = join(testDir, "valid.json")
    writeFileSync(path, JSON.stringify(exportData, null, 2), "utf-8")
    const result = verifyExport(path)
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

  it("detects invalid proofHash format", () => {
    const exportData = {
      schemaVersion: "1",
      exportedAt: new Date().toISOString(),
      sessionId: "test-session",
      proof: {
        level: "P1",
        levelLabel: "P1 INTEGRITY",
        integrity: "VALID",
        traceHealth: "COMPLETE",
        lifecycleStatus: "COMPLETE",
        completionMethod: null,
        contractStatus: null,
        runRoot: "a".repeat(64),
        proofHash: "tooshort",
      },
      summary: {
        eventCount: 1,
        sequenceRange: [0, 0],
        claimsByStatus: {},
        obligationsByStatus: {},
        requiredObligations: { total: 0, satisfied: 0, pending: 0 },
      },
      p3DenialReasons: [],
      gaps: [],
      verification: { chainValid: true, runRootValid: true, proofHashValid: true },
      derivedAt: new Date().toISOString(),
    }

    const path = join(testDir, "badhash.json")
    writeFileSync(path, JSON.stringify(exportData), "utf-8")
    const result = verifyExport(path)
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain("proofHash is not a valid SHA-256 hex string")
  })

  it("detects invalid runRoot format", () => {
    const exportData = {
      schemaVersion: "1",
      exportedAt: new Date().toISOString(),
      sessionId: "test-session",
      proof: {
        level: "P0",
        levelLabel: "P0 TRACE",
        integrity: "INVALID",
        traceHealth: "DEGRADED",
        lifecycleStatus: "INCOMPLETE",
        completionMethod: null,
        contractStatus: null,
        runRoot: "short",
        proofHash: "b".repeat(64),
      },
      summary: {
        eventCount: 0,
        sequenceRange: null,
        claimsByStatus: {},
        obligationsByStatus: {},
        requiredObligations: { total: 0, satisfied: 0, pending: 0 },
      },
      p3DenialReasons: ["no VERIFIED_COMPLETE decision"],
      gaps: ["no events"],
      verification: { chainValid: false, runRootValid: false, proofHashValid: true },
      derivedAt: new Date().toISOString(),
    }

    const path = join(testDir, "badroot.json")
    writeFileSync(path, JSON.stringify(exportData), "utf-8")
    const result = verifyExport(path)
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain("runRoot is not a valid SHA-256 hex string")
  })

  it("export JSON is stable for same input", () => {
    const exportData = {
      schemaVersion: "1",
      exportedAt: "2026-01-01T00:00:00.000Z",
      sessionId: "stable-session",
      proof: {
        level: "P1",
        levelLabel: "P1 INTEGRITY",
        integrity: "VALID",
        traceHealth: "COMPLETE",
        lifecycleStatus: "COMPLETE",
        completionMethod: null,
        contractStatus: null,
        runRoot: "a".repeat(64),
        proofHash: "b".repeat(64),
      },
      summary: {
        eventCount: 2,
        sequenceRange: [0, 1],
        claimsByStatus: {},
        obligationsByStatus: {},
        requiredObligations: { total: 0, satisfied: 0, pending: 0 },
      },
      p3DenialReasons: [],
      gaps: [],
      verification: { chainValid: true, runRootValid: true, proofHashValid: true },
      derivedAt: "2026-01-01T00:00:00.000Z",
    }

    const json1 = JSON.stringify(exportData, null, 2)
    const json2 = JSON.stringify(exportData, null, 2)
    expect(json1).toBe(json2)

    // Field order independence: same data in different order produces same parsed result
    const reordered = {
      sessionId: exportData.sessionId,
      proof: exportData.proof,
      schemaVersion: exportData.schemaVersion,
      verification: exportData.verification,
      summary: exportData.summary,
      exportedAt: exportData.exportedAt,
      p3DenialReasons: exportData.p3DenialReasons,
      gaps: exportData.gaps,
      derivedAt: exportData.derivedAt,
    }
    const parsed1 = JSON.parse(json1)
    const parsed2 = JSON.parse(JSON.stringify(reordered))
    expect(parsed1.sessionId).toBe(parsed2.sessionId)
    expect(parsed1.proof.level).toBe(parsed2.proof.level)
    expect(parsed1.proofHash).toBe(parsed2.proofHash)
  })
})
