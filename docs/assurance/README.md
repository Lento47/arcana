# External assurance program

This directory defines Arcana's machine-readable L3 reproduction and L4 independent-assessment contracts. It does not contain a certification and cannot elevate Arcana-authored evidence into an external claim.

## Status

| Level | Required evidence                                                                                                                                        | Current state    |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| L3    | Signed reproduction by an organization outside Arcana, on the exact release candidate and required environment/suite matrix                              | **Not assessed** |
| L4    | Signed full-platform assessment by a second independent organization, including remediation retest and zero open Critical, High, Medium, or Low findings | **Not assessed** |

The verifier in `script/assurance.ts` fails closed unless both signatures match configured trust anchors, both attestations bind to the same immutable candidate manifest, and the L3 and L4 organizations differ.

## Documents

- [L3 reproduction runbook](L3-REPRODUCTION-RUNBOOK.md)
- [L4 assessment runbook](L4-ASSESSMENT-RUNBOOK.md)
- [Hardened Linux reference deployment](REFERENCE-DEPLOYMENT.md)
- [Machine-readable schemas](schemas/)

The public evidence set is `assurance-manifest.json`, `l3-attestation.json`, `l4-attestation.json`, and their SHA-256 digest list. Detailed L4 findings may remain under NDA; the public attestation records scope, severity totals, open counts, limitations, retest status, assessor identity, and the confidential report digest.

## Release flow

1. The release workflow creates `vX.Y.Z-rc.N`, never a stable tag.
2. Arcana generates an exact-commit manifest from a clean candidate checkout and a completed reference-deployment manifest.
3. The external L3 party reproduces and signs its attestation with its own Ed25519 key.
4. A separate L4 assessor completes the initial review, Arcana remediates findings, and the assessor performs the second-pass retest and signs its attestation.
5. A protected GitHub environment imports and verifies both attestations, then publishes immutable evidence under `assurance-<commit>`.
6. The protected promotion workflow creates the stable tag on the same commit. Stable build publication independently re-verifies the evidence and trusted signer fingerprints.

No workflow, maintainer, or model may mark L3/L4 complete without the external signed evidence.

## Repository protection setup

Before using the workflows, an administrator must create the GitHub environment `assurance`, require independent human reviewers, prevent self-review where supported, restrict deployment branches/tags, and store these environment secrets:

- `ARCANA_L3_SIGNER_KEY_SHA256` — SHA-256 fingerprint emitted as `signature.keyId` by the accepted reproducer key.
- `ARCANA_L4_SIGNER_KEY_SHA256` — fingerprint from the separate assessor key.

The same read-only fingerprints must be available to the stable build job as repository secrets. Protect stable tags from direct creation/deletion and permit the promotion workflow identity only. Protect candidate and evidence tags against force updates. Keep release-signing, registry, and object-store credentials out of pull-request jobs and scope them only to stable publication.

Fingerprint exchange must use a channel separate from the attestation download. Changing either trusted fingerprint is a reviewed security operation and requires new attestations; never accept a key only because it is embedded in the downloaded JSON.
