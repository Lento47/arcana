---
tags: [arcan, concurrency, git, tooling]
date: 2026-09-08
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# trusting edit tool success under race

Edit tool reported "applied successfully" (even against a corrupted oldString) but a parallel agent's git add/commit silently reverted the edits

While editing arcan docs CSS/TSX, edits reported success yet re-reading showed them gone: the parallel Codex agent committed with `git add -A`-style operations that wiped my uncommitted changes. One edit even reported success with a visibly corrupted oldString that couldn't have matched — the file ended up in a mixed state (header edit present, title edit absent).

**Why:** Edit-tool success messages are not proof of persistence when another writer operates on the same file; and uncommitted work is one `git add -A && git commit` away from deletion by a rival agent.

**How to apply:** Under a file race: re-read after every edit (grep for a unique marker), treat STALE flags as real warnings, batch edits via a verified script, and commit working changes immediately — check `git log` for rival commits before assuming your change survived.
