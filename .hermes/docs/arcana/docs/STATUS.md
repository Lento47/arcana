---
document_class: status
authority: current_status
status: current
status_source: self
implementation_checkpoint: 0392ad7b
documentation_reconciliation_commit: 882ea468
current_branch_at_publication: phase-d-implementation
last_verified: 2026-08-02
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
| Implementation checkpoint | `0392ad7b` (2026-08-02; suites verified on the pre-commit worktree) |
| Documentation reconciliation commit | `882ea468` (baseline for the consolidated files) |
| Uncommitted worktree | clean at implementation checkpoint `0392ad7b` |
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
| Phase D — Distributed Authority | Implementation coverage: HIGH — D-7 frozen, D-8B end-to-end, D-9 offline policy, D-1 enrollment + `arcana node key rotate`, D-6B-T sync transport with POLICY_DELTA/REVOCATION_DELTA + node persistence + compatibility negotiation, D-6 execution ledger, D-5 revocation store/convergence + emergency deny-list + SSE push channel, D-10 hostile matrices (15 + 9 fixtures, 0 bypasses), containment fixtures, Node CLI + Node 1.0 API contract draft. Release readiness: BLOCKED — TLS/mTLS, live Linux validation, offline PEP wiring, L3, Node 1.0 freeze |
| Phase E — Protocol/SDK/Adapters | Implementation coverage: MODERATE–HIGH — protocol spec draft + conformance runner 5/5 (TS golden vectors, D-10 matrix, Rust verifier, SDK surface, adapter request-hash vectors) + AI SDK/MCP/Mastra/LangGraph governed adapters + certified vectors. Release readiness: BLOCKED — live PEP transport, macOS/Linux validation, ecosystem freeze, L3 |
| Phase F — Enterprise Control Plane | Service-core implementation: HIGH — F1–F13 cores implemented and mounted (`/api/enterprise/*` + SDK client: orgs, RBAC, fleet + rings + diagnostics, approvals + escalation, policy promotion/drafts, audit archive, security ops + anomaly, governance, reliability, federation + routing + revocation transport, SIEM, ticketing, webhooks, metering + usage export, entitlements). Production mounting: SUBSTANTIAL. Secure production boundary: BLOCKED (BLK-F-AUTH-01). Release readiness: BLOCKED — TUI consoles, live exercises, external assessment (F13) pending |
| TUI-1 | Historical independent tag (`arcana-tui-1-governance-observability`); not in current branch ancestry |
| TUI-2 — Interactive Authority Control | FROZEN (`arcana-tui-2-interactive-authority-control`) |
| TUI-2.1 — Production Integration + Polish | MOUNTED, AUTOMATED GREEN (TUI 787 tests, 0 fail); freeze NOT AUTHORIZED. Manual validation in progress (2026-08-02): contract admission, tool execution, governance aggregation, proof axes, approval via gate, denial with zero effects, restart durability, daemon respawn on idle-stop (F-22), approval inspector + spine keys (F-23), `v` inspect for any approval state + guidance toast (F-24), Esc always leaves the composer without interrupting (F-25), Esc inert on ACTION GATES (F-26), spine navigation + `v` inspection available while a gate is open (F-27), permission-gate `v` inspector (F-28); approval lifecycle via spine keys, matrices, stream protocol, and performance pending |

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
  client (2026-08-02)**; operator console UI (TUI/web dashboard) pending;
  secure authenticated-principal binding unresolved (BLK-F-AUTH-01) — the
  mounted surface is not a production-ready boundary until that P0 closes.
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
| Governance projection + Command Spine | Yes | Yes | Yes | Partial | No | No |
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
| Engine suite | Full rerun 2026-08-02: 4305 pass / 1 todo / 4 fail under the default 5s per-test timeout (4384 tests). The 4 failures are timing-bound: `revert + compact restore` ×2 pass at 6–7s (`--timeout 30000`), `snapshot state isolation` + `diffFull batch order` pass in isolation (~4s, load flakiness). Engine code unchanged since `e57c5ca2` verified run (4251/74/1/0) — no logic regression. Affected server/node suites: 83 pass / 0 fail |
| Arcana CLI/proof suite | 116 pass / 0 fail (2026-08-02) |
| SDK JS suite | 34 pass / 0 fail (2026-08-02, full `src` run incl. enterprise client, adapters, vectors, SSE) |
| Conformance runner | 5/5 suites (TS golden vectors + D-10 matrix + Rust verifier + SDK surface + adapter vectors; 46 crypto + 4 adapter vectors + 15 hostile fixtures) |
| ML eval / smoke | Earlier baseline: ml:eval 13/13, smoke 8/8 |
| Validation level | Strongest at L1–L2 (production-path integration + internal adversarial); L3+ independent validation not obtained |

## Phase A–F audit artifacts (2026-08-02)

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
   operational/external — Phase F still has an unresolved production security
   and integration code gap (BLK-F-AUTH-01: authenticated administrative
   identity binding), plus TLS/mTLS, live Linux validation, TUI operator
   consoles, live DR/compromised-node/key exercises, F13 external assessment,
   L3 reproduction, Node 1.0 freeze sign-off, and license text review.

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
