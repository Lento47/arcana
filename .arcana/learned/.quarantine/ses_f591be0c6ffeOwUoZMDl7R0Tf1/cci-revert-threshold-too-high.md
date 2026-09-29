---
tags: [freeconomics, trading, strategy, debugging]
date: 2026-09-16
source: ses_f591be0c6ffeOwUoZMDl7R0Tf1
---
# cci revert threshold too high

CCI revert strategy with threshold 308 never triggers because real CCI values max out ~224

The `cci-revert-20-308` strategy was promoted to live but produced zero trades because the entry threshold of ±308 was never reached. Actual CCI values for EURUSD ranged from -232 to +224 over the monitored period.

**Why:** Threshold was set without validating against real CCI value distribution. Strategy appeared to be "working" (promoted, live) but was functionally dead.

**How to apply:** Always backtest entry thresholds against actual indicator distributions before promoting a strategy. A strategy generating only "hold" signals is not the same as a validated strategy.
