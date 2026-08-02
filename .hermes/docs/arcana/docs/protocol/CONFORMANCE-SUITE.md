# Arcana Protocol Conformance Suite

**Status:** INTERNALLY-VALIDATED — two independent implementations agree on
the 46 golden vectors; external (L3) reproduction is the remaining gate.
**Run with:** `bun run script/conformance.ts`

## Implementations

| Implementation | Role | Location |
|---|---|---|
| TypeScript production | Canonical serializer + layered verifier + vector generator | `packages/core/src/crypto/` |
| Rust independent verifier | Reimplements canonicalization, strict JSON parsing, and the verification stages | `tools/acep-conformance-rust/` |

The Rust verifier does not call the TypeScript implementation: vectors are
generated once by TypeScript and verified independently in Rust.

## Vector inventory

- **46 golden conformance vectors** (41 negative, 5 positive) covering
  PARSE/SCHEMA/SIGNATURE/TRUST/AUDIENCE/FRESHNESS/REVOCATION stages across
  capability, policy, node-identity, and revocation envelopes
  (`tools/acep-conformance-rust/vectors/conformance-vectors.json`).
- Golden crypto suite (TypeScript): `packages/core/src/crypto/crypto.test.ts`.
- Phase D hostile-node matrix: `packages/core/src/crypto/hostile-node-evaluation.test.ts`
  (15 fail-closed fixtures, 0 bypasses).

## Running

```bash
bun run script/conformance.ts
```

The runner executes, in order:

1. TypeScript golden crypto suite (package-local).
2. TypeScript D-10 hostile-node matrix.
3. Rust conformance crate (`cargo test`).

It exits non-zero if any suite fails and prints a per-suite summary.

## Current results (2026-08-02)

| Suite | Result |
|---|---|
| TS golden crypto | 100/100 pass (0 fail) |
| TS D-10 matrix | 15 fail-closed fixtures, 0 bypasses |
| Rust conformance | 2/2 tests (46 vectors) |

## Publication gate

External reproduction (L3) and an independent third-party verifier are
required before this suite can be claimed as a public conformance program.
