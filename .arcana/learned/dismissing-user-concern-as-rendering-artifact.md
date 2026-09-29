---
tags: [communication, trust-user]
date: 2026-09-07
source: ses_f86bde30cffeE2skel5oXwMriL
---
# dismissing user concern as rendering artifact

Initially dismissed user's line-wrapping report as a terminal display artifact

The assistant told the user "That's just your terminal/chat wrapping the text" and "it was one complete line" — dismissing the issue as a rendering artifact. The user was correct and the assistant had to research the actual codebase to find the real bug.

**Correction:** Trust the user's report and investigate before dismissing. The wrapping was a genuine rendering bug caused by the first-paint width collapse.

Related: [[comparing-specialized-vs-general-tools]] [[premature-fix-recommendation]]
