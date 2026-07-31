# Phase D-7: Local Distributed Authority Milestone

**Tag:** `arcana-phase-d7-local-distributed-authority`
**Date:** 2026-07-30
**Commit:** 700c47a4

## What This Milestone Proves

Signed remote authority cannot bypass local Phase C enforcement.

```
SignedRemoteAuthority
∧ ExactAudience
∧ CurrentNodeState
∧ StableWorkload
∧ LocalPhaseCDecision
∧ FreshPEPRecheck
⇒ BoundedFilesystemRead
```

Zero observed bypasses across the evaluated integration suite.

## Security Boundary

**Distributed authority cannot bypass Phase C.**

A signed capability envelope, no matter how correctly signed, cannot
directly cause an effect without passing through the local Phase C
PDP and PEP. The derived local grant is always an attenuation of
every upstream constraint:

```
DerivedGrant ⊆ SignedGrant ∩ Policy ∩ NodeScope ∩ WorkloadScope ∩ PrincipalScope ∩ SessionScope
```

## Evidence Chain

The RunProof causal chain is:

1. Signed envelope received
2. ACEP-1 verification (7-layer pipeline)
3. Local grant derived (attenuated)
4. Phase C PDP decision
5. Phase C PEP freshness recheck
6. Effect executed (or denied)
7. Effect receipt

Trace health semantics:
- **COMPLETE**: All required events present, valid causal chain
- **DEGRADED**: Effect occurred but some authority event missing
- **INVALID**: Integrity mismatch or broken causality
- **INCOMPLETE**: Required events not yet recorded

## Tested Adversarial Scenarios

| Attack | Result |
|---|---|
| Signature mutation | DENY |
| Wrong node audience | DENY |
| Wrong workload audience | DENY |
| Wrong principal | DENY |
| Wrong session | DENY |
| Expired capability | DENY |
| Unknown issuer | DENY |
| Wrong public key | DENY |
| Path traversal (../) | DENY |
| Absolute outside path | DENY |
| Null byte in path | DENY |
| Directory read | DENY |
| Oversized file | DENY |
| Quarantined node | DENY |
| Revoked node | DENY |
| Workload change before effect | DENY |
| Missing envelope event | DEGRADED |
| Integrity hash mismatch | INVALID |
| Broken causal parent | INVALID |

## Filesystem Nonclaim

Arcana D-7 operationally validates signed distributed authority,
exact audience binding, grant attenuation, local Phase C PDP/PEP
enforcement, a real bounded filesystem-read effect, and causally
complete RunProof evidence. The filesystem adapter rejects tested
lexical escapes, absolute paths, null bytes, directories, oversized
files, and unsupported file types, and reads through the validated
opened descriptor.

**This milestone does not claim kernel-enforced protection against
hostile concurrent pathname replacement, symbolic-link races,
Linux magic-link or mount races, or Windows junction/reparse-point
namespace attacks.**

### SafeBoundedFileReader v2 Status

| Capability | Status |
|---|---|
| Lexical rejection (traversal, null bytes, absolute paths) | COMPLETE |
| Pre-open canonicalization (realpath) | COMPLETE |
| Same-handle file-type/read enforcement (fstat + readSync on same fd) | COMPLETE |
| Pre/post object-identity comparison (device/inode from fstat) | COMPLETE |
| Kernel-enforced beneath-root resolution (openat2 RESOLVE_BENEATH) | PENDING |
| Windows opened-handle final-path validation | PENDING |

The current reader provides handle-bound post-open identity verification.
It is not yet a kernel sandbox.

### Future Hardening Milestone

When openat2 and Windows handle enforcement arrive, tag as:
`arcana-phase-d7.1-filesystem-containment`

Do not move the D-7 tag.

## Test Results

| Suite | Tests |
|---|---|
| D-3 ACEP-1 crypto verifier | 70 |
| D-4 pure reducers | 56 |
| D-5 in-memory durable state | 48 |
| D-5S+H SQLite hardened | 63 |
| D-6 sync protocol | 40 |
| D-6B + workload identity | 47 |
| D-7 distributed PEP logic | 33 |
| D-7I real signed envelope integration | 31 |
| D-7P RunProof integration | 33 |
| TUI-2 approval lifecycle | 43 |
| TUI-2I SQLite lifecycle | 32 |
| TUI-2E governed executor | 42 |
| D-5H crash recovery | 30 |
| **Total TypeScript** | **568** |
| **Rust ACEP-1 conformance** | **46/46** |
| **Cross-runtime disagreements** | **0** |

## Hard Gates

| Gate | Value |
|---|---|
| Distributed Phase C bypasses | 0 |
| Wrong-identity effects | 0 |
| Post-revocation effects | 0 |
| Out-of-workspace reads | 0 |
| Unsigned envelope effects | 0 |

## Components Delivered

| File | Purpose |
|---|---|
| `verifier.ts` | 7-layer ACEP-1 verification (real Ed25519) |
| `canonical-serializer.ts` | ACEP-1 canonical serialization + strict parsing |
| `golden-vectors.ts` / `generate-full.ts` | 46 cross-runtime conformance vectors |
| `signed-envelopes.ts` | Envelope types + domain separators |
| `reducers.ts` | D-4 pure state reducers |
| `durable-state.ts` | D-5 in-memory durable state |
| `durable-state-sqlite.ts` | D-5S+H SQLite store (WAL, synchronous=FULL) |
| `sync-protocol.ts` | D-6 transport-neutral sync protocol |
| `sync-auth.ts` | D-6B authenticated sync control |
| `identity-contracts.ts` | D-6A 3-layer identity model |
| `workload-identity.ts` | Workload ID derivation + TOCTOU defense |
| `workload-identity-windows.ts` | Windows process identity collector |
| `distributed-pep.ts` | D-7 distributed PDP/PEP + grant derivation |
| `bounded-file-reader.ts` | SafeBoundedFileReader v2 |
| `runproof.ts` | D-7P RunProof causal chain |
| `approval-lifecycle.ts` | TUI-2 approval state machine |
| `approval-store-sqlite.ts` | TUI-2I SQLite approval store |
| `governed-executor.ts` | TUI-2E governed executor with precise semantics |

## Cross-Runtime Conformance

46 ACEP-1 vectors verified identically by TypeScript (`@noble/curves`)
and Rust (`ed25519-dalek`):
- Canonical payload bytes: 0 disagreements
- Signature input bytes: 0 disagreements
- Verification stage/reason: 0 disagreements

5 positive vectors (all 4 envelope categories)
41 negative vectors (all 7 verification stages)
