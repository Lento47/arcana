# Arcana Proof Protocol v1

**Status:** Proposed normative protocol contract for portable authorization and execution evidence.

This document defines the semantic fields Arcana evidence must bind so that a verifier can independently determine what was requested, which policy authorized it, what authority was consumed, what execution boundary acted, and whether the evidence remains internally consistent.

The protocol is intentionally narrower than a claim of general agent safety.

## 1. Design goals

Arcana proof artifacts should be:

- **request-bound** — security-relevant arguments are covered by a deterministic digest;
- **policy-bound** — the exact policy version/bundle used for authorization is identifiable;
- **identity-bound** — principal, agent/workload/session, and tool/resource identities are not conflated;
- **freshness-bound** — stale authority can be rejected at execution time;
- **replay-resistant** — use semantics are explicit and durably recorded;
- **portable** — verification does not require access to the live Arcana control plane;
- **implementation-neutral** — independent runtimes can generate/verify semantically equivalent evidence;
- **fail-explicit** — incomplete evidence is distinguishable from valid evidence.

## 2. Conceptual envelope

```text
ArcanaProofEnvelope
├── protocol
│   ├── version
│   ├── suite_id
│   └── schema_digest
├── request
│   ├── request_id
│   ├── principal_id
│   ├── owner_id?
│   ├── agent_id?
│   ├── workload_instance_id?
│   ├── session_id
│   ├── parent_instance_id?
│   ├── on_behalf_of?
│   ├── tool_instance
│   ├── action
│   ├── canonical_resource
│   └── canonical_args_digest
├── policy
│   ├── policy_version
│   ├── policy_bundle_digest?
│   ├── decision
│   ├── decision_context_digest?
│   └── reasons[]
├── authority
│   ├── capability_ids[]
│   ├── approval_ids[]?
│   ├── issued_at
│   ├── not_before?
│   ├── expires_at?
│   ├── nonce
│   ├── revocation_epoch?
│   └── delegation_chain_digest?
├── provenance
│   ├── argument_influence_digest?
│   ├── agent_build_digest?
│   ├── pep_build_digest?
│   └── policy_engine_build_digest?
├── execution
│   ├── execution_key
│   ├── pep_id
│   ├── started_at
│   ├── completed_at?
│   ├── status
│   ├── input_digest
│   ├── output_digest?
│   └── resource_receipt?
├── evidence
│   ├── sequence
│   ├── previous_event_hash
│   ├── event_hash
│   └── checkpoint?
└── signatures[]
```

Fields marked `?` are deployment-dependent. Their absence must be explicit in verification output rather than silently treated as proven.

## 3. Canonical request

The canonical request is the security object being authorized. Existing `AuthorizationRequest` semantics are the starting point.

A v1 request digest must cover at least:

```text
schemaVersion
requestId
principalId
sessionId
workspace/tenant scope when present
contract/revision/criteria when present
instanceId / parentInstanceId when present
onBehalfOf when present
tool instance identity when present
action
canonical resource
executable when relevant
arguments or their canonical digest
working directory when relevant
network destination when relevant
provenance labels
sensitivity labels
requestedAt
nonce
K7 influence claims when present
```

Adding a security-relevant field later requires a tagged/versioned hash domain so old verifiers cannot accidentally ignore new semantics.

## 4. Identity binding

Arcana v1 treats these as distinct concepts:

```text
principal       — authenticated actor initiating/owning the request context
owner           — organizationally accountable person/team
agent           — logical agent/service definition
workload        — concrete running software instance
session         — execution context
tool instance   — concrete tool/resource endpoint
on-behalf-of    — delegated business/user principal
```

The verifier reports which identity dimensions were actually bound. A proof that binds only `principalId + sessionId` must not be displayed as equivalent to one that additionally binds workload and tool-instance identity.

## 5. Decision object

A decision must bind:

```text
request_id
request_hash
decision = ALLOW | DENY | REQUIRE_APPROVAL
policy_version
policy_bundle_digest when available
capability_ids[]
reasons[]
risk_class
decided_at
valid_until when applicable
```

For HIGH/CRITICAL effects, the PEP must re-check request hash and freshness immediately before the protected execution boundary.

## 6. Authority object

Capabilities/approvals are authority, not evidence of execution.

A high-assurance capability should bind directly or transitively:

```text
issuer
subject/workload
acting-on-behalf-of principal
workspace/tenant
tool
action
resource
consequential-argument digest
request hash
policy identity
approval chain identity if required
issued-at / not-before / expiry
capability id
nonce/use counter
revocation epoch or equivalent
delegation depth and attenuation constraints
```

Delegation must be monotonic: child authority is a subset of delegable parent authority.

## 7. Execution receipt

The existing `ExecutionReceipt` model is the basis for replay and recovery safety.

A v1 receipt should preserve:

```text
execution_key
principal/session/request hash
capability id
nonce
pep/tool identity when available
status = EXECUTING | SUCCEEDED | FAILED | UNKNOWN_AFTER_CRASH
created_at
completed_at?
event_id?
input_digest
output_digest?
```

The execution key should remain deterministic over the identity/request/authority tuple so duplicate effect attempts can be recognized across retries and restarts.

`UNKNOWN_AFTER_CRASH` is a security-relevant state and must never be auto-converted into success. Recovery logic must prove whether retry is safe for the protected operation.

## 8. Evidence chain and checkpoints

A baseline event chain may use:

```text
E_i = H(domain || E_(i-1) || canonical(event_i))
```

with periodic checkpoints:

```text
C_n = Sign(K_evidence, tenant || sequence_n || E_n || timestamp || schema_version)
```

This can make post-checkpoint mutation detectable. It does not prove that an event omitted before admission to the evidence chain never happened.

Verifier output must therefore separate:

- `integrity_valid`;
- `continuity_valid`;
- `mediation_coverage`;
- `evidence_completeness`.

## 9. Signature and encoding profile

The existing Ed25519 assurance/signing work remains valid for current implementation evidence.

For the long-term portable proof protocol, the wire encoding must be frozen before it is marketed as a public protocol. The selected profile must specify:

- deterministic serialization;
- signature envelope format;
- hash suite;
- key identifier format;
- algorithm-agility/version rules;
- maximum object sizes;
- duplicate-key handling;
- Unicode normalization behavior;
- numeric/time canonicalization;
- unknown-field behavior.

Candidate standards to evaluate are deterministic CBOR + COSE and typed DSSE-style envelopes. Selection should be made by interoperability/fuzzing evidence, not aesthetic preference.

## 10. Verification algorithm

A standalone verifier should execute this conceptual sequence:

```text
1. parse with strict schema/version rules
2. verify schema/suite identity
3. recompute canonical request hash
4. verify decision authenticity
5. verify policy identity/digest
6. verify capability/approval binding
7. verify freshness and revocation semantics at execution time
8. verify delegation attenuation
9. verify execution key/receipt consistency
10. verify evidence chain and checkpoint signatures
11. verify optional resource receipt/attestation when present
12. report mandatory-mediation profile and missing assumptions
```

The verifier returns one of:

```text
VERIFIED
FAILED
INCOMPLETE
```

`INCOMPLETE` means the requested security claim cannot be established from the supplied evidence. It is not a warning-level success.

## 11. Negative conformance corpus

The conformance suite must include malformed and adversarial vectors, not only positive examples.

Required classes include:

- single-field request mutation after ALLOW;
- argument reorder/canonicalization ambiguity;
- duplicate JSON/map keys;
- Unicode normalization differentials;
- stale `validUntil`;
- consumed capability replay;
- capability from another workspace/session;
- delegated child with broadened resource/action scope;
- mismatched tool instance/schema hash;
- missing K2 identity extension where required by deployment profile;
- altered K7 influence claim block;
- policy version/digest rollback;
- forged/unknown signer;
- evidence-chain insertion/deletion/reorder;
- truncated tail after a known checkpoint;
- receipt state `UNKNOWN_AFTER_CRASH` followed by unsafe duplicate execution;
- parser differential vectors across TypeScript/Rust and future implementations.

## 12. Versioning

`arcana-proof/1` must be immutable after publication.

Future versions may add fields or stronger suites, but verifiers must never reinterpret a v1 object under v2 semantics. Security-relevant extensions require explicit tagged domains and compatibility tests.

## 13. Relationship to existing Arcana primitives

This protocol is a productization layer over existing primitives, not a replacement:

- Phase C capability types and delegation;
- K2 agent/tool instance identity binding;
- K7 consequential-argument provenance;
- approval request snapshots/lifecycle;
- request hashing and stale-decision rejection;
- execution receipts;
- RunProof/export/replay;
- frozen TypeScript/Rust conformance vectors;
- L3/L4 assurance manifests and attestations.

Implementation work should therefore converge these surfaces into one exported proof contract rather than create a parallel security subsystem.
