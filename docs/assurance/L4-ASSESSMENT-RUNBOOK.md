# L4 independent security assessment runbook

## Engagement model

Use a professional assessor independent from both Arcana and the L3 reproducer. The engagement has two passes:

1. **Discovery and attack:** architecture/threat-model review, implementation review, penetration testing, supply-chain/release review, and initial findings.
2. **Remediation verification:** retest every finding against the same candidate line and verify that no Critical, High, Medium, or Low item remains open.

If remediation changes the candidate commit, regenerate the assurance manifest and repeat every commit-bound L3 and L4 check. Evidence from a different commit cannot be carried forward as a passing attestation.

## Full-platform scope

The review covers all shipping and security-relevant Arcana surfaces: CLI and engine, PDP/PEP and capability stores, approvals and persistence, TUI governance controls, server/enterprise administrative APIs, gateway and cron entry points, plugin/MCP/skill boundaries, SDK adapters, distributed node/control-plane paths, memory and database boundaries, RunProof/export/replay, binaries/install/update, CI/release credentials and provenance, and the hardened Linux reference deployment.

At minimum, test:

- `¬Authorized(q) ⇒ ¬Executed(q)` at every declared executor boundary;
- stale-decision rejection, exact request binding, atomic grant/approval claims, replay resistance, revocation, delegation monotonicity, and cross-session/cross-tenant isolation;
- forged or unknown provenance, prompt/tool/plugin/MCP injection, adapter bypass, direct executor access, malformed events, proof omission/tampering, crash/restart races, and degraded/unavailable dependencies;
- transport authentication, TLS/mTLS, channel binding, secret/key custody, host isolation, backup/restore, compromised-node response, and rotation ceremonies;
- dependency, build, artifact-signing, SBOM, provenance, candidate promotion, and registry/update-channel compromise paths.

Use the Master Specification, `docs/SECURITY-CHECKLIST.md`, `docs/FREEZE-RELEASE.md`, `docs/BLOCKERS.md`, and the exact candidate manifest as scope authorities. The assessor must record exclusions and limitations; an excluded security-relevant surface prevents a full-platform passing conclusion.

## Findings and retest

Use Critical, High, Medium, Low, and Informational severities with documented definitions. Each finding needs an identifier, affected surface, reproduction evidence, impact, recommendation, remediation commit(s), and retest result. Arcana's selected gate is stricter than a conventional risk-acceptance gate: every Critical, High, Medium, and Low finding must be closed and independently retested. Informational findings may remain as recommendations and are counted publicly.

The final signed attestation must conform to `schemas/l4-assessment.v1.schema.json`, bind to the candidate and reference-deployment digests, mark all five review categories completed, set `retestCompleted: true`, record zero open non-informational findings, and use `conclusion: "passed"`. The assessor owns and retains its Ed25519 private key.

## Disclosure

Publish a summary containing assessor identity, dates, exact tag and commit, scope, methodology, limitations, severity totals and open counts, remediation/retest status, and the SHA-256 digest of the detailed final report. The detailed report and exploit material may remain under NDA. Redaction cannot hide scope exclusions, severity/open counts, retest state, or the report digest.

L4 remains **Not assessed** until the external assessor completes the second pass and Arcana's verifier accepts the signed attestation under the preconfigured assessor trust anchor.
