/**
 * F6: audit archive tests.
 */

import { describe, expect, it } from "bun:test"
import { Database } from "bun:sqlite"
import { SqliteAuditArchiveStore } from "./audit-archive-sqlite"
import {
  appendCustody,
  applyRetention,
  archiveProof,
  exportProof,
  placeLegalHold,
  proofFingerprint,
  removeLegalHold,
  type ProofLike,
} from "./audit-archive"

const NOW = new Date("2026-08-02T12:00:00.000Z")

function proof(overrides: Partial<ProofLike> = {}): ProofLike {
  return {
    id: "run_01J",
    schema_version: "0.2",
    timestamp: "2026-08-02T11:00:00.000Z",
    lifecycle: {
      status: "completed",
      started_at: "2026-08-02T10:00:00.000Z",
      ended_at: "2026-08-02T11:00:00.000Z",
    },
    events: [
      { id: "evt-1", timestamp: "2026-08-02T10:00:00.000Z", type: "plan.created" },
      { id: "evt-2", timestamp: "2026-08-02T10:05:00.000Z", type: "command.executed" },
    ],
    ...overrides,
  }
}

function store(): SqliteAuditArchiveStore {
  return new SqliteAuditArchiveStore(new Database(":memory:"))
}

describe("F6 audit archive", () => {
  it("archives and exports proofs with an independent fingerprint", () => {
    const s = store()
    const result = archiveProof(
      {
        tenantId: "tenant-a",
        proofId: "run_01J",
        proofJson: JSON.stringify(proof()),
        source: "node-1",
        retentionUntil: new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        ingestedAt: NOW.toISOString(),
      },
      s,
    )
    expect(result.kind).toBe("ARCHIVED")
    if (result.kind !== "ARCHIVED") return
    expect(result.record.fingerprint).toBe(proofFingerprint(proof()))
    expect(result.record.fingerprint.length).toBe(64)

    const exported = exportProof("tenant-a", result.record.archiveId, s)
    expect(exported.kind).toBe("EXPORTED")
    if (exported.kind !== "EXPORTED") return
    expect(exported.fingerprint).toBe(result.record.fingerprint)
  })

  it("rejects proofs that violate the archive schema", () => {
    const s = store()
    expect(
      archiveProof(
        {
          tenantId: "tenant-a",
          proofId: "bad",
          proofJson: JSON.stringify({ id: "bad", schema_version: "9.9" }),
          source: "node-1",
          retentionUntil: "2099-01-01T00:00:00.000Z",
        },
        s,
      ),
    ).toMatchObject({ kind: "REJECTED" })
  })

  it("retention deletes expired proofs unless on legal hold", () => {
    const s = store()
    const expired = archiveProof(
      {
        tenantId: "tenant-a",
        proofId: "expired",
        proofJson: JSON.stringify(proof({ id: "expired" })),
        source: "node-1",
        retentionUntil: new Date(NOW.getTime() - 1000).toISOString(),
        ingestedAt: NOW.toISOString(),
      },
      s,
    )
    const held = archiveProof(
      {
        tenantId: "tenant-a",
        proofId: "held",
        proofJson: JSON.stringify(proof({ id: "held" })),
        source: "node-1",
        retentionUntil: new Date(NOW.getTime() - 1000).toISOString(),
        ingestedAt: NOW.toISOString(),
      },
      s,
    )
    const future = archiveProof(
      {
        tenantId: "tenant-a",
        proofId: "future",
        proofJson: JSON.stringify(proof({ id: "future" })),
        source: "node-1",
        retentionUntil: new Date(NOW.getTime() + 1000).toISOString(),
        ingestedAt: NOW.toISOString(),
      },
      s,
    )
    if (expired.kind !== "ARCHIVED" || held.kind !== "ARCHIVED" || future.kind !== "ARCHIVED") {
      throw new Error("fixture")
    }
    placeLegalHold("tenant-a", held.record.archiveId, s)

    const sweep = applyRetention("tenant-a", s, NOW)
    expect(sweep.deleted).toBe(1)
    expect(sweep.retainedByHold).toBe(1)
    expect(s.get("tenant-a", expired.record.archiveId)).toBeUndefined()
    expect(s.get("tenant-a", held.record.archiveId)).toBeDefined()
    expect(s.get("tenant-a", future.record.archiveId)).toBeDefined()
  })

  it("appends chain-of-custody and isolates archives per tenant", () => {
    const s = store()
    const result = archiveProof(
      {
        tenantId: "tenant-a",
        proofId: "run_01J",
        proofJson: JSON.stringify(proof()),
        source: "node-1",
        retentionUntil: "2099-01-01T00:00:00.000Z",
      },
      s,
    )
    if (result.kind !== "ARCHIVED") throw new Error("fixture")
    appendCustody("tenant-a", result.record.archiveId, { who: "auditor-1", action: "EXPORTED", at: NOW.toISOString() }, s)
    expect(s.get("tenant-a", result.record.archiveId)?.custody).toHaveLength(1)
    expect(s.search("tenant-b", {})).toHaveLength(0)
  })
})
