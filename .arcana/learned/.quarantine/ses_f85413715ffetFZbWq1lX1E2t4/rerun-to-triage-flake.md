---
tags: [testing, triage, flaky-tests]
date: 2026-09-07
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# rerun to triage flake

One unexpected test failure after a change: re-run the suite once before debugging — a clean second run indicates flake, not regression

After the crash fix, one caret-timing test in `spine-prose` failed (a file untouched by the change). Second run: 0 failures, 1351 pass — flake, not regression.

**Why:** Timing-sensitive tests fail stochastically; debugging a flake as a regression wastes a session.

**How to apply:** On a single unexpected failure, re-run the suite (or the file) once. If it passes, tag it flaky and move on; if it reproduces, treat as a regression.
