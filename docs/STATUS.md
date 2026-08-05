---
document_class: status
authority: current_status
status: current
status_source: self
implementation_checkpoint: 4984d154
documentation_reconciliation_commit: 882ea468
current_branch_at_publication: phase-d-implementation
last_verified: 2026-08-05
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
| Current implementation branch | `phase-d-implementation` |
| Implementation checkpoint | `4984d154` (2026-08-05; merged via PRs #79/#80) |
| Documentation reconciliation commit | `882ea468` (baseline for the consolidated files) |
| Uncommitted worktree | clean at implementation checkpoint `4984d154` |
| Default branch (`master` / `origin/master`) | stale — Phase B/C, D-7, TUI-2 milestone commits not on it; mainline promotion pending (post-sign-off release action) |
| Release version | pre-release builds only (`0.0.0-phase-d-implementation-*`) |
| Last verification date | 2026-08-05 (fresh partial rerun at `4984d154`: TUI 819 pass / 1 skip / 0 fail, Arcana CLI 124 pass / 0 fail, SDK 37 pass / 0 fail; core and engine fresh runs had host-environment-specific failures (config loading, HTTP, subprocess/timing classes) so the documented canonical 2026-08-03 figures are retained — engine 4302 pass / 74 skip / 1 todo / 0 fail; per-suite detail in `docs/CURRENT-STATE.json`) |
| Supported platforms | Windows 10/11 (primary, tested); Linux (D-6A-L identity scaffold; live validation pending) |

## Milestone matrix

| Milestone | Status |
|---|---|
| Phase A — Epistemic Foundation | COMPLETE / FROZEN (declared complete in master spec) |
| Phase B — Verification and Replay | COMPLETE / FROZEN (`arcana-epistemic-runtime-phase-b`) |
| Phase C — Local Governed Autonomy | EVALUATION PASS; tags exist (`arcana-governed-autonomy-phase-c`, `phase-c-production-enforcement`); release sign-off = Approve with exceptions (2026-08-01) |
| Phase D — Distributed Authority | Implementation coverage: HIGH — D-7 frozen, D-8B end-to-end, D-9 offline policy wired into the distributed PEP, D-1 enrollment + `arcana node key rotate`, D-6B-T sync transport with POLICY_DELTA/REVOCATION_DELTA + node persistence + compatibility negotiation, D-6 execution ledger, D-5 revocation store/convergence + emergency deny-list + SSE push channel, D-10 hostile matrices (15 + 9 fixtures, 0 bypasses), containment fixtures, Node CLI + Node 1.0 API contract draft. Release readiness: BLOCKED — TLS/mTLS, live Linux validation, L3, Node 1.0 freeze |
| Phase E — Protocol/SDK/Adapters | Implementation coverage: MODERATE–HIGH — protocol spec draft + conformance runner 5/5 (TS golden vectors, D-10 matrix, Rust verifier, SDK surface, adapter request-hash vectors) + AI SDK/MCP/Mastra/LangGraph governed adapters + certified vectors. Release readiness: BLOCKED — live PEP transport, macOS/Linux validation, ecosystem freeze, L3 |
| Phase F — Enterprise Control Plane | Service-core implementation: HIGH — F1–F13 cores implemented and mounted (`/api/enterprise/*` + SDK client: orgs, RBAC, fleet + rings + diagnostics, approvals + escalation, policy promotion/drafts, audit archive, security ops + anomaly, governance, reliability, federation + routing + revocation transport, SIEM, ticketing, webhooks, metering + usage export, entitlements, escalation + auditor consoles). Production mounting: SUBSTANTIAL. Secure production boundary: RESOLVED 2026-08-03 (BLK-F-AUTH-01 fixed and merged via PR #53; enterprise HTTP auth-boundary suite green). Release readiness: BLOCKED — remaining operator console work, live exercises, external assessment (F13) pending |
| TUI-1 | Historical independent tag (`arcana-tui-1-governance-observability`); not in current branch ancestry |
| TUI-2 — Interactive Authority Control | FROZEN (`arcana-tui-2-interactive-authority-control`) |
| TUI-2.1 — Production Integration + Polish | MOUNTED, AUTOMATED GREEN (TUI 787 tests, 0 fail); freeze NOT AUTHORIZED. F-22..F-28 manual items verified per the 2026-08-02 status: daemon respawn on idle-stop (F-22), approval inspector + spine keys (F-23), `v` inspect for any approval state + guidance toast (F-24), Esc always leaves the composer without interrupting (F-25), Esc inert on ACTION GATES (F-26), spine navigation + `v` inspection available while a gate is open (F-27), permission-gate `v` inspector (F-28), plus contract admission, tool execution, governance aggregation, proof axes, approval via gate, denial with zero effects, restart durability. Automated validation for approval lifecycle via spine keys, routing matrices, live stream protocol, and performance is DONE via merged PR #49 (2026-08-03). Remaining: the manual validation phases per TUI-2.1-MANUAL-SMOKE-TEST.md plus human freeze sign-off |

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
| Approval routing (LOCAL_TUI/DESKTOP_PREFERRED/DESKTOP_REQUIRED/CENTRAL_REQUIRED) + Desktop heartbeat awareness | Yes | Yes | Yes | Partial | No | No |
| TUI-2.1 spine polish (grouping, aggregation, filters, compact rows, click-toggle) | Yes | Yes | Yes | In progress | No | No |
| Distributed authority (signed envelopes, sync, D-7) | Partial | Partial | Partial | No | No | No |
| Host containment (filesystem/process/network) | Partial | Partial | Partial | No | No | No |
| External CLI adapters (codex/claude/gemini) | Yes (A1 launch scaffold) | No | Partial | No | No | No |

External adapters: A1 launch scaffold implemented (`arcana launch <runtime>`:
declaration, `--dry-run`, supervision, durable evidence; no sandbox claim);
production-certified adapter: no (BLK-CLI-01).

## Test checkpoint (2026-08-02)

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
`4984d154` — the HEAD of `phase-d-implementation` after merged PRs #79
(ADR-004 M1 product-surface boundary) and #80 (D-7 deployment runbook). This
is the authoritative "current" commit. Earlier checkpoints (`0392ad7b`,
`63d71f07`, `a2491be5`) are historical milestones in the branch ancestry and
must not be read as current.

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

1. TUI-2.1 freeze gates: 11-phase manual smoke, width matrix, dark/light theme
   matrix, approval lifecycle observation, restart recovery, session
   isolation, performance measurements, 6-checkpoint live stream protocol.
2. Engine/core/TUI/CLI/SDK/Rust suite rerun at the exact final commit.
3. Mainline promotion (`master` fast-forward to `phase-d-implementation`).
4. Independent validation (L3+ reproduction of the Phase C evaluation).
5. Phase D/E/F remaining work per `docs/BLOCKERS.md`: in-repo engineering is
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
- No universal governance of external CLIs yet (A0–A3 assurance levels are a
  product contract, not an implemented surface).
- No distributed/fleet production claim; Phase D in-repo engineering is
  complete but production deployment (TLS/mTLS), live Linux validation, and
  Node 1.0 freeze remain.
- No public proof protocol (stable schemas, canonical serialization, external
  verifier, public vectors) published yet.
- No independent/third-party security assessment yet.

## Validation levels

L0 unit/property · L1 production-path integration · L2 internal adversarial ·
L3 independent reproduction · L4 third-party assessment · L5 bounded-pilot
production evidence. Arcana is currently strongest at L1–L2.
