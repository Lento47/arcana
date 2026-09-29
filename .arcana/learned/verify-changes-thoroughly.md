---
tags: [debugging, user-interaction, ai-agent]
date: 2026-09-18
source: ses_f49e2c5ceffeaw3SlqVpnlv4Vs
---
# verify changes thoroughly

Failing to detect user-indicated changes due to insufficient re-verification, leading to incorrect assumptions.

**Why:** Relying on previous file states without actively re-checking after user feedback can result in missed updates and erroneous conclusions, undermining accuracy in collaborative tasks.
**How to apply:** When a user states that changes have been made, always re-read or re-examine the relevant files or data sources before responding, and confirm the current state explicitly.

Related: [[goal-check-workspace-default]] [[trusting-tool-output-without-verifying-workspace]]
