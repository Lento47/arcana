---
tags: [trading, risk-management, cci-reversion, lesson-learned]
date: 2026-09-16
source: ses_f54ce6e26ffelnBq9Jb1PO1jm0
---
# bypassing trend guards causes trend fighting losses

Opening CCI reversion positions with trend guards bypassed led to fighting the H4/H1 downtrend

During a demo test, five guard filters (session, tail, economics, H4 trend, H1 trend) were temporarily bypassed to force a BUY signal through the authority chain. The CCI was deeply oversold at -410, but both H4 and H1 trends were DOWN and price was below EMA200. The positions opened at ~1.14651 and immediately began losing as price dropped to 1.14590 (-6 pips).

**Why:** The CCI reversion strategy works best when the mean reversion thesis aligns with the broader trend. Opening a BUY into a confirmed downtrend means the bounce is likely to be weak and the position is more vulnerable to continuation lower. The trend guards exist precisely to prevent this scenario.

**How to apply:** Never bypass trend guards for production trades — they are the primary risk management layer. When testing the execution chain, use the smallest possible position size and close immediately after confirming the fill. Treat guard bypasses as destructive test operations, not shortcuts to generate signals.

Related: [[demo-test-guard-bypass-for-execution-verification]] [[always-set-both-sl-and-tp]] [[only-set-sl-forgot-tp]] [[risk-max-open-positions-off-by-one]] [[max-open-positions-flip-bug]] [[adx-trend-strength-filter]] [[trend-consistency-filter]] [[cci-recovery-filter]] [[multi-factor-entry-gate]] [[bypassing-entry-filters]]
