/**
 * D-8B: SQLite Proof Batch Ledger
 *
 * Durable control-plane storage for registered node proof batches.
 * Idempotent by PRIMARY KEY (node_id, batch_root); restart-safe; supports
 * node/server hash reconciliation.
 */

import { Database } from "bun:sqlite"
import type { ProofBatchLedger, RegisteredProofBatch } from "./proof-registration"

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS proof_batches (
  node_id TEXT NOT NULL,
  batch_root TEXT NOT NULL,
  trust_domain TEXT NOT NULL,
  node_key_epoch INTEGER NOT NULL,
  first_local_sequence INTEGER NOT NULL,
  last_local_sequence INTEGER NOT NULL,
  previous_batch_root TEXT,
  event_merkle_root TEXT NOT NULL,
  run_proof_hashes_json TEXT NOT NULL,
  policy_sequence INTEGER NOT NULL,
  policy_digest TEXT NOT NULL,
  revocation_sequence INTEGER NOT NULL,
  revocation_digest TEXT NOT NULL,
  emergency_epoch INTEGER NOT NULL,
  issued_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  signed_envelope TEXT NOT NULL,
  PRIMARY KEY (node_id, batch_root)
);

CREATE INDEX IF NOT EXISTS proof_batches_node_seq
  ON proof_batches (node_id, first_local_sequence);
`

type ProofBatchRow = {
  node_id: string
  batch_root: string
  trust_domain: string
  node_key_epoch: number
  first_local_sequence: number
  last_local_sequence: number
  previous_batch_root: string | null
  event_merkle_root: string
  run_proof_hashes_json: string
  policy_sequence: number
  policy_digest: string
  revocation_sequence: number
  revocation_digest: string
  emergency_epoch: number
  issued_at: string
  received_at: string
  signed_envelope: string
}

function mapRow(row: ProofBatchRow): RegisteredProofBatch {
  return {
    batchRoot: row.batch_root,
    trustDomain: row.trust_domain,
    nodeId: row.node_id,
    nodeKeyEpoch: row.node_key_epoch,
    firstLocalSequence: row.first_local_sequence,
    lastLocalSequence: row.last_local_sequence,
    previousBatchRoot: row.previous_batch_root ?? undefined,
    eventMerkleRoot: row.event_merkle_root,
    runProofHashes: JSON.parse(row.run_proof_hashes_json) as string[],
    policySequence: row.policy_sequence,
    policyDigest: row.policy_digest,
    revocationSequence: row.revocation_sequence,
    revocationDigest: row.revocation_digest,
    emergencyEpoch: row.emergency_epoch,
    issuedAt: row.issued_at,
    receivedAt: row.received_at,
    signedEnvelope: row.signed_envelope,
  }
}

export class SqliteProofBatchLedger implements ProofBatchLedger {
  private readonly db: Database

  constructor(db: Database) {
    this.db = db
    this.db.exec(SCHEMA_SQL)
  }

  append(record: RegisteredProofBatch): void {
    this.db
      .query(
        `INSERT OR IGNORE INTO proof_batches (
          node_id, batch_root, trust_domain, node_key_epoch,
          first_local_sequence, last_local_sequence, previous_batch_root,
          event_merkle_root, run_proof_hashes_json,
          policy_sequence, policy_digest,
          revocation_sequence, revocation_digest, emergency_epoch,
          issued_at, received_at, signed_envelope
        ) VALUES (
          $nodeId, $batchRoot, $trustDomain, $nodeKeyEpoch,
          $firstLocalSequence, $lastLocalSequence, $previousBatchRoot,
          $eventMerkleRoot, $runProofHashesJson,
          $policySequence, $policyDigest,
          $revocationSequence, $revocationDigest, $emergencyEpoch,
          $issuedAt, $receivedAt, $signedEnvelope
        )`,
      )
      .run({
        $nodeId: record.nodeId,
        $batchRoot: record.batchRoot,
        $trustDomain: record.trustDomain,
        $nodeKeyEpoch: record.nodeKeyEpoch,
        $firstLocalSequence: record.firstLocalSequence,
        $lastLocalSequence: record.lastLocalSequence,
        $previousBatchRoot: record.previousBatchRoot ?? null,
        $eventMerkleRoot: record.eventMerkleRoot,
        $runProofHashesJson: JSON.stringify(record.runProofHashes),
        $policySequence: record.policySequence,
        $policyDigest: record.policyDigest,
        $revocationSequence: record.revocationSequence,
        $revocationDigest: record.revocationDigest,
        $emergencyEpoch: record.emergencyEpoch,
        $issuedAt: record.issuedAt,
        $receivedAt: record.receivedAt,
        $signedEnvelope: record.signedEnvelope,
      })
  }

  findBatch(nodeId: string, batchRoot: string): RegisteredProofBatch | undefined {
    const row = this.db
      .query(`SELECT * FROM proof_batches WHERE node_id = $nodeId AND batch_root = $batchRoot`)
      .get({ $nodeId: nodeId, $batchRoot: batchRoot }) as ProofBatchRow | null
    return row ? mapRow(row) : undefined
  }

  lastBatch(nodeId: string): RegisteredProofBatch | undefined {
    const row = this.db
      .query(
        `SELECT * FROM proof_batches WHERE node_id = $nodeId
         ORDER BY last_local_sequence DESC LIMIT 1`,
      )
      .get({ $nodeId: nodeId }) as ProofBatchRow | null
    return row ? mapRow(row) : undefined
  }

  batchesForNode(nodeId: string): RegisteredProofBatch[] {
    const rows = this.db
      .query(
        `SELECT * FROM proof_batches WHERE node_id = $nodeId
         ORDER BY first_local_sequence ASC`,
      )
      .all({ $nodeId: nodeId }) as unknown as ProofBatchRow[]
    return rows.map(mapRow)
  }
}
