# ADR 0002: Shared Tool Batch Scheduler

## Status

Accepted — **Phases 0–3 complete**.

| Phase | Delivered |
|-------|-----------|
| 0 | Bounds + recursive auth + nested allowlist (I04/I20) |
| 1 | Engine tier admission (`withToolAdmission`) |
| 2 | Path DAG + path locks; write concurrency 4 |
| 3 | WorkItem budgets, cancel trees, synthesis, RunProof `tool.batch` |

## Decision summary

```text
classify → capability + path DAG waves → bounded pools
  → per-child timeout/output cap → total wall budget
  → parent AbortSignal fan-out → WorkItem status
  → focused synthesis for model
  → optional proofGate.recordToolBatch / tool.batch event
```

## AgentRunner

Sole path: `executeAuthorizedTool` (top-level + nested).

Batch parent returns **`report.synthesis`** (not raw dumps). Full item state lives on `BatchRunReport.items` for proof.

## Engine

`SessionTools.resolve` → `withToolAdmission(name, effect, { input })`:

- capability semaphore
- path locks for writes
- no double-permit on native path

## Phase 3 budgets (defaults)

| Knob | Default |
|------|---------|
| maxCalls | 16 |
| defaultTimeoutMs (per child) | 60s |
| maxOutputChars (per child) | 2k |
| maxTotalTimeMs (batch) | 120s |
| maxSynthesisChars (parent) | 8k |
| read / network / write / shell concurrency | 8 / 4 / 4 / 1 |

## RunProof / TUI

- Event type: `tool.batch`
- `ProofManager.recordToolBatch` + proof-runtime bridge
- `AgentConfig.proofGate.recordToolBatch?`
- Engine: `formatEngineCapabilityHint` / `lastEngineBatchHint` for future pending strings

## Corruption / security

| Risk | Mitigation |
|------|------------|
| Dual policy stacks | Single `executeAuthorizedTool` |
| Nested batch | Denied |
| Cache secrets/mutations | Post-redact; read-only only |
| Unbounded fan-out | mapPool + maxCalls + total time |
| Same-path writes | Path locks |
| Nested path deadlock | One lock site (admission) |
| Parent context bloat | Synthesis caps |
| Orphan children after abort | AbortController tree + cancelled status |

## Threat model

M4 (recursive auth) and M13 (bounded batch fan-out) are **implemented** for:

- Agent interactive + `batch` path (`executeAuthorizedTool`)
- Engine multi-tool admission
- **Cron / gateway** via `createDelegatedRunner` (same AgentRunner stack; cron defaults `safeMode: true`)
- **MCP** tools registered as handlers but only invoked through `executeAuthorizedTool`

## Proof tape activity hint

- Core: `@arcana/core/tool/activity-hint` (`globalThis` slot)
- Engine admission publishes `tools · N cap` while tools run
- Agent batch publishes wave plan strings
- TUI spine footer polls `getToolActivityHint()` and merges into `pending`

## References

- `packages/arcana/src/agent/tool-batch/`
- `packages/engine/src/tool/batch/`
- `docs/architecture/arcana-durable-execution-memory-context-continuity.md`
- `docs/independent-security-audit-2026-07-14.md` I04 / I20
