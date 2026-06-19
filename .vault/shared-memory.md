# Shared Memory

Cross-user knowledge sync for Arcana Enterprise. Allows team members to share and merge learned facts across sessions.

## Architecture

```
arcana-agent → HTTP POST /api/team/:orgId/memory/sync → MemorySync.mergeFacts (in-memory)
                   GET  /api/team/:orgId/memory/facts → MemorySync.getOrgFacts
```

- **Push**: On `/exit`, agent POSTs new facts (key, value, confidence, source, timestamp, author) to the enterprise API.
- **Pull**: On startup (non-free tier), agent GETs shared facts from enterprise API and injects them as `<shared-knowledge>` context.
- **Merge**: Timestamp-based conflict resolution — latest timestamp wins; same-timestamp conflicts are kept (existing retained).

## Files

| File | Role |
|------|------|
| `packages/enterprise/src/core/memory-sync.ts` | In-memory fact store, merge logic |
| `packages/enterprise/src/routes/api/[...path].ts` | HTTP routes: `POST .../memory/sync`, `GET .../memory/facts` |
| `packages/arcana/src/cli/cmd/run.ts` | Agent startup pull (l.162-177), exit push (l.272-296) |

## Merge Rules

1. If incoming fact has a newer `updated_at` → replace existing.
2. If same `updated_at` but different value → conflict (existing kept, conflict counted).
3. If same key and same or older timestamp → ignored.

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `ARCANA_LICENSE_TIER` | Must be non-"free" to enable sync |
| `ARCANA_ORG_ID` | Org namespace for fact isolation (default: "default") |
| `ARCANA_USER` | User identifier stamped on pushed facts |

## Future

- Replace in-memory Map with Durable Objects / D1 for persistence across deploys.
- Add fact staleness TTL and automatic garbage collection.
- Expose conflict resolution UI in team dashboard.
