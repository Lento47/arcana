# Free quality routing algorithm

**Status:** implemented (proxy `free-routing.ts`)  
**Scale target:** ~5k free MAU (product currently smaller)

## Thesis

> Quality over quantity. Expand tokens only when free turns are healthy.  
> Free users never default to paid Aihubmix. Chinese 1M models: free if `$0`/`:free`, else Pro cheap long-context.

## Layers

1. **Product caps** — 10 turns / 60m / week, 200k weekly tokens  
2. **Rate limits** — free user 8/min, free IP 15/min, global soft ~120 free LLM req/min (isolate)  
3. **Model pool** — classified from OpenRouter catalog, quality-ranked  
4. **Progressive budget** — lean → standard → expanded  
5. **Free→free failover** — ranked list; prefer free-long when request is large  

## Progressive budgets

| Tier | Max in | Max out | When |
|------|--------|---------|------|
| lean | 6 144 | 1 536 | first turns, failures, token pressure |
| standard | 10 240 | 2 048 | steady mid-session |
| expanded | 14 336 | 2 048 | healthy mid-session, budget left |

Even expanded stays << 1M. Long free models are for **better SELECT**, not dumping 1M tokens.

## Classification

- `free` — `:free` or $0/$0 pricing  
- `freeLong` — free + context ≥ 256k  
- `paidLongChinese` — non-free + Chinese family + long/mega context (Pro reference)  

Quality score: free + coding + family priors + context (diminishing) − embed/image noise.

## API

- `GET /v1/free/models` — pool snapshot + policy  
- `POST /v1/free/models/refresh` — reclassify catalog into KV  
- Response headers: `X-Arcana-Free-Budget-*`, `X-Arcana-Free-Model*`, `X-Arcana-Free-Global-Load`

## 5k-user math (order of magnitude)

- 5k free × 10 turns/week ≈ 50k turns/week ≈ ~7k turns/day  
- Average free LLM RPS low; peak controlled by soft global RPM + per-user 8/min  
- Failover spreads load across free endpoints  

## Related

- `docs/free-usage-weekly-session-plan.md`  
- Session plan: free quality via context density  
- `packages/engine/src/error` — `ARC_FREE_*`  
