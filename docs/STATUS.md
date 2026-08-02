---
document_class: status
authority: current_status
status: current
status_source: self
evaluated_commit: c07faba6
current_branch_at_publication: phase-d-implementation
last_verified: 2026-08-02
supersedes: status claims inside Arcana_Project_Master_Specification.md Parts I-III
---

# Arcana — Live Status

This is the **only current-status authority**. The architecture compendium
(`docs/arcana-Master/Arcana_Project_Master_Specification.md`) is a reference
reader; its Parts I–III are historical snapshots and their status claims are
superseded by this file.

**Authority note:** `docs/STATUS.md` is the primary status authority. The
`.hermes/docs/arcana/docs/STATUS.md` copy is a synchronized mirror and is
secondary; never edit the mirror independently.

## Evaluated commit and branches

| Field | Value |
|---|---|
| Current implementation branch | `phase-d-implementation` |
| Committed HEAD at last verification | `e57c5ca2` (2026-08-02, `chore: checkpoint TUI-2.1 polish + daemon respawn + inspector + Phase A-F audit docs`) |
| Uncommitted worktree | clean at checkpoint `e57c5ca2`; subsequent docs-only updates tracked below |
| Default branch (`master` / `origin/master`) | stale — Phase B/C, D-7, TUI-2 milestone commits not on it; mainline promotion pending (post-sign-off release action) |
| Release version | pre-release builds only (`0.0.0-phase-d-implementation-*`) |
| Last verification date | 2026-08-02 (checkpoint; full engine rerun pending) |
| Supported platforms | Windows 10/11 (primary, tested); Linux (D-6A-L identity scaffold; live validation pending) |

## Milestone matrix

| Milestone | Status |
|---|---|
| Phase A — Epistemic Foundation | COMPLETE / FROZEN (declared complete in master spec) |
| Phase B — Verification and Replay | COMPLETE / FROZEN (`arcana-epistemic-runtime-phase-b`) |
| Phase C — Local Governed Autonomy | EVALUATION PASS; tags exist (`arcana-governed-autonomy-phase-c`, `phase-c-production-enforcement`); release sign-off = Approve with exceptions (2026-08-01) |
| Phase D — Distributed Authority | ACTIVE DEVELOPMENT, ~45–55% by playbook weighting; D-7 frozen (`arcana-phase-d7-local-distributed-authority`), D-8A proof batching implemented, **D-8B proof registration end-to-end (incl. local proof store integration) + D-9 offline grant/lease policy + D-1 enrollment w/ HTTP + D-6B-T signed-envelope sync transport + D-4 signed policy bundle store + D-6 execution ledger + governed distributed PEP + D-5 revocation store/convergence + emergency deny-list + D-10 hostile-node matrix + Node CLI + Node 1.0 API contract draft (2026-08-02)**; Node 1.0 release freeze pending (TLS, live Linux, L3) |
| Phase F — Enterprise Control Plane | STARTED — F1..F11 cores implemented (2026-08-02): tenant model, RBAC, policy lifecycle, fleet, approvals, audit archive, HA/DR, federation, security ops, data governance, admin events; F12/F13 pending |
| TUI-1 | Historical independent tag (`arcana-tui-1-governance-observability`); not in current branch ancestry |
| TUI-2 — Interactive Authority Control | FROZEN (`arcana-tui-2-interactive-authority-control`) |
| TUI-2.1 — Production Integration + Polish | MOUNTED, AUTOMATED GREEN; freeze NOT AUTHORIZED. Manual validation in progress (2026-08-02): contract admission, tool execution, governance aggregation, proof axes, approval via gate, denial with zero effects, restart durability, daemon respawn on idle-stop (F-22) observed, approval inspector + spine keys implemented (F-23) with regression tests; approval lifecycle via spine keys, matrices, stream protocol, and performance pending |

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

- **Arcana Desktop** = local operator workstation. Formalized as a parallel
  track; specification only, NOT implemented
  (`docs/roadmap/DESKTOP-1.0-SPEC.md`). Not required for Arcana 1.0.
- **Arcana Control** = remote enterprise governance plane (fleet, policy
  distribution, central approvals, remote revocation, compliance). Not
  implemented; depends on Phase D.
- **Arcana 1.0** = secure local runtime + CLI/TUI + one external adapter.

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

- Arcana Desktop implementation (spec-only; `docs/roadmap/DESKTOP-1.0-SPEC.md`)
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
| Governance projection + Command Spine | Yes | Yes | Yes | Partial | No | No |
| TUI-2.1 spine polish (grouping, aggregation, filters, compact rows, click-toggle) | Yes | Yes | Yes | In progress | No | No |
| Distributed authority (signed envelopes, sync, D-7) | Partial | Partial | Partial | No | No | No |
| Host containment (filesystem/process/network) | Partial | Partial | Partial | No | No | No |
| External CLI adapters (codex/claude/gemini) | No | No | No | No | No | No |

## Test checkpoint (2026-08-02)

| Gate | Result |
|---|---|
| TUI suite | 781 pass / 1 skip / 0 fail (782 tests) — rerun 2026-08-02 |
| Repo-wide typecheck | 16/16 packages |
| Build | 8/8 tasks (engine binaries smoke-tested; `0.0.0-phase-d-implementation-202608021350`) |
| Core suite | 1373 pass / 7 skip / 0 fail (1,380 tests, clean rerun 2026-08-02 incl. D-8B/D-9/D-1/D-6B-T/D-4/D-6/D-PEP/D-5/D-10 suites) |
| Engine suite | CLEAN full rerun 2026-08-02 at the audit worktree (now committed as `e57c5ca2`): 4251 pass / 74 skip / 1 todo / 0 fail (4,326 tests, 990.6s). Includes post-run fixes: OpenTUI 0.4.5 worker-path patch, daemon obligation-template seed idempotency, completion-gate per-contract idempotency, PEP criteria receipts. Re-verify at the exact final commit |
| Arcana CLI/proof suite | 116 pass / 0 fail (2026-08-02) |
| SDK JS suite | 7 pass / 0 fail (2026-08-02) |
| Rust conformance | 2 pass / 0 fail (2026-08-02) |
| ML eval / smoke | Earlier baseline: ml:eval 13/13, smoke 8/8 |
| Validation level | Strongest at L1–L2 (production-path integration + internal adversarial); L3+ independent validation not obtained |

## Phase A–F audit artifacts (2026-08-02)

The Phase A–F completion audit added a blocker register, a living task
register, phase/task traceability, and a checkpoint completion report:

- Blockers: `docs/blockers/README.md` + per-phase registers (A/B/C, TUI,
  CLI, D, E, F, Arcana 1.0).
- Task register: `docs/roadmap/TASK-REGISTER.md` (living; new `AUD-` tasks).
- Traceability: `docs/roadmap/PHASE-TRACEABILITY.md`.
- Completion report (with bugs): `docs/releases/COMPLETION-REPORT-2026-08-02.md`.
- Protocol freeze draft: `docs/protocol/PROTOCOL-1.0-SPEC.md`.
- Conformance suite + runner: `docs/protocol/CONFORMANCE-SUITE.md`,
  `script/conformance.ts` (TS + Rust independent implementations, 46 vectors).

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
- Detail matrix: `docs/security/EFFECT-COVERAGE.md`.

## Release blockers

1. TUI-2.1 freeze gates: 11-phase manual smoke, width matrix, dark/light theme
   matrix, approval lifecycle observation, restart recovery, session
   isolation, performance measurements, 6-checkpoint live stream protocol.
2. Engine/core/TUI/CLI/SDK/Rust suite rerun at the exact final commit.
3. Mainline promotion (`master` fast-forward to `phase-d-implementation`).
4. Independent validation (L3+ reproduction of the Phase C evaluation).
5. Phase D remaining work (BLK-D-01..09), Phase E (BLK-E-01..10), Phase F
   (BLK-F-01..13) per `docs/blockers/`.

## Nonclaims

- No hostile-host containment claim; hardware-backed attestation + explicit
  trust model required before claiming it.
- No universal governance of external CLIs yet (A0–A3 assurance levels are a
  product contract, not an implemented surface).
- No distributed/fleet production claim; Phase D is ~45–55% and D-7 is the
  only frozen sub-milestone.
- No public proof protocol (stable schemas, canonical serialization, external
  verifier, public vectors) published yet.
- No independent/third-party security assessment yet.

## Validation levels

L0 unit/property · L1 production-path integration · L2 internal adversarial ·
L3 independent reproduction · L4 third-party assessment · L5 bounded-pilot
production evidence. Arcana is currently strongest at L1–L2.
