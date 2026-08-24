---
document_class: roadmap
authority: execution_priority
status: current
owner: maintainer
last_updated: 2026-08-23
---

# Arcana roadmap

This document answers only **what should be worked on next**. Detailed implementation facts belong in `docs/STATUS.md`; acceptance evidence belongs in release or milestone records.

## Now — M1 convergence

Work in this section is release-critical. New work must close one of these outcomes.

Per `docs/design/ADR-004-m1-product-surface-boundary.md` (ratified via
PR #79), M1 is exactly: the authoritative local runtime (not a user-facing
surface) + CLI/TUI (primary AI work surface) + Arcana Desktop (local approval
and forensic companion) + one certified external-agent integration. Arcana
Manager is a transport/discovery adapter name, not a separate product or
authority surface. Enterprise consoles are preserved implementation tracks,
not M1 release surfaces; no new named operator surface enters M1 without an
explicit roadmap change and a separate ADR showing why TUI or Desktop cannot
satisfy the user outcome.

1. **Contract/runtime parity**
   - Reconcile `contracts/approval-api.v1.yaml` with the mounted runtime API.
   - Reconcile `contracts/events.v1.json` with emitted durable event envelopes.
   - Add automated contract linting and implementation conformance checks.

2. **Approval correctness**
   - Existing durable approval required before any operator decision.
   - Exact request, version, contract revision, expiry, capability, intent, and policy revalidated.
   - Surface-aware routing for Local TUI, Desktop, and future Central authority.
   - State transition and outbox event committed atomically.
   - Deterministic, unique durable event identity.

3. **Runtime/Desktop vertical slice**
   - Desktop attaches only on compatible protocol revision.
   - SSE heartbeat, reconnect, sequence continuity, deduplication, and REST resync.
   - Pending approvals recover after Desktop and daemon restart.
   - Offline Desktop disables authority commands until resync completes.

4. **One governed external-agent integration**
   - Select one runtime, initially Codex unless explicitly changed.
   - Declare its assurance boundary.
   - Demonstrate one consequential action through PDP, approval, PEP, receipt, and RunProof.

5. **Release evidence**
   - Exact-commit automated suites.
   - Manual Windows validation.
   - Installer and upgrade smoke.
   - Signed M1 sign-off record.

## Next — after M1 is demonstrated

- Freeze the CLI 1.0 machine contract and deterministic exit codes.
- Finish proof/replay/audit inspection UX.
- Add a second external-agent adapter only after the first is certified.
- Validate Linux production behavior.
- Publish a stable TypeScript SDK against the frozen runtime contract.
- Promote the verified implementation line to the repository default branch.
- ~~**Performance hardening** (AUD-31..40)~~ ✅ COMPLETE — All critical, medium, and low issues resolved. See `docs/TASKS.md` AUD-3x section.

## Later — preserved, not active

- Arcana Node and distributed governance.
- Arcana Control enterprise console.
- TLS/mTLS fleet transport and federation.
- Central approvals and remote revocation.
- Additional language SDKs.
- Public protocol and external conformance ecosystem.
- SIEM, ticketing, metering, and compliance productization.
- Gateway, cron, memory, skills, provider, and ML expansion unrelated to M1.

## Change rule

A task enters **Now** only when it has:

- a named user or security outcome;
- a bounded implementation surface;
- acceptance evidence;
- an owner;
- no duplicate active specification elsewhere.

New phases, new master specifications, and new product surfaces are not roadmap items by themselves.
