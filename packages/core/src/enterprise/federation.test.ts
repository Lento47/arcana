/**
 * F8: federation tests.
 */

import { describe, expect, it } from "bun:test"
import { Database } from "bun:sqlite"
import { SqliteFederationStore } from "./federation-sqlite"
import {
  agreementValid,
  conflictResolution,
  exchangeProof,
  intersectAuthority,
  propagateRevocation,
  type FederationAgreement,
} from "./federation"

const NOW = new Date("2026-08-02T12:00:00.000Z")

function agreement(overrides: Partial<FederationAgreement> = {}): FederationAgreement {
  return {
    agreementId: "agreement-1",
    version: 1,
    orgA: "org-a",
    orgB: "org-b",
    audienceRestrictions: ["arcana.test"],
    validFrom: "2026-08-01T00:00:00.000Z",
    validTo: "2027-08-01T00:00:00.000Z",
    status: "ACTIVE",
    ...overrides,
  }
}

const LOCAL = { actions: new Set(["filesystem.read", "filesystem.write"]), resources: new Set(["packages/**"]) }
const REMOTE = { actions: new Set(["filesystem.read", "network.write"]), resources: new Set(["packages/**"]) }

describe("F8 federation", () => {
  it("federated authority is the intersection and never broadens", () => {
    const store = new SqliteFederationStore(new Database(":memory:"))
    store.putAgreement(agreement())

    const result = intersectAuthority(LOCAL, REMOTE, store.getAgreement("agreement-1"), NOW)
    expect(result.allowed).toBe(true)
    if (result.allowed) {
      expect([...result.scope.actions]).toEqual(["filesystem.read"])
      expect([...result.scope.resources]).toEqual(["packages/**"])
    }

    // Remote-only action is NOT granted to the local org.
    const remoteOnly = intersectAuthority(
      { actions: new Set(["filesystem.read"]), resources: new Set(["packages/**"]) },
      { actions: new Set(["network.write"]), resources: new Set(["packages/**"]) },
      store.getAgreement("agreement-1"),
      NOW,
    )
    expect(remoteOnly).toMatchObject({ allowed: false })
  })

  it("unknown, expired, and revoked agreements fail closed", () => {
    const store = new SqliteFederationStore(new Database(":memory:"))
    store.putAgreement(agreement())
    store.putAgreement(agreement({ agreementId: "revoked", status: "REVOKED" }))
    store.putAgreement(agreement({ agreementId: "expired", validTo: "2026-07-01T00:00:00.000Z" }))

    expect(agreementValid(store.getAgreement("unknown"), NOW).valid).toBe(false)
    expect(intersectAuthority(LOCAL, REMOTE, store.getAgreement("revoked"), NOW).allowed).toBe(false)
    expect(intersectAuthority(LOCAL, REMOTE, store.getAgreement("expired"), NOW).allowed).toBe(false)
  })

  it("conflicts resolve to DENY unless both sides allow", () => {
    expect(conflictResolution("ALLOW", "ALLOW")).toBe("ALLOW")
    expect(conflictResolution("ALLOW", "DENY")).toBe("DENY")
    expect(conflictResolution("DENY", "ALLOW")).toBe("DENY")
  })

  it("exchanges proofs preserving origin and rejects unknown agreements", () => {
    const store = new SqliteFederationStore(new Database(":memory:"))
    store.putAgreement(agreement())

    const exchanged = exchangeProof(
      {
        agreementId: "agreement-1",
        orgId: "org-a",
        remoteProofId: "proof-remote-1",
        fingerprint: "a".repeat(64),
        origin: "org-b",
        now: NOW,
      },
      store,
    )
    expect(exchanged.kind).toBe("EXCHANGED")
    expect(store.exchanges("org-a")).toHaveLength(1)
    expect(store.exchanges("org-a")[0].origin).toBe("org-b")

    expect(
      exchangeProof(
        {
          agreementId: "unknown-agreement",
          orgId: "org-a",
          remoteProofId: "p",
          fingerprint: "a".repeat(64),
          origin: "org-b",
          now: NOW,
        },
        store,
      ),
    ).toMatchObject({ kind: "REJECTED" })
  })

  it("propagates revocations only under active agreements", () => {
    const store = new SqliteFederationStore(new Database(":memory:"))
    store.putAgreement(agreement())

    const propagated = propagateRevocation(
      { agreementId: "agreement-1", orgId: "org-a", subjectId: "grant-x", reason: "compromised", now: NOW },
      store,
    )
    expect("propagatedAt" in propagated).toBe(true)
    expect(store.revocations("org-a")).toHaveLength(1)

    expect(
      propagateRevocation(
        { agreementId: "unknown", orgId: "org-a", subjectId: "grant-y", reason: "x", now: NOW },
        store,
      ),
    ).toMatchObject({ kind: "REJECTED" })
  })
})
