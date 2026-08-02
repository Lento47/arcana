# Arcana Release Sign-off — 2026-08-01

**Status: APPROVED WITH EXCEPTIONS — 2026-08-01 (operator instruction). Gates
1–10 below are approved only under the exceptions recorded in §6.**

This is the normative review artifact required by
`ARCANA_PHASES_100_PERCENT_COMPLETION_PLAYBOOK.md`. An approver reviews each
gate below, marks it, and signs. A milestone is not complete or frozen until
every applicable gate is approved by an explicit human sign-off; nothing in
this document is a self-certification.

## 1. What is being signed off

This release sign-off covers milestone claims that are complete or frozen:

- **Phase A — Epistemic Foundation** (declared complete in the master spec)
- **Phase B — Verification and Replay** (frozen; tag
  `arcana-epistemic-runtime-phase-b` → `8a7b007a`)
- **Phase C — Local Governed Autonomy** (evaluation passed; tags
  `arcana-governed-autonomy-phase-c` → `89a64ef9` and
  `phase-c-production-enforcement` → `0b1b03c2`)
- **TUI-2 — Interactive Authority Control** (frozen; tag
  `arcana-tui-2-interactive-authority-control` → `e0b14a2d`)

The TUI-2 tag freezes the historical Interactive Authority Control milestone
contract. It does not certify the entire TUI 1.0 product track or the later
TUI-1.1 governance-visibility increment against the newer completion playbook.

**Out of scope for this sign-off:**

- **TUI-2.1** — mounted in production and automated-green, but its freeze is
  NOT authorized; it has its own freeze sign-off:
  `docs/audits/TUI-2.1-FREEZE-SIGNOFF-2026-08-01.md`.
- **Phase D** — implementation has progressed through D-8A: D-7 is frozen as a
  local distributed-authority milestone, D-8A proof batching is implemented,
  and several earlier work packages remain partially complete (roughly 45–55%
  by playbook weighting). Status and remaining work are reported in
  `docs/architecture/phase-d-remaining-roadmap.md` — a progress report, not a
  sign-off and not a kickoff.
- Phase E/F and Control 1.0.

## 2. Completion gates (playbook §4) — release scope

| # | Gate | Status | Evidence (measured this pass) | Approver |
|---|------|--------|-------------------------------|----------|
| 1 | Scope complete | PASS — release scope is explicitly limited to Phase A/B/C + frozen TUI-2; mainline promotion is a post-sign-off release action, not missing product scope; stale `master` is recorded as a follow-up, not as incomplete scope | Reconciliation audit on `phase-d-implementation` @ `c07faba6`; tags in §1 are contained in the current branch | ✅ |
| 2 | Production integration | PASS | Contract admission in `SessionPrompt`; PEP at effect boundary in `tool.ts`; completion gate in prompt loop; revocation/verification via HTTP, SDK, CLI, and `/capability` command | ✅ |
| 3 | Hard invariants | PASS | `¬Authorized(q) ⇒ ¬Executed(q)` exercised by PEP allow/deny/use-claim tests; revocation cascade tests; no violation observed | ✅ |
| 4 | Adversarial tests | PASS | 40 negative golden crypto vectors; Phase B evaluation A–C; PEP adversarial suite; event-store concurrency; revocation/verification fail-closed cases | ✅ |
| 5 | Positive utility | PASS | Engine 4248/0, core 1256/0, TUI 762/1 skip, arcana 116/0, SDK 7/0; all remaining packages green | ✅ |
| 6 | Persistence and restart | PASS | Intent-binding file-backed restart; RunProof restart reconstruction; durable idempotency; SQLite migration suite; contract re-admission lineage | ✅ |
| 7 | Performance measured | PASS | Intent lookup p50 0.18ms; governance list p50 0.74ms; RunProof derive p50 2.89–5.40ms; replay derivation < 500ms | ✅ |
| 8 | Observability | PASS | Governance event families feed RunProof + TUI spine; `verification.recorded` requires a reason; degraded evidence fail-visible; events asserted in tests | ✅ |
| 9 | Documentation frozen | PASS — corrected milestone narrative and split sign-off artifacts reviewed; accepted under recorded exceptions | Handover, TUI-1.1 audit, `docs/architecture/governance-events.md`, operations/security docs, this sign-off | ✅ |
| 10 | No hidden blocker | PASS — accepted under recorded exceptions | lint 0 errors, typecheck 16/16, ml:eval 13/13, build 8/8, smoke 8/8, all suites green; Bun 1.3.14 root-runner segfault isolated through package-local runners; one platform skip | ✅ |

## 3. Phase C checklist (playbook §19)

| Item | Evidence | Approver |
|------|----------|----------|
| Exact canonical request hashing active | AuthorizationRequest hash + intent binding tests | ☐ |
| Durable capabilities fail closed | Grant store + PEP tests (missing/expired/revoked/exhausted deny; atomic uses; restart) | ☐ |
| PDP pure, snapshots immutable | Pure-function + stale-decision tests | ☐ |
| PEP final authority | `tool.ts` PEP wrapper tests | ☐ |
| Intent bindings session/contract-revision scoped | Intent binding store tests incl. restart | ☐ |
| Provenance, sensitivity, lineage enforced | Provenance labels + sensitivity tests | ☐ |
| Scoped approvals exact, expiring, atomic, single-use | Approval lifecycle suites | ☐ |
| Child authority attenuates; ancestor revocation enforced | Delegation + cascade tests (unit, SQLite, HTTP) | ☐ |
| Workspace and MCP trust adapters active | Trust evaluation tests | ☐ |
| RunProof security profiles complete trace semantics | RunProof + trace health suites | ☐ |
| Frozen adversarial suite zero false allows | 95 fixtures / 0 false allows (re-verified green) | ☐ |
| Phase C tags exist and milestone commits are reachable | Both tags are contained in `phase-d-implementation` and pushed to `origin/phase-d-implementation`. The default branch has not yet been advanced to include the tagged milestone commits. Remaining action: **mainline promotion**, not tag publication | ☐ |

## 4. TUI-2 checklist (frozen milestone)

| Item | Evidence | Approver |
|------|----------|----------|
| TUI-2 milestone tag exists in current lineage | `arcana-tui-2-interactive-authority-control` → `e0b14a2d` (TUI-2S shell integration + approval operator service + milestone document) | ☐ |
| Approval lifecycle implemented | `approval-lifecycle.ts`, `approval-operator-service.ts`, `approval-store-sqlite.ts` | ☐ |
| Governed executor keeps the runtime authority boundary | `governed-executor.ts` — the shell never executes effects | ☐ |
| TUI-2.1 excluded from this sign-off | Separate freeze sign-off artifact; see §1 | ☐ |

## 5. Approver instructions

1. Review the evidence links in `docs/audits/ARCANA-HANDOVER-2026-08-01.md`
   (final verification pass, playbook evidence audit, Phase C checklist).
2. For each gate and checklist row, mark ☐ → ✅ (approved) or ✖ (rejected with
   reason). A rejected gate blocks the milestone; the reason becomes the next
   work item.
3. Sign below. Signing approves the current verified state, not TUI-2.1, not
   Phase D, and not future phases.
4. After approval: record the exact evaluated commit, run the release flow
   (bump + tag per `docs/operations.md`), and promote the intended branch to
   mainline. Do not open a new "Phase D kickoff" and do not tag any pre-polish
   TUI-2.1 candidate as TUI-2.1.

## 6. Approved exceptions (non-blocking, accepted)

1. Default branch promotion remains a post-sign-off release action.
2. Bun 1.3.14 root-runner segfault remains isolated through package-local
   runners.
3. TUI-2.1 and unfinished Phase D work are explicitly outside this release
   sign-off.
4. The TUI-2 tag certifies its historical milestone contract, not the complete
   modern TUI product track.

Gates 1–10 are approved only because these exceptions are explicitly accepted.

## 7. Sign-off record

| Role | Name | Decision | Date | Signature |
|------|------|----------|------|-----------|
| Approver | Operator | ✅ Approve with exceptions | 2026-08-01 | Approved per operator instruction; release commit records the evaluated milestone commit |

Exceptions / follow-ups:

---

Approved 2026-08-01 per operator instruction with the exceptions recorded
above. The release commit records the evaluated milestone commit.
