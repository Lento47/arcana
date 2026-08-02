/**
 * D-5: revocation store + convergence measurement tests.
 */

import { describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Database } from "bun:sqlite"
import { ed25519 } from "@noble/curves/ed25519.js"
import { REVOCATION_DOMAIN, type RevocationStatement } from "./signed-envelopes"
import { signEnvelope } from "./node-enrollment"
import { SqliteRevocationStore } from "./revocation-store-sqlite"
import { publishRevocation, type RevocationStore } from "./revocation-store"
import {
  checkRevocationTargets,
  estimateRevocationLag,
  measureRevocationLag,
} from "./revocation-convergence"

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
  return bytes
}

const issuerKey = ed25519.keygen(hexToBytes("31".repeat(32)))
const ISSUER_KEYS = new Map([["issuer-arcana", issuerKey.publicKey]])
const NOW = new Date("2026-08-02T12:00:00.000Z")

function statement(sequence: number, subjectId = "grant-1", overrides: Partial<RevocationStatement> = {}): RevocationStatement {
  const payload = {
    schemaVersion: 1,
    issuerId: "issuer-arcana",
    issuerEpoch: 1,
    sequence,
    subjectType: "GRANT" as const,
    subjectId,
    reason: "compromised",
    effectiveAt: "2026-08-02T12:00:00.000Z",
    issuedAt: "2026-08-02T11:59:00.000Z",
    ...overrides,
  }
  return signEnvelope(REVOCATION_DOMAIN, payload, issuerKey.secretKey) as unknown as RevocationStatement
}

function store(): RevocationStore {
  return new SqliteRevocationStore(new Database(":memory:"))
}

describe("D-5 revocation store", () => {
  it("publishes sequential statements", () => {
    const s = store()
    const first = publishRevocation({ statement: statement(1), now: NOW, trustedIssuerPublicKeys: ISSUER_KEYS }, s)
    expect(first.kind).toBe("PUBLISHED")
    const second = publishRevocation({ statement: statement(2, "node-alpha"), now: NOW, trustedIssuerPublicKeys: ISSUER_KEYS }, s)
    expect(second.kind).toBe("PUBLISHED")
    expect(s.last()?.sequence).toBe(2)
    expect(s.history()).toHaveLength(2)
  })

  it("rejects sequence rollback and non-1 first sequences", () => {
    const s = store()
    expect(publishRevocation({ statement: statement(2), now: NOW, trustedIssuerPublicKeys: ISSUER_KEYS }, s)).toMatchObject({
      kind: "REJECTED",
    })
    publishRevocation({ statement: statement(1), now: NOW, trustedIssuerPublicKeys: ISSUER_KEYS }, s)
    expect(publishRevocation({ statement: statement(1, "grant-2"), now: NOW, trustedIssuerPublicKeys: ISSUER_KEYS }, s)).toMatchObject({
      kind: "REJECTED",
    })
  })

  it("rejects forged signatures", () => {
    const forged = statement(1)
    forged.signature = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    const result = publishRevocation({ statement: forged, now: NOW, trustedIssuerPublicKeys: ISSUER_KEYS }, store())
    expect(result).toMatchObject({ kind: "REJECTED" })
  })

  it("is idempotent for identical content", () => {
    const s = store()
    publishRevocation({ statement: statement(1), now: NOW, trustedIssuerPublicKeys: ISSUER_KEYS }, s)
    const dup = publishRevocation({ statement: statement(1), now: NOW, trustedIssuerPublicKeys: ISSUER_KEYS }, s)
    expect(dup).toMatchObject({ kind: "PUBLISHED" })
  })

  it("survives restart", () => {
    const dir = mkdtempSync(join(tmpdir(), "arcana-revocation-"))
    try {
      const dbPath = join(dir, "rev.db")
      const db1 = new Database(dbPath)
      const s1 = new SqliteRevocationStore(db1)
      publishRevocation({ statement: statement(1), now: NOW, trustedIssuerPublicKeys: ISSUER_KEYS }, s1)
      db1.close()

      const db2 = new Database(dbPath)
      const s2 = new SqliteRevocationStore(db2)
      expect(s2.last()?.sequence).toBe(1)
      db2.close()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe("D-5 convergence measurement", () => {
  it("estimates lag within the CRITICAL 5s bound for a 1s poll interval", () => {
    const estimate = estimateRevocationLag({
      pollingIntervalMs: 1_000,
      distributionDelayMs: 200,
      localEnforcementDelayMs: 50,
      detectionDelayMs: 100,
    })
    expect(estimate.p50Ms).toBe(850)
    expect(estimate.p95Ms).toBe(1300)
    expect(checkRevocationTargets(estimate.p95Ms, "CRITICAL").pass).toBe(true)
    expect(checkRevocationTargets(estimate.p95Ms, "HIGH").pass).toBe(true)
  })

  it("measures observed lag and flags bound violations", () => {
    const base = Date.now()
    const samples = Array.from({ length: 100 }, (_, i) => ({
      publishedAt: base,
      enforcedAt: base + 1000 + (i % 10) * 100,
    }))
    const measured = measureRevocationLag(samples)
    expect(measured.count).toBe(100)
    expect(measured.p95Ms).toBeLessThanOrEqual(1900)
    expect(measured.p50Ms).toBeGreaterThanOrEqual(1000)

    const violations = checkRevocationTargets(measured.p95Ms, "CRITICAL")
    expect(violations.pass).toBe(true)

    const bad = checkRevocationTargets(10_000, "CRITICAL")
    expect(bad.pass).toBe(false)
    expect(bad.violations.length).toBe(1)
  })
})
