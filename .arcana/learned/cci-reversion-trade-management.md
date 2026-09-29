---
tags: [trading, cci-strategy, risk-management, freeconomics]
date: 2026-09-16
source: ses_f54ce6e26ffelnBq9Jb1PO1jm0
---
# cci reversion trade management

CCI reversion trades need both SL and TP set immediately; exit on mean cross is not sufficient alone

**Why:** The CCI strategy exits on mean cross (no fixed TP), but in practice mean reversion against the trend can take a long time or never fully materialize. Positions opened with only SL and no TP were left partially unmanaged.

**How to apply:** When opening CCI reversion positions, set SL at 2× ATR and TP at 2:1 risk-reward ratio immediately. Don't rely solely on the CCI mean-cross exit signal, especially when fighting the prevailing trend (H4/H1 both down). The mean-cross exit is a secondary exit, not a replacement for TP.

Related: [[risk-py-max-open-positions-flip]] [[atr-based-stop-loss-and-rr-take-profit]] [[missing-take-profit-initially]] [[set-sl-and-tp-in-same-pass]] [[guard-bypass-for-testing]] [[forgot-tp-on-demo-positions]] [[atr-based-sl-tp-setting]] [[risk-management-position-flip-bug]] [[bypassing-trend-guards-causes-trend-fighting-losses]] [[omitted-take-profit-on-demo-positions]] [[demo-test-guard-bypass-for-execution-verification]] [[always-set-both-sl-and-tp]] [[only-set-sl-forgot-tp]] [[mt5-comment-length-limit-29-chars]] [[risk-max-open-positions-off-by-one]] [[adx-trend-filter-for-mean-reversion]] [[cci-recovery-filter-catching-knife]] [[trend-consistency-multi-bar-confirmation]] [[multi-gate-entry-filter-architecture]] [[mt5-terminal-locking-on-restart]] [[max-open-positions-flip-bug]] [[adx-trend-strength-filter]] [[trend-consistency-filter]] [[cci-recovery-filter]] [[multi-factor-entry-gate]] [[bypassing-entry-filters]] [[mt5-comment-length-limit]] [[cci-trend-following-mode]] [[session-guard-market-hours]] [[deployment-symbol-restriction]]
