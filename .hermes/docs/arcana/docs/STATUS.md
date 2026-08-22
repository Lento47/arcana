---
document_class: status
authority: current_status
status: current
status_source: self
implementation_checkpoint: fb7c1968
documentation_reconciliation_commit: d21c5e3e
current_branch_at_publication: arcanagov
last_verified: 2026-08-22
supersedes: status claims inside Arcana_Project_Master_Specification.md Parts I-III
---

# Arcana — Live Status

This is the **only current-status authority**. The architecture compendium
(`.hermes/docs/arcana/docs/arcana-Master/Arcana_Project_Master_Specification.md`)
is a reference reader; its Parts I–III are historical snapshots and their
status claims are superseded by this file.

**Authority note:** `docs/STATUS.md` is the primary status authority. The
`.hermes/docs/arcana/docs/STATUS.md` copy is a synchronized mirror and is
secondary; never edit the mirror independently.

## Evaluated commit and branches

| Field | Value |
|---|---|
| Current implementation branch | `arcanagov` |
| Implementation checkpoint | `fb7c1968` (2026-08-21; 161 commits after the prior `f3c935e6` checkpoint) |
| Documentation reconciliation commit | `d21c5e3e` (2026-08-22 status/goal/memory reconciliation) |
| Uncommitted worktree | Dirty at verification time. Goal-verifier, memory-boundary, session-navigation, and related tests are present but not yet committed; their evidence is labeled working-tree evidence below. |
| Default branch (`master` / `origin/master`) | stale — Phase B/C, D-7, TUI-2 milestone commits not on it; mainline promotion pending (post-sign-off release action) |
| Release version | Source manifests: `0.3.67`; no Arcana 1.0 freeze or production-release claim |
| Last verification date | 2026-08-22 working tree on Windows. The pinned Bun 1.3.14 TUI run is **not green**: 1,132 pass / 42 fail / 1 skip; Bun 1.4.0 independently reproduced 42 failures. TUI and engine typechecks pass. Focused engine checks: 225 pass / 4 fail / 18 skip. Focused core/memory checks: 71 pass / 1 teardown-hook failure. |
| Supported platforms | Windows 10/11 (primary, tested); Linux (D-6A-L identity scaffold; live validation pending) |
| Performance audit | 2026-08-20 — 7 critical, 14 medium, 18 low issues identified; see Performance Audit section below |

## Milestone matrix

| Milestone | Status |
|---|---|
| Phase A — Epistemic Foundation | COMPLETE / FROZEN (declared complete in master spec) |
| Phase B — Verification and Replay | COMPLETE / FROZEN (`arcana-epistemic-runtime-phase-b`) |
| Phase C — Local Governed Autonomy | EVALUATION PASS; tags exist (`arcana-governed-autonomy-phase-c`, `phase-c-production-enforcement`); release sign-off = Approve with exceptions (2026-08-01) |
| Phase D — Distributed Authority | Implementation coverage: HIGH — D-7 frozen, D-8B end-to-end, D-9 offline policy wired into the distributed PEP, D-1 enrollment + `arcana node key rotate`, D-6B-T sync transport with POLICY_DELTA/REVOCATION_DELTA + node persistence + compatibility negotiation, D-6 execution ledger, D-5 revocation store/convergence + emergency deny-list + SSE push channel, D-10 hostile matrices (15 + 9 fixtures, 0 bypasses), containment fixtures, Node CLI + Node 1.0 API contract draft. Release readiness: BLOCKED — TLS/mTLS, live Linux validation, L3, Node 1.0 freeze |
| Phase E — Protocol/SDK/Adapters | Implementation coverage: MODERATE–HIGH — protocol spec draft + conformance runner 5/5 (TS golden vectors, D-10 matrix, Rust verifier, SDK surface, adapter request-hash vectors) + AI SDK/MCP/Mastra/LangGraph governed adapters + certified vectors + live PEP HTTP transport (`src/v2/live-pep.ts`, `1eab77ae`). Release readiness: BLOCKED — macOS/Linux validation, ecosystem freeze, L3 |
| Phase F — Enterprise Control Plane | Service-core implementation: HIGH — F1–F13 cores implemented and mounted (`/api/enterprise/*` + SDK client: orgs, RBAC, fleet + rings + diagnostics, approvals + escalation, policy promotion/drafts, audit archive, security ops + anomaly, governance, reliability, federation + routing + revocation transport, SIEM, ticketing, webhooks, metering + usage export, entitlements, escalation + auditor consoles). Production mounting: SUBSTANTIAL. Secure production boundary: RESOLVED 2026-08-03 (BLK-F-AUTH-01 fixed and merged via PR #53; enterprise HTTP auth-boundary suite green). Release readiness: BLOCKED — remaining operator console work, live exercises, external assessment (F13) pending |
| TUI-1 | Historical independent tag (`arcana-tui-1-governance-observability`); not in current branch ancestry |
| TUI-2 — Interactive Authority Control | FROZEN (`arcana-tui-2-interactive-authority-control`) |
| TUI-2.1 — Production Integration + Polish | MOUNTED; freeze NOT AUTHORIZED. The Aug. 15–21 wave added durable/idempotent prompt delivery, scoped remembered permissions, configurable governance routing, subagent progress/navigation, rendering-lifecycle fixes, custom providers, voice hold gating, and recorder hardening. The 2026-08-22 pinned-runtime TUI working-tree run has 42 failures, so the former “automated green” claim is historical only. Remaining: regressions, manual validation, exact-commit evidence, and human freeze sign-off. |

## Development wave since the previous checkpoint (2026-08-15–21)

The following capabilities are implemented on `arcanagov`; this is development
progress, not a release or freeze declaration:

- **Governance and permissions:** workspace governance is live-reloadable and
  persistent; benign auto-allow is configurable and fail-closed when coarse
  risk requires review; remembered `always` decisions are persisted per
  project and agent and can be revoked; the signal-engine classifier can only
  escalate deterministic decisions, never downgrade them.
- **Execution protection:** file edits are classified for wholesale replacement
  and large changes, large writes can create backups, dependency-manifest
  changes receive install-level scrutiny, and guard rules are included in
  RunProof ML evidence.
- **Prompt/session reliability:** failed prompt delivery has durable bounded
  retry, concurrent/repeated deliveries deduplicate by message identity, new
  sessions remain visible while routing settles, and stale route effects are
  refused.
- **TUI and voice:** turn lifecycle no longer treats missing session status as
  active, completed reasoning/tool rows stop shimmering, code previews remain
  visible while highlighting, the header carries session ancestry, and ALT
  push-to-talk defaults to a configurable 3,000 ms activation threshold before
  microphone animation/recording. Windows DirectShow discovery, waveform, and
  recorder error handling were added.
- **Agents and integrations:** subagent delegation, approval attribution,
  empty-completion recovery, live progress, and child navigation were hardened.
  `arcana launch` now declares the same bounded A1 launch contract for 11
  runtimes: codex, claude, gemini, hermes, opencode, cursor, aider, continue,
  cline, windsurf, and copilot. A1 still makes no sandbox or exact-effect PEP
  claim.
- **Operator surfaces:** custom OpenAI-compatible provider URLs can
  self-register, the enterprise console gained models/proofs/sessions/settings/
  skills routes, and TUI customization expanded to 21 built-in themes.

Working-tree-only progress on 2026-08-22 adds revision-bound independent goal
verification, archive-and-clear on verified completion, quarantine of legacy
terminal goals, reserved `active.*`/`goal.*` memory keys, and a consolidated
session navigation rail. These changes must be committed and included in the
next exact-commit verification before they become checkpoint evidence.

## Performance audit (2026-08-20)

Comprehensive memory, CPU, and database performance audit completed. Full audit covers security model (A), TUI rendering (A), database (B+), memory (B), CPU (B), project structure (A-).

### Critical issues (7) — ALL FIXED ✅

| # | Category | Issue | File | Fix |
|---|----------|-------|------|-----|
| 1 | Memory | `fileCache` TTL bypass in `cachedExistsSync` | `engine/src/config/config.ts:46` | ✅ Fixed: Added TTL check |
| 2 | Memory | `validatorCache` never evicts heavy AJV validators | `engine/src/workflow/validate.ts:4` | ✅ Fixed: FIFO eviction (max 100) |
| 3 | Memory | `PubSub.unbounded` in event system | `core/src/event.ts:185,198` | ✅ Fixed: `PubSub.bounded(4096)` |
| 4 | Memory | `Queue.unbounded` in LLM runtime | `engine/src/session/llm/native-runtime.ts:107` | ✅ Fixed: `Queue.bounded(1024)` |
| 5 | Memory | Event listener leaks without cleanup | `tui/src/context/project.tsx:70`, `tui/src/routes/session/index.tsx` | ✅ Fixed: Added `onCleanup` |
| 6 | Database | N+1 query in ClaimStore | `engine/src/session/epistemic/claim-store.ts:74-84` | ✅ Fixed: Batch `inArray` query |
| 7 | CPU | O(n²) path deduplication | `tui/src/shell/command-spine/spine-mapper.ts:2129` | ✅ Fixed: `Set` instead of `Array.includes` |

### Medium issues (14) — ALL FIXED ✅

- ✅ 39 instances of `concurrency: "unbounded"` bounded to 2-16
- ✅ 3 unbounded database queries limited (`stats.ts:1000`, `fence.ts:10000`, `project.ts:500`)
- ✅ LSP client Maps — LRU eviction (max 100)
- ✅ In-memory stores — TTL eviction
- ✅ JSON serialization — cached length
- ⏭️ Double array iteration — Skipped (not a real issue)
- ⏭️ Excessive memoization — Skipped (memos are correct)

### Low issues (18) — ALL FIXED ✅

- ✅ `lazy-loader.ts` cache — LRU eviction (max 50)
- ✅ `environmentCompatibilityCache` — TTL (1 hour) + LRU (max 100)
- ✅ 15 packages lack READMEs — Added README.md to all 16 packages
- ⏭️ `which-key.tsx` memos — Skipped (correct and efficient)

### Follow-up validation

All enumerated critical, medium, and low code changes above are implemented.
The remaining work is measurement: rerun startup, long-session memory, database,
and renderer benchmarks at the exact release candidate and attach the raw
evidence before freeze.

## Product tracks and roadmap (2026-08-02)

Product stack:

```text
Arcana Runtime
├── Arcana CLI
├── Arcana TUI
├── Arcana Desktop
├── Arcana Node
├── Arcana SDK
└── Arcana Control
```

- **Arcana Desktop** = local approval and forensic companion (M1, per
  ADR-004). It supervises the local runtime lifecycle; renders the same
  canonical governance semantics; presents routed approvals, evidence,
  proofs, restart recovery, and native notifications; and never becomes an
  independent policy, approval, execution, or evidence authority. The minimal
  M1 Desktop surface: runtime lifecycle, reconnect/resync, pending-approval
  notification, exact-request inspection, approve/deny through the
  authoritative runtime, proof inspection, restart recovery.
- **Arcana Control** = remote enterprise governance plane (fleet, policy
  distribution, central approvals, remote revocation, compliance).
  **Service cores IMPLEMENTED and MOUNTED as `/api/enterprise/*` + SDK
  client (2026-08-02)**; escalation (F5) and auditor (F6) consoles mounted
  (2026-08-04); broader operator console UI pending; secure
  authenticated-principal binding resolved (BLK-F-AUTH-01 via PR #53,
  2026-08-03).
- **Arcana 1.0 (M1)** = authoritative local runtime + CLI/TUI (primary AI
  work surface) + Arcana Desktop (local approval and forensic companion) +
  one certified external-agent integration, per ADR-004.

Immediate roadmap:

```text
TUI-2.1 freeze
→ CLI 1.0
→ local daemon/API/event contract
→ first external adapter
→ Desktop 1.0
→ Node 1.0
→ Control 1.0
```

## Active goal scope (TUI-2.1)

Active goal: **TUI-2.1 production polish and freeze** (turn grouping,
governance aggregation, progressive disclosure, width/theme/focus polish,
approval lifecycle validation, restart/session isolation, live stream
validation, performance, exact-commit verification, human freeze sign-off,
immutable tag).

Explicitly **outside** the active goal and NOT started by this sprint:

- Arcana Desktop implementation (M1 companion per ADR-004; outside the
  TUI-2.1 freeze sprint goal)
- Node 1.0 work
- Phase D expansion beyond the TUI-2.1 freeze prerequisites
- New product features beyond TUI-2.1 polish

## Capability matrix

Columns are independent: code existence, production mounting, automated
validation, manual validation, external validation, release.

| Capability | Code exists | Production mounted | Automated validated | Manually validated | Externally validated | Released |
|---|---|:--:|:--:|:--:|:--:|:--:|
| Intent-bound authorization (request/contract/criterion hash) | Yes | Yes | Yes | Partial | No | No |
| Deterministic PDP + fresh PEP enforcement | Yes | Yes | Yes | Partial | No | No |
| Durable capabilities, use-limits, cascade revocation | Yes | Yes | Yes | Partial | No | No |
| Durable approvals (PENDING→APPROVED→CLAIMED→CONSUMED) | Yes | Yes | Yes | Pending (WS1) | No | No |
| RunProof + verified completion | Yes | Yes | Yes | Partial | No | No |
| Governance projection + Command Spine (conversation/operations/forensic) | Yes | Yes | Yes | Partial | No | No |
| Configurable governance + agent-scoped remembered permissions | Yes | Yes | Yes | Partial | No | No |
| File-edit guard + escalation-only ML permission classifier | Yes | Yes | Yes | Partial | No | No |
| Approval routing (LOCAL_TUI/DESKTOP_PREFERRED/DESKTOP_REQUIRED/CENTRAL_REQUIRED) + Desktop heartbeat awareness | Yes | Yes | Yes | Partial | No | No |
| Independent goal completion verifier (deterministic gate + bounded model verification) | Yes (5bb8d9e8) | Yes | Focused tests pass (5/0 goal-verifier, 19/0 core goal, 3/0 engine goal, 4/0 runner-proof) | No | No | No |
| Reserved memory keys (runtime state isolation) | Yes (5bb8d9e8) | Yes | Focused tests pass (28/0 store, 4/0 facts-md) | No | No | No |
| TUI-2.1 spine polish (grouping, aggregation, filters, compact rows, click-toggle) | Yes | Yes | Yes | In progress | No | No |
| Distributed authority (signed envelopes, sync, D-7) | Partial | Partial | Partial | No | No | No |
| Host containment (filesystem/process/network) | Partial | Partial | Partial | No | No | No |
| External CLI adapters (11 runtimes) | Yes (A1 launch wrappers) | No exact-effect governance | Partial | No | No | No |

External adapters: A1 launch wrappers implemented for 11 runtimes (`arcana
launch <runtime>`: declaration, `--dry-run`, supervision, durable evidence;
no sandbox, file-read containment, or exact-effect PEP claim). No A2/A3 adapter
or independently validated production adapter exists.

## Test checkpoints and verification evidence

### Current working tree (2026-08-22)

| Gate | Result |
|---|---|
| Runtime | Pinned Bun 1.3.14 on Windows; a Bun 1.4.0 corroboration run reproduced the same 42-failure count |
| TUI suite | **1132 pass / 1 skip / 42 fail (1175 tests)** under Bun 1.3.14. Failures cluster in SDK/project test-provider setup, renderer interaction tests, voice/module isolation, and one teardown hook. Not release-green. |
| Focused TUI regressions | 167 pass / 0 skip / 1 fail; the same run also reported 1 module-loader error across voice, prompt queue, shimmer, turn lifecycle, navigation, mapper, receipt, and subagent UX tests |
| Focused engine regressions | 225 pass / 18 skip / 4 fail. Goal verifier, memory prompt boundary, scoped permissions, launch declarations, and prompt dedup checks pass; one HTTP timeout, one queued-static-reply failure, and two task empty-output timeout failures remain. |
| Focused core + memory regressions | 71 pass / 0 skip / 1 fail; the failure is a suite teardown-hook timeout after the individual tests pass |
| TUI typecheck | PASS (`bun --cwd packages/tui typecheck`) |
| Engine typecheck | PASS (`bun run --filter @arcana/engine typecheck`) |
| Validation level | Working-tree L1/L2 evidence only; not a freeze run and not external validation |

## Historical freeze evidence (2026-08-02–09)

| Gate | Result |
|---|---|
| TUI suite | 786 pass / 1 skip / 0 fail (787 tests) — rerun 2026-08-02 after F-23..F-28 keyboard/gate fixes |
| Repo-wide typecheck | 16/16 packages |
| Build | 8/8 tasks (engine binaries smoke-tested; `0.0.0-phase-d-implementation-202608021350`) |
| Core suite | 1465 pass / 7 skip / 0 fail (1,472 tests, 175 files — clean rerun 2026-08-02 incl. enterprise cores, delta bundles, revocation hostile fixtures, containment fixtures) |
| Engine suite | 2026-08-02 baseline rerun: 4250 pass / 33 fail / 1 skip (4358 tests). All 33 classified and fixed as harness/environment issues: 30 CLI subprocess tests spawned bun by name while it is not on PATH (fixed: process.execPath in test/lib/cli-process.ts); 2 replay fixtures needed bun on PATH (fixed: PATH bootstrap + explicit execSync env); 1 Windows shell test assumed Git Bash cygpath maps drive-stripped paths to C:\Windows\Temp (fixed: assert cross-variant normalization instead of a machine-specific root). Load-bound snapshot tests received justified 10s per-test timeouts. Stability gate rewritten as fresh-process iterations (test:engine:stability); 3/3 clean. Concurrency 1/4/8, randomize, and seeded randomize all 0 fail. Canonical full-suite rerun 2026-08-03: 4302 pass / 74 skip / 1 todo / 0 fail (4377 tests, 829s) - clean; raw log committed at docs/evidence/full-suite-canonical-2026-08-03.log.err |
| Arcana CLI/proof suite | 116 pass / 0 fail (2026-08-02) |
| SDK JS suite | 34 pass / 0 fail (2026-08-02, full `src` run incl. enterprise client, adapters, vectors, SSE) |
| Conformance runner | 5/5 suites (TS golden vectors + D-10 matrix + Rust verifier + SDK surface + adapter vectors; 46 crypto + 4 adapter vectors + 15 hostile fixtures) |
| ML eval / smoke | Earlier baseline: ml:eval 13/13, smoke 8/8 |
| Validation level | Strongest at L1–L2 (production-path integration + internal adversarial); L3+ independent validation not obtained |

**Checkpoint note (2026-08-03):** the implementation checkpoint advanced to
`63d71f07` via five merged upstream PRs — #43 (ci base green), #44 (ci split
verification gates), #45 (ml-eval script routing), #46 (enterprise tailwind
import fix), #47 (shared governance projection contract docs). These are
engineering/build/CI and documentation changes; they do not alter the test
counts above, which remain the 2026-08-02/03 figures recorded in this file.

**Checkpoint note (2026-08-05):** the current implementation checkpoint is
`b5d192a1` — the HEAD of `phase-d-implementation` after merged PRs #79–#82
(#81 codex launch adapter A1 certification, #82 DX examples). The status
snapshot and evidence log were generated at `4984d154` before #81/#82
merged; the checkpoint field was advanced to `b5d192a1` on rebase. Earlier
checkpoints (`0392ad7b`, `63d71f07`, `a2491be5`) are historical milestones
in the branch ancestry and must not be read as current.

## Phase A–F audit artifacts (2026-08-02)

## Runtime approval routing & Desktop contract (2026-08-03)

- Routing model implemented and durable: LOCAL_TUI, DESKTOP_PREFERRED,
  DESKTOP_REQUIRED, CENTRAL_REQUIRED; policy-driven by workspace, action,
  capability, risk class, deployment mode; persisted on approval records.
- Decision surface is bound to the authenticated caller (local TUI session
  endpoint vs workspace/Desktop runtime API); a live Desktop heartbeat is
  advisory availability, never proof of origin.
- Runtime API mounted: /approvals, /approvals/:id, approve/deny/revoke,
  /sessions, /sessions/:id, /proofs/:id, /desktop/heartbeat
  (plus existing /event, /health). OpenAPI: contracts/approval-api.v1.yaml;
  runtime contract doc: docs/RUNTIME-API-CONTRACT.md.
- REVOKE lifecycle added (PENDING|APPROVED -> INVALIDATED); revoked
  approvals can never claim (zero effects). Duplicate decisions/consumes are
  refused; changed request hash/version/revision fail machine-readable stale.
- Operator identity is derived from authenticated server context; client
  body fields (approvedBy/actorUserId/operatorId) cannot establish
  authority; x-arcana-session is a restriction only.
- TUI projection: default conversation mode aggregates healthy governance
  events into compact lifecycle rows; operations and forensic modes expose
  grouped tool/governance and exact durable evidence; security-critical rows
  always break through.

The Phase A–F completion audit added a blocker register, a living task
register, phase/task traceability, and a checkpoint completion report:

- Blockers: `docs/BLOCKERS.md` (consolidated register, 2026-08-02).
- Task register + traceability: `docs/TASKS.md` (living; new `AUD-` tasks).
- Completion report (with bugs): `docs/COMPLETION-REPORT.md`.
- Freeze drafts + release plan: `docs/FREEZE-RELEASE.md`.
- Protocol freeze draft: PROTOCOL-1.0-SPEC (draft, published 2026-08-02).
- Conformance suite + runner: CONFORMANCE-SUITE + `script/conformance.ts`
  (TS + Rust independent implementations, 46 vectors).

Nothing in these artifacts changes the milestone matrix above; they make the
gaps and evidence explicit.

## Goal verification system — committed (2026-08-22, `5bb8d9e8`)

An independent completion verifier prevents workers from self-certifying
completion. The flow:

1. **goal_set** records an explicit multi-step mutation objective (greetings,
   explanations, reviews, and read-only work stay goal-free).
2. **goal_check(status=complete)** submits a completion claim; this transitions
   the goal to `complete_pending_verify` and freezes all mutation tools.
3. An independent model-less deterministic gate runs first (required
   obligations, contract resolution, trace integrity, execution receipts).
   If it rejects, the goal reopens immediately without calling a model.
4. If the deterministic gate passes, a bounded evidence packet is sent to a
   separate model call (the "verifier") with temperature=0, no tools, and
   a structured Zod output schema (`GoalVerifierOutput`).
5. The verifier's evidence refs are validated against the bounded receipt set;
   out-of-scope refs or contradictory fields (verified + unmet criteria)
   cause automatic rejection.
6. On **verified**: the goal is archived (`verified_complete`), the active slot
   is cleared, and mutation tools are unfrozen.
7. On **rejected**: the same goal reopens (`in_progress`) with unmet criteria
   recorded; the worker must continue the same objective.
8. On **error**: the goal moves to `blocked` for operator review.

Key invariants:
- The worker cannot choose the verdict.
- Model citations must resolve to receipts from the current objective's
  evidence window (capped at 20 most recent).
- `complete` and `complete_unverified` (legacy) both freeze mutations.
- `complete_pending_verify` also freezes mutations during verification.
- Legacy `complete`/`complete_unverified` states are migrated on read via
  `migrateLegacyTerminalGoal()` and archived as `legacy_unverified`.

Goal status state machine:
```text
unset → in_progress → complete_pending_verify → verified (archived, slot cleared)
                     ↗ rejected → in_progress (reopen)
                     ↗ error → blocked (operator review)
in_progress → blocked
blocked → in_progress
```

Working-tree implementation: `packages/core/src/session/goal.ts` (state machine +
persistence), `packages/engine/src/session/goal-verifier.ts` (deterministic
gate + model verifier), `packages/arcana/src/agent/runner.ts`
(`verifyGoalCompletion` for CLI agent).

## Reserved memory keys — committed (2026-08-22, `5bb8d9e8`)

Runtime state keys (`active.*`, `goal.*`) are reserved and cannot be
persisted as user facts. The `isReservedMemoryKey()` filter in
`packages/memory/src/store.ts` rejects these keys at write time
(`ReservedMemoryKeyError`) and filters them out of:
- FACTS.md rendering and parsing
- Cloud sync (factsForCloud)
- System prompt injection
- Memory search results
- CLI memory merge

This prevents internal runtime state from masquerading as user knowledge
or leaking across sessions.

## Enforcement boundaries (current)

- **Logical PEP boundary:** Arcana-native effect paths (tools, session
  commands, HTTP/SDK surfaces) — enforced.
- **Physical containment:** `SafeBoundedFileReader` v2 (lexical, realpath,
  same-handle, object-identity); Linux `openat2 RESOLVE_BENEATH` and Windows
  handle final-path validation are scaffold-only; namespaces/seccomp/job
  objects/credential brokering not deployed.
- **External CLIs and processes outside the effect boundary:** NOT governed
  (target architecture).
- Detail matrix: security effect-coverage matrix (EFFECT-COVERAGE).

## Release blockers

1. Restore the full TUI and focused engine/core suites to green; the 42 TUI
   failures reproduce under both pinned Bun 1.3.14 and Bun 1.4.0 and therefore
   cannot be dismissed as runtime-version skew.
2. TUI-2.1 freeze gates: 11-phase manual smoke, width matrix, dark/light theme
   matrix, approval lifecycle observation, restart recovery, session
   isolation, performance measurements, 6-checkpoint live stream protocol.
3. Engine/core/TUI/CLI/SDK/Rust suite rerun at the exact final commit.
4. Mainline promotion (`master` fast-forward to `arcanagov`).
5. Independent validation (L3+ reproduction of the Phase C evaluation).
6. Phase D/E/F remaining work per `docs/BLOCKERS.md`: in-repo engineering is
   substantially complete, but the remaining work is NOT exclusively
   operational/external: TLS/mTLS, live Linux validation, remaining operator
   console work (escalation and auditor consoles mounted 2026-08-04), live
   DR/compromised-node/key exercises, F13 external assessment, L3
   reproduction, Node 1.0 freeze sign-off, and license text review.
   BLK-F-AUTH-01 (authenticated administrative identity binding) is resolved
   via PR #53 (2026-08-03).

## Nonclaims

- No hostile-host containment claim; hardware-backed attestation + explicit
  trust model required before claiming it.
- No universal exact-effect governance of external CLIs. Eleven A1 launch
  wrappers exist, but A1 is supervision/evidence only and explicitly does not
  claim sandboxing, in-process file-read containment, or PEP mediation.
- No distributed/fleet production claim; Phase D in-repo engineering coverage
  is high but production deployment (TLS/mTLS), live Linux validation, and
  Node 1.0 freeze remain.
- No public proof protocol (stable schemas, canonical serialization, external
  verifier, public vectors) published yet.
- No independent/third-party security assessment yet.

## Validation levels

L0 unit/property · L1 production-path integration · L2 internal adversarial ·
L3 independent reproduction · L4 third-party assessment · L5 bounded-pilot
production evidence. Arcana is currently strongest at L1–L2.
