# Arcana Error Taxonomy

> **Audience:** internal (engineering, support, ops)  
> **User-facing surface:** never show raw provider JSON, Azure `tid:`, or vendor brand errors in TUI/chat/web.

## Dual layer

| Layer | Fields | Who sees it |
|-------|--------|-------------|
| **User** | `error.message`, `error.recovery`, `error.code` (short) | End user in TUI / CLI / web |
| **Internal** | `internal.*` (provider, model, upstreamStatus, upstreamMessage, tid) | Logs, support, debug mode, wiki |

Wire shape (proxy + preferred client):

```json
{
  "error": {
    "code": "ARC_MODEL_UNSUPPORTED",
    "type": "model",
    "message": "This model cannot run that operation through Arcana right now.",
    "recovery": ["Switch to a standard chat model…"],
    "retryable": false
  },
  "internal": {
    "provider": "aihubmix",
    "providersAttempted": ["aihubmix", "openrouter"],
    "upstreamStatus": 400,
    "upstreamMessage": "The requested operation is unsupported. (tid: …)",
    "model": "gpt-4o-mini",
    "tid": "20260720…"
  }
}
```

## Stable codes

| Code | Type | Meaning | Typical HTTP |
|------|------|---------|--------------|
| `ARC_AUTH_REQUIRED` | auth | Missing session/key | 401 |
| `ARC_AUTH_INVALID` | auth | Rejected/expired token | 401 |
| `ARC_CREDITS_EXHAUSTED` | quota | **Arcana** ledger empty | 402 |
| `ARC_QUOTA_DAILY` | quota | Plan daily cap | 429 |
| `ARC_RATE_LIMITED` | rate_limit | Burst / per-min limit | 429 |
| `ARC_MODEL_UNSUPPORTED` | model | Operation not allowed for model/API | 400 |
| `ARC_MODEL_NOT_FOUND` | model | Unknown model id on all routes | 404 |
| `ARC_PROVIDER_UNAVAILABLE` | provider | Upstream down / no channel | 502 |
| `ARC_PROVIDER_BALANCE` | quota | **Upstream vendor** out of money (not user Arcana credits) | 502 |
| `ARC_CONTEXT_OVERFLOW` | request | Prompt too large | 400 |
| `ARC_NETWORK` | network | Transport failure | 502 |
| `ARC_REQUEST_INVALID` | request | Bad client payload | 400 |
| `ARC_ALL_PROVIDERS_FAILED` | provider | Failover exhausted | 502 |
| `ARC_IMAGE_FAILED` | provider | Image gen path failed | 502 |
| `ARC_INTERNAL` | internal | Unclassified Arcana fault | 500 |

## Mapping rules (summary)

Source of truth for pure functions:

- Monorepo: `packages/engine/src/error/map-upstream.ts`
- Proxy: `classifyUpstream` / `arcanaErrorResponse` in `arcana-proxy/src/index.ts`

Examples:

| Upstream signal | Arcana code |
|-----------------|-------------|
| `insufficient_balance` (proxy) | `ARC_CREDITS_EXHAUSTED` |
| Aihubmix “recharge your account” | `ARC_PROVIDER_BALANCE` |
| Azure “operation is unsupported” + tid | `ARC_MODEL_UNSUPPORTED` |
| OpenRouter “No endpoints found” | `ARC_MODEL_NOT_FOUND` |
| `no_available_channel` | `ARC_PROVIDER_UNAVAILABLE` |
| `daily_limit_reached` | `ARC_QUOTA_DAILY` |

## Client display

- TUI / session: `MessageV2.fromError` maps proxy/API bodies via `mapUpstreamToArcanaError` → `formatUserFacing`.
- Metadata keeps `arcanaCode`, `tid`, `upstreamMessage` for support without cluttering the body.
- Never paste `internal.raw` into chat replies.

## Support workflow

1. User reports code (`ARC_*`) from the message.
2. Operator looks up wiki note under `.arcana/wiki/errors/ARC_*.md`.
3. If needed, request `internal.tid` / provider from logs (not required from user).

## Related

- Resolution UX: `docs/resolution-and-recovery.md`
- Obsidian vault notes: `.arcana/wiki/errors/`
