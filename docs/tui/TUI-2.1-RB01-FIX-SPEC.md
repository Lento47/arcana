# RB-01 Fix Spec — Durable Approval Pipeline Wiring

**Status:** APPROVED by operator ("fix them all systematically"), 2026-07-31
**Branch:** `phase-d-implementation`
**Relates:** `docs/tui/TUI-2.1-FREEZE-REPORT.md` §4 (RB-01), `TUI-2.1-FREEZE-EXECUTION-PLAN.md` §1b
**Normative source:** playbook §23 TUI-1.2 (Interactive governance) + `TUI-2-INTERACTIVE-AUTHORITY-CONTROL.md`

---

## 1. Problem (verified)

1. **Engine**: `packages/engine/src/session/tools.ts:375-382` — the PEP `APPROVAL_REQUIRED` branch returns a TEXT result to the model. No durable `ApprovalRecord` is created; the tool call is not parked; nothing can be approved.
2. **PEP exact-effect binding broken**: `tools.ts:352-355` — `executeExact: () => null`. The real `item.execute(args, ctx)` runs at `tools.ts:389` OUTSIDE the PEP boundary. The PEP's execute hook is a no-op: no atomic claim/consume wrapping, TOCTOU window, and approval-backed ALLOW can never work.
3. **No transport**: engine has no approvals sync channel and no operator command endpoint; TUI `routes/session/index.tsx:1535-1590` passes none of the four approval shell props; `useApprovalIntegration` unused in production.

## 2. The good news — the machinery already exists

- `packages/core/src/capability/pep.ts:218` `authorizeAndExecuteEffect(effect, contextProvider, eventEmitter?, approvalStore?: ScopedApprovalStore)` — implements the full approval path: REQUIRE_APPROVAL (269-285), approval-backed ALLOW with **atomicClaim → resolveExecute(executeExact) → consumeApproval → CONSUMED** (321-384), STALE_DECISION on claim failure (348-355).
- `packages/core/src/crypto/approval-lifecycle.ts` + `approval-store-sqlite.ts` — durable records, versioned transitions, outbox CAS.
- `packages/core/src/crypto/approval-operator-service.ts` — `submitCommand` (APPROVE_ONCE/DENY with version/hash/revision/session/workspace checks), `loadApproval`, `loadPendingApprovals`.
- `packages/core/src/crypto/governed-executor.ts` — `RealGovernedApprovalExecutor` (claim → verify → dispatch), usable as an alternative trigger path.
- TUI shell: `approval-integration.ts` (`useApprovalIntegration`), `approval-shell-controller.ts`, `approval-spine-adapter.ts` — complete, tested (135/135 runner).

## 3. Design decisions (locked)

- **D1 — Execution trigger = resume path.** The PEP is the executor. The engine parks the tool call when PEP returns REQUIRE_APPROVAL (records PENDING + stores the protected request). On operator APPROVE, the session processor resumes the parked tool call; the PEP re-evaluates with fresh snapshot (which loads the approved scope — verify the snapshot hook exists; if the PDP snapshot does not load approval scopes, add the store-backed scope loader), decision → ALLOW via approval → PEP claims, executes `executeExact` (the real effect), consumes. Deny → mark tool part failed/denied, zero execution. This matches the TUI-2 vertical slice ("fresh PDP/PEP evaluation → execute") and keeps the PEP as the single execution authority.
- **D2 — executeExact carries the real effect.** `executeExact: () => item.execute(args, ctx)` (return the promise; plugin before/after triggers + budget release stay around the PEP call). The line-389 external `item.execute` is REMOVED. Same for the MCP path (`tools.ts:445`).
- **D3 — Store wiring.** The engine constructs a `ScopedApprovalStore` adapter over the durable sqlite store (core) and passes it to every `authorizeAndExecuteEffect` call. The same store serves the operator service + sync reads. Records are session + workspace scoped.
- **D4 — Transport.** Sync channel: session sync data gains `approvals` (map approvalId → ApprovalRecord, pushed on create/transition — same SSE channel as messages/parts). Operator commands: engine HTTP endpoint `POST /api/session/:sessionId/approval/:approvalId/command` `{command: "APPROVE_ONCE"|"DENY", expectedVersion, expectedRequestHash, expectedContractRevision}` → session-scoped `ApprovalOperatorService` → response. Authenticated operator = TUI session identity.
- **D5 — Tool part state.** Pending tool call renders as approval-required (adapter already maps PENDING); on resume the existing part updates with the execution result. No new part types.
- **D6 — Contract revision** for the approval record comes from the policy snapshot the PEP used (decision context), same value the adapter displays.

## 4. Work breakdown (delegation clusters)

| Cluster | Scope | Files (primary) | Depends |
|---------|-------|-----------------|---------|
| A | Engine core: executeExact binding fix (both call sites), APPROVAL_REQUIRED → durable record + parked tool call, resume-on-approve path, PEP approvalStore wiring | `packages/engine/src/session/tools.ts`, `packages/engine/src/session/processor.ts`, new engine approval store adapter | — |
| B | Engine transport: sync `approvals` channel + operator command HTTP endpoint | engine sync module, engine HTTP api | A |
| C | TUI route: consume sync approvals + `useApprovalIntegration` controller + pass 4 shell props | `packages/tui/src/routes/session/index.tsx` | B |
| D | Polish: M1 glyph, M4 version 1, M5 full hash, M7 SUBMITTING visual; RB-01c stale test file; H1/H2 repro tests; H4 dompurify | `spine-types.ts`, `approval-spine-adapter.ts`, `approval-lifecycle.ts`, `approval-store-sqlite.ts`, `__tests__/run-tui2.1-production-tests.ts`, `packages/tui/test/*repro*`, `packages/ui/package.json` | — |

## 5. Hard requirements (from the playbook + contract)

- Approval UI acts on exact request hashes (no truncation in the inspect surface — M5).
- Keyboard and mouse paths produce the same decision.
- Prompt typing cannot trigger approval shortcuts (already verified).
- **Denied → zero executor calls.** **Approved → exactly one execution.** (CAS claim; concurrent approve = one wins, other STALE.)
- Sensitive values redacted in panel/inspector/receipts/errors.
- `Not Authorized(q) => Not Executed(q)` — PEP remains the ONLY execution authority (D2).

## 6. Test plan

- Engine unit: REQUIRE_APPROVAL creates PENDING record + parks call; deny → tool part denied, `item.execute` never called (spy); approve → PEP re-eval → claim → executeExact called exactly once → CONSUMED; concurrent approve → one STALE; expiry; request-hash change → INVALIDATED (no execution).
- Engine integration: full tool call through the real processor; RunProof/receipt updated.
- Transport: sync delivers create/transition; endpoint enforces session/workspace + version CAS.
- TUI: route passes props; controller commands round-trip; adapter glyph/version/hash updates.
- Regression: full TUI suite + core runners + typecheck + build.

## 7. Sequencing

1. Cluster A (implementer + spec review + quality review)
2. Cluster B (after A)
3. Cluster C (after B)
4. Cluster D (parallel with A; independent files)
5. Docs (M2/M3/M6 wording) — main agent, alongside
6. Full verification + freeze report update + WS1 rerun
