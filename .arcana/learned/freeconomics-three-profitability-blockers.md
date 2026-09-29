---
tags: [freeconomics, status, debugging]
date: 2026-09-15
source: ses_f591be0c6ffeOwUoZMDl7R0Tf1
---
# freeconomics three profitability blockers

Kill switch engaged, promoted strategy was dead (all 'hold'), no strategy has passed full pipeline with actual trades

**Why:** These are the concrete reasons the bot isn't profitable yet — knowing them directs effort to the right problems.

**How to apply:** 1) Fix kill switch disengagement flow, 2) Deploy a strategy that actually generates buy/sell signals, 3) Ensure full evidence-gate → promotion → deployment pipeline works end-to-end with real signal flow.

Related: [[cci-threshold-too-high-for-market-range]] [[validate-indicator-range-before-deploy]] [[risk-max-open-positions-fix]] [[wrong-test-suite-in-goal-check]] [[goal-check-ran-wrong-test-suite]] [[cci-reversion-strategy-exit-mechanism]] [[atr-based-sl-with-rr-tp]] [[forgot-to-set-tp-with-sl]] [[risk-max-open-positions-flip-bug]] [[cci-reversion-trade-management]] [[forgot-tp-when-setting-sl]] [[mt5-comment-length-limit-29-chars]] [[risk-max-open-positions-off-by-one]] [[adx-trend-filter-for-mean-reversion]] [[cci-recovery-filter-catching-knife]] [[trend-consistency-multi-bar-confirmation]] [[multi-gate-entry-filter-architecture]] [[mt5-terminal-locking-on-restart]] [[adx-trend-strength-filter]] [[trend-consistency-filter]] [[cci-recovery-filter]] [[mt5-comment-length-limit]] [[max-open-positions-flip-bug]] [[cci-trend-following-mode]] [[session-guard-market-hours]] [[deployment-symbol-restriction]] [[verify-changes-thoroughly]] [[goal-check-workspace-default]] [[trusting-tool-output-without-verifying-workspace]]
