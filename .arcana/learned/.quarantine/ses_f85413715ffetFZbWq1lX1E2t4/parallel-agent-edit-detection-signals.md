---
tags: [concurrency, git, workflow, arcan]
date: 2026-09-08
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# parallel agent edit detection signals

Signals of a concurrent agent editing your files: content differs between reads, foreign commits appear, rival process running, .codex-*/.claude dirs

In one arcan session: the docs page changed from accordion layout to sidebar layout between two reads; git log showed two new commits I didn't make; `tasklist`/ps showed a `codex.js resume` process (pid 8232); `.claude/` and `.codex-*` dirs existed in the repo. The rival agent's `git add -A` + commit operations silently reverted my uncommitted edits to both `globals.css` and `page.tsx`.

**Why:** Without recognizing the race, you misattribute reverts to tool bugs or your own errors, and repeatedly lose work.

**How to apply:** On any unexpected file-state change: (1) check git log/status for commits you didn't make; (2) check running processes for other agents; (3) look for `.codex-*`/`.claude` dirs. Then re-apply edits via deterministic scripts, verify immediately, and commit your work as soon as it's correct so a rival `git add -A` incorporates rather than destroys it.
