---
tags: [arcana, errors, wiki, index]
type: moc
status: active
updated: 2026-07-20
---

# Arcana Errors (MOC)

Internal map of support / engineering notes for `ARC_*` codes.

> **User principle:** never show raw provider errors. Users see Arcana voice + recovery. Operators use these notes + `internal` fields.

## Taxonomy

- Spec: [[../../../.hermes/docs/arcana/docs/architecture/arcana-error-taxonomy|arcana-error-taxonomy]]
- Code: `packages/engine/src/error/`
- Proxy: `arcanaErrorResponse` in arcana-proxy

## Codes

| Code | Note |
|------|------|
| [[ARC_MODEL_UNSUPPORTED]] | Azure / aihubmix unsupported operation |
| [[ARC_PROVIDER_BALANCE]] | Upstream vendor balance (not Arcana credits) |
| [[ARC_CREDITS_EXHAUSTED]] | User Arcana ledger empty |
| [[ARC_MODEL_NOT_FOUND]] | Model id missing on routes |
| [[ARC_ALL_PROVIDERS_FAILED]] | Failover exhausted |
| [[ARC_RATE_LIMITED]] | Burst / per-minute |
| [[ARC_QUOTA_DAILY]] | Daily plan cap |
| [[ARC_AUTH_REQUIRED]] / [[ARC_AUTH_INVALID]] | Login / key |

## Properties convention

Each error note uses YAML frontmatter:

```yaml
---
code: ARC_MODEL_UNSUPPORTED
type: model
http: 400
retryable: false
tags: [arcana, errors, model]
user_message: "…"
---
```

Link from session logs: `arcanaCode` metadata field.
