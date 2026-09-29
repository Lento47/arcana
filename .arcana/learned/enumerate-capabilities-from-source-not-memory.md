---
tags: [technique, accuracy]
date: 2026-08-26
source: ses_fc403dce9ffePWSWDDmaLtNFDN
---
# enumerate capabilities from source not memory

Answer 'what can you do / list commands' questions by grepping registration source files and reporting aliases

When asked to list available commands/features, locate the files where they are registered/enumerated and derive the list from source, including aliases in parens.

**Why:** Prevents hallucinated or incomplete feature lists; aliases surface shortcuts users don't know exist.

**How to apply:** Grep for command-registration patterns (strings starting with `/`, switch statements on command names), then group results logically (session, agent/model, etc.) before answering.

Related: [[enumerate-features-from-source]] [[verify-enforcement-gap-with-rg]] [[atr-based-stop-loss-and-rr-take-profit]] [[avoid-surface-level-code-assessment]]
