---
tags: [freeconomics, validation, strategy-deployment, trading]
date: 2026-09-15
source: ses_f591be0c6ffeOwUoZMDl7R0Tf1
---
# validate indicator range before deploy

Before deploying a strategy, verify historical indicator values actually reach the configured entry thresholds

The CCI revert strategy with threshold 308 was deployed but never triggered because actual CCI values peaked at ~224. This is a class of deployment bug where a strategy is "live" but functionally inert.

**Why:** Strategies can pass backtests if the test period included the right conditions, but live markets may not cooperate. Deploying without checking creates false confidence that the strategy is "running."

**How to apply:** Add a pre-deployment sanity check:
1. Compute the indicator over the last N days of live data
2. Verify `max(|indicator|) >= threshold` for at least X% of bars
3. If not, either lower the threshold or flag the strategy as unvalidated
4. Add this to the evidence gate pipeline as a required check before promotion

Related: [[risk-max-open-positions-fix]] [[position-counter-needs-symbol-awareness]] [[goal-check-ran-wrong-test-suite]] [[no-initial-stop-loss]] [[cci-reversion-strategy-exit-mechanism]] [[atr-based-sl-with-rr-tp]] [[forgot-to-set-tp-with-sl]] [[risk-max-open-positions-flip-bug]] [[mt5-comment-length-limit]] [[cci-revert-trend-filter-blocking]] [[forgot-tp-on-demo-positions]] [[mt5-python-binding-comment-limit]] [[atr-based-sl-with-fixed-rr-tp]] [[forgot-to-set-take-profit]] [[guard-bypasses-create-trend-fighting-positions]] [[mt5-python-comment-length-limit]] [[cci-reversion-trade-management]] [[sl-then-tp-sequence-mistake]] [[forgot-tp-when-setting-sl]] [[missing-take-profit-initially]] [[set-sl-and-tp-in-same-pass]] [[guard-bypass-for-testing]] [[atr-based-sl-tp-setting]] [[bypassing-trend-guards-causes-trend-fighting-losses]] [[omitted-take-profit-on-demo-positions]] [[demo-test-guard-bypass-for-execution-verification]] [[always-set-both-sl-and-tp]] [[only-set-sl-forgot-tp]] [[mt5-comment-length-limit-29-chars]] [[risk-max-open-positions-off-by-one]] [[adx-trend-filter-for-mean-reversion]] [[cci-recovery-filter-catching-knife]] [[trend-consistency-multi-bar-confirmation]] [[multi-gate-entry-filter-architecture]] [[mt5-terminal-locking-on-restart]] [[adx-trend-strength-filter]] [[trend-consistency-filter]] [[cci-recovery-filter]] [[max-open-positions-flip-bug]] [[cci-trend-following-mode]] [[session-guard-market-hours]] [[deployment-symbol-restriction]]
