/**
 * D-5/D-10: Revocation hostile fixtures.
 *
 * Adversarial revocation statements must fail closed: forged signatures,
 * unknown issuers, expired/future statements, sequence rollbacks, non-genesis
 * first statements, duplicate-sequence content changes, and revocation
 * resurrection. The suite asserts zero bypasses and reports fixture totals.
 */

import { describe, expect, it } from "bun:test"
import { Database } from "bun:sqlite"
import { ed25519 } from "@noble/curves/ed25519.js"
import { encodeBase64url } from "./canonical-serializer"
import { REVOCATION_DOMAIN, type RevocationStatement } from "./signed-envelopes"
import { signEnvelope } from "./node-enrollment"
import { publishRevocation } from "./revocation-store"
import { SqliteRevocationStore } from "./revocation-store-sqlite"
import {
  reduceRevocationState,
  type RevocationSyncState,
  type VerifiedRevocationInput,
} from "./reducers"

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
  return bytes
}

const issuerKey = ed25519.keygen(hexToBytes("51".repeat(32)))
const attackerKey = ed25519.keygen(hexToBytes("52".repeat(32)))
const NOW = new Date("2026-08-02T12:00:00.000Z")
const ISSUER_KEYS = new Map([["issuer-arcana", issuerKey.publicKey]])

let fixtureCount = 0
let bypassCount = 0

function expectFailClosed(actual: boolean, label: string): void {
  fixtureCount++
  if (!actual) {
    bypassCount++
    console.error(`[D-10 REVOCATION BYPASS] ${label}`)
  }
  expect(actual).toBe(true)
}

function statement(
  sequence: number,
  overrides: Partial<RevocationStatement> = {},
): RevocationStatement {
  const payload = {
    schemaVersion: 1,
    issuerId: "issuer-arcana",
    issuerEpoch: 1,
    sequence,
    subjectType: "GRANT" as const,
    subjectId: "grant-1",
    reason: "compromised",
    effectiveAt: NOW.toISOString(),
    issuedAt: NOW.toISOString(),
    ...overrides,
  }
  return signEnvelope(REVOCATION_DOMAIN, payload, issuerKey.secretKey) as unknown as RevocationStatement
}

function freshStore(): SqliteRevocationStore {
  return new SqliteRevocationStore(new Database(":memory:"))
}

function revokedState(): RevocationSyncState {
  return {
    issuerId: "issuer-arcana",
    issuerEpoch: 1,
    acceptedSequence: 0,
    emergencyEpoch: 0,
    revokedGrantIds: new Set(),
    revokedNodeIds: new Set(),
    revokedPolicyIds: new Set(),
    revokedIssuerEpochs: new Map(),
    status: "UNAVAILABLE",
  }
}

function verifiedInput(
  sequence: number,
  subjectType: VerifiedRevocationInput["subjectType"],
  subjectId: string,
): VerifiedRevocationInput {
  return {
    issuerId: "issuer-arcana",
    issuerEpoch: 1,
    sequence,
    subjectType,
    subjectId,
    receivedAt: NOW.toISOString(),
  }
}

describe("D-10 revocation hostile fixtures", () => {
  it("forged and unknown-issuer revocation statements are never published", () => {
    const forged = statement(1)
    forged.signature = encodeBase64url(new Uint8Array(64).fill(9))
    const forgedResult = publishRevocation(
      { statement: forged, trustedIssuerPublicKeys: ISSUER_KEYS, now: NOW },
      freshStore(),
    )
    expectFailClosed(forgedResult.kind === "REJECTED", "forged revocation statement published")

    const unknownIssuer = statement(1, { issuerId: "issuer-evil" })
    const unknownResult = publishRevocation(
      { statement: unknownIssuer, trustedIssuerPublicKeys: ISSUER_KEYS, now: NOW },
      freshStore(),
    )
    expectFailClosed(unknownResult.kind === "REJECTED", "unknown-issuer revocation statement published")
  })

  it("schema-invalid, future-dated, and non-genesis revocation statements are rejected", () => {
    const missingSubject = signEnvelope(REVOCATION_DOMAIN, {
      schemaVersion: 1,
      issuerId: "issuer-arcana",
      issuerEpoch: 1,
      sequence: 1,
      subjectType: "GRANT",
      reason: "compromised",
      effectiveAt: NOW.toISOString(),
      issuedAt: NOW.toISOString(),
    }, issuerKey.secretKey) as unknown as RevocationStatement
    const schemaResult = publishRevocation(
      { statement: missingSubject, trustedIssuerPublicKeys: ISSUER_KEYS, now: NOW },
      freshStore(),
    )
    expectFailClosed(schemaResult.kind === "REJECTED", "schema-invalid revocation statement published")

    const future = statement(1, { issuedAt: "2026-08-03T00:00:00.000Z" })
    const futureResult = publishRevocation(
      { statement: future, trustedIssuerPublicKeys: ISSUER_KEYS, now: NOW },
      freshStore(),
    )
    expectFailClosed(futureResult.kind === "REJECTED", "future-dated revocation statement published")

    const nonGenesis = statement(2)
    const nonGenesisResult = publishRevocation(
      { statement: nonGenesis, trustedIssuerPublicKeys: ISSUER_KEYS, now: NOW },
      freshStore(),
    )
    expectFailClosed(nonGenesisResult.kind === "REJECTED", "non-genesis first revocation statement published")
  })

  it("sequence rollback and duplicate-sequence content changes are rejected", () => {
    const store = freshStore()
    const first = publishRevocation(
      { statement: statement(1), trustedIssuerPublicKeys: ISSUER_KEYS, now: NOW },
      store,
    )
    expect(first.kind).toBe("PUBLISHED")
    const second = publishRevocation(
      { statement: statement(2), trustedIssuerPublicKeys: ISSUER_KEYS, now: NOW },
      store,
    )
    expect(second.kind).toBe("PUBLISHED")

    const rollback = publishRevocation(
      { statement: statement(1, { reason: "different reason" }), trustedIssuerPublicKeys: ISSUER_KEYS, now: NOW },
      store,
    )
    expectFailClosed(rollback.kind === "REJECTED", "revocation sequence rollback accepted")

    const duplicateContentChange = publishRevocation(
      { statement: statement(2, { subjectId: "grant-other" }), trustedIssuerPublicKeys: ISSUER_KEYS, now: NOW },
      store,
    )
    expectFailClosed(
      duplicateContentChange.kind === "REJECTED",
      "duplicate revocation sequence with different content accepted",
    )
  })

  it("revoked subjects never resurrect", () => {
    let state = revokedState()
    const applied = reduceRevocationState(state, verifiedInput(1, "GRANT", "grant-1"))
    expect(applied.status).toBe("APPLIED")
    if (applied.status === "APPLIED") state = applied.state
    expectFailClosed(state.revokedGrantIds.has("grant-1"), "revoked grant not recorded")

    // A later verified input for the same subject must not resurrect it.
    const later = reduceRevocationState(state, verifiedInput(2, "GRANT", "grant-1"))
    expectFailClosed(
      later.status === "REJECTED" || (later.status === "APPLIED" && later.state.revokedGrantIds.has("grant-1")),
      "revoked subject resurrected",
    )
  })

  it("reports revocation fixture totals with zero bypasses", () => {
    expect(bypassCount).toBe(0)
    expect(fixtureCount).toBeGreaterThanOrEqual(8)
    console.log(`[D-10] revocation hostile fixtures: ${fixtureCount}, ${bypassCount} bypasses`)
  })
})
