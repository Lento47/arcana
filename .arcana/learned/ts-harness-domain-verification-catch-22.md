---
tags: [ts-harness, architecture, bootstrapping, security]
date: 2026-09-17
source: ses_f4ee8c3d1ffe4oUlTqcjBC3w5U
---
# ts harness domain verification catch 22

Profile creation requires domain verification against the profile's own allowlist, creating a bootstrapping deadlock

The ts-harness `profile-create` step fetches every host in `domains.official` and verifies it resolves before allowing profile creation. But the domain filter (`filterResults()`) blocks fetches for domains not already in an existing profile's allowlist. For new vendor profiles (like Splunk), the target domain isn't in any allowlist yet — so verification fails before it can ever succeed.

**Why:** This is a classic bootstrapping problem. The security model is sound for *existing* profiles but has no path for *initial* profile creation when the vendor's domain isn't already whitelisted by some other profile.

**How to apply:** When designing allowlist-based security, always ensure there's a first-entry path. Options: a hardcoded seed list of verified vendor domains, a manual override for the first profile creation, or separating the "is this a valid vendor site" check from the "is this site in our allowlist" check.

Related: [[ts-harness-bootstrapping-deadlock]] [[ts-harness-plugin-api-unimplemented]] [[cli-override-for-bootstrapping]] [[audit-surface-level-initial-take]] [[ts-harness-audit-validation]] [[per-domain-fetch-headers-implementation]] [[missing-filterresults-unit-tests]] [[no-end-to-end-pipeline-test]] [[ts-harness-grounding-gate]] [[safe-file-split-without-vcs]]
