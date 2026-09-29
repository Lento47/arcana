---
tags: [debugging, investigation, efficiency]
date: 2026-08-28
source: ses_fb9883576ffeh1NvC5If4atLNL
---
# scattered investigation hit step limit

Assistant used too many tiny sequential inspection calls, hit step limit before root cause

During the Arcana `/diff` investigation, the assistant issued dozens of narrow 'Let me check X' read calls one per step (palette, SDK signature, git history, test files, prompt guards, etc.) rather than batching reads or narrowing scope aggressively. This exhausted the step budget before confirming the OpenTUI renderable suspect.

**Why:** Over-broad, linear exploration is inefficient in step-limited or plan-mode sessions.

**How to apply:** In step-constrained or read-only sessions, prioritize the highest-yield files, read larger regions per call, and avoid speculative checks unrelated to the stated symptom. State a narrowing hypothesis early and descend the trace stack decisively.

Related: [[arcana-tui-recovery-esc-daemon]] [[debug-tui-hang-trace-path]] [[arcana-tui-diff-hang-network-drive]] [[trace-client-and-server-for-hang]] [[inferred-root-cause-without-reproduction]] [[verify-environmental-assumptions]] [[network-drive-theory-wrong]] [[vcs-diff-hang-root-cause]] [[truncation-type-distinction]] [[initial-wrong-paths]] [[freeconomics-three-profitability-blockers]] [[wrong-test-suite-in-goal-check]] [[mt5-terminal-locking-on-restart]] [[parallel-audit-technique]] [[parallel-subagent-code-audit]] [[verify-changes-thoroughly]] [[goal-check-workspace-default]] [[trusting-tool-output-without-verifying-workspace]]
