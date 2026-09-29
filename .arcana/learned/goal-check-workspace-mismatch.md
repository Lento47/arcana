---
tags: [tooling, configuration, error]
date: 2026-09-18
source: ses_f49e2c5ceffeaw3SlqVpnlv4Vs
---
# goal check workspace mismatch

Tools may default to the wrong workspace, leading to incorrect results in automated checks.

**Why:** Automated tools like `goal_check` might use the wrong working directory if not configured properly, causing false negatives or positives that misrepresent the actual state.

**How to apply:** Specify the correct working directory when running tools, or verify their configuration. In this case, running checks directly in the ts-harness directory yielded accurate results, highlighting the need to check tool defaults.

Related: [[goal-check-workspace-default]] [[trusting-tool-output-without-verifying-workspace]]
