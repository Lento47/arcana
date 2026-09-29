---
tags: [refactoring, typescript, code-organization]
date: 2026-09-18
source: ses_f49e2c5ceffeaw3SlqVpnlv4Vs
---
# barrel pattern for code splitting

Use a central re-export file to split large modules without breaking existing imports.

**Why:** When refactoring large files, maintaining backward compatibility for existing imports is crucial. A barrel file acts as a facade, re-exporting from split modules, so callers don't need to change their import paths.

**How to apply:** Create individual files for each domain or concern, and have the original file (e.g., `report.ts`) re-export all public symbols from these new files. Test thoroughly to ensure no import breaks.

Related: [[barrel-re-export-split-pattern]] [[wait-for-quiet-before-split]] [[domain-surface-file-split]]
