/**
 * Open the Arcana SQLite store for offline epistemic CLI tools (replay / revalidation).
 *
 * Uses bun:sqlite (always available in the engine runtime) instead of better-sqlite3
 * and the nonexistent @examples/infra-lib package that broke production builds.
 */
import { Database } from "bun:sqlite"
import { Database as ArcanaDatabase } from "@arcana/core/database/database"

export type ReplayDatabase = Database

/** Open the primary Arcana DB read-only for audit/replay CLIs. */
export function openReplayDatabase(readonly = true): Database {
  const dbPath = ArcanaDatabase.path()
  return new Database(dbPath, { readonly, create: false })
}
