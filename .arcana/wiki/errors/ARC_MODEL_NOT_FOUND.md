---
code: ARC_MODEL_NOT_FOUND
type: model
http: 404
retryable: false
tags: [arcana, errors, model]
updated: 2026-07-20
---

# ARC_MODEL_NOT_FOUND

## User sees

> That model id is not available on any configured route.

## Map signals

- OpenRouter `No endpoints found for …`
- `not a valid model ID`
- `model_not_found`

## Operator checklist

1. Remap aihubmix bare ids via `toOpenRouterModel`
2. Update alias table if catalog slug drifts
