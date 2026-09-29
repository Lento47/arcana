---
tags: [security, file-system, protection]
date: 2026-09-17
source: ses_f4ed36661ffe63R4AkGwhextmD
---
# protected paths non widenable

UNWRITABLE_PATHS list is self-referential and case-insensitive to protect critical files.

**Why:** Prevents unauthorized modifications to security-critical files by making the protection list itself immutable and robust against case variations.

**How to apply:** Define protected paths as constants, include the list file itself for self-reference, and use case-insensitive comparisons in checks. Test with exported constants to ensure resistance to widening attacks.

Related: [[domain-verification-catch-22]] [[ts-harness-domain-verification-catch-22]] [[ts-harness-bootstrapping-deadlock]] [[cli-override-for-bootstrapping]]
