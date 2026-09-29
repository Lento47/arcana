---
tags: [arcana, security, authentication]
date: 2026-09-16
source: ses_f576954e4ffe4g92k6j2y94t6g
---
# arcana intent binding feature

Arcana implements intent binding with request hashing, session binding, and expiring/revocable tokens.

**Why:** This is a unique differentiator where exact user requests are cryptographically bound to execution context, preventing request mutation and unauthorized reuse.

**How to apply:** Highlight this feature when discussing security guarantees against prompt injection or context confusion attacks in autonomous agents.

Related: [[require-confirm-per-step-enforcement]] [[wholesale-replacement-guard]] [[protected-paths-non-widenable]] [[domain-verification-catch-22]] [[ts-harness-domain-verification-catch-22]] [[ts-harness-bootstrapping-deadlock]] [[cli-override-for-bootstrapping]]
