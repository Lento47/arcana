---
document_class: product_definition
authority: product_scope
status: proposed
owner: maintainer
last_updated: 2026-08-05
---

# Arcana product definition

## Product

Arcana is a local zero-trust governance runtime for AI agents. It mediates consequential actions, enforces scoped authority, records durable evidence, and produces verifiable RunProofs.

The runtime owns authority. The CLI/TUI and Arcana Desktop are clients of the runtime: they render projections and submit commands, but they do not independently authorize or execute governed effects.

## Primary user

The initial user is a developer or security-conscious operator running coding agents locally who needs to answer four questions for every consequential action:

1. What exactly is the agent trying to do?
2. Why is it allowed, denied, or awaiting approval?
3. What effect actually occurred?
4. What durable evidence proves the result?

## M1 / Arcana 1.0 scope

The first releasable product is intentionally narrow. Per
`docs/design/ADR-004-m1-product-surface-boundary.md` (ratified via PR #79),
Arcana M1 has **exactly one product journey and two user-facing clients**. The
Arcana Runtime is not a third user-facing product surface: it is the
authoritative local service used by both clients.

1. **CLI/TUI — primary AI work surface**
   - launches or attaches to the certified external agent;
   - presents conversation, tool execution, compact governance lifecycle, and
     local approval controls when routing permits;
   - remains the canonical operator path for developing and diagnosing the
     governed agent session.

2. **Arcana Desktop — local approval and forensic companion**
   - supervises the local runtime lifecycle;
   - renders the same canonical governance semantics;
   - presents routed approvals, evidence, proofs, restart recovery, and native
     notifications;
   - never becomes an independent policy, approval, execution, or evidence
     authority.

The minimal M1 Desktop surface is: runtime lifecycle, reconnect/resync,
pending-approval notification, exact-request inspection, approve/deny through
the authoritative runtime, proof inspection, and restart recovery.

Arcana Manager is a transport/discovery adapter name, not a separate product
or authority surface; it must converge on the same runtime contract and
approval commands used by Desktop and TUI. Enterprise consoles are preserved
implementation tracks, not M1 release surfaces; they do not add requirements
to the M1 golden path.

The M1 scope includes:

- local authoritative runtime;
- durable governance and approval state;
- deterministic PDP and effect-boundary PEP;
- append-only governance event transport;
- exact-request approval lifecycle;
- CLI/TUI work surface;
- Arcana Desktop approval and forensic surface;
- reconnect, gap detection, REST resynchronization, and deduplication;
- RunProof derivation and verification;
- one production-certified external agent integration;
- Windows packaging, restart recovery, and exact-commit sign-off.

The M1 golden path is:

```text
launch one certified agent
  -> consequential request
  -> PDP decision
  -> durable approval when required
  -> routed inspection and approve/deny
  -> exact-request PEP revalidation
  -> at-most-once execution
  -> receipt and durable evidence
  -> RunProof inspection and verification
  -> restart/reconnect recovery without loss or duplication
```

## Product invariants

- One durable source of truth; clients never invent authority or evidence.
- Approval authorizes only the exact immutable request that was reviewed.
- A decision surface is authenticated independently from its liveness signal.
- Denied, expired, revoked, stale, or unverified actions execute zero protected effects.
- Restart and reconnect cannot silently lose or duplicate authoritative events.
- Missing evidence is rendered as missing or degraded, never healthy.
- Documentation cannot declare implementation complete without production-path evidence.

## Deferred product tracks

These are valuable but are not Arcana 1.0 release requirements:

- Arcana Control, central approval, and enterprise fleet governance;
- Arcana Node and distributed authority;
- federation and central policy distribution;
- additional SDKs beyond the frozen first contract and multi-language SDK expansion;
- protocol standardization beyond the first stable contract;
- broad gateway, cron, memory, skills, and ML expansion;
- additional external-agent adapters beyond the first certified integration.

Deferred work remains documented and tagged. It must not compete with the active M1 release gate unless a maintainer explicitly moves it into `docs/ROADMAP.md` under **Now**.

## Success criterion

Arcana 1.0 is ready when one governed external-agent action can be requested, inspected, approved or denied, executed at most once, evidenced, recovered after runtime/Desktop restart, and independently verified from its RunProof at an exact tagged commit.
