# Arcana Performance Optimization Foundation

Performance work in Arcana has two tracks that must stay distinct:

1. **Foundation contracts** (this document's original slice) — pure budgets, scoring, and policies measured in shadow mode before enforcement.
2. **Shipped runtime surfaces** — tool fan-out bounds, path safety, and cheap TUI projection that already change live behavior.

Neither track may reduce governance, traceability, security, or TUI correctness.

The performance direction follows the token-kernel research: tokens are a governed kernel resource, and optimization should happen through preflight accounting, admission decisions, actual-usage reconciliation, context discipline, cache-aware layout, and measurable runtime budgets.

## Scope split: TUI vs runtime performance

```txt
TUI performance
  stable spine projections, deterministic summaries
  bounded panel/diff rendering
  cheap local hints (activity poll ~220ms)
  never invent RunProof or verifier truth

Runtime performance
  bound tool fan-out and path races
  batch budgets + synthesis caps
  measure token/context/candidate efficiency (flags first)
  never bypass permission, mutation, verifier, RunProof, or rollback
```

**Out of scope for performance work:** TUI inventing kernel truth; "make the UI prettier" without projection discipline; any optimization that drops required evidence or governance.

Cross-links:

- Tool parallelization: [ADR 0002 — Tool Batch Scheduler](../adr/0002-tool-batch-scheduler.md)
- Living command-spine surface: [command-spine-ui.md](./command-spine-ui.md)
- Durable execution Phase 3: [arcana-durable-execution-memory-context-continuity.md](./arcana-durable-execution-memory-context-continuity.md)

---

## Shipped runtime performance surfaces

These **already change runtime behavior** (not foundation-only, not shadow-only). They live on product paths rather than a single global "perf flag."

| Surface | What it does | Where |
|---------|----------------|-------|
| Engine tool admission | Capability pools for concurrent tools | `packages/engine/src/tool/batch/` |
| Path locks | Serialize same-path writes; allow independent writes up to write pool | same |
| Agent tool batch | Classify → path DAG waves → pools → budgets → synthesis | `packages/arcana/src/agent/tool-batch/` |
| Batch allowlist + recursive auth | Nested tools re-authorize (I04); size/fan-out caps (I20) | AgentRunner `executeAuthorizedTool` |
| Activity hint | Process-local string for TUI proof tape / pending | `@arcana/core/tool/activity-hint` |

### Default knobs (engine admission)

| Env | Default |
|-----|---------|
| `ARCANA_TOOL_READ_CONCURRENCY` | 8 |
| `ARCANA_TOOL_NETWORK_CONCURRENCY` | 4 |
| `ARCANA_TOOL_WRITE_CONCURRENCY` | 4 |
| `ARCANA_TOOL_SHELL_CONCURRENCY` | 1 |

### Default knobs (agent batch)

| Knob | Default |
|------|---------|
| maxCalls | 16 |
| defaultTimeoutMs (per child) | 60s |
| maxOutputChars (per child) | 2k |
| maxTotalTimeMs (batch) | 120s |
| maxSynthesisChars (parent) | 8k |
| read / network / write concurrency | 8 / 4 / 4 |

Delegated runners (cron/gateway) and MCP handlers share the same AgentRunner authorization path; see ADR 0002.

### TUI cost discipline (shipped)

- Command-spine is the default shell.
- Footer merges `getToolActivityHint()` on a ~220ms poll — not a streaming event bus.
- Layout breakpoints: `wide` (≥120), `compact` (≥100), `narrow` (≥80), `minimal` (&lt;80), with hysteresis.

---

## Foundation slice (non-breaking contracts)

The original foundation branch remains intentionally non-breaking for **token / context / candidate** layers:

This foundation slice only adds (or keeps as pure contracts):

- performance budgets
- token efficiency scoring
- context strategy selection
- candidate search stopping policy
- tests for each optimization primitive

Runtime wiring for those layers still comes later and must be behind rollout flags.

**Exception (documented above):** tool admission, path locks, and agent batch budgets are already live runtime behavior. They are not part of the "shadow-only" foundation rule; treat them as the first enforced performance surface.

## Optimization layers

1. TUI render performance
   - stable projection inputs
   - deterministic summaries
   - bounded panel rendering
   - no expensive recomputation inside render helpers

2. Kernel projection performance
   - event replay budgets
   - projection freshness tracking
   - gap-aware but low-cost summaries

3. Token efficiency
   - estimate vs actual reconciliation
   - cache-read ratio
   - reasoning/output pressure
   - cost and latency efficiency

4. Context efficiency
   - prefer cache-friendly static prefixes
   - retrieve focused evidence before raw replay
   - compact long-running state before large-window replay
   - preserve provenance and security controls

5. Candidate search efficiency
   - adaptive stop decisions
   - budget-aware candidate count
   - confidence and quality margin gates
   - verifier-aware stopping

6. Tool / IO concurrency (shipped baseline)
   - resource-specific pools
   - path locks for conflicting writes
   - batch size, timeout, and synthesis caps
   - cancel trees on parent abort

7. Security and governance preservation
   - performance cannot bypass permission, mutation, verifier, RunProof, or rollback authority
   - token reduction must not remove required evidence
   - context compaction must not preserve secrets

## Acceptance gates

A performance improvement is valid only if it satisfies all gates:

- typecheck passes
- tests pass
- no `footer.command.tsx` rewrite as a presentation-only shortcut
- no existing behavior changed without a documented path (flag, ADR, or explicit shipped surface)
- no governance authority bypassed
- token/context optimization remains traceable
- performance budget functions are deterministic

## Next rollout path (foundation layers)

1. Keep pure contracts and tests for token/context/candidate layers.
2. Add runtime measurements in shadow mode.
3. Expose meters in cockpit projection when ready.
4. Add rollout flags for enforcement of those layers.
5. Enforce only after stable telemetry proves safe thresholds.

Tool admission and batch budgets already passed step 5 for their own surfaces; do not re-litigate them as "not started."
