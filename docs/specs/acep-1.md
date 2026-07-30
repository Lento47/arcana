# Arcana Canonical Envelope Profile v1 (ACEP-1)

**Status:** Final Hardening
**Version:** 1.0.0-proto
**Supersedes:** RFC 8785/JCS subset (partial compatibility)

---

## 1. Overview

ACEP-1 defines the deterministic serialization format for all Arcana signed
envelopes. It is inspired by RFC 8785/JCS but imposes stricter constraints
to eliminate ambiguity in cross-runtime cryptographic verification.

Every signed Arcana envelope must serialize to identical bytes regardless of:
- Runtime language
- Object key insertion order
- JSON parser implementation

This property is required so that Ed25519 signatures computed by one runtime
can be verified by another without negotiation.

---

## 2. Differences from RFC 8785/JCS

| Property | RFC 8785/JCS | ACEP-1 |
|---|---|---|
| Object key sorting | Yes (UTF-16 code unit) | Yes (UTF-16 code unit) |
| Duplicate keys | Rejected | Rejected after JSON escape decoding |
| Numbers | I-JSON IEEE-754 | Safe nonnegative integers only (where specified) |
| Floating-point | Permitted | Prohibited |
| Schema fields | Not specified | Exact allowed-field sets per envelope type |
| Timestamps | Not specified | Strict UTC RFC 3339 with milliseconds |
| Base encoding | Not specified | Canonical base64url (no padding) |
| Unicode normalization | Not specified | None (exact scalar sequences preserved) |

A JCS-compliant serializer is NOT automatically ACEP-1 compliant.

---

## 3. Integer Representation

### 3.1 Safe Integer Constraint

All integer fields in signed envelopes use JavaScript safe integers:

- Range: `0` to `2^53 - 1` (9007199254740991)
- No negative values where the schema defines the field as unsigned
- No floating-point values
- No NaN, Infinity, -Infinity
- No exponential notation (`1e5`)
- No leading zeros (`01`)

### 3.2 Large Counters

If a field may exceed `2^53 - 1`, use a canonical unsigned decimal string:

```
sequence: "9007199254740992"
```

String counters reject:
- Leading `+`
- Leading zeros (except `"0"`)
- Exponential notation
- Fractional values

---

## 4. Timestamps

All timestamps use strict UTC RFC 3339 with exactly 3 fractional digits:

```
2026-07-29T12:00:00.000Z
```

Reject:
- `2026-07-29T12:00:00Z` (missing milliseconds)
- `2026-07-29T12:00:00.00Z` (2 digits)
- `2026-07-29 12:00:00.000Z` (space separator)
- `2026-07-29T12:00:00+00:00` (offset instead of Z)

Regex: `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$`

---

## 5. Base Encoding

All binary data (public keys, signatures, digests, nonces) uses canonical
base64url without padding:

- Alphabet: `A-Za-z0-9-_`
- No `+`, `/`, `=`
- No whitespace
- Round-trip required: `decode(reencode(x)) === x`

Canonical decode: decode then re-encode; reject if result differs from input.

Invalid base64url length: length `1 mod 4` is always invalid.

---

## 6. Unicode

### 6.1 Signed Payload Strings

Freeze rule: **UTF-8 strings are signed exactly as provided.**

- No Unicode normalization (NFC, NFD, NFKC, NFKD)
- Reject invalid Unicode (unpaired surrogates, invalid UTF-8 sequences)
- Preserve exact Unicode scalar sequences

### 6.2 Domain-Specific Canonicalization

Identifier fields (nodeId, issuerId, workspaceId, contractId) should be
validated and canonicalized **before envelope construction**, not during
signature verification.

The signing layer does not silently normalize arbitrary signed strings.

### 6.3 Duplicate Key Detection

JSON object keys are compared for duplication **after JSON escape decoding**,
using their exact resulting Unicode scalar sequence. No Unicode normalization
is applied by the signed-envelope layer.

Therefore:
```json
{
  "issuerId": "a",
  "\u0069ssuerId": "b"
}
```
MUST be rejected as a duplicate (both decode to `issuerId`).

But `é` (U+00E9) and `e` + combining acute accent (U+0065 U+0301) remain
distinct unless a domain-specific schema forbids them.

---

## 7. Envelope Categories

### 7.1 Media Types

```
application/vnd.arcana.capability+json;version=1
application/vnd.arcana.policy+json;version=1
application/vnd.arcana.node-identity+json;version=1
application/vnd.arcana.revocation+json;version=1
```

### 7.2 Domain Separators

Used in signature input construction:

```
arcana:signed-capability:v1
arcana:signed-policy:v1
arcana:node-identity:v1
arcana:revocation:v1
```

### 7.3 Allowed Fields

Each envelope type defines an exact set of allowed top-level fields.
Unknown fields are rejected at the SCHEMA verification stage, before
signature verification.

---

## 8. Signature Construction

### 8.1 Ed25519

- Algorithm: Ed25519 (RFC 8032)
- Key form: 32-byte raw public key (no DER wrapper)
- Signature form: 64-byte raw signature
- Test seed: 32-byte deterministic seed

### 8.2 Signature Input

```
signatureInput = UTF8(domainSeparator) || UTF8(canonicalPayload)
```

Where `canonicalPayload` is the ACEP-1 canonical serialization of the
unsigned envelope (all fields except `signature` and `signatureAlgorithm`).

### 8.3 Encoding

Public keys, signatures, digests, and nonces are encoded as canonical
base64url without padding in the wire format.

---

## 9. Wire Parsing

### 9.1 Strict Parse Order

```
raw bytes
  → strict UTF-8 decode (fatal on invalid sequences)
  → lexical duplicate-key scan (after JSON escape decoding)
  → JSON.parse
  → reject non-object top-level
```

### 9.2 UTF-8 Requirement

Raw bytes MUST be valid UTF-8. The decoder uses `{ fatal: true }` mode.
Invalid UTF-8 produces:

```
stage: PARSE
reason: INVALID_UTF8
```

Replacement characters from permissive decoding are NOT accepted.

---

## 10. Verification Stages

ACEP-1 verification proceeds through seven independent layers:

| Stage | Purpose | Checks |
|---|---|---|
| PARSE | Wire validity | UTF-8, duplicate keys, JSON syntax, top-level object |
| SCHEMA | Structural validity | Schema version, required fields, field types, unknown fields, timestamps, integers, base64url |
| SIGNATURE | Cryptographic integrity | Ed25519 verification against domain-separated canonical payload |
| TRUST | Issuer authorization | Issuer ID in trusted key set |
| AUDIENCE | Scope binding | Envelope targets correct node/organization |
| FRESHNESS | Temporal validity | Not expired, not issued in future |
| REVOCATION | Sequence integrity | No sequence rollback against known state |

Each stage produces either `{ valid: true }` or:
```
{
  valid: false,
  stage: "PARSE" | "SCHEMA" | "SIGNATURE" | "TRUST" | "AUDIENCE" | "FRESHNESS" | "REVOCATION",
  reason: RejectionReason,
  detail: string
}
```

Stages are evaluated in order. The first rejection terminates verification.

---

## 11. Cross-Runtime Contract

### 11.1 Interoperability Requirement

Two independent implementations of ACEP-1 must produce identical
accept/reject decisions for all golden test vectors.

```
TSResult(vector) = RustResult(vector)
```

for every vector in the conformance suite.

### 11.2 Golden Vector Organization

Vectors are organized by verification stage:

- **Positive:** 5-8 vectors covering all envelope categories with valid signatures
- **Negative:** 30-40 vectors organized by rejection stage:
  - PARSE: invalid UTF-8, duplicate keys, invalid JSON, excessive nesting
  - SCHEMA: unknown fields, missing fields, wrong types, unsafe integers, noncanonical timestamps, invalid base64url
  - SIGNATURE: wrong key, mutated signature, changed payload fields, wrong domain separator
  - TRUST: unknown issuer, unauthorized issuer
  - AUDIENCE: wrong node, wrong organization
  - FRESHNESS: expired, future-dated, sequence rollback
  - REVOCATION: revoked grant, revoked node, revoked issuer key

### 11.3 Noble Dependency Pinning

Ed25519 verification uses `@noble/curves` through a named wrapper:

```typescript
function verifyEd25519Signature(input: {
  signature: Uint8Array
  message: Uint8Array
  publicKey: Uint8Array
}): boolean
```

Upgrade gate:
1. Upgrade `@noble/curves`
2. Run RFC 8032 reference vectors
3. Run all Arcana golden vectors
4. Run wrong-key/domain/mutation suite
5. Only then update lockfile

Never call Noble directly outside the wrapper.

---

## 12. Rejection Reasons

| Reason | Stage | Description |
|---|---|---|
| `SCHEMA_UNSUPPORTED` | PARSE/SCHEMA | Structural validation failure |
| `INVALID_SIGNATURE` | SIGNATURE | Ed25519 verification failed |
| `UNKNOWN_ISSUER` | TRUST | Issuer not in trusted set |
| `ISSUER_EPOCH_TOO_OLD` | TRUST | Issuer epoch below minimum |
| `WRONG_AUDIENCE` | AUDIENCE | Node/org mismatch |
| `EXPIRED` | FRESHNESS | Envelope past expiry |
| `SEQUENCE_ROLLBACK` | REVOCATION | Sequence ≤ known state |
| `DIGEST_MISMATCH` | REVOCATION | Policy chain linkage broken |
| `ANCESTRY_INVALID` | REVOCATION | Delegation chain broken |
| `REVOKED` | REVOCATION | Subject explicitly revoked |

---

## 13. Future: Threshold Root Authority

ACEP-1 envelope schemas and verification APIs are designed to permit future
threshold signing without breaking the protocol. The current prototype uses
single Ed25519 issuers, but the `RootTrustMetadata` type supports:

```typescript
type RootTrustMetadata = {
  version: 1
  rootSequence: number
  keys: readonly {
    keyId: string
    publicKey: string
    status: "ACTIVE" | "RETIRING" | "REVOKED"
  }[]
  threshold: number
  expiresAt: string
}
```

Threshold verification will require `threshold` valid signatures from
`ACTIVE` keys, but the wire format and canonical serialization remain
unchanged.
