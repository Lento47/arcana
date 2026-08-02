# Arcana Completion Report — Phase A–F Campaign (checkpoint, with bugs)

---
document_class: completion_report
authority: secondary (status authority: docs/STATUS.md)
status: checkpoint — NOT a phase F completion declaration
created: 2026-08-02
audited_commit: e57c5ca2 (2026-08-02 checkpoint commit; suites verified on the
pre-commit worktree, which the commit reproduces exactly)
supersedes: none
superseded_by: future final completion report after Phase F freeze
---

## 1. What this document is

This is the **new completion document** required by the Phase A–F campaign. It
records what is genuinely complete, what remains incomplete, and the known
bugs and blockers — including bugs that were fixed and bugs that remain open.
It deliberately does not declare overall completion: playbook §4 requires
every hard gate to pass and every phase to be human-approved before "100%".

## 2. Executive summary

| Area | Status |
|---|---|
| Phase A — Epistemic Foundation | COMPLETE / FROZEN |
| Phase B — Verification and Replay | COMPLETE / FROZEN |
| Phase C — Local Governed Autonomy | EVALUATION PASS; approved with exceptions (2026-08-01) |
| TUI-2 (interactive authority) | FROZEN (`arcana-tui-2-interactive-authority-control`) |
| TUI-2.1 (production polish) | MOUNTED + automated green; freeze NOT authorized |
| CLI 1.0 | PARTIAL — contract not frozen |
| Phase D — Distributed Governed Autonomy | ACTIVE (~45–55%); D-7 frozen, D-8A done |
| Phase E — Protocol/SDK/Adapters | PLANNED / PARTIAL |
| Phase F — Enterprise Control Plane | PARTIAL — F1–F12 cores implemented (2026-08-02); GA freeze NOT authorized (live exercises + external assessment pending) |
| Arcana 1.0 convergence | NOT REACHED |

The local product core (A + B + C + frozen TUI-2 + working CLI surfaces) is
the strongest verified portion of the campaign. Everything distributed,
external, and enterprise remains behind the blockers documented in
`docs/blockers/`.

## 3. Completed with evidence

### Phase A — Epistemic Foundation

Typed claims/evidence, revisioned contracts/criteria/obligations, transactional
hash-linked event store, execution receipts, hard completion gate, inspection
commands, freeze documentation. Gate audit: `docs/blockers/PHASE-A-BLOCKERS.md`.

### Phase B — Verification and Replay

RunProof with independent assurance axes, model-independent verification,
audit replay, deterministic replay, live revalidation, trace health,
performance baselines, frozen milestone tag
(`arcana-epistemic-runtime-phase-b`). Gate audit:
`docs/blockers/PHASE-B-BLOCKERS.md`.

### Phase C — Local Governed Autonomy

Canonical request hashing, durable capabilities, pure PDP, fresh PEP, intent
binding, provenance/sensitivity/lineage, scoped approvals, delegation
attenuation, workspace/MCP trust, security RunProof profiles, 95-fixture
adversarial evaluation with 0 unexpected allows and 0 executor calls on denied
paths. Tags: `arcana-governed-autonomy-phase-c`,
`phase-c-production-enforcement`. Sign-off: APPROVED WITH EXCEPTIONS
(2026-08-01) — see `docs/audits/ARCANA-SIGNOFF-2026-08-01.md`.

### TUI-2 (interactive authority control)

Frozen tag with approval lifecycle, governed executor, and operator surfaces.

## 4. Verification evidence (2026-08-02, current working tree)

| Gate | Result |
|---|---|
| TUI suite | **781 pass / 1 skip / 0 fail** (782 tests) |
| Engine suite | **4251 pass / 74 skip / 1 todo / 0 fail** (4,326 tests, 990.6 s) |
| Core suite | **1264 pass / 7 skip / 0 fail** (1,271 tests) |
| Arcana CLI/proof suite | **116 pass / 0 fail** |
| SDK JS suite | **7 pass / 0 fail** |
| Rust conformance | **2 pass / 0 fail** |
| Typecheck | **16/16 packages** |
| Build | **8/8 tasks**; engine binary smoke `0.0.0-phase-d-implementation-202608021350` |
| Denied-path executor calls | 0 (Phase C frozen suite) |
| Unexpected allows | 0 (95 fixtures) |
| Core suite (current) | 1419 pass / 7 skip / 0 fail (1,426 tests incl. Phase D/E/F cores) |
| Conformance runner | 4/4 suites (46 vectors + 15 hostile fixtures + SDK surface) |

No regressions versus the previous checkpoint: TUI 762 → 781 pass, core 1256 →
1264 pass, engine 4248 → 4251 pass. OpenTUI remains pinned at 0.4.5 with the
worker-path patch; no dependency was downgraded.

## 5. Known bugs

### Fixed during this campaign (with regression coverage)

| ID | Bug | Fix |
|---|---|---|
| F-15 | OpenTUI 0.4.5 compiled-binary worker-path crash (TUI would not open) | `script/patch-opentui.ts` postinstall patch |
| F-16 | Daemon boot crash: obligation_templates seed UNIQUE violation | idempotent seed |
| F-17 | Governance/proof rows rendered as chat cards when healthy | spine mapper fix |
| F-18 | Completion gate idempotency was per-session, not per-contract | per-contract idempotency + test |
| F-19 | Criteria receipts were never emitted in production | PEP `test_receipt`/`build_receipt` emission |
| F-20 | RunProof hid operator-rejected executions | rejection evidence recorded |
| F-21 | Proof/governed rows swapped order on live updates ("duplicate proof") | stable ordering + regression test |
| F-22 | Daemon idle-stop left the TUI with "Failed to send prompt / Unable to connect" | daemon respawn in `tui.ts` + `sdk.tsx` + `daemon-respawn.test.ts` |
| F-23 | Approval inspector invisible + spine keys unreachable from the keyboard | `approval-inspector.tsx` + command-spine keys + `approval-inspector.test.ts` |

### Open / residual bugs and risks

| Bug / risk | Status | Owner |
|---|---|---|
| Bun 1.3.14 root-runner segmentation fault on Windows | Workaround: package-local runners; isolated, documented, accepted exception | Bun upstream |
| Enterprise admin API actor identity is client-supplied in mutation payloads (`actorUserId`/`approvedBy`) rather than bound to the authenticated principal | RBAC permission checks are exercised end-to-end, but the auth-context binding (HTTP auth → principal) is a follow-up before GA (BLK-F-02/11) | Engineering |
| TUI-2.1 live validation still pending: approval lifecycle via `v`/`a`/`d`, width matrix, theme matrix, restart/session isolation, performance, 6-checkpoint stream protocol | Freeze NOT authorized until passed at the exact commit | Engineering + operator |
| "Failed to send prompt / Unable to connect" after daemon death | F-22 mitigation implemented; re-verify through the live-stream protocol | Engineering |
| No L3+ independent reproduction of the Phase C evaluation | Blocker AUD-20 | External |
| `master` mainline stale vs `phase-d-implementation` | Post-sign-off release action (BLK-1.0-05) | Release |
| Phase D transport/containment/enrollment/offline/ops/eval gaps | BLK-D-01..09 | Engineering |
| D-7.1 Windows handle-based containment reader implemented (10/10 tests incl. traversal + junction escape); engine integration + live Linux validation pending | BLK-D-02 | Engineering |
| D-8B proof registration implemented end-to-end (control-plane ledger + HTTP, node-side uploader/outbox + HTTP client, 33 tests); scheduler/CLI wiring + hostile-node matrix pending | BLK-D-04 | Engineering |
| D-9 offline grant/lease policy implemented (15 tests); distributed PEP wiring + node-level partition tests pending | BLK-D-06 | Engineering |
| D-1 enrollment ceremony + key rotation implemented with HTTP endpoints; D-8B proof registry now durable-enrollment-backed; node-side ceremony client pending | BLK-D-05 | Engineering |
| D-6B-T signed-envelope sync transport implemented (policy + revocation, replay protection, audience/freshness/rotation enforcement; 15 tests); TLS/mTLS + channel binding remain in ops deployment | BLK-D-01 | Engineering |
| D-4 signed policy bundle store implemented (strict schema, chaining, staged activation, last-known-good, audited rollback) with HTTP endpoints; sync transport now serves POLICY_SNAPSHOT; DELTA bundles + compat negotiation pending | BLK-D-01 | Engineering |
| D-6 execution ledger implemented and wired into the distributed PEP (exactly-once claims, cross-node matrix, UNKNOWN_AFTER_* replay-forbidden, offline gating; 17 tests); hostile-node matrix pending | BLK-D-01 | Engineering |
| D-5 revocation store + convergence measurement implemented (sequence-monotonic statements, REVOCATION_SNAPSHOT delivery, frozen p95 bounds; 10 tests); emergency push channel + hostile-node revocation pending | BLK-D-01 | Engineering |
| D-10 hostile-node matrix implemented: 15 fail-closed fixtures across all ten adversarial categories, 0 bypasses (incl. new future-issuedAt freshness check); Node 1.0 freeze + independent reproduction pending | BLK-D-08 | Engineering |
| Node CLI shipped: `arcana node enroll|proof upload|sync|status` with restart-safe identity file (enrollment ceremony client + proof upload loop + authenticated sync are now operator-invokable) | BLK-D-04/05 | Engineering |
| Emergency deny-list implemented (`POST /api/revocations/emergency`: immediate node revocation + signed NODE statement propagation; sync 401) and Node 1.0 API contract draft published; release freeze remains gated on TLS, live Linux validation, proof-store integration, independent reproduction | BLK-D-05/07/09 | Engineering |
| Local proof store integration completed: `arcana node proof upload` now reads the durable `.arcana/proofs` store, builds deterministic ordered batches (chained across batch boundaries), and runs the upload loop (2 tests) | BLK-D-04 | Engineering |
| Phase E started: `PROTOCOL-1.0-SPEC.md` freeze draft + independent conformance harness (TS + Rust agree on 46 vectors, `script/conformance.ts` 3/3 suites) | BLK-E-01/02 | Engineering |
| SDK 1.0 governance surface shipped: canonical authorization request builder, framework-adapter mapping hook, strict envelope verification (`@arcana/sdk/v2/governance`, SDK suite 10/10) | BLK-E-03 | Engineering |
| SDK RunProof verifier shipped: schema/lifecycle/timestamp checks + canonical fingerprint with tamper detection (`@arcana/sdk/v2/proof`, SDK suite 15/15) | BLK-E-03 | Engineering |
| SDK stable error model + compatibility contract shipped (`@arcana/sdk/v2/errors`, `SDK-1.0-COMPATIBILITY.md`; conformance runner now 4/4 incl. SDK suite 17/17); protocol governance + quickstart docs published | BLK-E-03/08/09 | Engineering |
| Adapter layer started: `arcana launch <runtime>` A1 scaffold (declaration + dry-run + evidence, no sandbox claim), SDK `governedTool` framework hook (ALLOW-only, exact binding), adapter certification registry published | BLK-E-05/06/07 | Engineering |
| E4 Rust SDK foundation: canonical request hashing ported byte-for-byte from TypeScript with a cross-language golden vector (identical hash in TS and Rust); Rust crate 5/5 tests | BLK-E-04 | Engineering |
| MCP governed-tool hook shipped (`governedMcpTool`, MCP_DESCRIPTION default provenance, ALLOW-only; SDK suite 22/22) + ecosystem evaluation matrix published (E10 draft with freeze-gate status) | BLK-E-06/10 | Engineering |
| Phase F started: F1 multi-tenant organization model implemented (tenant-scoped records, zero cross-tenant reads by construction, deletion isolation; 3 tests) | BLK-F-01 | Engineering |
| F2 RBAC core implemented: tenant-scoped roles + permission matrix, privileged-action audit, immediate deprovisioning, visible time-bounded break-glass (5 tests); SSO/SCIM/MFA service integration pending | BLK-F-02 | Engineering |
| F3 policy lifecycle implemented: validated approved promotion across environments, structural policy diff, audited approvals (6 tests) on top of the D-4 signed bundle store; authoring/simulation editor pending | BLK-F-03 | Engineering |
| F4 fleet core + F5 central approvals implemented (tenant-scoped inventory/health/heartbeats; exact-inspection approval queue with separation of duties, expiry, bulk-deny-only, emergency revocation; 7 tests) | BLK-F-04/05 | Engineering |
| F6 audit/compliance archive implemented: immutable tenant-scoped proof retention, fingerprint-verified export, custody chain, retention with legal hold (4 tests); compliance mappings + auditor console pending | BLK-F-06 | Engineering |
| F7 HA/DR core (digest-verified backup/restore, drill evaluation vs RPO/RTO, degraded fail-closed; 3 tests) + F8 federation core (authority intersection never broadens, conflict resolution, proof exchange, revocation propagation; 5 tests) implemented | BLK-F-07/08 | Engineering |
| F9 security-ops core (alerts, incident timelines, audited revocation campaigns, forensic exports), F10 data governance (classification, regional/CMK, PII controls), F11 admin event surface (webhook/SIEM/ticketing envelopes) implemented (8 tests) | BLK-F-09/10/11 | Engineering |
| F12 commercial readiness core (tiered entitlements, metering-never-affects-security invariant, redacted diagnostics, upgrade policy; 4 tests) + Phase F GA freeze draft published (gate evidence; freeze not authorized) | BLK-F-12/13 | Engineering |
| Enterprise admin HTTP surface mounted (`/api/enterprise/*`: organizations, roles, fleet, approvals with exact inspection, audit; HTTP integration test) — production mounting of F1/F2/F4/F5 cores | BLK-F-01/02/04/05/11 | Engineering |
| Enterprise HTTP operations surface mounted (`/api/enterprise/*`: F3 policy promotion/diff with RBAC into per-environment target chains, F4 node register/heartbeat, F5 emergency revoke + bulk deny, F6 archive/export/custody/legal-hold/retention-sweep, F9 alerts/timeline/revocation-campaign/forensics, F10 governance checks; 5 integration tests) | BLK-F-03/04/05/06/09/10/11 | Engineering |
| Enterprise HTTP reliability/federation/commercial surface mounted (`/api/enterprise/*`: F7 backup/restore/drill evaluation, F8 agreements/proof-exchange/revocation-propagation/authority-intersection, F12 entitlements/metering-invariant/redacted-diagnostics/upgrade-policy; 3 integration tests) | BLK-F-07/08/11/12 | Engineering |
| F4 node diagnostics, F5 escalation core, F11 admin-event store + SIEM CEF export, F12 metering pipeline implemented and mounted (`nodeDiagnostics`; `escalation.ts` + SQLite with bounded fallback approvers and audited events that never consume approvals; `admin-events-sqlite.ts` + `siem-export.ts` JSON-lines/CEF; `metering.ts` + SQLite usage aggregation and informational quota; 11 core tests + 3 integration tests) | BLK-F-04/05/11/12 | Engineering |
| F8 cross-org approval routing (exact action grants, per-rule daily caps, agreement validity; bounded delegated authority), F4 upgrade-ring rollout automation (ring CRUD, node assignment, gated plans), and F6 compliance crosswalk doc (SOC 2 / ISO 27001 / NIST engineering index) implemented and mounted (6 core tests + 2 integration tests) | BLK-F-04/06/08/11 | Engineering |
| SDK enterprise admin client (`packages/sdk/js/src/v2/enterprise.ts`): typed automation for the `/api/enterprise/*` surface — orgs, roles, fleet, policy promotion, escalation, SIEM export, metering, federation routing (4 SDK tests; satisfies F11 equivalent-automation requirement) | BLK-F-11 | Engineering |
| F3 policy draft validation (schema/signature/chain check without publishing; 2 core + 1 integration test), F9 anomaly-detection heuristics (alert burst, revocation velocity, backlog, stale ratio; 3 core + 1 integration test), and F11 ticketing payloads (deterministic titles/priorities/labels; 1 core + 1 integration test) implemented and mounted | BLK-F-03/09/11 | Engineering |
| F8 federated revocation transport exchange implemented and mounted (`federation-transport.ts` + SQLite: agreement-validated outbox/inbox, delivery state tracking, deduplicated receive; 3 core + 1 integration test); live network delivery + channel binding remain ops | BLK-F-08 | Engineering |
| F11 webhook delivery sink implemented and mounted (`webhooks.ts` + SQLite: endpoint registry, auto-enqueue on admin events, bounded retry/backoff, durable delivery state; 4 core + 1 integration test) — closes the F11 webhooks/event-streams item | BLK-F-11 | Engineering |
| F5 approvals list endpoint added (`CentralApprovalStore.all` + `GET /api/enterprise/*/approvals` with status filter; integration tested) — supports the escalation/auditor consoles | BLK-F-05 | Engineering |
| Phase E protocol/SDK/adapter gaps | BLK-E-01..10 | Engineering |
| Phase F control-plane gaps | BLK-F-01..13 | Engineering |

## 6. What is NOT complete (honest scope)

- **TUI-2.1 freeze** — automated green only; manual/live gates pending.
- **CLI 1.0** — no frozen JSON/exit-code contract, no launch adapters.
- **Phase D** — ~45–55% by playbook weighting; D-6B-T, D-7.1, D-6A-L, D-8B,
  enrollment/key rotation, offline policy, ops deployment, hostile-node
  evaluation, Node 1.0 freeze all pending.
- **Phase E** — no frozen public protocol, no independent conformance, no SDK
  1.0, no external/framework adapters.
- **Phase F** — no multi-tenant control plane, identity, fleet operations,
  federation, compliance archive, HA/DR, or external security assessment.
- **Arcana 1.0** — requires TUI 1.0 + CLI 1.0 + one production adapter +
  signed artifacts + mainline promotion.

## 7. Nonclaims (unchanged)

- No hostile-host containment; no universal prompt-injection prevention.
- No governance of effects outside the Arcana PEP boundary.
- No distributed-node or fleet production claim.
- No public proof protocol or independent verification.
- No enterprise/GA claims until Phase F gates and external assessment pass.

## 8. Traceability and blocker index

- Blockers: `docs/blockers/README.md` (10 register files).
- Living task status: `docs/roadmap/TASK-REGISTER.md`.
- Task → evidence → gate trace: `docs/roadmap/PHASE-TRACEABILITY.md`.
- Live status authority: `docs/STATUS.md`.
- TUI-2.1 freeze runbook: `docs/tui/TUI-2.1-FREEZE-OPERATOR-RUNBOOK.md`.

## 9. Sign-off

**No phase F / full-campaign completion sign-off is claimed by this document.**
This is a checkpoint report. The next human sign-off gate is the TUI-2.1
freeze at the exact final commit, followed by Phase D milestones, then E/F.

| Role | Name | Decision | Date |
|---|---|---|---|
| Approver | Operator | ☐ Approve / ☐ Reject (checkpoint only) | |

## 10. Ordered next steps

1. AUD-01..08: finish the TUI-2.1 manual/live/performance gates and freeze.
2. AUD-09..15: close Phase D blockers (transport → containment → enrollment →
   offline → ops → adversarial eval → Node 1.0 freeze).
3. AUD-16..17: freeze protocol specs, independent conformance, SDK 1.0, first
   external adapter.
4. AUD-18: build the enterprise control plane (F1–F13) with tenant isolation
   and federation.
5. AUD-19: execute the release flow (signed artifacts, installer, mainline
   promotion).
6. AUD-20: independent reproduction of the Phase C evaluation.
7. AUD-21/22: keep STATUS, task register, and blocker evidence current.

*This report is the completion record with bugs: the completed core is real
and measured; the unfinished phases are explicit, evidence-backed, and
tracked to closure.*
