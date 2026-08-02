# Arcana Phase A–F Blocker Register

**Document class:** blocker register (evidence-backed)
**Authority:** secondary — status decisions live in `docs/STATUS.md`
**Created:** 2026-08-02 (Phase A–F completion audit)
**Applies to commit:** `b34299ff` (2026-08-02 checkpoint)

This folder is the **new blocker documentation** required by the Phase A–F
completion objective. It records, per phase and product track, every
requirement that is not yet provably 100% complete, the evidence that proves
the gap, and the evidence that would close it.

## Methodology

Gate vocabulary follows playbook §4.2 (`PASS | FAIL | BLOCKED | DEGRADED |
NOT APPLICABLE`). A task is never marked complete from unit tests alone; it
must be production-mounted, adversarially tested, restart-safe, measured,
observable, documented, and (for frozen milestones) human-approved.

Blocker IDs use the form:

```text
BLK-<AREA>-<NN>
```

where `<AREA>` is `A`, `B`, `C`, `TUI`, `CLI`, `D`, `E`, `F`, or `1.0`.

Each blocker row states:

1. The playbook task or gate it blocks.
2. The current evidence of the gap (files, commands, observed behavior).
3. Why it blocks the 100% declaration.
4. The acceptance evidence required to close it.

## Summary

| Area | Current status | Open blockers | Source doc |
|---|---|---:|---|
| Phase A — Epistemic Foundation | COMPLETE / FROZEN | 0 | [PHASE-A-BLOCKERS.md](./PHASE-A-BLOCKERS.md) |
| Phase B — Verification & Replay | COMPLETE / FROZEN | 0 | [PHASE-B-BLOCKERS.md](./PHASE-B-BLOCKERS.md) |
| Phase C — Local Governed Autonomy | EVALUATION PASS, signed with exceptions | 0 (scope-limited) | [PHASE-C-BLOCKERS.md](./PHASE-C-BLOCKERS.md) |
| TUI 1.0 (TUI-2.1 freeze) | MOUNTED, automated green, freeze NOT authorized | 8 | [TUI-1.0-BLOCKERS.md](./TUI-1.0-BLOCKERS.md) |
| CLI 1.0 | PARTIAL — no frozen contract | 5 | [CLI-1.0-BLOCKERS.md](./CLI-1.0-BLOCKERS.md) |
| Phase D — Distributed Governed Autonomy | FEATURE-COMPLETE in-repo; freeze pending ops/external gates | 9 | [PHASE-D-BLOCKERS.md](./PHASE-D-BLOCKERS.md) |
| Phase E — Protocol, SDKs, Adapters | PARTIAL — conformance 5/5 + adapters + certified vectors; freeze pending live/L3 | 10 | [PHASE-E-BLOCKERS.md](./PHASE-E-BLOCKERS.md) |
| Phase F — Enterprise Control Plane | PARTIAL — F1–F13 cores implemented and mounted; freeze pending external assessment/consoles | 13 | [PHASE-F-BLOCKERS.md](./PHASE-F-BLOCKERS.md) |
| Arcana 1.0 convergence | NOT reached | 5 | [ARCANA-1.0-BLOCKERS.md](./ARCANA-1.0-BLOCKERS.md) |

## Rules for closing a blocker

- A blocker closes only when the acceptance evidence exists **and** is
  recorded in this register with a date, commit, and verification command.
- Closing a blocker never happens by re-scoping the playbook without an
  explicit architecture decision record (playbook §52, AGENTS.md completion
  gate).
- Security blockers (`unauthorizedExecutions != 0`, amplification, replay,
  bypass) are terminal: the phase cannot be declared complete with any open
  security blocker.
- The completion report at `docs/releases/COMPLETION-REPORT-2026-08-02.md`
  is the checkpoint-level summary of this register.

## Task traceability

Every task row in the playbook and every new task added during this audit is
tracked in:

- `docs/roadmap/TASK-REGISTER.md` — living per-task status register.
- `docs/roadmap/PHASE-TRACEABILITY.md` — task → evidence → gate trace.

## External and human gates (owner / artifact / evidence)

These gates cannot be closed from the repository. Each row names the owner,
the artifact that must be produced, and the evidence that closes it.

| Gate | Owner | Artifact | Evidence required to unblock |
|---|---|---|---|
| TLS/mTLS + channel binding + OS-level key protection (BLK-D-07) | Ops + release engineering | Server/node transport config with mTLS and channel binding; OS key protection | TLS handshake fixtures at deployment; MITM confidentiality test |
| Live Linux workload validation (BLK-D-03) | Engineering + Linux ops | Live Linux node run (D-6A-L workload identity) | Live workload-identity validation report |
| Live DR / compromised-node / key-rotation exercises | Operator + engineering | Exercised environment + drill records | DR drill meets RPO/RTO; compromised-node exercise log; key-rotation exercise log (BLK-F-07/09) |
| TUI-2.1 manual matrices | Operator + engineering | TUI at the exact freeze commit | Runbook Gates 1–10: smoke, width 59–180, themes, approval lifecycle, restart/session isolation, performance, 6-checkpoint SSE protocol (AUD-01..08) |
| F13 external security assessment | External assessor | Assessment report | Architecture review, penetration test, threat-model review, supply-chain assessment, remediation verification |
| L3 independent reproduction | External party | Independent rerun of the frozen suites | L3 reproduction report (AUD-20) |
| License text review | Legal | Reviewed license texts | Legal sign-off (BLK-F-12) |
| Node 1.0 freeze | Maintainer + human sign-off | Node 1.0 API contract at the exact commit | TLS/live-Linux/L3 cleared + freeze sign-off (BLK-D-09) |
| Phase F / Control 1.0 freeze | Maintainer + human sign-off | GA freeze evidence pack | All playbook §40 gates measured + sign-off (BLK-F-13) |
| Arcana 1.0 release sign-off | Release + human sign-off | Signed release artifacts + installer | Playbook §43 gates + executed release-flow records (BLK-1.0-04/05) |

None of these gates may be declared complete without its artifact and
recorded evidence; see `docs/releases/RELEASE-FLOW-PLAN.md` for the execution
order once the freeze sign-offs exist.
