/**
 * F10: Regional storage and CMK store backed by SQLite.
 *
 * The region registry and CMK registry are pure in-process state. No real KMS
 * or cloud SDK calls are made — these are policy stores that the governance
 * enforcement functions consult.
 */

import { Database } from "bun:sqlite"
import type {
  DataClassification,
  RegionRegistry,
  CmkReference,
  CmkRegistry,
} from "./data-governance"

const REGION_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS region_data_classes (
  region TEXT NOT NULL,
  data_class TEXT NOT NULL,
  PRIMARY KEY (region, data_class)
);
`

const CMK_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS cmk_keys (
  key_id TEXT NOT NULL,
  region TEXT NOT NULL,
  rotation_status TEXT NOT NULL,
  verified_at TEXT NOT NULL,
  PRIMARY KEY (key_id)
);
`

export class SqliteRegionRegistry implements RegionRegistry {
  private readonly db: Database

  constructor(db: Database) {
    this.db = db
    this.db.exec(REGION_SCHEMA_SQL)
  }

  setAllowedClasses(region: string, dataClasses: DataClassification[]): void {
    this.db
      .query("DELETE FROM region_data_classes WHERE region = $region")
      .run({ $region: region })
    for (const dataClass of dataClasses) {
      this.db
        .query(
          "INSERT INTO region_data_classes (region, data_class) VALUES ($region, $dataClass)",
        )
        .run({ $region: region, $dataClass: dataClass })
    }
  }

  getAllowedClasses(region: string): DataClassification[] {
    const rows = this.db
      .query("SELECT data_class FROM region_data_classes WHERE region = $region ORDER BY data_class")
      .all({ $region: region }) as { data_class: string }[]
    return rows.map((r) => r.data_class as DataClassification)
  }

  hasAllowedClass(region: string, dataClass: DataClassification): boolean {
    const row = this.db
      .query("SELECT 1 FROM region_data_classes WHERE region = $region AND data_class = $dataClass LIMIT 1")
      .get({ $region: region, $dataClass: dataClass }) as { data_class: string } | null
    return row !== null
  }
}

export class SqliteCmkRegistry implements CmkRegistry {
  private readonly db: Database

  constructor(db: Database) {
    this.db = db
    this.db.exec(CMK_SCHEMA_SQL)
  }

  put(key: CmkReference): void {
    this.db
      .query(
        `INSERT OR REPLACE INTO cmk_keys (key_id, region, rotation_status, verified_at)
         VALUES ($keyId, $region, $rotationStatus, $verifiedAt)`,
      )
      .run({
        $keyId: key.keyId,
        $region: key.region,
        $rotationStatus: key.rotationStatus,
        $verifiedAt: key.verifiedAt,
      })
  }

  get(keyId: string): CmkReference | undefined {
    const row = this.db
      .query("SELECT * FROM cmk_keys WHERE key_id = $keyId LIMIT 1")
      .get({ $keyId: keyId }) as CmkRow | null
    return row ? mapCmkRow(row) : undefined
  }

  listByRegion(region: string): CmkReference[] {
    const rows = this.db
      .query("SELECT * FROM cmk_keys WHERE region = $region ORDER BY verified_at DESC")
      .all({ $region: region }) as CmkRow[]
    return rows.map(mapCmkRow)
  }

  hasActiveCmk(region: string): boolean {
    const row = this.db
      .query(
        `SELECT 1 FROM cmk_keys
         WHERE region = $region AND rotation_status = 'ACTIVE'
         LIMIT 1`,
      )
      .get({ $region: region }) as { key_id: string } | null
    return row !== null
  }
}

type CmkRow = {
  key_id: string
  region: string
  rotation_status: string
  verified_at: string
}

function mapCmkRow(row: CmkRow): CmkReference {
  return {
    keyId: row.key_id,
    region: row.region,
    rotationStatus: row.rotation_status as CmkReference["rotationStatus"],
    verifiedAt: row.verified_at,
  }
}