---
tags: [trust, confidence, model-reliability, learning]
date: 2026-06-21
source: session-hardening-15-failure-modes
---

# Confidence Decay Pipeline — Model Trust Tracking

**Rule:** Track model confidence vs actual outcomes. When a model repeatedly tags actions HIGH but they fail, decay its baseline confidence. Future plans from that model default to `[CONF:LOW]*` (star = baseline-adjusted, not model-claimed).

**Scope:** `packages/engine/src/session/learning.ts` — `EXTRACTION_PROMPT`, `ConfidenceDecayEntry`, `updateModelTrust()`, `isModelLowConfidence()`.

**Reason:** Models can spoof confidence — always claiming HIGH to bypass scrutiny. Without independent verification baseline, there's no defense against systematic overconfidence. Research on appropriate reliance shows people stop trusting automation when they can't calibrate when to rely on it.

## Implementation

### Data Flow

1. After session completion, `EXTRACTION_PROMPT` asks the model to self-identify overconfidence cases
2. Model outputs `confidence_decay` array with `{ modelId, providerId, claim, actual }`
3. `updateModelTrust()` reads/writes `.arcana/learned/model-trust.md`
4. `isModelLowConfidence()` checks if mismatch count > 3
5. If true, `footer.plan.tsx` renders `[CONF:LOW]*` instead of model-claimed confidence

### model-trust.md Format

```markdown
| Model | Provider | Mismatches | Low Confidence Default |
|---|---|---|---|
| claude-sonnet-4-20250514 | anthropic | 5 | true |
| gpt-5.1 | openai | 2 | false |
```

### Confidence Levels

| Tag | Meaning | Visual |
|---|---|---|
| `[CONF:HIGH]` | Model is confident — default, no tag shown | Clean line |
| `[CONF:MED]` | Model has some uncertainty | Muted color |
| `[CONF:LOW]` | Model is unsure — flagged for review | Warning color |
| `[CONF:LOW]*` | Baseline-adjusted — model history shows unreliability | Warning color + star |

## Tab Filter

Pressing `Tab` in [[ghost-preview-system]] toggles a filter showing only `[CONF:LOW]` steps.

## History

- 2026-06-21: Implemented as failure mode #14 in the 15-mode hardening pass. Built on top of existing `EXTRACTION_PROMPT` infrastructure.

## Related

- [[ghost-preview-system]] — Confidence tags rendered in ghost plan
- [[negative-memory-system]] — Anti-patterns are another form of learned distrust
- [[transactional-engineering-skill]] — Skill-level confidence calibration guidance
