# Arcana Engineering Handover - 2026-08-01

## Status

This is an in-progress handover for the active Arcana master-specification goal.
It is not a declaration that Phase C, TUI-2, TUI-2.1, Phase D, or the product
is 100% complete. The completion playbook still requires evidence against every
applicable gate and explicit human approval. Milestone status has been
reconciled against the `phase-d-implementation` lineage (see "Reconciled
milestone status" below); the earlier `master`-worldview claims in this
document are superseded.

Current branch: `phase-d-implementation`

The worktree contains many concurrent/user changes. Do not use restore, reset,
checkout, broad cleanup, or blanket staging. Inspect and stage only intentional
files. In particular, do not recreate or delete runtime lock/database files as a
source-control cleanup operation.

## Reconciled milestone status (2026-08-01 branch-lineage audit)

The milestone model below is the current source of truth and replaces the
earlier `master`-worldview claims in this document.

| Milestone | Status |
|---|---|
| Phase A | complete/frozen (declared complete in the master spec) |
| Phase B | complete/frozen (`arcana-epistemic-runtime-phase-b` → `8a7b007a`) |
| Phase C | complete/frozen on the implementation lineage (`arcana-governed-autonomy-phase-c` → `89a64ef9`, `phase-c-production-enforcement` → `0b1b03c2`); tags exist and are reachable from `phase-d-implementation`; the default branch has not yet been advanced to include the tagged commits (mainline promotion pending, not tag publication) |
| TUI-1 | historical independent tag (`arcana-tui-1-governance-observability` → `a5da26d9`), not part of current branch ancestry; TUI-1 functionality appears to be represented in the current command-spine implementation, but the tag remains the authoritative historical milestone |
| TUI-2 | frozen (`arcana-tui-2-interactive-authority-control` → `e0b14a2d`) |
| TUI-2.1 | mounted, automated green, manual freeze pending — freeze NOT authorized; no tag |
| Phase D | implementation has progressed through D-8A; D-7 frozen as a local distributed-authority milestone; D-8A proof batching implemented; several earlier work packages remain partially complete; roughly 45–55% by playbook weighting, not 0% |
| Default branch (`master`/`origin/master`) | stale — milestone commits absent; `phase-d-implementation` is the current source of truth |

Sections below are layered historical working records from the 2026-08-01
passes. The table above is authoritative for current milestone truth; test
counts and evidence in the historical sections remain valid.

## Committed And Pushed Work

The original TUI streaming truncation fix was committed and pushed:

- Commit: `c07faba63c27ee050e5a5e2027572b73a0e085ec`
- Message: `fix: render complete streamed TUI messages`
- User manually confirmed the fix worked after restarting the engine/TUI.
- The prominent code comment explaining the stream-fragment/backslash boundary
  is included in that committed implementation.

Root cause: the live TUI rendered only the latest streaming fragment while the
persisted/reloaded session rendered the complete accumulated message. Restarting
appeared to fix the text because the reload path read the durable complete value.
This was a TUI live-projection issue, not model output truncation.

## Uncommitted Governance Visibility Work

The current worktree includes an end-to-end governance projection increment:

1. Durable governance event families are read from `EventStore` by session.
2. `GET /session/:sessionID/governance` exposes canonical stored evidence.
3. SSE forwards live governance records as `governance.recorded`.
4. The generated JavaScript SDK includes the governance endpoint and event type.
5. TUI sync loads the initial governance snapshot and applies live events.
6. The Command Spine projects capability, authorization, contract, claim,
   evidence, obligation, completion, and intent events.
7. RunProof authorization evidence is shown as a compact spine snapshot.
8. Missing or degraded proof data is fail-visible as `UNAVAILABLE` or degraded;
   the TUI does not present absent evidence as healthy.

Important files:

- `packages/engine/src/session/epistemic/event-store.ts`
- `packages/engine/src/session/epistemic/governance-event.ts`
- `packages/engine/src/session/epistemic/governance-event-bridge.ts`
- `packages/engine/src/server/routes/instance/httpapi/groups/session.ts`
- `packages/engine/src/server/routes/instance/httpapi/handlers/session.ts`
- `packages/sdk/js/src/v2/gen/sdk.gen.ts`
- `packages/sdk/js/src/v2/gen/types.gen.ts`
- `packages/tui/src/context/sync.tsx`
- `packages/tui/src/shell/command-spine/production-spine-input.ts`
- `packages/tui/test/governance-spine.test.ts`
- `packages/tui/test/cli/cmd/tui/sync-governance.test.tsx`

Session attribution was corrected for contract, claim, evidence, and obligation
publishers so governance records are associated with the owning session. Session
grant bootstrap now emits a real `capability.created` event rather than leaving
the capability lifecycle implicit.

Existing documentation for this increment:

- `docs/architecture/command-spine-ui.md`
- `docs/audits/TUI-1.1-GOVERNANCE-VISIBILITY-2026-08-01.md`

Those documents still need a final update for the intent-enforcement work below.

## Uncommitted Production Intent Enforcement Work

### Exact authorization scope

`AuthorizationRequest` now optionally carries:

- `contractRevision`
- `criterionIds`

When present, the request hash binds the exact contract revision and a
canonically sorted criterion set. The legacy byte stream remains unchanged for
contractless requests. PEP request-integrity checks now reject mutations of the
contract, revision, workspace, or criteria between decision and execution.

Files:

- `packages/core/src/capability/types.ts`
- `packages/core/src/capability/request-hash.ts`
- `packages/core/src/capability/pep-integration.ts`
- `packages/core/src/capability/pep.ts`
- `packages/core/src/capability/pdp.ts`

### Durable intent binding store

Added an insert-only SQLite intent-binding store with explicit revocation:

- `packages/core/src/capability/intent-binding-sql.ts`
- `packages/core/src/capability/intent-binding-store-sqlite.ts`
- `packages/core/src/database/migration/20260801000000_intent_bindings.ts`
- `packages/core/src/database/migration.gen.ts`
- `packages/core/src/database/schema.gen.ts`
- `packages/core/src/capability/grant-store.ts`
- `packages/core/src/capability/index.ts`

Reads are exact by session and request hash. Contract-bound rows are returned
only when the referenced contract is still active and its current revision
matches the binding revision. A revision change therefore invalidates old
bindings without rewriting history.

### Strict binding validation and PDP behavior

Binding validation checks request hash, session, contract, revision, criteria,
status, and expiry. An `EXPLICIT_APPROVAL` binding is valid only when
`createdBy` is `USER_APPROVAL`.

A security fallthrough was found and fixed during testing: the PDP previously
appended `REQUIRE_APPROVAL_INTENT` but could continue to the final `ALLOW` when
no ordinary approval reason existed. Intent approval is now a blocking state.
An ordinary scoped approval cannot substitute for the durable exact intent
binding. The approved retry first persists that binding, then reevaluates the
same immutable request.

The policy snapshot also distinguishes these cases:

- Empty available store: no matching binding, evaluated by intent policy.
- Missing or failed REQUIRED store: hard deny with
  `DENY_INTENT_STORE_UNAVAILABLE`.
- Contractless `LEGACY_COMPAT`: intent bindings remain unenforced, but this is
  durably recorded and shown as degraded assurance.

### Session runtime wiring

Added `packages/engine/src/session/intent-runtime.ts` and wired it through
`packages/engine/src/session/tools.ts`.

Runtime behavior:

1. No active contract: use `LEGACY_COMPAT` and append
   `intent.compatibility_mode`.
2. Exactly one active contract: use REQUIRED enforcement with its exact
   revision, required criteria, and source user event.
3. Multiple active contracts: fail closed because authority is ambiguous.
4. Clean `USER_INSTRUCTION` or `ACTIVE_CONTRACT` work can receive a runtime
   `NECESSARY_SUBSTEP` binding for non-critical consequential actions.
5. Remote, MCP, untrusted-local, tool-output, and subagent-derived requests do
   not receive automatic runtime bindings.
6. Critical or untrusted work requires an exact operator approval, which creates
   a `USER_APPROVAL` / `EXPLICIT_APPROVAL` binding with expiry.
7. Approval retries reuse the same immutable `AuthorizationRequest`; rebuilding
   a request changes its nonce/hash and cannot reuse the old binding.

New durable event types:

- `intent.enforcement_required`
- `intent.binding_created`
- `intent.binding_revoked`
- `intent.compatibility_mode`

`authorization.requested` now records bounded governance metadata needed by
RunProof without storing raw arguments: provenance, sensitivity, contract ID,
contract revision, criterion IDs, workspace ID, and request hash.

### RunProof and TUI assurance

RunProof authorization profiles now include:

- `intentEnforcementMode`: `REQUIRED`, `LEGACY_COMPAT`, or `UNAVAILABLE`
- `intentBindingsCreated`
- `intentTraceHealth`

The TUI treats intent assurance as unhealthy unless enforcement is REQUIRED and
the trace is COMPLETE. The Command Spine summary/body shows enforcement mode,
trace health, and binding count. Compatibility mode is deliberately visible as
degraded rather than silently accepted.

## Verification Evidence

Passing on the current increment:

- Engine typecheck: `bun run --filter @arcana/engine typecheck`
- SDK generation/build: `bun run --filter @arcana/sdk build`
- TUI typecheck: `bun --cwd packages/tui typecheck`
- Intent/PDP focused suite: 65 passed, 0 failed, 85 assertions.
- SQLite intent store suite: 4 passed, 0 failed, 11 assertions.
- Session intent runtime suite: 5 passed, 0 failed, 16 assertions.
- Authorization event plus information-flow suite: 20 passed, 0 failed,
  81 assertions.
- Database migration package-local suite: 14 passed, 0 failed, 48 assertions.
- Governance EventStore and HTTP API/SDK group: 30 passed, 6 skipped, 0 failed,
  86 assertions.
- Earlier package-local full TUI suite: 760 passed, 1 skipped, 0 failed.

## Progress After This Handover Was Written (2026-08-01)

All pending verification gates were re-run and are green:

- Focused intent/PDP suite (7 files, incl. new revocation tests): 96 passed,
  0 failed, 204 assertions.
- Session intent runtime suite: 7 passed, 0 failed, 27 assertions.
- Intent binding file-backed restart/persistence suite (new): 3 passed, 0 failed,
  34 assertions — ACTIVE bindings survive a database reopen, revoke after restart,
  and compatibility/per-revision REQUIRED mode events are idempotent across restart.
- EventStore concurrency + multi-connection suites: 12 passed, 0 failed, 47 assertions.
- Governance EventStore + HTTP API/SDK group: 30 passed, 6 skipped, 0 failed,
  86 assertions.
- Full package-local TUI suite: 761 passed, 1 skipped, 0 failed, 2,129 expect calls.
  The spine-entry interaction capture helper was hardened to wait for a stable frame
  after a flake (header painted before the think body under parallel load).
- Contract admission flow suite (new): 6 passed, 0 failed, 27 assertions.
- Contract engine lifecycle + completion verifier suites (new): 5 passed, 0 failed,
  16 assertions — activation seeds criteria-backed obligations idempotently, resolution
  marks the contract `resolved`, and the verifier resolves execution/observation
  obligations from durable evidence while leaving comparison/human/external obligations
  pending.
- HTTP API/SDK + fresh listener group with admission assertions: 25 passed, 6 skipped,
  0 failed, 70 assertions — the fake-LLM governance test now asserts
  `contract.proposed`, `contract.activated`, `intent.enforcement_required`, REQUIRED
  enforcement mode, and COMPLETE intent trace health in the same run as the PEP
  authorization chain.
- Epistemic/server group (event store, attribution, concurrency, contract/verifier,
  fresh listener): 28 passed, 6 skipped, 0 failed, 104 assertions.
- HTTP API/SDK group with verified-completion assertions: 19 passed, 0 failed,
  57 assertions — the fake-LLM governance test now also asserts `obligation.created`,
  `obligation.resolved`, `completion.resolved`, `contractStatus: resolved`,
  `completionMethod: VERIFIED_COMPLETE`, and `VERIFIED` assurance.
- SQLite atomic use counters + session grant lookup (new): 3 passed, 0 failed,
  7 assertions — `tryConsumeUse` decrements `constraints.maxUses` in a serialized
  transaction (the production store previously never decremented), and
  `getActiveGrantsForSession` returns ACTIVE grants only.
- PEP capability use-claim adversarial suite (new): 3 passed, 0 failed, 17 assertions —
  use-limited grants execute exactly N times then fail closed with
  `DENY_CAPABILITY_EXHAUSTED` and zero executor calls; unlimited grants repeat; the
  last-use claim emits `capability.exhausted`.
- Full capability folder: 617 passed, 0 failed, 1,474 assertions — includes the Phase C
  waves, the PEP claim suite, and the repaired labels baseline (14 pre-existing
  `labels.test.ts` failures fixed: provenance is a `Set`; declassification fixture
  corrected).
- Capability revocation workflow suite (new): 4 passed, 0 failed, 12 assertions —
  unknown, foreign-session, and already-revoked grants are no-ops; active grants revoke
  with descendants and emit `OPERATOR_REVOKE` / `PARENT_REVOKED` evidence.
- HTTP API/SDK group with revoke endpoint test: 20 passed, 0 failed, 65 assertions —
  `POST /session/:sessionID/capability/:capabilityID/revoke` succeeds for an ACTIVE
  session grant (with `capability.revoked` evidence and `OPERATOR_REVOKE` reason) and
  returns 404 for unknown grants. The generated SDK now exposes
  `sdk.session.revokeCapability`.
- Capability revocation cascade (SQLite store): 1 passed, 0 failed, 5 assertions —
  parent + descendant are REVOKED in the durable store with evidence reasons, a sibling
  grant is untouched.
- RunProof derivation performance: derive(500 events) p50 2.89–3.26 ms, p95 7.56–8.71 ms,
  max ≤ 22.86 ms (logged, CI-safe bound).
- RunProof file-backed restart: 1 passed, 0 failed, 8 assertions — after reopening the
  database, the projection reconstructs identically (event count, terminal sequence,
  integrity VALID, contractStatus, completionMethod, obligationsByStatus, zero
  unauthorized executions) and the event chain verifies.
- Contract criteria compilation: `ContractEngine.propose` now derives acceptance
  criteria from the user request (tests/verification, defects, builds) with meaningful
  descriptions; obligations carry the criterion description, and the admission question
  exposes the compiled criteria. Only execution-verifiable criteria are compiled so
  completion is never auto-blocked. Contract engine suite now covers compilation
  (3 tests), and the combined engine group stays green (654 pass, 6 skip, 0 fail,
  1,606 assertions).
- Combined engine regression run: 878 passed, 6 skipped, 0 failed, 2,213 assertions
  across 60 files.
- HTTP API/SDK + fresh listener group with capability-revocation assertions:
  25 passed, 6 skipped, 0 failed, 78 assertions.
- Performance evidence (1,000 bindings, 200 samples): request lookup p50 0.11 ms /
  p95 0.19 ms; session lookup p50 1.95 ms / p95 4.38 ms; `listGovernance(500)`
  p50 0.37 ms / p95 0.74 ms.

New production work in this pass:

- `IntentRuntime.revokeBindingsForContract` wired into the production completion gate
  (`session/prompt.ts`): resolving a contract revokes its ACTIVE bindings and emits
  `intent.binding_revoked` with `CONTRACT_RESOLVED`.
- Durable mode-event idempotency: process-local de-dup sets replaced by
  `EventStore.listType` checks; REQUIRED dedup is keyed by exact contract revision.
- Production contract admission: `contract-admission.ts` compiles a completion contract
  from the user's request, presents it through the permission gate (`contract.accept`),
  and activates it on acceptance; allow-all sessions auto-accept, declines are recorded
  once (`__arcana_contract_declined`), and subagent/compaction/structured-output turns
  never ask. Wired into `session/prompt.ts` and registered in both the default layer and
  the server `SessionPrompt.node` graph (`ContractEngine.node`).
- Obligation seeding + verified completion: activation seeds criteria-backed obligations
  (idempotent); the production verifier resolves execution/observation obligations from
  durable evidence; the completion gate now runs on the natural finish path, is
  durable-idempotent, resolves the contract to `resolved`, and revokes intent bindings
  only on verified completion.
- Capability lifecycle: verified completion revokes the session's ACTIVE grants and
  emits `capability.revoked` (`CONTRACT_RESOLVED`); the SQLite use counter now decrements
  atomically; the PEP claims one use per allow on both allow paths, fails closed when a
  claim is exhausted or unavailable, and emits `capability.exhausted` on last-use claims
  — use limits are now enforced end-to-end in production.
- Operator revocation: `capability-revocation.ts` + HTTP endpoint revoke a session grant
  and its descendants (`revokeWithCascade`) with `capability.revoked` evidence
  (`OPERATOR_REVOKE` / `PARENT_REVOKED`); unknown/foreign/already-revoked grants 404.
- Evidence closure: descendant cascade is now covered at the SQLite store integration
  level; RunProof derivation latency is measured (p50/p95 logged); the full governance
  projection reconstructs identically after a file-backed database reopen and the event
  chain verifies.
- Contract compilation: acceptance criteria are derived from the user request with
  meaningful descriptions, and those descriptions propagate into obligations and the
  admission permission card.
- Docs updated: `docs/architecture/command-spine-ui.md` and
  `docs/audits/TUI-1.1-GOVERNANCE-VISIBILITY-2026-08-01.md` now describe the durable
  intent store, REQUIRED/LEGACY behavior, exact revision invalidation, revocation
  workflow, idempotency, fresh test counts, performance numbers, and remaining gaps.

Root-runner crash diagnostics (still unresolved, now documented with a fingerprint):

```text
bun test packages/core/test/database-migration.test.ts
=> Bun v1.3.14 Windows x64 segfault (0xFFFFFFFFFFFFFFFF) within ~77 ms, before tests
bun test packages/core/test/crypto.test.ts => same crash
bunx bun@latest => 1.3.14 (no newer release available)
```

Package-local runners pass with the same preload, so this is a Bun 1.3.14 root-runner
bug, not a test failure. No dev:tui process was running, so the live restart step was
not applicable this pass.

The latest governance group command was:

```powershell
bun --cwd packages/engine test test/epistemic/event-store-governance.test.ts test/epistemic/event-publisher-session-attribution.test.ts test/server/httpapi-sdk.test.ts test/server/httpapi-listen.test.ts
```

The root runner `bun test packages/core/test/database-migration.test.ts` crashes
Bun 1.3.14 on Windows before test execution. Running the same test package-locally
passes. The same root-preload crash has occurred for the TUI suite. Treat this as
an unresolved runner/toolchain problem, not as passing evidence.

## Immediate Next Steps

1. Rerun engine typecheck after the final PEP evidence payload and test assertion
   edits:

```powershell
bun run --filter @arcana/engine typecheck
```

DONE — passes.

2. Run all focused intent tests together:

```powershell
bun --cwd packages/engine test test/capability/capability-types.test.ts test/capability/intent-binding.test.ts test/capability/production-enforcement.test.ts test/capability/intent-binding-store-sqlite.test.ts test/capability/intent-runtime.test.ts test/capability/authorization-events.test.ts test/capability/information-flow.test.ts
```

DONE — 96 passed, 0 failed, 204 assertions.

3. Rebuild the SDK and recheck the TUI:

```powershell
bun run --filter @arcana/sdk build
bun --cwd packages/tui typecheck
bun --cwd packages/tui test test/governance-spine.test.ts test/cli/cmd/tui/sync-governance.test.tsx
bun --cwd packages/tui test
```

DONE — SDK build passes; TUI governance tests 9/9; full TUI suite 761 pass, 1 skip.

4. Update `docs/architecture/command-spine-ui.md` and
   `docs/audits/TUI-1.1-GOVERNANCE-VISIBILITY-2026-08-01.md` with the durable
   intent store, REQUIRED/LEGACY behavior, exact revision invalidation, test
   counts, and remaining gaps. DONE — both docs updated; the audit also records the
   revocation workflow, durable idempotency, file-backed restart evidence, measured
   performance, and root-runner crash diagnostics.

5. Restart the exact live `bun run dev:tui` process tree because TUI source
   changes require an engine restart. Verify `http://127.0.0.1:9142/health` after
   restart. Do not kill unrelated Bun processes. NOT APPLICABLE this pass — no
   dev:tui/Bun process was running.

6. Review scoped diffs before staging. No commit was requested for this current
   governance/intent increment, and the worktree contains many unrelated changes.

## Remaining Product Gaps

Production contract admission and the epistemic completion path are now wired: primary
sessions compile, present, accept, and activate a completion contract before
consequential work; activation seeds proof obligations; the production verifier resolves
execution/observation obligations from durable evidence; and the natural-finish
completion gate emits VERIFIED_COMPLETE only when nothing required remains unresolved,
resolving the contract and revoking its intent bindings. Remaining verifier boundaries:
comparison / human_decision / external_confirmation obligations now resolve only from
durable `verification.recorded` events (an explicit operator/verifier outcome with a
required reason — never from executed effects or model prose), and criteria-specific
evidence rules require receipts: test criteria need a `test_receipt`, build criteria a
`build_receipt`, diff-digest criteria a `diff_receipt`, and artifact criteria an
`artifact_receipt` (all as `evidence.attached` events). Contract re-admission after
resolution is implemented: the next objective proposes a fresh contract with the next
revision (lineage is durable and ordered). The operator path is exposed as
`ObligationEngine.recordVerification` and as the `arcana capability revoke
<sessionID> <capabilityID>` CLI command (cascade + `capability.revoked` evidence per
grant). Contractless sessions (declined, or headless without an allow rule) still enter
explicit `LEGACY_COMPAT` mode — visible and degraded, but not the master-spec end state.

Capability lifecycle status: verified-completion revocation, PEP use-claims, and the
operator revocation endpoint (with descendant cascade) are wired. Remaining lifecycle
work: TUI-2.1 production polish — the `/capability revoke <capabilityID>` command
works from the TUI prompt and `run --command` (implemented in `SessionPrompt.command`,
no model involved), the CLI `arcana capability revoke` command is live, and an explicit
descendant-cascade HTTP fixture now covers the endpoint (parent + child revoked,
sibling untouched, `PARENT_REVOKED` evidence per descendant).

TUI-2.1 is mounted and automated-green, but its freeze is NOT authorized; see
`docs/audits/TUI-2.1-FREEZE-SIGNOFF-2026-08-01.md`.

## Completion-playbook evidence audit (2026-08-01) — NOT a certification

This is the evidence checklist required before any human approval can certify a phase.
Every row is a gate from the playbook's "Definition of 100% completion"; each status is
the current measured state, and no phase is certified without explicit human approval.

| Gate | Status | Evidence |
|------|--------|----------|
| 1. Scope complete | PARTIAL | Release scope reconciled to Phase A/B/C + TUI-2 (see "Reconciled milestone status"); TUI-2.1 freeze and Phase D remaining work are tracked separately, not silently dropped. Mainline promotion of milestone commits still pending. |
| 2. Production integration | PASS (measured) | Contract admission/propose/accept/activate runs in `SessionPrompt` before consequential work; PEP enforces at the effect boundary in `tool.ts`; the completion gate runs in the prompt loop and only emits VERIFIED_COMPLETE when no REQUIRED obligation remains; revocation is reachable through the HTTP endpoint, the CLI command, and `/capability revoke` in the session command path. Unit tests alone were never used as the integration claim. |
| 3. Hard invariants | PASS (measured) | `¬Authorized(q) ⇒ ¬Executed(q)` is exercised by PEP allow/deny/use-claim tests (3-test adversarial suite: use-limited grants execute exactly N times then fail closed) and capability revocation cascade tests. No violation observed in this pass. |
| 4. Adversarial tests | PASS (measured) | Golden-vector crypto conformance: 5 positive + 40 negative vectors (mutation, wrong key/domain, rollback, freshness, schema); Phase B evaluation groups A–C; event-store concurrency/multi-connection suites; corrupted-cache, migration-failure, and revocation-cascade scenarios; ACP blocked-permission isolation. |
| 5. Positive utility | PASS (measured) | Full monorepo sweep green: engine 4248, core 1256, TUI 762, arcana CLI 116, LLM 275, memory 29, UI 57, ML 35, gateway 3, http-recorder 66, effect-drizzle-sqlite 14, enterprise 32, SDK 7 (0 failures in every suite; 74+30+1 skips are recorded/PTY/platform, not failures). |
| 6. Persistence and restart | PASS (measured) | Intent-binding file-backed restart suite (3 tests), RunProof file-backed restart (reconstructs identical projection, integrity VALID), durable mode-event idempotency, SQLite migration suite, obligation/contract re-admission across proposals. |
| 7. Performance measured | PASS (measured) | Intent-binding lookup p50 0.18ms / p95 0.26ms; governance list(500) p50 0.74ms; RunProof derive(500 events) p50 2.89–5.40ms, p95 7.56–14.67ms; Phase B E2 replay derivation < 500ms; event verification and proof-batch figures tracked in the TUI-1.1 audit. |
| 8. Observability | PASS (measured) | Governance event families (contract/claim/evidence/obligation/completion/intent/authorization/capability/verification) feed RunProof and the TUI cockpit; `verification.recorded` requires an explicit reason and renders as an operator-decision row in the command spine; fail-visible degraded evidence (`UNAVAILABLE`, degraded intent rows) is tested; `capability.revoked`, `verification.recorded`, `completion.attempted/resolved`, `obligation.*` events are asserted in tests. |
| 9. Documentation frozen | PARTIAL | Handover, TUI-1.1 audit, operations URL policy, security audit, and the new `docs/architecture/governance-events.md` reference (event families, `verification.recorded` contract, migration notes) are updated this pass; master spec/design docs are the normative references. Not "frozen" until the human sign-off confirms the corrected milestone docs and TUI-2.1 freeze artifacts are final. |
| 10. No hidden blocker | PARTIAL | Every local `verify` step passes: `bun run lint` 0 errors (553 warnings), `bun run typecheck` 16/16 packages, all test suites green, `bun --cwd packages/ml run eval` 13/13, `bun run build` 8/8 tasks (engine binaries smoke-tested), `bun run smoke` 8/8 entry surfaces. Known, documented blockers only: Bun 1.3.14 root-run test segfault (package-local runners pass), one platform TUI skip, and the explicit TUI-2.1 freeze follow-ups above. The adversarial sweep beyond the suites listed is still part of the human-gated audit. |

Conclusion: strong measured evidence on gates 2–8; gates 1, 9, and 10 remain
human-gated. Do not mark Phase C, TUI-2, TUI-2.1, or the overall Arcana objective
100% complete on the basis of this table alone — the normative playbook sign-off and
explicit human approval are still required.

The review-ready release sign-off is `docs/audits/ARCANA-SIGNOFF-2026-08-01.md`
(Phase A/B/C + TUI-2 only); TUI-2.1 has its own freeze sign-off
(`docs/audits/TUI-2.1-FREEZE-SIGNOFF-2026-08-01.md`), and Phase D is reported
separately in `docs/architecture/phase-d-remaining-roadmap.md`. These are
prepared review artifacts, not approvals themselves.

Phase D (Distributed Authority) is not planned-at-0%: implementation has
progressed through D-8A, D-7 is frozen as a local distributed-authority
milestone, D-8A proof batching is implemented, and several earlier work
packages remain partially complete (roughly 45–55% by playbook weighting).
The progress report and remaining-work roadmap is
`docs/architecture/phase-d-remaining-roadmap.md`; it is not a kickoff and not
a sign-off, and it does not restart completed work.

The remaining TUI work is TUI-2.1 production polish, scoped in
`docs/architecture/tui-2-polish.md` — candidate items T1–T8 (T9 optional) plus
the full freeze matrix (manual smoke, width/theme matrices, approval lifecycle
observation, restart recovery, session isolation, performance). TUI-2.1 is
mounted and automated-green; the freeze is NOT authorized.

Additional follow-up gaps:

- Wire a production intent-binding revocation workflow and emit
  `intent.binding_revoked` from that path. DONE — `revokeBindingsForContract` is wired
  into the completion gate and emits the event with `CONTRACT_RESOLVED`.
- Replace process-local once-per-session event de-duplication sets with durable
  idempotency if duplicate mode events across restart are unacceptable. DONE — durable
  `EventStore.listType` checks, per-revision REQUIRED keying, restart-tested.
- Add restart/persistence evidence using a file-backed database, not only
  in-memory SQLite. DONE for the intent store and mode-event idempotency; a full
  end-to-end governance projection restart remains outstanding.
- Add measured performance evidence for binding lookup and governance projection.
  DONE for binding lookup and the bounded governance list (see performance numbers
  above); full RunProof derivation latency remains unmeasured.
- Resolve or isolate the Bun 1.3.14 root test-preload crash. ISOLATED —
  deterministic Bun segfault on any root-run test; package-local runners are the
  verified workaround; documented in the TUI-1.1 audit.
- Complete the full completion-playbook audit, including adversarial, positive
  utility, production integration, persistence/restart, performance,
  observability, and frozen-documentation gates.

Do not mark Phase C, TUI-2, TUI-2.1, or the overall Arcana objective 100%
complete without the normative playbook checklist and explicit human approval.

## Final verification pass — full sweep green (2026-08-01)

One serial, package-local sweep after the fixes in this pass:

Flake note: one full-suite run in this window reported a single un-identified
failure and the `--only-failures` rerun hung; the failure did not reproduce in
two consecutive subsequent full runs (both 4248 pass / 0 fail). The known
perf/cancel flakes were already hardened (executable-resolution cache for
deterministic replay; 10s budgets for the mid-stream and queued-caller cancel
tests). No root cause has reproduced since.

| Suite | Result |
|-------|--------|
| Engine (`bun --cwd packages/engine test`) | **4248 pass, 74 skip, 1 todo, 0 fail**, 51 snapshots, 11,445 expect calls (4323 tests / 364 files) |
| Core (`bun --cwd packages/core test`) | **1256 pass, 7 skip, 0 fail**, 3,404 expect calls |
| TUI (`bun test` from `packages/tui`) | **762 pass, 1 skip, 0 fail**, 8 snapshots, 2,138 expect calls |
| Arcana CLI (`bun test` from `packages/arcana`) | **116 pass, 0 fail**, 351 expect calls |
| LLM | 275 pass, 30 skip (recorded-cassette suites), 0 fail |
| Memory | 29 pass, 0 fail |
| UI | 57 pass, 0 fail |
| ML | 35 pass, 0 fail |
| Gateway | 3 pass, 0 fail |
| http-recorder | 66 pass, 0 fail |
| effect-drizzle-sqlite | 14 pass, 0 fail |
| Enterprise (storage/share core) | **32 pass, 0 fail** — previously 32 failures; a filesystem `local` storage adapter now backs the tests (S3/R2 remain the cloud adapters) |
| SDK (`packages/sdk/js`) | 7 pass, 0 fail |
| Cron | no tests (script passes with `--pass-with-no-tests`) |
| Typechecks | clean in every package with a typecheck script: core, cron, effect-drizzle-sqlite, effect-sqlite-node, engine, enterprise, gateway, http-recorder, llm, memory, ml, plugin, server, tui, ui, sdk/js, plus arcana via direct `tsc --noEmit` |

Everything in the earlier 122-failure baseline (plus every pre-existing failure
found while sweeping) is now fixed. Notable repairs:

- Tool suite: task `task_id` resume semantics restored (the tool had been
  hard-wired to always create a fresh child), webfetch localhost fixtures now
  opt in via a test-only env gate, registry plugin fixture uses the modern
  `@arcana/plugin` package path, read/external-directory Windows normalization
  tests no longer strip the drive letter, LSP/task permission metadata tests
  assert the new `engine_action` envelope, storage migrations no longer advance
  the marker on failure, and the task/help/parameters snapshots were refreshed.
- CLI: `--format json` stdout is clean again (the server-password notice now
  goes to stderr), the legacy `--compat-opencode-env` flag was removed,
  session-data bash-echo stripping honors short outputs, replay summary text
  matches the canonical duration formatter, and the ACP subprocess client now
  answers `session/request_permission` so contract-accept asks cannot hang
  prompts. Which-key is asserted as a default-enabled internal plugin.
- ACP: blocked permission on session A no longer blocks session B message
  deltas (test now sends the required `partType`); prompt-content subprocess
  passes.
- Core: golden-vector conformance suites pass (stale vector IDs fixed, float
  epoch routed to SCHEMA, node/revocation/wrong-domain vectors routed to the
  correct verifiers, expiry mutation actually mutates, freshness clock pinned,
  count invariants updated), ModelsDev no longer leaks a process-global cache
  across tests, websearch restores the Exa credential query, shell env-path
  normalization resolves a real Git Bash install, session-move tests publish a
  proper `Location.Ref`, and Bash tool wording matches the tool.
- Arcana CLI: kanban's atomic-write import path fixed, Cloudflare direct
  providers restored to `providers.arcana.json`, IPv6 and git author-name
  redaction repaired.
- Enterprise: both copies of the S3/R2-only storage layer gained a filesystem
  `local` adapter (test/development mode), and the enterprise test preload
  routes storage/share tests to a temp dir — no cloud credentials needed.
- Verifier boundaries: `verification.recorded` is now a canonical governance
  event (with `operator` actor kind); comparison / human_decision /
  external_confirmation obligations resolve only from recorded outcomes with a
  required reason; test/build/diff/artifact criteria require matching
  `evidence.attached` receipts. `ObligationEngine.recordVerification` is the
  operator API.
- Contract re-admission: each new objective after resolution proposes a fresh
  contract with the next revision (durable lineage).
- Revoke surfaces: CLI `arcana capability revoke`, and `/capability revoke
  <capabilityID>` in the session command path (works from the TUI prompt and
  `run --command`, no model involved). An explicit descendant-cascade HTTP
  fixture covers parent+child revocation, sibling preservation, and
  `PARENT_REVOKED` evidence.
- Performance: deterministic replay now caches `which`/`where` per executable
  (previously one subprocess spawn per replayed step — the Phase B E2 gate was
  flaking at ~0.7s on Windows); E2 passes well under the 500ms bound. The
  mid-stream cancel regression test gets the same 10s budget as its siblings.
- Operator verification surface: `POST
  /session/{sessionID}/obligation/{obligationID}/verify` (SDK
  `session.verifyObligation`) records `verification.recorded` evidence with a
  required reason and resolves comparison / human_decision /
  external_confirmation obligations. Foreign/unknown obligations fail closed
  with 404. The TUI command spine renders `verification.recorded` as an
  operator-decision row (ok/fail by outcome, expanded on failure).
- Command discoverability: `/capability` is registered as a built-in command
  (description + hints), so TUI completion and CLI command listing surface the
  operator revoke action.
- Governance reference: `docs/architecture/governance-events.md` freezes the
  canonical event families, the `verification.recorded` payload contract,
  obligation verification rules, operator surfaces, and migration notes for
  the additive event/actor schema changes.
- Repo-wide gates: `bun run lint` passes with 0 errors (oxlint now pinned to
  an explicit root config so the vendored `.hermes` docs tree is excluded; the
  one real finding — an unused `fileOps` variable — was removed). `bun run
  typecheck` (turbo) passes 16/16 packages. Live revalidation now surfaces
  file-writing commands as unverified artifact-drift warnings instead of a
  silent empty stub, with a regression test.
- Repo-wide build: `bun run build` passes 8/8 turbo tasks, including the
  engine binaries (all 11 target platforms) with a live `arcana --version`
  smoke test. The engine build's runtime dependency step added
  `@parcel/watcher` and `@ff-labs/fff-bun` to `bun.lock` (required for
  reproducible builds).
- ML eval: `bun --cwd packages/ml run eval` passes 13/13 fixture-based evals
  (quality, token budgeting, SQL optimization, machine-resource posture).
  With lint, typecheck, tests, and build green, every local step of the
  playbook/CI `verify` chain now passes except the human-gated release tag.
- Product smoke: `bun run smoke` passes 8/8 entry surfaces. Two pre-existing
  defects were fixed to get there: `packages/arcana/package.json` declared a
  `bin` (`./bin/arcana`) that never existed — the dev wrapper shim was
  created (routes to the engine entry), and the smoke's enterprise check was
  stale (expected `vite build`; the real wired script is
  `bun ./script/build.ts`).
- Published npm wrapper hygiene: `packages/arcana/npm/package.json` leaked the
  private repository via `repository`/`homepage` (violating the operations.md
  policy) and still carried `opencode` branding — both removed, description
  rebranded to Arcana governed-autonomy CLI, `opencode` keyword dropped, and
  the wrapper README no longer links the private source or credits OpenCode.

## Phase C checklist evidence (playbook §19 — NOT a certification)

The playbook's Phase C checkboxes map to the following current evidence. The
final box (mainline promotion of the tagged milestone commits) is a release
action that requires explicit human approval; nothing below self-certifies the
phase.

| Playbook item | Current evidence |
|---|---|
| Exact canonical request hashing is active | Canonical `AuthorizationRequest` includes requestId/requestHash/nonce/policyVersion and intent bindings key exact request hashes; PEP asserts the hash at the effect boundary. |
| Durable capabilities fail closed | `SqliteGrantStore` + PEP tests: missing/expired/revoked/exhausted/mismatched grants deny; store failure fails closed; restart preserves state; use counters are atomic (PEP use-claim adversarial suite). |
| PDP is pure and snapshots are immutable | `Permission`/PDP is a pure function over an immutable snapshot; snapshot-mutation and stale-decision tests pass. |
| PEP is the final authority at protected effect boundaries | `tool.ts` PEP wrapper executes only after fresh revalidation + atomic use/approval claim; stale decision rejection tested. |
| Intent bindings are session and contract-revision scoped | `SqliteIntentBindingStore` keys bindings by session/contract/revision; binding created/revoked evidence tested incl. restart. |
| Provenance, sensitivity, and consequential-field lineage are enforced | Provenance label tests (10 labels, fail-closed on HIGH/CRITICAL UNKNOWN) and sensitivity policy tests pass. |
| Scoped approvals are exact, expiring, atomic, and single-use | Approval lifecycle/state-machine suites (core crypto) pass; exact-hash single-use expiring approvals tested. |
| Child authority attenuates and ancestor revocation is enforced | Delegation attenuation tests + revocation cascade (workflow unit, SQLite store, and HTTP fixture with `PARENT_REVOKED` evidence). |
| Workspace and MCP trust adapters are active | Workspace trust evaluation (`evaluateWorkspaceTrust`) gates executable config/tools; trust tests pass. |
| RunProof security profiles have complete trace semantics | RunProof projection + trace health suites pass; degraded evidence is fail-visible. |
| Frozen adversarial suite has zero false allows | Phase C evaluation: 95 fixtures, 0 false allows, 722 tests (per AGENTS.md), re-verified green in this sweep. |
| Phase C tags exist and milestone commits are reachable | `arcana-governed-autonomy-phase-c` → `89a64ef9`; `phase-c-production-enforcement` → `0b1b03c2`; both contained in `phase-d-implementation` and pushed to `origin/phase-d-implementation`. The default branch has not yet been advanced to include the tagged milestone commits. Remaining action: **mainline promotion**, not tag publication. |

### Arcana Pro / API endpoints (rebrand)

- AI Gateway API (canonical): `https://proxy-arcana.otnelhq.com` (health
  `https://proxy-arcana.otnelhq.com/healthz`), fallback
  `https://arcana-proxy.lejzerv.workers.dev`.
- License server API (canonical): `https://api-arcana.otnelhq.com/api`,
  fallback `https://arcana-license-server.lejzerv.workers.dev`.
- All license bind/validate/activate/audit/health/shared-memory call sites
  updated; `app.opencode.ai` UI upstream replaced with `arcana.otnelhq.com`;
  CSP connect-src updated; docs/operations.md URL policy rewritten to match.
- The HTTP server's default Basic-auth username is now `arcana` (was
  `opencode`) for `ARCANA_SERVER_USERNAME` and the `ServerAuth.header`
  fallback; the serve-route auth layer and the OpenAPI title are rebranded
  too, CORS now allows `*.arcana.otnelhq.com` origins (legacy `opencode.ai`
  origins retained), and the SDK wire protocol sends `x-arcana-directory` /
  `x-arcana-workspace` headers (server accepts both the new and legacy header
  names; the SDK error text now says Arcana Server). Every user-visible
  OpenAPI description in the engine server now says Arcana (sessions, config,
  instances, projects, PTY, upgrade, global events/health), and the internal
  HTTP API identifiers were renamed `opencode-root`/`opencode-instance` →
  `arcana-root`/`arcana-instance` (`OpenCodeHttpApi` → `ArcanaHttpApi`).
- CLI/user-visible copy sweep: `arcana uninstall` intro/success now say
  Arcana, permission dialogs say "until Arcana is restarted", the MCP debug
  client identifies as `arcana-debug`, the internal in-process SDK base URL is
  `http://arcana.internal`, GitHub integration log/prompt copy says Arcana,
  and the demo fixture references the real engine path. Functional
  compat surfaces (`.opencode` paths, `opencode.json` config files,
  `x-opencode-*` headers, GitHub app/workflow identifiers) are intentionally
  preserved. The `init` command template and the OAuth dummy key also say
  Arcana now. The JS SDK `v2/gen` output was regenerated from the current
  OpenAPI spec: descriptions are Arcana-branded and the governance, approval,
  capability-revoke, and obligation-verify endpoints are now codegen-first
  (the earlier hand-added methods were superseded by generated ones).
  The LLM layer's unsupported-provider reason and its internal AGENTS.md now
  reference Arcana and `@arcana/llm` (the actual package name) instead of
  `@opencode-ai/llm`.
- Regression found by the full sweep: the rebranded unsupported-provider
  reason ("provider is not openai, arcana, or anthropic") left one stale
  llm-native expectation, and the compaction cancellation test's 1s
  ready-wait raced process boot in the current env. Both were corrected (the
  compaction budget is 5s and only gates the plugin trigger, not the
  cancellation assertions); the full engine suite re-ran green.

### Remaining known limitations (unchanged from above)

- Root-level `bun test packages/tui` (and other root-run tests) still
  segfaults inside Bun 1.3.14 on Windows before any test executes; package-local
  runners are the verified workaround.
- Comparison / human_decision / external_confirmation obligations resolve from
  durable `verification.recorded` events; criteria evidence receipts and the
  capability revoke endpoint are implemented. Remaining outstanding work:
  TUI-2.1 manual freeze gates (smoke, width/theme matrices, approval lifecycle
  observation, restart recovery, performance) and the Phase D remaining
  roadmap. Do not mark any phase 100% complete without the normative playbook
  checklist and explicit human approval.
