---
tags: [debugging, tooling, verification]
date: 2026-09-21
source: ses_f49e2c5ceffeaw3SlqVpnlv4Vs
---
# trusting tool output without verifying workspace

Don't trust automated tool results without confirming they ran against the correct project

The `goal_check` tool reported results from arcana's workspace instead of ts-harness. Initial review showed these as the project's results until manually verified.

**Why:** The tool auto-detected the wrong workspace root. Without manual verification, incorrect pass/fail results would have been accepted.

**How to apply:** After any automated check, verify the output matches expectations for the specific project — check file paths, config references, and test counts in the output. If anything looks off, re-run manually from the correct directory.
