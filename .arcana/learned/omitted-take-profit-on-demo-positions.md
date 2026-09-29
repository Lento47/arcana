---
tags: [trading, mistake, position-management, follow-through]
date: 2026-09-16
source: ses_f54ce6e26ffelnBq9Jb1PO1jm0
---
# omitted take profit on demo positions

Set SL but forgot TP on demo positions, user had to correct twice

When managing the demo positions, only a stop loss (1.14368) was applied initially. The user asked about TP and was told it was handled, but it wasn't. The user had to point out the omission a second time before TP was actually set at 1.15220 (2:1 RR).

**Why:** The CCI strategy normally exits on mean cross (no fixed TP), so the mindset was that TP isn't needed. But the user explicitly asked for it, and the response was incomplete/superficial — the assistant acknowledged the request without verifying it was done.

**How to apply:** When a user explicitly asks for a management action (SL/TP), always verify both are set before confirming completion. Don't assume one implies the other. If the strategy normally doesn't use TP, state that but still apply the user's request.

Related: [[demo-test-guard-bypass-for-execution-verification]] [[always-set-both-sl-and-tp]] [[only-set-sl-forgot-tp]] [[adx-trend-strength-filter]] [[trend-consistency-filter]] [[cci-recovery-filter]] [[surface-level-assessment-error]] [[goal-check-workspace-default]]
