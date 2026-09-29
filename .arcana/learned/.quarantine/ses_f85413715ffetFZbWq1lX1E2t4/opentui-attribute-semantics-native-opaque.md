---
tags: [opentui, rust, testing, arcana]
date: 2026-09-08
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# opentui attribute semantics native opaque

TextBufferRenderable default-attribute semantics (set vs OR with chunk syntax attributes) live in compiled Rust and are not verifiable from bundled JS

`TextBufferRenderable` attribute composition semantics live behind `textBufferSetDefaultAttributes` in compiled Rust — the bundled JS cannot reveal whether default attributes REPLACE or OR with chunk-level attributes. This matters because while streaming, code blocks get `_initialStyledText` (a `StyledText` whose chunks carry their own attributes, e.g. bold headers); if set-replaces, dimming a code block would kill its bold styling.

**Why:** Composition with chunk-level BOLD/ITALIC is still unproven: in a bare test environment tree-sitter never runs (no `treeSitterClient`), so the first frame is plain and a composition probe (span bold + renderable DIM, checking for attr `3` vs `2`) had not yet completed.

**How to apply:** Don't trust inferred semantics for native boundaries — run the OR-vs-replace probe (bold span + renderable DIM, inspect per-cell attribute buffer for 3 vs 2) before finalizing the ink-settle design for code blocks.
