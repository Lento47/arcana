---
tags: [trading, cci, strategy, risk-management]
date: 2026-09-16
source: ses_f54ce6e26ffelnBq9Jb1PO1jm0
---
# cci revert trend filter blocking

CCI reversion strategy uses H4/H1 trend + EMA200 as entry guards to avoid fighting the trend

The CCI reversion strategy (cci-revert-20-308) triggers BUY on CCI(20) < -300 (oversold), but requires trend alignment:
- H4 trend UP (EMA20 > EMA50)
- H1 trend UP (EMA20 > EMA50)
- Price above EMA200

Without these guards, the strategy fights the trend — mean reversion bounces may happen but are riskier.

**Why:** Mean reversion from oversold levels works best when the broader trend supports the bounce. Opening positions against the trend increases drawdown risk.

**How to apply:** When testing or debugging, temporarily bypass guards to verify execution chain, but always revert afterward. The guard bypass pattern (`bypass_guards=True`) should only be used for integration testing, never in production.

Related: [[mt5-python-binding-comment-limit]] [[risk-max-open-positions-flip-bug]] [[atr-based-sl-with-fixed-rr-tp]] [[forgot-to-set-take-profit]] [[guard-bypasses-create-trend-fighting-positions]] [[mt5-python-comment-length-limit]] [[cci-reversion-trade-management]] [[sl-then-tp-sequence-mistake]] [[forgot-tp-when-setting-sl]] [[risk-py-max-open-positions-flip]] [[atr-based-stop-loss-and-rr-take-profit]] [[missing-take-profit-initially]] [[set-sl-and-tp-in-same-pass]] [[guard-bypass-for-testing]] [[forgot-tp-on-demo-positions]] [[atr-based-sl-tp-setting]] [[risk-management-position-flip-bug]] [[bypassing-trend-guards-causes-trend-fighting-losses]] [[omitted-take-profit-on-demo-positions]] [[demo-test-guard-bypass-for-execution-verification]] [[always-set-both-sl-and-tp]] [[only-set-sl-forgot-tp]] [[risk-max-open-positions-off-by-one]] [[adx-trend-filter-for-mean-reversion]] [[cci-recovery-filter-catching-knife]] [[max-open-positions-flip-bug]] [[adx-trend-strength-filter]] [[trend-consistency-filter]] [[cci-recovery-filter]] [[multi-factor-entry-gate]] [[bypassing-entry-filters]] [[cci-trend-following-mode]]
