/**
 * F7: HA/DR tests.
 */

import { describe, expect, it } from "bun:test"
import { Database } from "bun:sqlite"
import { SqliteReliabilityStore } from "./reliability-sqlite"
import {
  backupKeyMaterial,
  degradedEnforcementAllowed,
  evaluateDrill,
  keyMaterialDigest,
  restoreBackup,
  restoreKeyMaterial,
  type BackupRecord,
  type KeyBackupMaterial,
  type ReliabilityConfig,
} from "./reliability"
import { keyFingerprint } from "./key-rotation"
import { decodeCanonicalBase64url, encodeBase64url } from "../crypto/canonical-serializer"
import { ed25519 } from "@noble/curves/ed25519.js"

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

function keyMaterial(overrides: Partial<KeyBackupMaterial> = {}): KeyBackupMaterial {
  const keys = ed25519.keygen(new Uint8Array(32).fill(0x31))
  return {
    nodeId: "node-a",
    publicKey: encodeBase64url(keys.publicKey),
    secretKey: encodeBase64url(new Uint8Array(32).fill(0x31)),
    ...overrides,
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

  it("records digest-verified key backups with the key fingerprint", () => {
    const store = new SqliteReliabilityStore(new Database(":memory:"))
    const material = keyMaterial()

    const result = backupKeyMaterial(
      { tenantId: "tenant-a", backupId: "keys-1", material, now: NOW },
      store,
    )

    expect(result.kind).toBe("BACKED_UP")
    if (result.kind !== "BACKED_UP") return
    expect(result.record.kind).toBe("KEYS")
    expect(result.record.digest).toBe(keyMaterialDigest(material))
    expect(result.record.fingerprint).toBe(
      keyFingerprint(decodeCanonicalBase64url(material.publicKey)!),
    )
    expect(result.record.createdAt).toBe(NOW.toISOString())
    expect(store.getBackup("tenant-a", "keys-1")?.fingerprint).toBe(result.record.fingerprint)
  })

  it("rejects key backups with invalid key material", () => {
    const store = new SqliteReliabilityStore(new Database(":memory:"))
    const badKey = backupKeyMaterial(
      { tenantId: "tenant-a", backupId: "keys-bad", material: keyMaterial({ publicKey: "nope" }) },
      store,
    )
    expect(badKey).toMatchObject({ kind: "REJECTED" })
    const badSecret = backupKeyMaterial(
      {
        tenantId: "tenant-a",
        backupId: "keys-bad-2",
        material: keyMaterial({ secretKey: "short" }),
      },
      store,
    )
    expect(badSecret).toMatchObject({ kind: "REJECTED" })
    expect(store.getBackup("tenant-a", "keys-bad")).toBeUndefined()
    expect(store.getBackup("tenant-a", "keys-bad-2")).toBeUndefined()
  })

  it("restores key material only when digest AND fingerprint match; tampered backups fail closed", () => {
    const store = new SqliteReliabilityStore(new Database(":memory:"))
    const material = keyMaterial()
    backupKeyMaterial({ tenantId: "tenant-a", backupId: "keys-1", material, now: NOW }, store)

    // Tampered content: same key identity, altered secret -> digest mismatch.
    const tampered = restoreKeyMaterial(
      {
        tenantId: "tenant-a",
        backupId: "keys-1",
        presentedMaterial: keyMaterial({ secretKey: encodeBase64url(new Uint8Array(32).fill(0x99)) }),
        now: NOW,
      },
      store,
    )
    expect(tampered).toMatchObject({ kind: "REJECTED" })
    expect(store.getBackup("tenant-a", "keys-1")?.restoredAt).toBeUndefined()

    // Different key identity -> fingerprint mismatch.
    const otherKey = restoreKeyMaterial(
      {
        tenantId: "tenant-a",
        backupId: "keys-1",
        presentedMaterial: keyMaterial({
          publicKey: encodeBase64url(ed25519.keygen(new Uint8Array(32).fill(0x77)).publicKey),
          secretKey: encodeBase64url(new Uint8Array(32).fill(0x77)),
        }),
        now: NOW,
      },
      store,
    )
    expect(otherKey).toMatchObject({ kind: "REJECTED" })

    // Exact material restores.
    const restored = restoreKeyMaterial(
      { tenantId: "tenant-a", backupId: "keys-1", presentedMaterial: material, now: NOW },
      store,
    )
    expect(restored.kind).toBe("RESTORED")
    if (restored.kind === "RESTORED") {
      expect(restored.record.restoredAt).toBe(NOW.toISOString())
    }
  })

  it("gates restore on the active key fingerprint before the key becomes active", () => {
    const store = new SqliteReliabilityStore(new Database(":memory:"))
    const activeMaterial = keyMaterial()
    const rotatedMaterial = keyMaterial({
      publicKey: encodeBase64url(ed25519.keygen(new Uint8Array(32).fill(0x42)).publicKey),
      secretKey: encodeBase64url(new Uint8Array(32).fill(0x42)),
    })
    backupKeyMaterial({ tenantId: "tenant-a", backupId: "keys-active", material: activeMaterial, now: NOW }, store)
    backupKeyMaterial({ tenantId: "tenant-a", backupId: "keys-rotated", material: rotatedMaterial, now: NOW }, store)

    // A rotated (superseded) key backup cannot activate while a different
    // key is current: fingerprint gate rejects before activation.
    const stale = restoreKeyMaterial(
      {
        tenantId: "tenant-a",
        backupId: "keys-rotated",
        presentedMaterial: rotatedMaterial,
        activeKeyFingerprint: keyFingerprint(decodeCanonicalBase64url(activeMaterial.publicKey)!),
        now: NOW,
      },
      store,
    )
    expect(stale).toMatchObject({ kind: "REJECTED" })
    expect(store.getBackup("tenant-a", "keys-rotated")?.restoredAt).toBeUndefined()

    // The active key's own backup restores against the active fingerprint.
    const restored = restoreKeyMaterial(
      {
        tenantId: "tenant-a",
        backupId: "keys-active",
        presentedMaterial: activeMaterial,
        activeKeyFingerprint: keyFingerprint(decodeCanonicalBase64url(activeMaterial.publicKey)!),
        now: NOW,
      },
      store,
    )
    expect(restored.kind).toBe("RESTORED")
  })

  it("key restores are tenant-isolated and DATABASE backups never restore as keys", () => {
    const store = new SqliteReliabilityStore(new Database(":memory:"))
    const material = keyMaterial()
    backupKeyMaterial({ tenantId: "tenant-a", backupId: "keys-1", material, now: NOW }, store)
    store.putBackup(backup())

    const crossTenant = restoreKeyMaterial(
      { tenantId: "tenant-b", backupId: "keys-1", presentedMaterial: material, now: NOW },
      store,
    )
    expect(crossTenant).toMatchObject({ kind: "REJECTED" })

    const dbBackup = restoreKeyMaterial(
      { tenantId: "tenant-a", backupId: "backup-1", presentedMaterial: material, now: NOW },
      store,
    )
    expect(dbBackup).toMatchObject({ kind: "REJECTED" })
  })
})
