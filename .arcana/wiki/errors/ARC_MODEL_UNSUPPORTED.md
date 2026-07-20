---
code: ARC_MODEL_UNSUPPORTED
type: model
http: 400
retryable: false
tags: [arcana, errors, model, aihubmix, azure]
aliases: [unsupported operation, tid azure]
updated: 2026-07-20
---

# ARC_MODEL_UNSUPPORTED

## User sees

> This model cannot run that operation through Arcana right now.

Recovery: switch chat model; use image tool for images; `or/` for OpenRouter.

## Internal meaning

Upstream rejected the **operation** (not auth). Common sources:

- Azure OpenAI via Aihubmix: `The requested operation is unsupported. (tid: …)`
- Responses-only knobs on chat/completions
- Image-only models used as chat

## Map signals

- `/unsupported|requested operation|not supported/i`
- HTTP 400 from aihubmix / azure-style tid

## Operator checklist

1. Check `internal.model` and `internal.provider`
2. Confirm failover list (`providersAttempted`)
3. Prefer OpenRouter chat model (`openai/gpt-4o-mini`)
4. If image intent → `POST /v1/images/generations` / `image_generate`

## Related

- [[ARC_MODEL_NOT_FOUND]]
- [[ARC_ALL_PROVIDERS_FAILED]]
- [[ARC_PROVIDER_BALANCE]]
