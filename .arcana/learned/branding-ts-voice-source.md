---
tags: [arcana, tui, branding, voice]
date: 2026-06-18
source: manual
---
# branding.ts — voice source

`packages/tui/src/branding.ts` is the central source for all arcane voice/theme.

**Exports:** Lexicon (verb map), BOOT_PHRASES, PLACEHOLDER, PROMPT_FRAME, COPY, IDLE_PHRASES, CORRUPT_GLYPHS, Glyph (sigils), APP_NAME, TAGLINE.

**Why:** All display strings read from one file — cohesive, tunable, single place.

**How to apply:** When adding new arcane strings, extend branding.ts exports. Never hardcode voice strings in components. Import from branding.ts.

Related: [[scramble-reruns-on-text-change]], [[corrupt-glyphs-error-effect]] [[keymash-noise-input-handling]] [[arcana-project-overview]] [[arcana-slash-commands-source-files]] [[arcana-workspace-overview]] [[arcana-governance-model-location]] [[enumerate-features-from-source]] [[arcana-shell-execution-goal-gate]] [[arcana-security-model]] [[arcana-slash-command-sources]] [[demo-gated-actions-via-minimal-goal]] [[shell-run-before-binding-goal]] [[arcana-evalcondition-bypass]] [[arcana-audit-baseline]] [[governed-codebase-audit-method]] [[shell-exec-needs-active-goal]] [[arcana-monorepo-layout]] [[arcana-tooling-stack]] [[pattern-count-tests-repo-wide]] [[mistake-src-only-test-scan]] [[bash-tool-gated-on-goal]] [[arcana-agents-md-conventions]] [[arcana-deny-unlabeled-consequential-unenforced]] [[arcana-ancestors-intentbindings-failopen]] [[arcana-authorize-execute-sync-issues]]
