import type { DatabaseMigration } from "../migration"

const up = `
ALTER TABLE session ADD COLUMN org_id TEXT;
CREATE INDEX IF NOT EXISTS session_org_idx ON session(org_id);
`

const down = `
DROP INDEX IF EXISTS session_org_idx;
`

export default { name: "20260619000000_add_session_org_id", up, down } satisfies DatabaseMigration.Migration
