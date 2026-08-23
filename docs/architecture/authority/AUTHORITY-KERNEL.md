# Authority Kernel — Frozen Architecture v3

> Status: **FROZEN CONTRACT** (2026-08-23). Supersedes all prior drafts.
> Changes require an ADR and explicit human approval (see §5 Constitution).
> Empirical baseline: [`AUTHORITY-TRACE.md`](./AUTHORITY-TRACE.md).

## 0. Thesis

> **Probabilistic Intelligence over Deterministic Authority.**

Decisive question: *"Can any feature acquire authority except by delegation from the kernel?"*
Target end-state: mechanically **no**. Surfaces are not "made compliant" — they cannot acquire protected authority any other way.

## 1. Invariants (P1–P6)

| # | Invariant | Name |
|---|-----------|------|
| P1 | `ProtectedEffect(e) ⇒ Mediated(e)` | Complete mediation |
| P2 | `¬Authorized(e) ⇒ ¬ObservableEffect(e)` | Fail-safe authority |
| P3 | `SameAuthoritativeInputs ⇒ SameDecision` | Deterministic authority |
| P4 | `Claimed(e) ⇒ Terminal(e)`; `Terminal ∈ {SETTLED, AMBIGUOUS, CANCELLED, FAILED}` | Durability — no silent disappearance |
| P5 | `Authority(child) ⊆ Authority(parent)` | No amplification |
| P6 | `SensitiveData(d) ∧ CrossesTrustBoundary(d) ⇒ MediatedDisclosure(d)` | Controlled disclosure |

## 2. Trust ladders

### Mediation stages (S)

| Stage | Deliverable | Claim allowed |
|-------|-------------|---------------|
| S1 | dependency-graph enforcement + permission-audit instrumentation | architectural mediation enforcement |
| S2 | authority API confinement (kernel issues capability-bound handles) | authority API confinement |
| S3 | credential confinement (secrets kernel-only) | credential confinement |
| S4 | process isolation (hardened contract §6) | separate trust boundary; E1-full signer |
| S5 | OS sandbox + distinct OS principal + attestation roots | tamper-resistance (verified TCB only) |

### Evidence integrity levels (E) — advances independently of S

| Level | Mechanism |
|-------|-----------|
| E0 | local hash-chained receipts |
| E1 | protected signing **identity**: non-exportable key + signing interface isolated from untrusted authority (E1-full at S4). Defeats signing-oracle attacks |
| E2 | independently persisted signed checkpoints |
| E3 | external transparency / witness |

Hash chains prove integrity relative to prior commitment only — hence E1–E3 exist.

## 3. Protection model

### Axis A — Effect authority

Closed effect algebra (clients construct requests; kernel owns executors):
`FsMutation · ProcessExecution · NetworkMutation · SecretUse · GitMutation · Deployment · ExternalMutation · FinancialMutation · DelegationMutation · AuthorityMutation`

Unclassified effect kind arriving at the kernel ⇒ protected (deny pending classification).
Inventory changes = versioned artifact + ADR.

### Axis B — Information authority

`acquire SECRET · expose SECRET to model · expose PRIVATE across trust boundary`
Reads stay approval-free; **egress boundaries decide**. Conservative turn-level taint initially (SECRET/PRIVATE in context ⇒ turn's outbound escalations), burden measured before finer IFC investment.
Not-approval-mediated surfaces (rendering, logs, metrics, clock) remain subject to Axis B: `NoEffectApproval ≠ NoInformationPolicy`.

### Raw authority-source inventory

Unknown `EffectKind` denies only calls arriving as effect objects; ambient calls produce none. K0 maintains a mechanically derived inventory (`node:*` effectful modules, `Bun.*`, `global fetch`, `process.env`, provider SDK internals, natives, FFI/WASI, workers, dynamic import) with manifest gate:

```text
ActualAuthoritySources == DeclaredAuthoritySources
```

Three separately-claimed mechanisms: static scan (structure) · dynamic audit (**exercised** paths — never claimed as dormant-path absence) · runtime containment (prevention, S4/S5).
Node/Deno permission models are audit scaffolding ("seat belts"), never the boundary.

## 4. Key semantics

**Lifecycles.** `AuthorizationAttempt` (PROPOSED→DENIED | REQUIRE_APPROVAL→… | AUTHORIZED) is separate from `EffectClaim` (CLAIMED→CANCELLED | FAILED | DISPATCHED→SETTLED | AMBIGUOUS).
Epistemic rule: `FAILED ⇒ ProvenNoEffect`; `AMBIGUOUS ⇒ EffectTruthUnknown`. Timeout-after-send is AMBIGUOUS, never FAILED.
`effect_id` persisted once inside the CLAIMED transaction; `idempotency_key = H("arcana-effect-v1", effect_id, request_hash)`.
Receipts append-only; amendments reference originals.
**Arcana Output-Gate Principle:** `AuthorityStateDurable ≺ ExternallyObservableEffect`.

**Determinism (P3).** Security-relevant nondeterminism (time, randomness) enters decisions only through explicit snapshotted kernel inputs.

**Memory.** `AdvisoryMemory ⇏ Authority`. Memory cannot mint authority; it can still steer behavior within legitimately held authority (bounded by argument-provenance visibility + egress taint — not eliminated). AdvisoryMemory carries provenance metadata consumed by K7.

**Delegation (K8).** Signed attenuated lease (`issuer_epoch`, `policy_hash`, TTL); local verification, no per-effect upstream round-trip; `WorstCaseRevocationDelay ≤ LeaseTTL`; monitor's own governance mutations mediated upstream; no second root.

## 5. Constitution — autonomy never mutates directly

PDP semantics · PEP enforcement · proof verifier · event integrity · approval exactness · capability verification · mutation evaluator · evolution promotion policy · inventory classification.
Changes require ADR + explicit human approval.

## 6. S4 hardened acceptance contract

Unprivileged agent: no kernel credentials · no inherited sensitive fds · no direct network mutation · no child-process authority · no FFI/natives · no shared kernel memory · no attach/debug against kernel.
IPC: authenticated peer · schema-validated canonical requests · bounded size · request IDs/nonces · replay protection · identity binding.

## 7. Implementation order

```text
Step Zero   AUTHORITY-TRACE.md            ← empirical baseline (this dir)
M0          Effect Surface Discovery      trace + manifest + static scan + dynamic audit; zero behavior refactors
M1          ProcessExecution vertical     canonical request → identity envelope → PDP/PEP → receipt;
                                          CI rejects raw spawn outside kernel
then        FsMutation → NetworkMutation → SecretUse → GitMutation → Deployment
            → DelegationMutation → AuthorityMutation → FinancialMutation
later       K2 identity depth · K3a/K3b replay · K5 SLOs · K6 scorecard
            · K7 lineage · K8 leases · K9 certificates · K10 supply-chain
```

K1 completion criterion (NOT "known call sites migrated"):

```text
Client → ProtectedEffect has NO graph path except through Kernel
```

Guardrails: do not create a new kernel package until the trace justifies placement; do not rewrite verified PDP decision machinery during migration; audit-mode (`ARCANA_AUTHORITY_MODE`) precedes enforce-mode; distributing authority before the local surface closes distributes the bypasses.
