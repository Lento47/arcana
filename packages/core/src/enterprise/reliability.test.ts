/**
 * F7: HA/DR tests.
 */

import { describe, expect, it } from "bun:test"
import { Database } from "bun:sqlite"
import { SqliteReliabilityStore } from "./reliability-sqlite"
import {
  degradedEnforcementAllowed,
  evaluateDrill,
  restoreBackup,
  type BackupRecord,
  type ReliabilityConfig,
} from "./reliability"

const NOW = new Date("2026-08-02T12:00:00.000Z")

const CONFIG: ReliabilityConfig = {
  availabilityTarget: 0.999,
  rpoMs: 15 * 60 * 1000,
  rtoMs: 60 * 60 * 1000,
}

function backup(): BackupRecord {
  return {
    tenantId: "tenant-a",
    backupId: "backup-1",
    kind: "DATABASE",
    createdAt: NOW.toISOString(),
    digest: "abc123",
  }
}

describe("F7 HA/DR", () => {
  it("restores only digest-verified backups", () => {
    const store = new SqliteReliabilityStore(new Database(":memory:"))
    store.putBackup(backup())

    const tampered = restoreBackup("tenant-a", "backup-1", "tampered", store, NOW)
    expect(tampered).toMatchObject({ kind: "REJECTED" })
    expect(store.getBackup("tenant-a", "backup-1")?.restoredAt).toBeUndefined()

    const restored = restoreBackup("tenant-a", "backup-1", "abc123", store, NOW)
    expect(restored.kind).toBe("RESTORED")
    if (restored.kind === "RESTORED") {
      expect(restored.record.restoredAt).toBe(NOW.toISOString())
    }
  })

  it("restore drills pass only inside the published RPO/RTO", () => {
    expect(
      evaluateDrill({ tenantId: "tenant-a", startedAt: "t0", finishedAt: "t1", measuredRpoMs: 10_000, measuredRtoMs: 30_000 }, CONFIG).pass,
    ).toBe(true)
    const failed = evaluateDrill({ tenantId: "tenant-a", startedAt: "t0", finishedAt: "t1", measuredRpoMs: 20 * 60 * 1000, measuredRtoMs: 2 * 60 * 60 * 1000 }, CONFIG)
    expect(failed.pass).toBe(false)
    expect(failed.violations.length).toBe(2)
  })

  it("degraded enforcement fails closed during outages", () => {
    expect(degradedEnforcementAllowed("ONLINE").allowed).toBe(true)
    expect(degradedEnforcementAllowed("OFFLINE_RESTRICTED").allowed).toBe(true)
    expect(degradedEnforcementAllowed("QUARANTINED").allowed).toBe(false)
  })
})
