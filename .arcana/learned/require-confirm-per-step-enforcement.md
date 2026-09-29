---
tags: [security, typescript, config-validation]
date: 2026-09-17
source: ses_f4ed36661ffe63R4AkGwhextmD
---
# require confirm per step enforcement

Multiple enforcement layers for requireConfirmPerStep in ts-harness.

**Why:** Ensures that the setting cannot be bypassed or disabled, maintaining security integrity for step confirmations.

**How to apply:** When implementing similar settings, enforce at multiple layers: use Zod schema for validation at config load, add runtime checks in validators to reject proposals, and design architecture to prevent batch approvals. This provides defense-in-depth.

Related: [[domain-verification-catch-22]] [[ts-harness-domain-verification-catch-22]] [[ts-harness-bootstrapping-deadlock]] [[cli-override-for-bootstrapping]] [[split-large-file-by-domain-surface]] [[refactor-by-domain-surface]] [[barrel-re-export-refactor]] [[split-by-domain-surface]] [[barrel-pattern-for-code-splitting]] [[barrel-re-export-split-pattern]] [[domain-surface-file-split]]
