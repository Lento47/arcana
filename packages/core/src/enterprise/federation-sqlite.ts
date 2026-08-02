/**
 * F8: SQLite federation store.
 */

import { Database } from "bun:sqlite"
import type {
  FederationAgreement,
  FederationStore,
  ProofExchangeRecord,
  RevocationPropagationRecord,
} from "./federation"

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS federation_agreements (
  agreement_id TEXT PRIMARY KEY,
  version INTEGER NOT NULL,
  org_a TEXT NOT NULL,
  org_b TEXT NOT NULL,
  audience_restrictions_json TEXT NOT NULL,
  valid_from TEXT NOT NULL,
  valid_to TEXT NOT NULL,
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS federation_exchanges (
  agreement_id TEXT NOT NULL,
  org_id TEXT NOT NULL,
  remote_proof_id TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  exchanged_at TEXT NOT NULL,
  origin TEXT NOT NULL,
  PRIMARY KEY (org_id, remote_proof_id)
);

CREATE TABLE IF NOT EXISTS federation_revocations (
  agreement_id TEXT NOT NULL,
  org_id TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  propagated_at TEXT NOT NULL,
  PRIMARY KEY (org_id, subject_id, propagated_at)
);
`

export class SqliteFederationStore implements FederationStore {
  private readonly db: Database

  constructor(db: Database) {
    this.db = db
    this.db.exec(SCHEMA_SQL)
  }

  putAgreement(agreement: FederationAgreement): void {
    this.db
      .query(
        `INSERT OR REPLACE INTO federation_agreements (
          agreement_id, version, org_a, org_b, audience_restrictions_json,
          valid_from, valid_to, status
        ) VALUES (
          $agreementId, $version, $orgA, $orgB, $audienceRestrictionsJson,
          $validFrom, $validTo, $status
        )`,
      )
      .run({
        $agreementId: agreement.agreementId,
        $version: agreement.version,
        $orgA: agreement.orgA,
        $orgB: agreement.orgB,
        $audienceRestrictionsJson: JSON.stringify(agreement.audienceRestrictions),
        $validFrom: agreement.validFrom,
        $validTo: agreement.validTo,
        $status: agreement.status,
      })
  }

  getAgreement(agreementId: string): FederationAgreement | undefined {
    const row = this.db
      .query(`SELECT * FROM federation_agreements WHERE agreement_id = $agreementId`)
      .get({ $agreementId: agreementId }) as
      | {
          agreement_id: string
          version: number
          org_a: string
          org_b: string
          audience_restrictions_json: string
          valid_from: string
          valid_to: string
          status: string
        }
      | null
    return row
      ? {
          agreementId: row.agreement_id,
          version: row.version,
          orgA: row.org_a,
          orgB: row.org_b,
          audienceRestrictions: JSON.parse(row.audience_restrictions_json) as string[],
          validFrom: row.valid_from,
          validTo: row.valid_to,
          status: row.status as FederationAgreement["status"],
        }
      : undefined
  }

  recordExchange(exchange: ProofExchangeRecord): void {
    this.db
      .query(
        `INSERT OR REPLACE INTO federation_exchanges (
          agreement_id, org_id, remote_proof_id, fingerprint, exchanged_at, origin
        ) VALUES ($agreementId, $orgId, $remoteProofId, $fingerprint, $exchangedAt, $origin)`,
      )
      .run({
        $agreementId: exchange.agreementId,
        $orgId: exchange.orgId,
        $remoteProofId: exchange.remoteProofId,
        $fingerprint: exchange.fingerprint,
        $exchangedAt: exchange.exchangedAt,
        $origin: exchange.origin,
      })
  }

  recordRevocationPropagation(record: RevocationPropagationRecord): void {
    this.db
      .query(
        `INSERT OR REPLACE INTO federation_revocations (
          agreement_id, org_id, subject_id, reason, propagated_at
        ) VALUES ($agreementId, $orgId, $subjectId, $reason, $propagatedAt)`,
      )
      .run({
        $agreementId: record.agreementId,
        $orgId: record.orgId,
        $subjectId: record.subjectId,
        $reason: record.reason,
        $propagatedAt: record.propagatedAt,
      })
  }

  exchanges(orgId: string): ProofExchangeRecord[] {
    const rows = this.db
      .query(`SELECT * FROM federation_exchanges WHERE org_id = $orgId ORDER BY exchanged_at ASC`)
      .all({ $orgId: orgId }) as unknown as Array<{
      agreement_id: string
      remote_proof_id: string
      fingerprint: string
      exchanged_at: string
      origin: string
    }>
    return rows.map((row) => ({
      agreementId: row.agreement_id,
      orgId,
      remoteProofId: row.remote_proof_id,
      fingerprint: row.fingerprint,
      exchangedAt: row.exchanged_at,
      origin: row.origin,
    }))
  }

  revocations(orgId: string): RevocationPropagationRecord[] {
    const rows = this.db
      .query(`SELECT * FROM federation_revocations WHERE org_id = $orgId ORDER BY propagated_at ASC`)
      .all({ $orgId: orgId }) as unknown as Array<{
      agreement_id: string
      subject_id: string
      reason: string
      propagated_at: string
    }>
    return rows.map((row) => ({
      agreementId: row.agreement_id,
      orgId,
      subjectId: row.subject_id,
      reason: row.reason,
      propagatedAt: row.propagated_at,
    }))
  }
}
