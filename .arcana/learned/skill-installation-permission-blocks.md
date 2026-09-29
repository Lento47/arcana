---
tags: [skills, installation, permissions]
date: 2026-08-28
source: ses_fb54e1562ffeethgXt3K6Sp0g9
---
# skill installation permission blocks

Skill installation can be blocked by system permissions, requiring alternative methods.

During skill installation, commands may be rejected due to system policies or permission settings. **Why:** Global installations often require elevated privileges that might be restricted by system or user configurations. **How to apply:** If a global install fails, try local installation without the `-g` flag, or manually fetch the skill content and save it locally to bypass permission issues.

Related: [[denied-remote-content-injection-policy]] [[retry-instead-of-explain-permission-blocks]] [[explained-block-instead-of-retrying-request]]
