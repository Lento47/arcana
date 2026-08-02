/**
 * F10: data governance tests.
 */

import { describe, expect, it } from "bun:test"
import {
  applyPiiRetention,
  assertExportable,
  assertStorable,
  classifyInput,
  DEFAULT_DATA_GOVERNANCE_POLICY,
  type DataGovernancePolicy,
} from "./data-governance"

const NOW = new Date("2026-08-02T12:00:00.000Z")

const POLICY: DataGovernancePolicy = {
  allowedRegions: ["US", "EU"],
  customerManagedKeys: true,
  telemetryOptOut: false,
  piiRetentionMs: 90 * 24 * 60 * 60 * 1000,
}

describe("F10 data governance", () => {
  it("enforces regional and CMK constraints", () => {
    expect(assertStorable({ id: "a", classification: "INTERNAL", region: "US", createdAt: "t" }, POLICY).allowed).toBe(true)
    expect(assertStorable({ id: "b", classification: "INTERNAL", region: "RU", createdAt: "t" }, POLICY).allowed).toBe(false)
    expect(assertStorable({ id: "c", classification: "SECRET", region: "US", createdAt: "t" }, POLICY).allowed).toBe(true)
    expect(
      assertStorable({ id: "d", classification: "SECRET", region: "US", createdAt: "t" }, { ...POLICY, customerManagedKeys: false }).allowed,
    ).toBe(false)
  })

  it("blocks PII export under telemetry opt-out", () => {
    expect(assertExportable("PII", POLICY).allowed).toBe(true)
    expect(assertExportable("PII", { ...POLICY, telemetryOptOut: true }).allowed).toBe(false)
  })

  it("applies PII retention and classifies inputs", () => {
    const old = { id: "old", classification: "PII" as const, region: "US", createdAt: new Date(NOW.getTime() - 91 * 24 * 60 * 60 * 1000).toISOString() }
    const fresh = { id: "fresh", classification: "PII" as const, region: "US", createdAt: NOW.toISOString() }
    const secret = { id: "secret", classification: "SECRET" as const, region: "US", createdAt: NOW.toISOString() }

    const result = applyPiiRetention([old, fresh, secret], POLICY, NOW)
    expect(result.expired).toEqual(["old"])
    expect(result.retained.map((r) => r.id)).toEqual(["fresh", "secret"])
    expect(classifyInput({ containsPii: true, sensitivity: "INTERNAL" })).toBe("PII")
    expect(classifyInput({ containsPii: false, sensitivity: "SECRET" })).toBe("SECRET")
  })

  it("defaults match the published contract", () => {
    expect(DEFAULT_DATA_GOVERNANCE_POLICY.allowedRegions).toEqual(["US", "EU"])
    expect(DEFAULT_DATA_GOVERNANCE_POLICY.customerManagedKeys).toBe(false)
  })
})
