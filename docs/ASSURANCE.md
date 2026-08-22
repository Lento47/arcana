# Arcana assurance and independent verification

Arcana separates engineering evidence from independent assurance. The model proposes, the engine decides, and the proof records; an Arcana-authored test report is not an external certification.

## Current claim boundary

| Level | Meaning                                                                                                              | Current state                                                                                                                          |
| ----- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| L1    | One implementation passes its own tests                                                                              | Available                                                                                                                              |
| L2    | Reproducible cross-runtime evidence with frozen corpora                                                              | Available in-repository: TypeScript and Rust, 46 crypto vectors, hostile-node fixtures, SDK contracts, and 4 certified adapter vectors |
| L3    | A party outside the Arcana project reproduces the results from a pinned release candidate                            | Not assessed                                                                                                                           |
| L4    | An independent security review evaluates the threat model, implementation, release process, and findings remediation | Not assessed                                                                                                                           |

The machine-readable conformance report carries these states. It never promotes L2 results into an L3 or L4 claim.

The external-assurance contract, schemas, release gates, and independent-party procedures are in [docs/assurance](assurance/README.md). The hardened Linux target is intentionally fail-closed: known TLS/mTLS, channel-binding, OS-key-protection, and live-exercise blockers make a passing L4 attestation impossible until they are resolved and independently observed.

## Reproduce the internal conformance evidence

Prerequisites are Bun 1.3 or newer, a stable Rust toolchain, and Git.

```bash
bun install --frozen-lockfile
bun run conformance --output evidence/conformance.json
```

For automation, use JSON-only stdout:

```bash
bun run conformance --json --output evidence/conformance.json
```

The command exits `0` only when all five suites pass, `1` for a conformance failure, and `2` for invalid runner arguments. Reports use schema `arcana.conformance.v1` and contain:

- exact commit and dirty-worktree state;
- OS, architecture, Bun, and Rust versions;
- commands, working directories, durations, exit status, and bounded summaries;
- SHA-256 identities for the crypto and adapter corpora;
- explicit `not_assessed` values for external reproduction and independent audit.

The [assurance workflow](../.github/workflows/assurance.yml) is configured to run the same evidence contract on Linux, Windows, and macOS and retain each report for 180 days. A release build is gated on the runner and attaches its report to the GitHub release.

## Evidence surfaces

| Surface                                   | Location                                                       | Purpose                                                            |
| ----------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------ |
| Runner and report schema                  | `script/conformance.ts`                                        | Unified fail-closed execution and portable report                  |
| Signed-capability corpus                  | `tools/acep-conformance-rust/vectors/conformance-vectors.json` | 46 implementation-neutral positive and negative vectors            |
| Independent-language implementation       | `tools/acep-conformance-rust`                                  | Rust canonicalization, signature, envelope, PEP, and proof checks  |
| TypeScript crypto and hostile-node checks | `packages/core/src/crypto`                                     | Production implementation and adversarial matrix                   |
| SDK governance/proof/error contract       | `packages/sdk/js/src/v2`                                       | Stable client behavior and proof verification                      |
| Certified adapter corpus                  | `packages/sdk/js/src/v2/adapters/certified-vectors.ts`         | Public request-hash inputs and outputs for four framework mappings |

## L3 reproduction package

An external reproducer should receive one immutable release commit or tag, the two frozen corpora, this procedure, the generated report schema, and no private Arcana test oracle. The reproducer should publish its environment, commands, raw report, deviations, and identity of the evaluated commit. Arcana maintainers may help with setup but must not run or edit the final reproduction.

Acceptance requires all suites to pass from a clean checkout on at least two operating systems and the corpus hashes to match the release evidence. A failure, changed corpus, dirty checkout, or maintainer-produced final report does not qualify as L3.

Follow the [L3 reproduction runbook](assurance/L3-REPRODUCTION-RUNBOOK.md). The signed report must conform to [the L3 schema](assurance/schemas/l3-reproduction.v1.schema.json), bind to the exact assurance-manifest digest, and verify under the preconfigured reproducer key fingerprint.

## L4 review package

Commission the independent review only after a release candidate is frozen. Scope should include the authorization invariant `¬Authorized(q) ⇒ ¬Executed(q)`, PDP/PEP separation, stale-decision rejection, approval and capability replay, provenance fail-closed behavior, proof integrity, persistence/restart recovery, adapter bypass attempts, and release provenance.

Publish the review scope, reviewer identity, dates, tested commit, severity rubric, findings, remediation commits, and retest result. Redactions should be limited to exploit details that remain unsafe to disclose. Arcana must not describe the review as passed until the reviewer confirms remediation.

Follow the [two-pass L4 assessment runbook](assurance/L4-ASSESSMENT-RUNBOOK.md). The public signed attestation must conform to [the L4 schema](assurance/schemas/l4-assessment.v1.schema.json), while the detailed report may remain under NDA. The selected release gate requires zero open Critical, High, Medium, or Low findings after independent retest.

## Candidate and stable-release gate

`bun run assurance manifest` creates the exact-commit input contract from a clean candidate checkout. `bun run assurance verify` validates manifest binding, Ed25519 signatures, configured signer fingerprints, separate external organizations, the complete L3 matrix, full L4 scope/retest, deployment identity, and finding closure.

The release workflow creates only `vX.Y.Z-rc.N`. External evidence is imported through the protected assurance environment and frozen under `assurance-<commit>`. A second protected workflow may then create `vX.Y.Z` on that same commit. Stable registry and update-channel publication independently reruns verification; RC tags are never published as stable packages.
