---
tags: [security, code-edit, guard]
date: 2026-09-17
source: ses_f4ed36661ffe63R4AkGwhextmD
---
# wholesale replacement guard

Guard rejects edits with over 30% diff ratio to prevent wholesale replacement.

**Why:** Protects against malicious or accidental overwriting of entire files or sections, preserving code integrity.

**How to apply:** Implement diff ratio checks in edit guards to block changes that exceed a threshold (e.g., 30%). Use severity levels like 'block' to enforce hard stops, and log findings for audit trails.

Related: [[domain-verification-catch-22]] [[ts-harness-domain-verification-catch-22]] [[ts-harness-bootstrapping-deadlock]] [[cli-override-for-bootstrapping]]
