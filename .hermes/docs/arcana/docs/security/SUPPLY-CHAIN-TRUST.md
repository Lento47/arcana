---
document_class: security_supply_chain
authority: reference
status: current
last_verified: 2026-08-02
status_source: docs/STATUS.md
---

# Supply-Chain Trust

## Current state

| Control | Status | Evidence |
|---|---|---|
| Dependency pinning | IMPLEMENTED / PRODUCTION-MOUNTED | `bun.lock` committed; reproducible installs |
| Vulnerability triage | INTERNALLY-VALIDATED | TUI-2.1 freeze report WS4: dompurify 3.4.11→3.4.12 landed; @hey-api/openapi-ts dev-only not reachable; nitro enterprise-only, separate security PR |
| npm wrapper hygiene | IMPLEMENTED | Private repo URL/`opencode` branding removed from `packages/arcana/npm` |
| SBOM generation | NOT IMPLEMENTED | No cyclonedx/spdx artifact |
| Signature verification of dependencies | NOT IMPLEMENTED | No registry signature enforcement |
| Build provenance / attestation | NOT IMPLEMENTED | No SLSA attestation |
| Schema/supply-chain controls | PARTIAL | Zod schemas + canonical serializer; public registry pending (`docs/protocol/SCHEMA-VERSION-REGISTRY.md`) |

## Policy

- Reachability classification before dependency upgrades: production-runtime,
  build-time, or dev-only.
- Patches land before merge when reachable (dompurify precedent).
- Major upgrades with breaking surface (e.g., openapi-ts) go through a
  separate change with regeneration + full suite.

## Nonclaims

- No independent dependency audit yet.
- No SBOM or SLSA attestation published.
- No guarantee for transitive deps beyond lockfile pinning and triage.
