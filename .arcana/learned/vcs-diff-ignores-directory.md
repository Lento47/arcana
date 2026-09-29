---
tags: [bug, diff-viewer, server]
date: 2026-08-28
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# vcs diff ignores directory

Server `vcs.diff` ignores `directory` TUI sends, uses ctx.directory from InstanceState

The server `vcs.diff` handler reads `mode`/`context` from the query but uses `ctx.directory` from `InstanceState`, ignoring the `directory` parameter sent by the TUI. This is a correctness bug.

**Why:** The TUI may request a diff for a specific directory but the server computes it for the instance's default directory, producing wrong results.

**How to apply:** When fixing the diff feature, ensure the server honors the `directory` argument from the client request.

Related: [[normalize-chat-prose-limited-kinds]] [[mt5-comment-length-limit]] [[mt5-python-binding-comment-limit]] [[risk-max-open-positions-flip-bug]] [[mt5-comment-max-29-chars]] [[domain-verification-catch-22]]
