---
tags: [freeconomics, architecture, strategy-filters]
date: 2026-09-16
source: ses_f54ce6e26ffelnBq9Jb1PO1jm0
---
# multi gate entry filter architecture

Layer entry filters in ordered gates: structure → signal → trend → strength → confirmation

The entry gate architecture layers filters in a specific order: (1) Market structure (ATR ratio), (2) CCI extreme signal, (3) Multi-timeframe trend agreement (H4, H1), (4) ADX strength, (5) Trend consistency, (6) CCI recovery. Each gate must pass before the next is checked.

**Why:** Ordered gates fail fast and are easy to reason about. You can debug exactly which gate blocked an entry. The ordering also reflects logical priority—no point checking trend confirmation if there's no signal.

**How to apply:** Structure strategy filters as an ordered pipeline where each check returns a bool. Log which gate failed for diagnostics. Start with the broadest filter (market structure) and narrow down to the most specific (recovery confirmation).

Related: [[adx-trend-strength-filter]] [[trend-consistency-filter]] [[cci-recovery-filter]] [[mt5-comment-length-limit]] [[max-open-positions-flip-bug]] [[cci-trend-following-mode]] [[session-guard-market-hours]] [[deployment-symbol-restriction]] [[ts-harness-domain-verification-catch-22]] [[ts-harness-bootstrapping-deadlock]]
