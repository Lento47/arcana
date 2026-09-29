---
tags: [ts-harness, security, bootstrapping, bug]
date: 2026-09-17
source: ses_f4ee8c3d1ffe4oUlTqcjBC3w5U
---
# domain verification catch 22

Domain verification in profile creation creates a catch-22 when the domain isn't already in the allowlist

The `profile-create` command requires domain verification (fetching every host in `domains.official` before offering the step), but the domain filter blocks fetches for domains not already in an existing profile's `domains.official` allowlist. This means you cannot create a new vendor profile for a domain that isn't already whitelisted — a circular dependency that blocks first-time setup.

**Why:** The security model's defense-in-depth layers (domain filter + verification) conflict during bootstrapping. The filter assumes profiles already exist; verification requires a profile to reference those domains.

**How to apply:** When designing layered security, trace the bootstrapping path for brand-new entries end-to-end. If Layer A requires Layer B to exist and Layer B requires Layer A to exist, the system is broken for first-time setup even if it works fine for existing entries.

Related: [[ts-harness-domain-verification-catch-22]] [[ts-harness-plugin-api-is-declarative-only]] [[ts-harness-bootstrapping-deadlock]] [[ts-harness-plugin-api-unimplemented]] [[cli-override-for-bootstrapping]] [[audit-surface-level-initial-take]] [[ts-harness-audit-validation]] [[per-domain-fetch-headers-implementation]] [[missing-filterresults-unit-tests]] [[no-end-to-end-pipeline-test]] [[ts-harness-grounding-gate]] [[safe-file-split-without-vcs]]
