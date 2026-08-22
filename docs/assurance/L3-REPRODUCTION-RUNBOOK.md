# L3 independent reproduction runbook

## Independence and custody

The reproducer must be an organization outside the Arcana project and must not be the L4 assessor. Arcana maintainers may answer setup questions, but may not operate the final run, edit its output, hold the reproducer's private key, or choose which failures to omit.

The subject is one immutable `vX.Y.Z-rc.N` tag and its 40-character commit. Work from a new checkout with no ignored or untracked additions. Record source acquisition, operator, UTC timestamps, hardware/virtualization, operating system image, Bun version, Rust version, and every deviation.

## Required environments

- Linux x64 on a clean, supported distribution image.
- macOS arm64 on a clean supported host or VM.

Both environments must execute every suite listed in `assurance-manifest.json`. The manifest is authoritative; do not substitute commands or update dependencies. A missing environment, dirty source tree, changed corpus, failed command, missing raw report, or unexplained deviation is an L3 failure.

## Procedure

For each environment:

```bash
git clone --no-local <public-arcana-repository> arcana-l3
cd arcana-l3
git checkout --detach <candidate-commit>
test "$(git rev-parse HEAD)" = "<candidate-commit>"
test -z "$(git status --porcelain --untracked-files=all)"
bun install --frozen-lockfile
```

Verify every artifact digest in the manifest, then execute each `requiredSuites[].command` exactly from its declared `cwd`. Preserve complete stdout/stderr and the generated JSON evidence. Hash every raw report with SHA-256 and place that digest in the matching result.

After the run, confirm the source tree remains clean. Any generated evidence must be written outside the checkout or to a predeclared ignored evidence directory whose contents are separately hashed.

## Attestation

Create an unsigned document conforming to `schemas/l3-reproduction.v1.schema.json`. It must contain the complete environment-by-suite matrix, `sourceClean: true` for every result, an empty `deviations` array, the aggregate report digest, and `conclusion: "passed"`. If those statements are not true, use `conclusion: "failed"`; do not sign a passing attestation.

The reproducer generates and retains its own Ed25519 key. It may use the candidate's signing helper without sharing the private key:

```bash
bun run assurance sign \
  --input l3-attestation.unsigned.json \
  --private-key reproducer-ed25519-private.pem \
  --output l3-attestation.json
```

Deliver the signed attestation, raw report package, SHA-256 digest list, public key fingerprint through a separately authenticated channel, and a public HTTPS download URL for the attestation. Arcana pins the fingerprint before evidence import.

## Acceptance

Arcana runs `bun run assurance verify` but does not decide whether failed evidence should be reinterpreted. A failed or incomplete reproduction requires a new candidate or a new complete external run. L3 remains **Not assessed** until the signed evidence is imported and verified.
