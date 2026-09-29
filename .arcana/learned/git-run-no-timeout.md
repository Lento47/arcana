---
tags: [bug, engine, git, hang]
date: 2026-08-28
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# git run no timeout

`Git.run` (packages/engine/src/git/index.ts) has no process timeout/kill

`Git.run` in `packages/engine/src/git/index.ts` (around lines 128-150) spawns git processes via `appProcess.run` with no timeout or kill logic. If a daemon-side git call blocks, the HTTP handler hangs until the client's 15s race rejects.

**Why:** Lack of process-level timeout means indefinite hangs on git block, and the client timeout alone doesn't cancel the server work.

**How to apply:** When investigating TUI `/diff` hangs, treat `Git.run` missing timeout as root-cause candidate; add process timeout/kill for robustness.

Related: [[vcs-diff-hang-root-cause]] [[normalize-chat-prose-limited-kinds]] [[text-delta-no-word-boundary-awareness]] [[mt5-comment-length-limit]] [[mt5-python-binding-comment-limit]] [[risk-max-open-positions-flip-bug]] [[mt5-comment-max-29-chars]] [[domain-verification-catch-22]]
