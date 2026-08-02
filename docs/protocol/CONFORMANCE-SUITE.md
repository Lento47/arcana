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
- **Cross-language request-hash vector**: the same AuthorizationRequest
  fixture hashes identically in TypeScript and Rust
  (`b1e96acf45c7fd998e29679720efb522dfb65463ff8633aae79f8470ed5d4168`).
- Golden crypto suite (TypeScript): `packages/core/src/crypto/crypto.test.ts`.
- Phase D hostile-node matrix: `packages/core/src/crypto/hostile-node-evaluation.test.ts`
  (15 fail-closed fixtures, 0 bypasses).
- **Certified adapter request-hash vectors**: 4 frozen golden hashes for
  AI SDK / MCP / Mastra / LangGraph tool naming
  (`packages/sdk/js/src/v2/adapters/vectors.test.ts`), pinned with a fixed
  request identity (`GovernanceContext.requestId`/`nonce`/`requestedAt`).

## Running

```bash
bun run script/conformance.ts
```

The runner executes, in order:

1. TypeScript golden crypto suite (package-local).
2. TypeScript D-10 hostile-node matrix.
3. Rust conformance crate (`cargo test`).
4. SDK 1.0 governance/proof/error suite.
5. SDK adapter request-hash vectors.

It exits non-zero if any suite fails and prints a per-suite summary.

## Current results (2026-08-02)

| Suite | Result |
|---|---|
| TS golden crypto | 100/100 pass (0 fail) |
| TS D-10 matrix | 15 fail-closed fixtures, 0 bypasses |
| Rust conformance | 5/5 tests (46 vectors + request-hash golden vector) |
| SDK governance/proof/error | 10/10 pass (0 fail) |
| SDK adapter vectors | 4/4 frozen golden hashes (0 fail) |

## Publication gate

External reproduction (L3) and an independent third-party verifier are
required before this suite can be claimed as a public conformance program.
