# Arcana Revolutionary Runtime North Star

This document turns the Arcana Revolutionary Runtime Report into repo-level doctrine.

Arcana is not a chat-first coding assistant, not a prettier TUI clone, and not a cosmetic fork rename.

Arcana is a governed software engineering kernel.

```txt
Model proposes.
Kernel decides.
SecurityContext classifies.
Policy constrains.
PipelinePlan stages.
CandidateSet searches.
DiffGate mutates.
Verifier certifies.
RunProof records.
TUI observes.
```

## Category

```txt
Arcana = Sovereign Software Engineering Kernel
```

The model is not the product.
The chat is not the product.
The TUI is not the source of truth.

The product is the governed runtime that turns AI output into verified engineering change with durable evidence.

## Implemented Runtime Primitives

| Primitive | Status | Repo surface | Authority rule |
|---|---:|---|---|
| Kernel contract | implemented | `packages/engine/src/kernel/kernel.ts` | owns identity and authority boundaries |
| Migration model | implemented | `packages/engine/src/kernel/migration.ts` | migration advances only through quality gates |
| Compatibility shim registry | implemented | `packages/engine/src/kernel/compat.ts` | legacy paths must decay and contract |
| Mutation authority | implemented | `packages/engine/src/kernel/mutation.ts` | writes move through proposed/approved/applied/verified states |
| Verifier authority | implemented and tightened | `packages/engine/src/kernel/verifier.ts` | completion requires evidence, not agent claims |
| SecurityContext | implemented | `packages/engine/src/kernel/security-context.ts` | risk and required controls are derived before action |
| PipelinePlan | implemented | `packages/engine/src/kernel/pipeline.ts` | work follows typed stages instead of wandering loops |
| CandidateSet | implemented | `packages/engine/src/kernel/candidate.ts` | model generates candidates; policy/scoring chooses survivors |
| EngineAction | implemented | `packages/engine/src/kernel/action.ts` | every execution unit carries risk, policy, controls, and evidence |

## Differentiation Boundary

Arcana becomes its own product category by changing where authority lives.

```txt
Open-ended agent loop       -> Arcana pipeline runtime
Single generated patch      -> CandidateSet with scoring
Agent says done             -> VerifierPass with evidence
Tool mutates directly       -> MutationAuthority / DiffGate
Conversation transcript     -> RunProof ledger
Pretty terminal output      -> TUI proof cockpit
Provider-dependent behavior -> AI sovereignty and model-route visibility
Compatibility forever       -> measured shim decay and contraction
```

## Runtime Law

Every privileged runtime operation must satisfy the following chain.

```txt
Intent
  -> PipelinePlan
  -> EngineAction
  -> SecurityContext
  -> PolicyDecision
  -> optional Permission
  -> optional CandidateSet
  -> optional MutationAuthority
  -> Verifier
  -> RunProof
  -> TUI Projection
```

A feature is not Arcana-native if it bypasses this chain.

## Security-First Defaults

Arcana must treat model output as high-capability but untrusted.

Required defaults:

- Secret reads require approval, redaction, proof, and human review.
- Dependency mutations require SBOM/OSV evidence and verifier review.
- Auth, billing, crypto, and upload/download paths require high-friction review.
- Destructive shell commands require approval, checkpoint, rollback, and review.
- Network egress crosses a trust boundary and must be policy-visible.
- Model/provider route selection is an AI sovereignty event.
- Verifier and builder should be separable authorities.

## Pipelines

Arcana should not use one workflow for every task.

| Pipeline | Purpose | Required shape |
|---|---|---|
| `fix` | repair broken behavior | reproduce -> localize -> candidates -> DiffGate -> tests -> verifier -> proof |
| `feature` | implement requirement | intent contract -> architecture map -> plan search -> candidates -> compat checks -> verifier -> proof |
| `security` | reduce risk | threat model -> abuse cases -> secure patch -> scans -> human review -> verifier -> proof |
| `forge` | discover better algorithms/systems | baseline -> candidate search -> benchmark -> property/security checks -> verifier -> proof |
| `migration` | move Arcana toward native runtime | architecture map -> expand-contract slice -> replay checks -> shim decay -> verifier -> proof |
| `research` | produce claims and designs | evidence standard -> source strategy -> hypotheses -> claim verification -> proof |

## Candidate Search Doctrine

Arcana should not trust the first plausible patch.

Candidates are scored by:

```txt
correctness        30%
security           25%
maintainability    15%
performance        10%
verification depth 10%
rollback safety     5%
minimality          5%
```

Security is a floor, not just a weighted input. A candidate with unacceptable security should lose even if it looks productive.

## TUI Future

The TUI must become a cockpit over kernel truth, not a chat transcript.

The visual hierarchy should expose:

```txt
objective
pipeline
risk
provider route
candidate set
policy decisions
permission requests
mutation queue
verifier verdict
proof completeness
rollback readiness
compat shim usage
```

The TUI may be beautiful, but beauty must come from precise state, not decoration.

## Integration Direction

Integrations must enter through `EngineAction` and `SecurityContext`.

Priority standards and systems:

```txt
GitHub / GitHub Actions
GitLab CI/CD
MCP with policy wrapper
LSP / DAP
SARIF
SPDX / CycloneDX
OSV
SLSA / Sigstore
CodeQL / Semgrep / Trivy / Scorecard
Ollama / vLLM / cloud providers / gateways
OpenTelemetry
Kubernetes
```

Rule:

```txt
Integration does not equal authority.
Integration emits actions.
Kernel decides.
RunProof records.
```

## Migration Rule

Do not rewrite blindly.
Do not preserve compatibility blindly.

Use:

```txt
branch-by-abstraction internally
strangler adapters at boundaries
expand-contract for schemas and events
feature flags for rollout and rollback
RunProof continuity for evidence
compat shim decay for contraction
```

## Definition of Revolutionary Progress

A change advances the north star only if it improves at least one of these:

1. execution authority
2. security control
3. evidence quality
4. verifier independence
5. mutation governance
6. AI sovereignty
7. pipeline correctness
8. candidate search quality
9. TUI truth projection
10. compatibility contraction

If a change only makes Arcana look less like its origin without moving authority, it is not revolutionary progress.

## Next Implementation Gates

The next code-level gates should be:

1. Bridge `EngineAction` into tool execution.
2. Bridge `SecurityContext` into permission decisions.
3. Bridge `MutationAuthority` into actual write/edit/apply-patch paths in shadow mode.
4. Project `EngineAction`, `SecurityContext`, `CandidateSet`, `MutationAuthority`, and `Verifier` into RunProof.
5. Add TUI projection contracts over kernel state.
6. Add integration adapters only after they are mediated by action/security/policy/proof.

The north-star invariant:

```txt
No invisible work.
No ungated mutation.
No self-certified completion.
No unrecorded risk.
No provider lock-in by accident.
No UI state outside kernel truth.
```
