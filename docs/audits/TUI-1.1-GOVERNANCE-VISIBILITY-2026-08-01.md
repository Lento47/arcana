# TUI-1.1 Governance Visibility Audit

**Audit date:** 2026-08-01  
**Scope:** Canonical durable governance evidence, durable intent enforcement, and RunProof visibility in the Command Spine  
**Status:** **Implemented increment; not 100% complete**

This document records implementation evidence and open release gates. It is not a phase,
track, workstream, or feature completion declaration. The Arcana completion playbook still
requires every applicable gate plus explicit human approval.

## Implemented production path

```text
runtime publisher
-> session-attributed ArcanaEvent
-> EventStore
-> governance REST snapshot and governance.recorded SSE event
-> generated TypeScript SDK
-> TUI synchronization store
-> ProductionSpineInput
-> Command Spine entry and RunProof row
```

The projection is limited to canonical durable families:

- `contract.*`
- `claim.*`
- `evidence.*`
- `obligation.*`
- `completion.*`
- `authorization.*`
- `capability.*`
- `intent.*`

Log-only execution records and process-local activity hints are deliberately excluded.

## Durable intent enforcement

The increment adds an insert-only SQLite intent-binding store with explicit revocation
(`intent-binding-sql.ts`, `intent-binding-store-sqlite.ts`, migration
`20260801000000_intent_bindings`). Bindings are read exactly by session and request hash;
a contract-bound binding is returned only while the referenced contract is active and its
current revision equals the binding revision, so a revision change invalidates the old
binding without rewriting history.

Strict validation covers request hash, session, contract, revision, criteria, status, and
expiry, and an `EXPLICIT_APPROVAL` binding is valid only when `createdBy` is
`USER_APPROVAL`. A security fallthrough was fixed in the PDP during testing: intent
approval is now a blocking state, and an ordinary scoped approval cannot substitute for
the durable exact intent binding. Approved retries persist the binding first, then
reevaluate the same immutable request.

The policy snapshot distinguishes three intent cases:

- Empty available store: no matching binding; evaluated by intent policy.
- Missing or failed REQUIRED store: hard deny with `DENY_INTENT_STORE_UNAVAILABLE`.
- Contractless `LEGACY_COMPAT`: bindings unenforced, but this is durably recorded and
  shown as degraded assurance.

Session runtime behavior (`intent-runtime.ts`, wired through `tools.ts`):

1. No active contract: `LEGACY_COMPAT` plus `intent.compatibility_mode`.
2. Exactly one active contract: REQUIRED enforcement with its exact revision, required
   criteria, and source user event.
3. Multiple active contracts: fail closed because authority is ambiguous.
4. Clean `USER_INSTRUCTION` / `ACTIVE_CONTRACT` work may receive a runtime
   `NECESSARY_SUBSTEP` binding for non-critical consequential actions.
5. Remote, MCP, untrusted-local, tool-output, and subagent-derived requests receive no
   automatic runtime bindings.
6. Critical or untrusted work requires an exact operator approval, which creates a
   `USER_APPROVAL` / `EXPLICIT_APPROVAL` binding with expiry.
7. Approval retries reuse the same immutable `AuthorizationRequest`; rebuilding the
   request changes its nonce/hash and cannot reuse the old binding.

New durable event families projected by the spine: `intent.enforcement_required`,
`intent.binding_created`, `intent.binding_revoked`, and `intent.compatibility_mode`.
`authorization.requested` now records bounded governance metadata (provenance,
sensitivity, contract ID, contract revision, criterion IDs, workspace ID, and request
hash) without storing raw arguments.

### Production revocation workflow

`IntentRuntime.revokeBindingsForContract` is the production revocation path: it revokes
every ACTIVE binding bound to an exact contract revision, transitions the durable rows to
`REVOKED`, and emits `intent.binding_revoked` with the binding metadata and a
`CONTRACT_RESOLVED` reason. It is wired into the production completion gate in
`session/prompt.ts`: when all required obligations are satisfied and `completion.resolved`
is emitted, the resolved contract's bindings are revoked so no further consequential work
can be grounded on them. The SQL read filter already hid superseded revisions; this makes
the lifecycle visible in RunProof and the governance projection instead of leaving
silent ACTIVE rows.

### Production contract admission

Primary sessions now compile, present, accept, and activate a completion contract before
consequential work (`contract-admission.ts`, wired into the session run loop):

- On the first step of a user turn, when no active contract exists and the session has not
  previously declined, the runtime proposes a contract from the user's request
  (`contract.proposed`), presents it through the permission gate (permission
  `contract.accept` with the objective, revision, and contract ID in metadata), and
  activates it on acceptance (`contract.activated`).
- The session permission ruleset is honored: allow-all sessions auto-accept, default
  interactive sessions ask the operator, and a deny rule declines into explicit
  `LEGACY_COMPAT`.
- Declines are recorded on the session (`__arcana_contract_declined`) so the operator is
  not re-prompted every turn; compatibility mode remains visible as degraded.
- Subagent, compaction, structured-output, and empty-text turns never ask.
- Once activated, the intent runtime enters REQUIRED enforcement for the exact revision,
  so the Command Spine shows `contract.proposed` / `contract.activated` followed by
  `intent.enforcement_required` and healthy REQUIRED intent assurance.

The production HTTP path is covered by the fake-LLM governance test, which asserts
`contract.proposed`, `contract.activated`, `intent.enforcement_required`, REQUIRED mode,
and COMPLETE intent trace health in the same run as the PEP authorization chain.

### Durable mode-event idempotency

The process-local once-per-session de-duplication sets were replaced with durable
idempotency: `EventStore.listType(sessionId, type)` queries the persisted event table, and
`recordCompatibilityMode` / `recordRequiredMode` skip appending when the durable event
already exists. REQUIRED-mode dedup is keyed by the exact contract revision, so a later
contract for the same session receives its own `intent.enforcement_required` event.
Duplicate mode events across restart are now impossible without a second append.

### Obligation seeding and verified completion

The epistemic completion path is now production-wired end to end:

- Contract activation seeds proof obligations from the contract's required acceptance
  criteria (`ObligationEngine.createFromAcceptanceCriteria`, idempotent per contract).
  Criteria carry their declared verification method into the obligation, so an
  `observation` criterion creates an observation obligation, not a hard-coded
  `execution` one.
- Contract compilation is request-derived: `ContractEngine.compileAcceptanceCriteria`
  turns mentions of tests/verification, defects, and builds into specific criteria
  ("Relevant tests and checks pass", "The reported defect is fixed", "The project builds
  successfully") with meaningful descriptions; other requests keep the generic
  task-completion criterion. Only criteria whose verification the production verifier
  can satisfy are compiled, so completion is never auto-blocked without a resolution
  path. Obligations now carry the criterion's description, and the admission permission
  card exposes the compiled criteria.
- `CompletionVerifier.resolveObligationsFromEvidence` resolves pending REQUIRED
  obligations from durable governance evidence: `execution` obligations from
  `authorization.executed` events, `observation` obligations from `evidence.attached`
  events. `comparison`, `human_decision`, and `external_confirmation` obligations are
  never auto-resolved and block completion.
- The completion gate (`epistemicCompletionGate` in `session/prompt.ts`) now runs on the
  natural finish path (assistant stopped without pending tool calls) as well as the
  terminal stop path, is durable-idempotent via `completion.resolved` events, and only
  emits `completion.resolved` `VERIFIED_COMPLETE` when no required obligation remains
  unresolved. Verified completion resolves the contract to `resolved` (P3-compatible)
  and revokes its intent bindings.
- The generated proof projection now reports `contractStatus: resolved`,
  `completionMethod: VERIFIED_COMPLETE`, `obligationsByStatus`, and
  `assuranceProfile.verification: VERIFIED` on the production path; the fake-LLM HTTP
  test asserts all of these alongside the PEP authorization chain.
- Verified completion also revokes the session's ACTIVE capability grants
  (`capability.revoked`, reason `CONTRACT_RESOLVED`) so no authority survives a
  completed objective; a resumed session with a new objective bootstraps fresh grants.

### Capability lifecycle and use counters

- The SQLite grant store's `tryConsumeUse` now decrements `constraints.maxUses` inside a
  serialized IMMEDIATE transaction, matching the in-memory store's semantics. Previously
  the production store checked `maxUses > 0` but never decremented, so use-limited grants
  never exhausted.
- `SqliteGrantStore.getActiveGrantsForSession` returns ACTIVE grants for a session,
  backing the verified-completion revocation path.
- The PEP now claims capability use budget on BOTH allow paths (approval-based and
  capability-based) before recording the final ALLOW and executing. A failed claim fails
  closed: the request is denied with `DENY_CAPABILITY_EXHAUSTED` /
  `DENY_CAPABILITY_CLAIM_UNAVAILABLE` and the protected executor is never called.
- When a claim consumes a grant's last remaining use, the PEP emits
  `capability.exhausted` (with capability ID, request ID, and request hash), so the
  lifecycle event now has a production producer.
- Operator-initiated revocation is exposed through the HTTP API:
  `POST /session/:sessionID/capability/:capabilityID/revoke`. The workflow
  (`capability-revocation.ts`) revokes the ACTIVE grant owned by the session plus every
  descendant grant (cascade via `revokeWithCascade`), emits `capability.revoked` with
  `OPERATOR_REVOKE` / `PARENT_REVOKED` reasons, and returns the revoked IDs. Unknown,
  already-revoked, and foreign-session grants fail closed with 404 so the endpoint
  cannot probe grant existence across sessions. The generated SDK exposes
  `sdk.session.revokeCapability`.
- Baseline repair: `labels.test.ts` was fixed to match the current API (provenance is a
  `Set`; declassification fixture corrected), removing 14 pre-existing failures.

## Delivered evidence

| Area | Evidence |
|------|----------|
| Session attribution | Contract activation, claim transitions, evidence attachment, and obligation lifecycle publishers resolve and persist the owning session. A missing owner fails instead of writing globally invisible evidence. |
| Capability bootstrap | Real session grant persistence publishes `capability.created` only after a successful first write. Repeated bootstrap is idempotent and failed storage does not emit a false event. |
| Authorization | Local and MCP PEP paths publish requested, allowed/denied/approval, stale, executed, and failed evidence through EventStore. |
| Intent enforcement | Durable bindings are persisted, validated, and read by exact session + request hash; PDP/PEP treat intent approval as blocking, and RunProof authorization profiles carry `intentEnforcementMode`, `intentBindingsCreated`, and `intentTraceHealth`. |
| Intent revocation | Contract resolution revokes the contract's ACTIVE bindings through the production completion gate and emits `intent.binding_revoked` (`CONTRACT_RESOLVED`) with binding metadata. |
| Durable idempotency | Mode events are deduplicated against persisted events (`EventStore.listType`); compatibility and per-revision REQUIRED markers survive restart without duplication. |
| Contract admission | Primary sessions propose, present, and activate an exact completion contract before tool authorization; declined sessions stay in explicit LEGACY_COMPAT and are not re-prompted. |
| Obligation seeding + verifier | Activation seeds criteria-backed obligations; the production verifier resolves execution/observation obligations from durable evidence; natural-finish completion is gated and P3-verifiable. |
| Capability lifecycle | Verified completion revokes session grants and emits `capability.revoked`; SQLite use counters now decrement atomically. |
| PEP capability use-claim | Both PEP allow paths claim use budget before execution, fail closed when exhausted/unavailable, and emit `capability.exhausted` on last-use claims. |
| Operator revocation | HTTP revoke endpoint revokes a session grant + descendants with `capability.revoked` evidence (`OPERATOR_REVOKE` / `PARENT_REVOKED`); unknown/foreign/already-revoked grants 404. |
| API | `GET /session/:sessionID/governance` returns canonical events, trace health, and the current compact RunProof projection. |
| Live updates | `GovernanceEventBridge` emits session-scoped `governance.recorded` SSE updates from persisted canonical events. |
| RunProof | The server projection includes proof level, proof hash, run root, integrity, lifecycle, trace health, assurance axes, status counts, gaps, and authorization profile, including intent enforcement mode, binding count, and intent trace health. |
| Command Spine | Canonical intent, provenance, obligation/completion, capability, authorization, trace-health, and RunProof entries are mapped from production inputs. Full evidence remains inspectable. |
| Fail visibility | Missing governance data is `UNAVAILABLE`, not healthy. Invalid/degraded evidence, unauthorized executions, orphan executions, and non-REQUIRED or degraded intent enforcement produce a failed/degraded proof row. Denials have a stable reason fallback. |

## Verification evidence

Run from the repository worktree on 2026-08-01:

| Command / suite | Result |
|-----------------|--------|
| `bun run --filter @arcana/engine typecheck` | PASS |
| `bun --cwd packages/tui typecheck` | PASS |
| `bun run --filter @arcana/sdk build` | PASS, including generation, formatting, and SDK TypeScript compile |
| Focused intent/PDP suite (7 capability files) | 94 pass, 0 fail, 193 assertions |
| SQLite intent-binding store suite | 4 pass, 0 fail, 11 assertions |
| Session intent runtime suite (incl. revocation workflow) | 7 pass, 0 fail, 27 assertions |
| Authorization events + information-flow suite | 20 pass, 0 fail, 81 assertions |
| Database migration suite (package-local) | 14 pass, 0 fail, 48 assertions |
| Intent binding file-backed restart/persistence suite | 3 pass, 0 fail, 34 assertions |
| EventStore concurrency + multi-connection suites | 12 pass, 0 fail, 47 assertions |
| Contract admission flow suite | 6 pass, 0 fail, 27 assertions |
| Contract engine lifecycle (incl. criteria compilation) + completion verifier suites | 6 pass, 0 fail |
| SQLite atomic use counters + session grant lookup | 3 pass, 0 fail, 7 assertions |
| PEP capability use-claim adversarial suite | 3 pass, 0 fail, 17 assertions |
| Capability revocation workflow suite | 4 pass, 0 fail, 12 assertions |
| Capability revocation cascade (SQLite store) | 1 pass, 0 fail, 5 assertions — parent + descendant REVOKED in the durable store, sibling untouched, evidence reasons correct |
| RunProof derivation performance | 1 pass, 0 fail — derive(500 events) p50 2.89–3.26 ms, p95 7.56–8.71 ms, max ≤ 22.86 ms |
| RunProof file-backed restart | 1 pass, 0 fail, 8 assertions — projection reconstructs identically (event count, terminal sequence, integrity VALID, contractStatus, completionMethod, obligations, zero unauthorized) and the event chain verifies after reopen |
| Full capability folder (incl. Phase C waves, labels baseline repair) | 617 pass, 0 fail, 1,474 assertions |
| HTTP API/SDK group with revoke endpoint test | 20 pass, 0 fail, 65 assertions |
| Engine governance store and publisher attribution tests | 5 pass, 0 fail, 21 assertions |
| Session capability bootstrap tests | 2 pass, 0 fail, 6 assertions |
| TUI governance spine and synchronization tests | 9 pass, 0 fail, 40 assertions |
| Generated SDK HTTP integration tests | 19 pass, 0 fail, 45 assertions |
| Fresh listener integration tests | 6 pass, 6 PTY skips, 0 fail, 20 assertions |
| Governance EventStore + publisher attribution + concurrency + contract/verifier + fresh listener group | 28 pass, 6 skip, 0 fail, 104 assertions |
| HTTP API/SDK group with admission + verified-completion + capability-revocation assertions | 25 pass, 6 skip, 0 fail, 78 assertions |
| Intent binding performance evidence | request lookup p50 0.11 ms / p95 0.19 ms; session lookup p50 1.95 ms / p95 4.38 ms; `listGovernance(500)` p50 0.37 ms / p95 0.74 ms (1,000 bindings, in-memory SQLite, 200 samples) |
| `bun --cwd packages/tui test` | 762 pass, 1 skip, 0 fail, 2,138 expect calls, 8 snapshots — includes the new `verification.recorded` operator-decision spine row |

The listener test exercises a real fake-LLM tool path and requires persisted
`capability.created`, the authorization requested/allowed/executed chain, valid proof
integrity, complete authorization trace health, and zero unauthorized executions.

The TUI interaction suite was also hardened during this pass: the frame capture helper in
`spine-entry-interaction.test.tsx` now waits for a stable frame instead of returning the
first non-empty paint, removing a capture race observed under parallel suite load
(header disclosure updated while the body had not yet painted). The full TUI suite
re-ran green after the change.

### Repository-root runner crash diagnostics

The documented repository-root runner failure reproduces deterministically on this
worktree:

```text
bun test packages/core/test/database-migration.test.ts
=> Bun v1.3.14 (0d9b296a) Windows x64 panic: Segmentation fault at address
   0xFFFFFFFFFFFFFFFF within ~77 ms, before any test output
```

The same segfault occurs for other root-run tests (e.g.
`bun test packages/core/test/crypto.test.ts`, ~54 ms) and produces the same crash-report
URL fingerprint. `bunx bun@latest` resolves to 1.3.14, so no newer released Bun is
available to absorb the fix. The package-local runner is the verified workaround:

```text
bun --cwd packages/core test test/database-migration.test.ts   => 14 pass, 0 fail
bun --cwd packages/core test --preload ..\..\scripts\tui-test-preload.ts ... => PASS
bun --cwd packages/tui test                                    => 762 pass, 1 skip
```

Conclusion: this is a Bun 1.3.14 root-runner bug on Windows (pre-test crash, not a test
failure). The gate remains open pending a Bun fix or an approved runner change; package-local
suites are the current evidence source.

## Open completion gates

TUI-1.1 must remain open until these gaps are resolved and evidenced:

1. Obligations are seeded from request-derived criteria and the production verifier
   resolves `execution` /
   `observation` obligations from durable evidence, but `comparison`,
   `human_decision`, and `external_confirmation` obligations have no auto-verifier and
   block completion by design; command-receipt-level evidence rules (test results, diff
   digests, artifact hashes) are the next verifier boundary. Contractless sessions
   (declined or headless-without-allow) still enter explicit `LEGACY_COMPAT`, visible
   and degraded; a removal or migration policy for `LEGACY_COMPAT` remains open.
2. `capability.revoked` and `capability.exhausted` have production producers, and the
   operator revocation endpoint is live (session + descendant cascade). TUI/CLI revoke
   surfaces are implemented: `/capability revoke <capabilityID>` in the session command
   path and `arcana capability revoke` in the CLI, and the explicit descendant-cascade
   HTTP fixture covers parent + child revoked / sibling untouched with
   `PARENT_REVOKED` evidence. RESOLVED.
3. Production capability lifecycle publishers are wired: verified completion revokes
   session grants (`capability.revoked` with `CONTRACT_RESOLVED`), PEP use-claims
   enforce limits and emit `capability.exhausted`, and operator revocation emits
   `OPERATOR_REVOKE` / `PARENT_REVOKED`. RESOLVED.
4. Durable Phase C request-field provenance/lineage does not yet have a canonical event
   family. The visible `evidence.attached` family is Phase A evidence provenance, not a
   substitute for field-level lineage.
5. Verifier receipts beyond obligation and completion evidence do not yet have a complete
   canonical event family and production publisher path.
6. Governance snapshot/synchronization is bounded to 500 events. Long-session anchor
   retention, pagination, and proof continuity have not been demonstrated.
7. The intent-binding store, mode-event idempotency, and the full governance projection
   (RunProof) have file-backed restart evidence, including identical projection
   reconstruction after reopen. What remains open is a full live end-to-end
   session/prompt-loop restart across a file-backed database (manual operator check).
8. Performance evidence covers binding lookup, the bounded governance list, and
   RunProof profile derivation (p50/p95 logged). Long-session projection latency at
   larger event volumes remains unmeasured.
9. The repository-root runner crashes Bun 1.3.14 on Windows before tests execute (see
   diagnostics above). The package-local suites are green, but the documented root-runner
   gate is unresolved pending a Bun fix.
10. Manual width, resize, live restart, observability, and adversarial operator checks
    remain outstanding.
11. The full completion-playbook audit (adversarial, positive utility, production
    integration, persistence/restart, performance, observability, frozen documentation)
    and explicit human approval under the 100% completion playbook have not been given.
12. The admission permission card is functional but generic; a dedicated contract
    presentation surface (criteria, obligations, forbidden outcomes) is TUI-2.1
    production-polish scope.

## Gate verdict

This increment materially improves production governance visibility and removes false
healthy rendering for missing evidence. It does **not** satisfy the Arcana 100% completion
gate and must not be used to unblock a later phase on its own.
