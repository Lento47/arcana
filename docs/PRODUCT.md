---
document_class: product_definition
authority: product_scope
status: proposed
owner: maintainer
last_updated: 2026-08-02
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

The first releasable product is intentionally narrow:

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

- Arcana Node and distributed authority;
- Arcana Control and enterprise fleet governance;
- federation and central policy distribution;
- multi-language SDK expansion;
- protocol standardization beyond the first stable contract;
- broad gateway, cron, memory, skills, and ML expansion;
- additional external-agent adapters beyond the first certified integration.

Deferred work remains documented and tagged. It must not compete with the active M1 release gate unless a maintainer explicitly moves it into `docs/ROADMAP.md` under **Now**.

## Success criterion

Arcana 1.0 is ready when one governed external-agent action can be requested, inspected, approved or denied, executed at most once, evidenced, recovered after runtime/Desktop restart, and independently verified from its RunProof at an exact tagged commit.
