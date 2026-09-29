---
tags: [tooling, debugging, mistake]
date: 2026-09-21
source: ses_f49e2c5ceffeaw3SlqVpnlv4Vs
---
# goal check workspace default

goal_check tool may default to workspace root instead of current workdir, causing wrong project detection

When running `goal_check` in a subdirectory of a monorepo or adjacent project, the tool may pick up the parent workspace's turbo config instead of the target project's actual typecheck/build/test results.

**Why:** Led to false initial results (arcana's turbo output vs ts-harness actual results). Wasted verification time.

**How to apply:** Always verify goal_check results match the expected project. If the tool reports unexpected config, check whether it resolved to the wrong workspace root and run the checks manually from the correct directory.
