import { describe, expect, it } from "bun:test"
import {
  DEFAULT_UPGRADE_POLICY,
  entitled,
  meteringNeverAffectsDecision,
  redactDiagnostics,
  type Diagnostics,
} from "./commercial-readiness"

const DIAGNOSTICS: Diagnostics = {
  version: "1.0.0",
  runtime: { os: "windows", node: "22" },
  config: { apiToken: "sk-abc", region: "US" },
  logs: ["started", "using sk-abc"],
}

describe("F12 commercial readiness", () => {
  it("enforces feature entitlement by tier", () => {
    expect(entitled("COMMUNITY", "local_runtime")).toBe(true)
    expect(entitled("COMMUNITY", "fleet_control")).toBe(false)
    expect(entitled("TEAM", "shared_policy")).toBe(true)
    expect(entitled("ENTERPRISE", "federation")).toBe(true)
  })

  it("metering never changes security decisions", () => {
    expect(meteringNeverAffectsDecision("ALLOW", { ok: false })).toBe("ALLOW")
    expect(meteringNeverAffectsDecision("DENY", { ok: true, overQuota: true })).toBe("DENY")
    expect(meteringNeverAffectsDecision("REQUIRE_APPROVAL", { ok: false, overQuota: true })).toBe("REQUIRE_APPROVAL")
  })

  it("redacts secrets from support diagnostics", () => {
    const redacted = redactDiagnostics(DIAGNOSTICS, ["sk-abc"])
    expect(redacted.config.apiToken).toBe("[REDACTED]")
    expect(redacted.config.region).toBe("US")
    expect(redacted.logs[1]).toBe("using [REDACTED]")
    expect(redacted.runtime.os).toBe("windows")
  })

  it("documents the upgrade policy", () => {
    expect(DEFAULT_UPGRADE_POLICY.rollbackAllowed).toBe(true)
    expect(DEFAULT_UPGRADE_POLICY.breakingChangesRequire).toBe("migration_runbook")
  })
})
