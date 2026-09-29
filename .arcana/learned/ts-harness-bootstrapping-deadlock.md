---
tags: [ts-harness, architecture, security, bootstrapping]
date: 2026-09-17
source: ses_f4ee8c3d1ffe4oUlTqcjBC3w5U
---
# ts harness bootstrapping deadlock

Domain verification creates a catch-22: need profile to have domains in allowlist, need domains in allowlist to create profile

In ts-harness, the `profile-create` step requires domain verification — it fetches every host in `domains.official` and checks the page. But the domain filter (`filterResults()` and the fetcher) blocks requests to hosts not in an existing profile's allowlist. Result: you can't create the first profile for a vendor because the domain isn't in any allowlist yet, and you can't add it to an allowlist without the profile existing.

**Why:** The verification gate and the domain filter were designed independently. The filter protects against SSRF and off-topic fetches for *existing* profiles, but it wasn't scoped to allow the bootstrap case.

**How to apply:** When designing allowlist-based access control, always consider the first-entry case. Either add a CLI path that bypasses the filter (keeping SSRF guard only), or add a `--bootstrap` flag that temporarily relaxes domain filtering with explicit user confirmation.

Related: [[ts-harness-audit-validation]] [[per-domain-fetch-headers-implementation]] [[missing-filterresults-unit-tests]] [[no-end-to-end-pipeline-test]] [[ts-harness-grounding-gate]] [[safe-file-split-without-vcs]]
