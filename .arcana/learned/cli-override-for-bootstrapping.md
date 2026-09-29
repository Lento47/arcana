---
tags: [ts-harness, cli-design, security, bootstrapping]
date: 2026-09-17
source: ses_f4ee8c3d1ffe4oUlTqcjBC3w5U
---
# cli override for bootstrapping

Use a CLI command outside the chat pipeline to handle first-entry cases that require relaxed guards

For the ts-harness bootstrapping deadlock, the proposed fix is `tsh vendor create splunk --domain docs.splunk.com` — a CLI command that operates **outside** the chat pipeline. It fetches with SSRF guard (netGuard) but **no domain filter** (since no profile exists yet), shows the user the result, and writes a minimal `vendors/<name>.yaml`. The chat's `profile-create` stays strict.

**Why:** The chat pipeline enforces safety invariants (domain verification, rejection logging) that are correct for normal operation but block first-entry. A separate CLI path lets the human make the trust decision explicitly while keeping the safety surface intact for automated flows.

**How to apply:** When your safety model creates a bootstrapping deadlock, add a dedicated CLI command that:
1. Keeps the security guard (SSRF, injection)
2. Drops the allowlist filter (nothing to filter against)
3. Requires explicit human input for the trust decision
4. Writes a minimal valid artifact that the normal pipeline can then extend

Related: [[ts-harness-audit-validation]] [[per-domain-fetch-headers-implementation]] [[missing-filterresults-unit-tests]] [[no-end-to-end-pipeline-test]] [[ts-harness-grounding-gate]] [[safe-file-split-without-vcs]]
