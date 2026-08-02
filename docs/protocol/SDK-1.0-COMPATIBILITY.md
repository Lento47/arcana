# SDK 1.0 — Compatibility Contract (draft)

**Status:** draft — versioning/error semantics are stable, the SDK 1.0
release freeze remains pending.

## Versioning

- The SDK follows semantic versioning. Breaking changes to public exports,
  error codes, or canonical request semantics require a major version.
- `@arcana/sdk/v2/*` subpath exports are the public surface: `client`,
  `server`, `governance`, `proof`, `errors`, `gen/client`.
- Protocol schema versions are negotiated independently of SDK versions:
  `schemaVersion: 1` envelopes are accepted; unknown versions fail at SCHEMA.

## Error model

Stable machine codes (`@arcana/sdk/v2/errors`):

| Code | Class | Typical status |
|---|---|---|
| AUTHORIZATION_DENIED | AuthorizationDeniedError | 401/403 |
| APPROVAL_REQUIRED | ApprovalRequiredError | 402 |
| VERIFICATION_FAILED | VerificationFailedError | 400 |
| TRANSPORT_ERROR | TransportError | network/5xx |
| INVALID_REQUEST | InvalidRequestError | 400 |
| NOT_FOUND | NotFoundError | 404 |
| INTERNAL | ArcanaError | 500 |

Consumers may depend on `code`; `message` is human-readable only.

## Conformance

`bun run script/conformance.ts` runs the SDK governance/proof/error suite
alongside the golden crypto vectors, the D-10 matrix, and the Rust verifier.
The SDK must pass all four surfaces for a release.

## Nonclaims

- The SDK does not implement OS-level sandboxing; adapters must declare their
  enforcement level (A0–A3) separately.
- Proof verification is structural (schema/lifecycle/fingerprint); full event
  chain integrity is engine-side.
