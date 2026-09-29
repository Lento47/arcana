---
tags: [arcana, turbo, ci, verification]
date: 2026-09-07
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# harness infra fallback authoritative commands

When harness runners hit infra limits (turbo 'cannot find binary path', 120s timeout), run AGENTS.md's authoritative commands directly with captured output

The harness's typecheck invokes `bun turbo typecheck` directly, which fails turbo's package-manager detection (`cannot find binary path` — flaky env quirk predating all changes), and its 120s test timeout can't fit the full multi-package suite. Fallback: directly invoke the authoritative commands per AGENTS.md and capture output as evidence — `bun test packages/tui` (1352 pass / 0 fail), `bun run typecheck` (16/16 packages), targeted engine test files.

**Why:** Infra flakiness in wrapper runners shouldn't block verification when authoritative commands exist.

**How to apply:** On harness runner infra failures, distinguish infra error from code failure, then run the project's documented authoritative commands directly and record their output as the verification result.
