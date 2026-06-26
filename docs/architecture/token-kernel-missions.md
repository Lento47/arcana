# Arcana Token Kernel Missions

Status: planning branch
Source branch: `architecture/arcana-native-runtime`
Branch: `architecture/token-kernel-missions`

## North Star

Arcana must treat tokens as a governed kernel resource, not as incidental provider billing metadata.

The goal is not merely to reduce token count. The goal is to maximize token value while preserving:

- correctness
- context continuity
- traceability
- RunProof evidence
- security boundaries
- AI sovereignty
- latency and throughput
- provider portability
- local-first execution paths

Arcana is not training or fine-tuning foundation models. This work is strictly runtime, kernel, policy, context, accounting, routing, telemetry, and UX.

## Non-Goals

These are explicitly out of scope for this branch:

- LLM fine-tuning
- RLHF / RLAIF
- model weight training
- benchmark chasing by modifying models
- proprietary provider lock-in
- hidden provider-specific state as Arcana truth
- token dashboards without kernel enforcement
- lossy summarization without a validation contract
- context compression that can silently drop security-relevant facts

## Guiding Principle

```txt
Do not optimize tokens by making Arcana blind.
Optimize tokens by making every token accountable.
```

Token management belongs in the same authority chain as actions, mutation, verifier, and RunProof:

```txt
Pipeline
-> EngineAction
-> ContextPack
-> TokenEstimate
-> BudgetAdmission
-> ModelCall
-> TokenActual
-> Reconciliation
-> RunProofTokenEvent
-> VerifierBudgetVerdict
-> TUI Projection
```

## Mission 1 — Token Ledger Kernel Contract

### Objective

Create a provider-neutral token accounting contract that can represent estimates, actuals, cache usage, reasoning tokens, tool schema tokens, retrieval context, summaries, embeddings, latency, and cost.

### Subtasks

1. Add `packages/engine/src/kernel/token-ledger.ts`.
2. Define token classes:
   - `input_uncached`
   - `input_cache_read`
   - `input_cache_write`
   - `output_visible`
   - `output_reasoning`
   - `tool_schema`
   - `tool_result`
   - `retrieval_context`
   - `summary`
   - `embedding`
   - `provider_state`
3. Define `ArcanaTokenLedgerEntry`.
4. Define `ArcanaTokenTotals`.
5. Define `ArcanaTokenReconciliation`.
6. Add hash-chain fields for traceability:
   - `previous_entry_hash`
   - `entry_hash`
7. Add unit tests for totals and reconciliation.

### Expected Outcome

Arcana has one canonical token ledger language independent of OpenAI, Anthropic, Gemini, Ollama, vLLM, OpenRouter, Cerebras, or local providers.

### Acceptance Gates

- No provider-specific field is required for the kernel contract.
- Estimated and actual token counts are separate.
- Reconciliation deltas are explicit.
- Ledger entries can be attached to `EngineAction` and RunProof later.

## Mission 2 — Token Budget Contract

### Objective

Make budget admission a kernel decision before model calls happen.

### Subtasks

1. Add `packages/engine/src/kernel/token-budget.ts`.
2. Define budget scopes:
   - `action`
   - `candidate`
   - `pipeline`
   - `run`
   - `workspace`
3. Define budget dimensions:
   - tokens
   - cost micros
   - latency target
   - provider rate class
   - max candidates
   - max context share
4. Define budget decisions:
   - `allow`
   - `downgrade_model`
   - `compact_context`
   - `reduce_candidates`
   - `require_approval`
   - `stop`
5. Add monotonic remaining-budget tests.

### Expected Outcome

Arcana can admit, reshape, or stop model calls before token spend happens.

### Acceptance Gates

- Budget consumption cannot increase remaining budget.
- High-cost decisions can require approval.
- Budget decisions can be projected into RunProof and TUI state.

## Mission 3 — Provider Usage Normalization

### Objective

Normalize token usage from different providers into Arcana ledger entries.

### Subtasks

1. Add `packages/engine/src/kernel/token-provider.ts` or provider adapter boundary.
2. Define `ArcanaProviderUsageAdapter`.
3. Add fixture-driven tests for generic usage objects.
4. Normalize at minimum:
   - input tokens
   - cached input tokens
   - output tokens
   - reasoning tokens when available
   - cache writes when available
   - latency when available
5. Treat provider-specific reasoning blobs, thought signatures, compaction items, and cache handles as opaque references only.

### Expected Outcome

Arcana stays sovereign over token accounting even when provider accounting semantics differ.

### Acceptance Gates

- Provider adapters cannot leak provider-specific fields into kernel policy.
- Unknown provider fields are preserved only as opaque metadata.
- Usage normalization is testable from fixtures.

## Mission 4 — ContextPack Contract

### Objective

Replace ad hoc prompt assembly with a typed context assembly contract.

### Subtasks

1. Add `packages/engine/src/kernel/context-pack.ts`.
2. Define context segments:
   - `policy`
   - `system_invariant`
   - `objective`
   - `repo_evidence`
   - `retrieval_item`
   - `tool_schema`
   - `tool_result`
   - `summary`
   - `user_input`
   - `security_notice`
3. Each segment must include:
   - source id
   - provenance reference
   - trust level
   - estimated tokens
   - cache eligibility
   - redaction status
4. Add a deterministic ordering function:
   - static/cacheable first
   - dynamic evidence later
   - user/task-specific latest
5. Add tests that preserve cache-friendly ordering.

### Expected Outcome

Arcana can build prompts as governed context packages, not string concatenation.

### Acceptance Gates

- Security and policy context cannot be dropped by compression.
- User-provided or retrieved content is marked as untrusted unless verified.
- Cacheable and dynamic segments are separated.

## Mission 5 — Context Budgeter

### Objective

Select the highest-value context under a declared token budget without losing traceability.

### Subtasks

1. Add `packages/engine/src/kernel/context-budgeter.ts`.
2. Score context by:
   - relevance
   - recency
   - authority
   - risk criticality
   - dependency relation to current action
   - proof obligation
3. Never drop mandatory segments:
   - policy
   - security controls
   - active objective
   - unresolved approvals
   - active mutation state
   - verifier limitations
4. Add tests for token budget pressure.
5. Add adversarial tests where malicious/untrusted content tries to crowd out policy.

### Expected Outcome

Arcana reduces tokens by dropping low-value context, never by dropping required governance context.

### Acceptance Gates

- Mandatory governance context survives every budget cut.
- Dropped segments are recorded as explicit context gaps.
- Context gaps can become verifier limitations.

## Mission 6 — Summary / Compaction Contract

### Objective

Support long-running sessions without raw transcript replay while preventing silent context loss.

### Subtasks

1. Add `packages/engine/src/kernel/context-compaction.ts`.
2. Define a structured summary schema with mandatory fields:
   - objective
   - active IDs
   - completed actions
   - pending actions
   - known decisions
   - assumptions
   - blockers
   - security constraints
   - mutation state
   - verifier limitations
   - next step
3. Add secret redaction before summarization.
4. Add summary validation.
5. Add tests for mandatory fact preservation.

### Expected Outcome

Arcana can compact context while preserving operational state, security state, and proof obligations.

### Acceptance Gates

- Summaries cannot contain raw secrets.
- Summaries must preserve active IDs and blockers.
- Invalid summaries are rejected, not silently accepted.

## Mission 7 — Adaptive Candidate Token Strategy

### Objective

Use test-time compute intelligently without fixed-N waste.

### Subtasks

1. Extend `kernel/candidate.ts` or add `kernel/candidate-budget.ts`.
2. Track token burn per candidate.
3. Track verifier confidence and evidence strength.
4. Define early-stop criteria:
   - decisive winner
   - plateaued marginal gain
   - budget tight
   - verifier confidence high
   - risk too high for additional generation
5. Add simulation tests for candidate stopping.

### Expected Outcome

Arcana can spend more tokens when exploration is valuable and stop when more samples are wasteful or unsafe.

### Acceptance Gates

- Candidate budgets are non-increasing.
- More candidates require measurable expected value.
- High-risk mutation candidates require verifier or approval gates.

## Mission 8 — Lazy Tool Surface Loading

### Objective

Stop loading every tool schema into every model call.

### Subtasks

1. Add tool catalog metadata:
   - capability tags
   - risk class
   - schema token estimate
   - provider compatibility
2. Add tool selection before model call.
3. Prefer minimal tool set by task intent.
4. Record omitted tools as context gaps if relevant.
5. Add tests for tool schema token reduction.

### Expected Outcome

Arcana reduces context size and provider overhead without reducing capability availability.

### Acceptance Gates

- Tool selection is deterministic and auditable.
- Dangerous tools are not introduced without policy reason.
- Tool omission is traceable.

## Mission 9 — RunProof Token Events

### Objective

Make token utilization auditable as part of RunProof.

### Subtasks

1. Extend `kernel/runproof-projection.ts` with token event support.
2. Add event phases:
   - `estimate`
   - `admission`
   - `actual`
   - `reconcile`
3. Attach token events to action IDs and pipeline IDs.
4. Add completeness gaps for missing token accounting.
5. Add tests for missing estimate/actual/reconcile events.

### Expected Outcome

RunProof can prove not only what Arcana did, but what resources it consumed and why.

### Acceptance Gates

- Every model call can produce token estimate and actual events.
- Reconciliation deltas are explicit.
- Missing token evidence lowers proof completeness.

## Mission 10 — Verifier Budget Verdicts

### Objective

Make token budget compliance part of verifier authority.

### Subtasks

1. Extend `kernel/verifier.ts` with token verdict fields.
2. Add budget verdicts:
   - `within_budget`
   - `over_budget_reconciled`
   - `over_budget_unexplained`
   - `budget_evidence_missing`
3. Make high-cost unexplained runs fail verifier in strict mode.
4. Add tests for verifier gates.

### Expected Outcome

A run cannot claim completion while hiding ungoverned token burn.

### Acceptance Gates

- High-cost unexplained runs are verifier failures.
- Token gaps become verifier limitations.
- Verifier decisions are projected to TUI and RunProof.

## Mission 11 — TUI Token Projection

### Objective

Expose token state in the cockpit without turning Arcana into a billing dashboard.

### Subtasks

1. Extend `kernel/tui-projection.ts` with token state.
2. Add visible fields:
   - budget band
   - actual vs estimated burn
   - cache hit ratio
   - context pressure
   - compaction status
   - provider route
3. Add FooterState mapping.
4. Add tests for calm/attention/danger/blocked token states.

### Expected Outcome

The user sees token pressure as operational state, not accounting noise.

### Acceptance Gates

- TUI state comes from kernel projection only.
- No provider billing dashboard logic in UI.
- High pressure is visible before failure.

## Mission 12 — Security Invariants

### Objective

Treat token management as a security boundary.

### Subtasks

1. Add invariant tests for:
   - secret redaction before summary
   - ACL-aware retrieval
   - untrusted retrieval marking
   - prompt injection isolation
   - budget exhaustion handling
2. Ensure untrusted content cannot alter policy context.
3. Ensure token budget attacks cannot trigger unbounded inference.
4. Add denial/approval paths for high-cost requests.

### Expected Outcome

Token optimization reduces security exposure instead of creating new hidden risk.

### Acceptance Gates

- Secret markers cannot appear in summaries.
- Untrusted content cannot be promoted to policy context.
- Budget exhaustion stops or downgrades safely.

## Mission 13 — Performance Harness

### Objective

Measure whether token governance improves efficiency without slowing Arcana down.

### Subtasks

1. Add a benchmark harness for synthetic runs:
   - read-only run
   - write/edit run
   - shell run
   - retrieval-heavy run
   - multi-candidate run
   - long-session compaction run
2. Track:
   - tokens per action
   - tokens per pipeline
   - p50/p95 latency
   - cache hit rate
   - context assembly time
   - verifier false positive rate
3. Add regression thresholds.

### Expected Outcome

Arcana can prove token governance does not ruin performance.

### Acceptance Gates

- Context assembly overhead is bounded.
- Token reduction does not remove required evidence.
- Performance regressions fail tests or benchmarks.

## Rollout Strategy

Use the same migration discipline as the native runtime work:

```txt
contract
-> shadow record
-> reconcile
-> canary
-> enforce low-risk paths
-> enforce high-risk paths
-> remove compatibility shims
```

Recommended flags:

```txt
token.ledger.enabled
token.preflight_count.enabled
token.budget.shadow
token.budget.enforced
token.runproof_events.enabled
token.tui_projection.enabled
token.context_pack.enabled
token.context_budgeter.enabled
token.compaction.enabled
token.candidate_early_stop.enabled
token.tool_lazy_loading.enabled
token.security_invariants.strict
token.verifier_budget_gate.enabled
token.signed_receipts.enabled
```

## Milestone Plan

### Milestone A — Token Shadow Kernel

Missions:

- Mission 1
- Mission 2
- Mission 3
- Mission 9 in shadow mode

Outcome:

```txt
Arcana records token estimates and actuals without enforcing budget decisions.
```

### Milestone B — Context Sovereignty

Missions:

- Mission 4
- Mission 5
- Mission 6
- Mission 12 partial

Outcome:

```txt
Arcana controls what enters context, why it enters, what was dropped, and what must never be dropped.
```

### Milestone C — Adaptive Runtime Efficiency

Missions:

- Mission 7
- Mission 8
- Mission 13 partial

Outcome:

```txt
Arcana spends more tokens only when the expected value is justified by evidence.
```

### Milestone D — Governed Enforcement

Missions:

- Mission 10
- Mission 11
- Mission 12 complete
- Mission 13 complete

Outcome:

```txt
Arcana can block or downgrade unsafe, wasteful, or untraceable token usage.
```

## Definition of Done

A mission is done only when:

- it has a typed kernel contract
- it has unit tests
- it has negative tests
- it is connected to RunProof or has a recorded bridge task
- it is projected to TUI if user-visible
- it preserves security invariants
- it has shadow mode before enforcement
- it does not rely on fine-tuning
- it does not lock Arcana to one provider

## First Implementation Slice

Start here:

```txt
1. kernel/token-ledger.ts
2. kernel/token-budget.ts
3. kernel/token-provider.ts
4. tests for ledger totals, reconciliation, and budget admission
5. export from kernel/index.ts
```

First commit name:

```txt
feat(kernel): add token ledger and budget contracts
```

Expected immediate result:

```txt
Token utilization becomes part of Arcana's runtime language.
No enforcement yet.
No provider lock-in.
No performance-sensitive path touched yet.
```
