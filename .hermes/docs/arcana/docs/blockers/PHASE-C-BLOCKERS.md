# Phase C — Local Governed Autonomy: Blocker Register

**Status: EVALUATION PASS — 95 adversarial fixtures, 0 unexpected allows,
0 protected executor calls on denied paths. Release sign-off: APPROVED WITH
EXCEPTIONS (2026-08-01). Tags: `arcana-governed-autonomy-phase-c`,
`phase-c-production-enforcement`.**

## Open blockers

**None within the declared Phase C scope.** The following are explicitly NOT
Phase C blockers (recorded as nonclaims or later-phase work):

- L3+ independent reproduction of the evaluation (global validation-level
  gap, not a Phase C gate).
- Physical host containment (namespaces/seccomp/job objects) — tracked in
  Phase D (D-7.1) and `docs/security/EFFECT-COVERAGE.md`.
- Governance of external CLIs and processes outside the Arcana effect
  boundary — Phase E.

## Gate audit (playbook §19)

| Gate | Required | Evidence | Verdict |
|---|---|---|---|
| Unexpected allows | 0 | 95-fixture suite (wave 1–5), re-verified green | PASS |
| Protected executor calls on denied paths | 0 | PEP spy suites (`production-enforcement.test.ts`, `pep.test.ts`) | PASS |
| Capability amplifications | 0 | `delegation.test.ts`, `delegation-hardening.test.ts`, `runtime-delegation.test.ts` | PASS |
| Approval replay executions | 0 | `scoped-approval.test.ts`, `pep-use-claim.test.ts`, `atomic-use-replay.test.ts` | PASS |
| Revoked-ancestor executions | 0 | cascade revocation suites (unit + SQLite + HTTP) | PASS |
| Secret-exfiltration successes | 0 | `information-flow.test.ts`, `field-lineage.test.ts` | PASS |
| Unlabeled consequential executions | 0 | provenance/label suites | PASS |
| Known model-facing P0 bypasses | 0 | adversarial waves + gap-closure suite | PASS |
| Benign workflow success | 100% of frozen suite | 14/14 benign workflows; engine/core/TUI reruns | PASS |
| Capability/security tests | 100% | capability suites above | PASS |
| Phase A/B regressions | 0 | combined reruns (2026-08-02) | PASS |
| Production-source type errors | 0 | typecheck 16/16 | PASS |

## Task completion evidence (playbook §18)

| Task | Weight | Evidence |
|---|---:|---|
| C1 Canonical authorization requests | 5% | `request-hash.ts`, `canonical-resource.ts`, PEP integration |
| C2 Durable capability grants | 10% | `grant-store-sqlite.ts`, `grant-store.ts`, `session-grants.ts` + suites |
| C3 Pure PDP | 10% | `pdp.ts` + deterministic snapshot tests |
| C4 Effect-boundary PEP | 10% | `pep.ts`, `pep-integration.ts`, `effect-boundary.ts` + spy suites |
| C5 Intent-action binding | 8% | `intent-binding*.ts`, `intent-runtime.ts` + suites |
| C6 Provenance and sensitivity | 8% | `labels.ts`, `field-lineage.ts`, `information-flow.test.ts` |
| C7 Scoped approvals | 8% | `scoped-approval.ts` + lifecycle suites |
| C8 Delegated least privilege | 8% | `delegation.ts`, `runtime-delegation.ts`, `child-launch-barrier.ts` + suites |
| C9 Workspace and MCP trust | 6% | `trust-adapters.ts` + suites |
| C10 Security evidence / RunProof profiles | 5% | RunProof profiles + trace health suites |
| C11 Adversarial evaluation | 12% | 95 fixtures, 8 groups (playbook §18.1) |
| C12 Freeze and tag | 10% | `docs/security/PHASE-C-MILESTONE.md`, tags, sign-off |

## Accepted exceptions (2026-08-01 sign-off)

1. Mainline (`master`) promotion is a post-sign-off release action.
2. Bun 1.3.14 root-runner segfault is isolated through package-local runners.
3. TUI-2.1 and unfinished Phase D are outside this sign-off.
4. The TUI-2 tag certifies its historical milestone contract only.

## Nonclaims preserved

No universal prompt-injection prevention, no hostile-host containment, no
governance of out-of-boundary processes, no distributed-node security, no
remote attestation.
