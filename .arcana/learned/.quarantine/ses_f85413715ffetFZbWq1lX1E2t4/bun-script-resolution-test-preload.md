---
tags: [bun, arcana, testing]
date: 2026-09-08
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# bun script resolution test preload

Bun resolves from the script's directory — probe scripts must live in packages/tui/test/ as .test.tsx for the preload (plugin + node_modules) to apply

Bun resolves module resolution and preloads from the script's own directory. An empirical probe script placed elsewhere failed to pick up the test preload (which registers the solid/OpenTUI plugin and resolves node_modules); moving it into `packages/tui/test/` with a `.test.tsx` name fixed resolution.

**Why:** OpenTUI/solid JSX render probes depend on the preload plugin; without it the script can't compile renderables at all.

**How to apply:** Write TUI render probes as `packages/tui/test/*.test.tsx` files so the existing preload applies; don't run them from arbitrary directories.
