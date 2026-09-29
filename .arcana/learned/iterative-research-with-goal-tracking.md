---
tags: [research, methodology]
date: 2026-09-07
source: ses_f86bde30cffeE2skel5oXwMriL
---
# iterative research with goal tracking

Researching complex rendering bugs requires setting goals, checking git history, diffing files, and tracing data flow

The assistant used a systematic approach: set a bash goal, check git history, diff rendering-path files, trace data flow through `spine-mapper`, and check `viewportWidth`/`proseWidth` computation. When one path was ruled out, it moved to the next.

**Why:** Complex UI rendering bugs span multiple layers; a single grep rarely suffices.

**How to apply:** For rendering bugs: (1) set a goal, (2) check git history for recent changes, (3) diff files on the rendering path, (4) trace the data contract through each layer.

Related: [[audit-from-source-not-readme]] [[audit-surface-level-initial-take]]
