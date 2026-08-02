# Protocol Governance (E9 draft)

## Version lifecycle

- `EXPERIMENTAL` — schemas may change without notice (current internal
  batch/sync messages).
- `STABLE` — additive changes only; breaking changes require a major schema
  version (current core envelopes: capability, policy, node-identity,
  revocation, join-token).
- `FROZEN` — no changes without an architecture decision record (target for
  PROTOCOL-1.0 release).

## Deprecation policy

- Deprecated fields/versions remain accepted for one full compatibility
  window (two minor releases) with an explicit deprecation notice in the
  schema registry.
- Security-critical semantics are never deprecated silently.

## Security advisory process

- Vulnerabilities in protocol handling are filed with severity, affected
  schema versions, fix version, and a redacted repro.
- Fixes that change canonical serialization or signature input are treated as
  breaking changes with a compatibility transition.

## Extension registry

- Optional extensions must be namespaced (`x-<vendor>-<name>`), documented in
  the schema registry, and never alter security semantics.
- Unknown mandatory fields are rejected (strict schema).

## Compatibility matrix

| Component | Schema | Protocol | SDK |
|---|---|---|---|
| Core envelopes | 1 | 1.0-draft | — |
| Sync transport | 1 | 1.0-draft | — |
| Proof batch | 1 | 1.0-draft | — |
| RunProof | 0.2 | 1.0-draft | v2/proof |
| JS SDK | — | 1.0-draft | 1.x |

## Ownership

- Reference tests: `script/conformance.ts` (TS + Rust independent).
- Registry owner: protocol maintainers; changes require a PR touching the
  registry + conformance vectors.
