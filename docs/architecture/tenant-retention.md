# Tenant Data Lifecycle and Retention

## Data Creation and Scoping

Every record in the Arcana control plane is tenant-scoped. The `SqliteTenantStore` (and all sibling stores — identity, fleet, approvals, audit archive, etc.) carries a `tenant_id` column on every table and filters by it in every query. Cross-tenant reads are structurally impossible at the SQLite level.

## Tenant Deletion Semantics

`SqliteTenantStore.deleteTenant(tenantId)` cascade-deletes two tables:

| Table | What is deleted |
|-------|----------------|
| `tenant_organizations` | The organization row for the tenant |
| `tenant_records` | All tenant-scoped records (workspaces, users, nodes, policy bundles, approval queues, proof archives, etc.) |

After deletion, the tenant's organization row and all records are unreachable via any API or store method. The data remains in the SQLite WAL file until the database is vacuumed or the file is removed, but no query returns it.

## What Is NOT Cascade-Deleted

- The SQLite database file itself (`control-plane.db`) persists and is reused across tenants.
- Other tenants' data in the same database is untouched.
- The `stateCache` in `control-state.ts` retains a reference to the `ControlPlaneState` for the directory; subsequent requests for the deleted tenant will find no organization or records, but the cache entry is not evicted.

## Audit/Proof Archive Retention

The `AuditArchiveStore` stores proof records with a `retentionUntil` timestamp and a `legalHold` flag. The `applyRetention` sweep deletes records past their retention date unless `legalHold` is `true`. Proof fingerprints (SHA-256 of canonicalized proof JSON) survive deletion — deletion cannot falsify a surviving proof's fingerprint.

## Legal Hold Interaction

- `placeLegalHold(tenantId, archiveId)` sets `legalHold = true` on an archive record, preventing it from being deleted by the retention sweep.
- `removeLegalHold(tenantId, archiveId)` clears the hold, making the record eligible for deletion on the next sweep.
- Legal holds are tenant-scoped: a hold on tenant A's record does not affect tenant B's records.
- When a tenant is deleted via `deleteTenant`, all archive records for that tenant are cascade-deleted from `tenant_records`. Legal holds on those records are moot.

## Retention of Audit/Proof Archives After Tenant Deletion

Tenant deletion removes all archive records for that tenant from the `tenant_records` table. The `applyRetention` sweep operates per-tenant and cannot recover deleted tenant data. Audit archives for surviving tenants are unaffected.