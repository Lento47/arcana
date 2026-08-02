/**
 * D-6B-T: SQLite sync replay store.
 *
 * Stores every accepted sync response keyed by requestId. A retry with the
 * same requestId receives the identical stored response (idempotent); a
 * different digest for the same requestId is a security conflict.
 */

import { Database } from "bun:sqlite"
import { checkReplay, SYNC_REPLAY_TABLE_SQL, type SyncResponseContext } from "./sync-auth"

const RESPONSE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS sync_responses (
  request_id TEXT PRIMARY KEY,
  server_identity TEXT NOT NULL,
  response_json TEXT NOT NULL,
  response_digest TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  received_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_requests (
  request_id TEXT PRIMARY KEY,
  client_nonce TEXT NOT NULL,
  received_at TEXT NOT NULL
);
`

export type SyncReplayLookup = {
  serverIdentity: string
  requestId: string
  clientNonce: string
  responseDigest: string
  responseJson: string
  expiresAt: string
  receivedAt: string
}

export class SqliteSyncReplayStore {
  private readonly db: Database

  constructor(db: Database) {
    this.db = db
    this.db.exec(SYNC_REPLAY_TABLE_SQL)
    this.db.exec(RESPONSE_TABLE_SQL)
  }

  /** Record a response so an idempotent retry can be answered identically. */
  record(
    context: SyncResponseContext,
    responseDigest: string,
    responseJson: string,
    receivedAt: Date = new Date(),
  ): void {
    this.db
      .query(
        `INSERT OR REPLACE INTO sync_responses (
          request_id, server_identity, response_json, response_digest, expires_at, received_at
        ) VALUES ($requestId, $serverIdentity, $responseJson, $responseDigest, $expiresAt, $receivedAt)`,
      )
      .run({
        $requestId: context.requestId,
        $serverIdentity: context.serverIdentity,
        $responseJson: responseJson,
        $responseDigest: responseDigest,
        $expiresAt: context.expiresAt,
        $receivedAt: receivedAt.toISOString(),
      })
  }

  recordRequest(requestId: string, clientNonce: string, receivedAt: Date = new Date()): void {
    this.db
      .query(
        `INSERT OR IGNORE INTO sync_requests (request_id, client_nonce, received_at)
         VALUES ($requestId, $clientNonce, $receivedAt)`,
      )
      .run({
        $requestId: requestId,
        $clientNonce: clientNonce,
        $receivedAt: receivedAt.toISOString(),
      })
  }

  findRequest(requestId: string): { clientNonce: string; receivedAt: string } | undefined {
    const row = this.db
      .query(`SELECT * FROM sync_requests WHERE request_id = $requestId`)
      .get({ $requestId: requestId }) as
      | { request_id: string; client_nonce: string; received_at: string }
      | null
    return row
      ? { clientNonce: row.client_nonce, receivedAt: row.received_at }
      : undefined
  }

  find(requestId: string): SyncReplayLookup | undefined {
    const row = this.db
      .query(`SELECT * FROM sync_responses WHERE request_id = $requestId`)
      .get({ $requestId: requestId }) as
      | {
          request_id: string
          server_identity: string
          response_json: string
          response_digest: string
          expires_at: string
          received_at: string
        }
      | null
    return row
      ? {
          serverIdentity: row.server_identity,
          requestId: row.request_id,
          clientNonce: "",
          responseDigest: row.response_digest,
          responseJson: row.response_json,
          expiresAt: row.expires_at,
          receivedAt: row.received_at,
        }
      : undefined
  }

  /**
   * Classify an incoming response against the stored ledger:
   * OK (fresh), IDEMPOTENT (same digest), SECURITY_CONFLICT (different
   * digest for the same requestId).
   */
  classify(context: SyncResponseContext, responseDigest: string, now: Date) {
    const existing = this.find(context.requestId)
    const result = checkReplay(
      context,
      responseDigest,
      existing
        ? [
            {
              serverIdentity: existing.serverIdentity,
              requestId: existing.requestId,
              clientNonce: context.clientNonce,
              responseDigest: existing.responseDigest,
              expiresAt: existing.expiresAt,
              receivedAt: existing.receivedAt,
            },
          ]
        : [],
      now,
    )
    return {
      ...result,
      existing: existing
        ? {
            responseDigest: existing.responseDigest,
            responseJson: existing.responseJson,
          }
        : undefined,
    }
  }
}
