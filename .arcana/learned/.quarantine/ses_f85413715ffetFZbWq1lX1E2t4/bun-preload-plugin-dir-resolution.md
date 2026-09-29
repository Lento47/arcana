---
tags: [bun, spine-tui, testing, tooling]
date: 2026-09-08
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# bun preload plugin dir resolution

Probe script outside `packages/tui/test/` didn't load the solid/jsx preload plugin — Bun resolves preload from the script's directory

An isolated probe written outside the test directory failed to pick up the preload plugin: Bun resolves preloads relative to the *script's* directory, and the plugin plus matching node_modules live under `packages/tui/test/`.

**Why:** Without the plugin, `.tsx` probes fail to compile/run and burn a debugging cycle before the real question gets answered.

**How to apply:** Place probe scripts inside `packages/tui/test/` and name them `.test.tsx` so the existing preload picks them up.
