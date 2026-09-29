---
tags: [freeconomics, cci, strategy-config, trading]
date: 2026-09-15
source: ses_f591be0c6ffeOwUoZMDl7R0Tf1
---
# cci threshold too high for market range

CCI revert strategy threshold (308) exceeded actual market CCI range (-232 to +224), producing zero trades ever

The `cci-revert-20-308` strategy on EURUSD had an entry threshold of ±308, but live CCI values only ranged from -232 to +224 over the monitored period (Aug 27 → Sep 15). This means the strategy was physically incapable of generating a trade signal.

**Why:** Threshold calibration was done on a different market regime or the value was set aspirationally rather than empirically. A strategy that never enters is functionally dead — it passes no risk but also earns nothing.

**How to apply:** When deploying any strategy, verify that historical indicator values actually reach the entry thresholds. Add a validation check: `max(|indicator_values|) >= entry_threshold` for at least N% of historical bars. Consider setting thresholds at percentiles (e.g., 95th percentile of historical readings) rather than arbitrary values.

Related: [[risk-max-open-positions-fix]] [[position-counter-needs-symbol-awareness]] [[goal-check-ran-wrong-test-suite]] [[no-initial-stop-loss]] [[cci-reversion-strategy-exit-mechanism]] [[atr-based-sl-with-rr-tp]] [[forgot-to-set-tp-with-sl]] [[risk-max-open-positions-flip-bug]] [[mt5-comment-length-limit]] [[cci-revert-trend-filter-blocking]] [[forgot-tp-on-demo-positions]] [[mt5-python-binding-comment-limit]] [[atr-based-sl-with-fixed-rr-tp]] [[forgot-to-set-take-profit]] [[guard-bypasses-create-trend-fighting-positions]] [[mt5-python-comment-length-limit]] [[cci-reversion-trade-management]] [[sl-then-tp-sequence-mistake]] [[forgot-tp-when-setting-sl]] [[missing-take-profit-initially]] [[set-sl-and-tp-in-same-pass]] [[guard-bypass-for-testing]] [[atr-based-sl-tp-setting]] [[bypassing-trend-guards-causes-trend-fighting-losses]] [[omitted-take-profit-on-demo-positions]] [[demo-test-guard-bypass-for-execution-verification]] [[always-set-both-sl-and-tp]] [[only-set-sl-forgot-tp]] [[mt5-comment-length-limit-29-chars]] [[risk-max-open-positions-off-by-one]] [[adx-trend-filter-for-mean-reversion]] [[cci-recovery-filter-catching-knife]] [[trend-consistency-multi-bar-confirmation]] [[multi-gate-entry-filter-architecture]] [[mt5-terminal-locking-on-restart]] [[adx-trend-strength-filter]] [[trend-consistency-filter]] [[cci-recovery-filter]] [[max-open-positions-flip-bug]] [[cci-trend-following-mode]] [[session-guard-market-hours]] [[deployment-symbol-restriction]]
