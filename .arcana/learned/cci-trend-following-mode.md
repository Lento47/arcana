---
tags: [trading-strategy, cci, freeconomics]
date: 2026-09-16
source: ses_f54ce6e26ffelnBq9Jb1PO1jm0
---
# cci trend following mode

CCI >100 or <-100 with ADX>25 and multi-timeframe confirmation can signal trend-following entries

Added `--mode trend` to `live_cci_loop.py` with entry logic:
- **BUY**: CCI > 100 + uptrend confirmed (H4, H1, EMA200 all bullish, ADX > 25, EMA20/50 consistency)
- **SELL**: Mirror conditions inverted
- **Exit**: When CCI reverts to neutral zone

**Why:** Pure CCI reversion trades fight strong trends. Separating reversion vs trend modes avoids the conflict. Extreme CCI values like -200+ with ADX=87 indicate genuine trend, not overbought/oversold.

**How to apply:** Check ADX and multi-timeframe alignment before deciding if CCI extreme is a reversion opportunity or trend confirmation.
