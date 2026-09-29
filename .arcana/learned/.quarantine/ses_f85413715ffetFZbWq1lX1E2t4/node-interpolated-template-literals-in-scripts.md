---
tags: [nodejs, scripting, tooling]
date: 2026-09-08
source: ses_f85413715ffetFZbWq1lX1E2t4
---
# node interpolated template literals in scripts

Replacement strings containing ${...} got interpolated by Node when the script was built — escape as \${ in template literals

A Node replacement script containing the literal TSX text `className={...${...}...}` had its `${...}` expressions evaluated by Node instead of treated as literal text, corrupting the search/replace payload. Fixed by escaping as `\${` inside the template literal.

**Why:** Any literal `${` inside a JS template literal is an interpolation hole — the script runs without error but embeds wrong strings, so replacements silently fail or corrupt output.

**How to apply:** When scripting edits over source code containing template literals, escape `${` as `\${`, or build strings via concatenation / `String.raw` instead of template literals; verify the written file compiles (e.g. `tsc --noEmit`) afterward.
