# Arcana Native Migration Operating Model

This document converts the Arcana-native Runtime Migration Report into an executable migration doctrine.

The migration strategy is not a rewrite and not a rename.

```txt
Branch by abstraction inside the runtime.
Strangler adapters at external boundaries.
Expand-contract for schemas, APIs, IDs, events, and proof formats.
Feature flags for rollout and rollback.
RunProof for evidence continuity.
```

## Product Doctrine

```txt
Model proposes.
Kernel decides.
Diff gate mutates.
Verifier certifies.
RunProof records.
TUI observes.
```

Every migration slice must strengthen that chain.

## Migration Dimensions

Every phase must cover the following quality dimensions.

| Dimension | Meaning in Arcana |
|---|---|
| Performance | Kernel governance must not make the runtime feel slow. Every migration phase needs p95 overhead budgets. |
| Security | Migration must reduce bypasses, secret leakage, unsafe tool execution, and ungated mutation. |
| AI Sovereignty | Users must keep provider/model choice, local-first operation, and explicit routing control. |
| AI Governance | Actions, policy decisions, approvals, verifier outcomes, and overrides must be auditable. |
| Known Bug Freedom | Do not promise mathematical perfection; require zero known blocking bugs before advancing phases. |
| Scalability | Long-horizon runs, large diffs, multiple providers, and future enterprise control surfaces must stay viable. |
| Technology Support | Preserve today's compatibility while creating native support for APIs, tools, MCP, LSP, providers, local models, cloud gateways, CI, IDE, TUI, and GitHub workflows. |

## Phase Ladder

The migration proceeds in a strict ladder.

### 1. Baseline Pin

Goal: lock the inherited baseline and make future divergence explicit.

Do:

- Record baseline commit.
- Preserve license and attribution.
- Capture a replay corpus.
- Keep compatibility on.

Do not:

- Hide origin.
- Rename without authority changes.
- Remove compatibility before measurement.

### 2. Observability Foundation

Goal: observe everything before changing behavior.

Do:

- Emit EngineAction records.
- Emit kernel events.
- Add OpenTelemetry-compatible spans/events later.
- Project RunProof compatibility from legacy sessions.

Exit when:

- Action/event coverage is effectively complete.
- Proof gaps are zero on sampled runs.
- Performance overhead is inside budget.

### 3. Compatibility Bridge

Goal: route old surfaces through new authority boundaries.

Required shims:

- `OpenApiV1Compat`
- `PermissionCompatAdapter`
- `LegacyToolFacade`
- `ConfigMigrator`
- `ProviderModelAliasRegistry`
- `IDAliasRegistry`

Arcana rule:

```txt
Compatibility may preserve behavior.
Compatibility must not preserve hidden authority.
```

### 4. Governed Mutation Shadow

Goal: make all writes visible to DiffGate without enforcing yet.

Do:

- Generate mutation proposal IDs for write/edit/apply_patch.
- Reconcile proposal/apply/filesystem state.
- Build rollback catalog.
- Redact secrets from diff artifacts.

Exit when:

- Shadow accounting sees zero ungated mutations.
- Proposal/apply counts reconcile exactly.
- Rollback drill passes on sampled mutations.

### 5. Governed Mutation Enforced

Goal: make DiffGate the owner of file mutation.

Required lifecycle:

```txt
proposed -> approved -> applied -> verified -> reverted
```

Rules:

- Approval-required mutation cannot apply from `proposed`.
- Checkpoint-required mutation cannot apply without checkpoint evidence.
- Human-review-required mutation cannot apply without review evidence.
- No write path can bypass mutation authority in Arcana mode.

### 6. Independent Verification

Goal: stop letting the builder agent self-certify completion.

Do:

- Add passive verifier first.
- Require verifier for high-risk mutations next.
- Allow human override only if RunProof records the override and limitation.

Verifier should be model/provider independent where possible. That is part of AI sovereignty: Arcana must not require the same model to build and certify.

### 7. Native Proof and API

Goal: make native RunProof and kernel APIs the primary contract.

Do:

- Default new runs to native proof.
- Expose kernel APIs as versioned contracts.
- Keep v1 compatibility while shim usage declines.
- Make local-first proof export the default.

### 8. Contraction

Goal: remove legacy shims only after safety is measured.

Contraction requires:

- Compatibility shim hit rate below threshold.
- Replay mismatches equal zero.
- Proof gaps equal zero.
- Rollback drill passed.
- High-risk verifier coverage at 100%.
- Zero known blocking bugs.
- Major-version migration notes.

## Feature Flags

Migration flags should be treated as release toggles with removal deadlines.

| Flag | Purpose |
|---|---|
| `kernel.actions.observational` | Emit actions/events without behavior changes. |
| `kernel.policy.bridge` | Route permission and policy decisions through kernel bridge. |
| `kernel.diffgate.shadow` | Observe mutation proposals without enforcing. |
| `kernel.diffgate.enforced` | Require DiffGate for writes. |
| `kernel.verifier.passive` | Run verifier without blocking completion. |
| `kernel.verifier.required` | Require verifier for high-risk completion. |
| `proof.compat.enabled` | Project proof from legacy sessions/events. |
| `proof.native.enabled` | Use native RunProof by default. |
| `api.v1.compat` | Keep old API compatibility facade. |
| `ui.kernel_projection_only` | Force TUI to render kernel projection instead of owning hidden state. |

## Required Gates

Every PR in migration branches should answer:

1. Which phase does this advance?
2. Which quality dimensions does it improve?
3. Which compatibility shim does it add, preserve, or remove?
4. Which flag controls rollout and rollback?
5. What RunProof evidence does it emit?
6. What canary or replay check proves no regression?
7. What is the rollback path?

## Performance Rules

Arcana governance must be fast enough to feel native.

Initial budget:

```txt
p95 migration overhead <= 10%
proof export bounded for long-horizon runs
adapter latency invisible for normal TUI use
large diff handling degrades gracefully
```

Performance regressions must block rollout when they affect default user flows.

## Security Rules

Migration must improve security by default.

Required properties:

- No reserved authority can be shadowed by custom tools.
- No high-risk mutation can bypass policy.
- No mutation can bypass DiffGate in enforced mode.
- Telemetry and proof must not leak secrets.
- Share/export must be local-first and explicit.
- Red-team tests must cover prompt injection, malicious tool output, custom-tool override abuse, verifier bypass, and egress bypass.

## AI Sovereignty Rules

Arcana must not become locked to one provider, model, cloud, or API style.

Required properties:

- Provider/model aliases remain stable during migration.
- Local, cloud, gateway, enterprise, and offline routes remain conceptually supported.
- Builder and verifier can use different model routes.
- Model routing is policy-visible.
- User can audit which model/provider acted and which one verified.

## AI Governance Rules

Governance must be state, not prose.

Required records:

- EngineAction
- PolicyDecision
- PermissionRequest / PermissionReply
- MutationProposal
- MutationTransition
- VerifierResult
- RollbackEvidence
- RunProof projection

A summary without records is not governance.

## Scalability Rules

Arcana-native runtime must support:

- long-horizon tasks
- large repositories
- multi-file diffs
- multiple concurrent runs
- multiple providers and model routes
- local-first operation
- future enterprise policy surfaces
- CI/GitHub/IDE/TUI/client integrations

The migration must not hardcode a single UI, single model, single provider, or single execution environment.

## Definition of Done for Migration Slices

A migration slice is done only when:

```txt
code compiles
unit tests exist
compatibility behavior is preserved or intentionally versioned
rollback path exists
quality gates are declared
RunProof evidence is represented
no known blocking bugs remain
```

## Hard Boundary

Arcana must never migrate by simply making the fork harder to recognize.

Arcana migrates by changing where authority lives.
