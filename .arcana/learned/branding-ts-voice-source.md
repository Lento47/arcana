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

Related: [[scramble-reruns-on-text-change]], [[corrupt-glyphs-error-effect]] [[keymash-noise-input-handling]] [[arcana-project-overview]] [[arcana-slash-commands-source-files]] [[arcana-workspace-overview]] [[arcana-governance-model-location]] [[enumerate-features-from-source]] [[arcana-shell-execution-goal-gate]] [[arcana-security-model]] [[arcana-slash-command-sources]] [[demo-gated-actions-via-minimal-goal]] [[shell-run-before-binding-goal]] [[arcana-evalcondition-bypass]] [[arcana-audit-baseline]] [[governed-codebase-audit-method]] [[shell-exec-needs-active-goal]] [[arcana-monorepo-layout]] [[arcana-tooling-stack]] [[pattern-count-tests-repo-wide]] [[mistake-src-only-test-scan]] [[bash-tool-gated-on-goal]] [[arcana-agents-md-conventions]] [[arcana-deny-unlabeled-consequential-unenforced]] [[arcana-ancestors-intentbindings-failopen]] [[arcana-authorize-execute-sync-issues]] [[arcana-diff-command-flow]] [[arcana-diff-fetch-timeout-bounded]] [[arcana-diffviewer-no-reactive-loop]] [[arcana-diff-freeze-suspect-opentui-renderable]] [[tui-command-trace-method]] [[arcana-diff-viewer-git-mode-default]] [[arcana-server-git-no-timeout]] [[arcana-repo-on-network-drive]] [[arcana-tui-recovery-esc-daemon]] [[debug-tui-hang-trace-path]] [[arcana-tui-diff-hang-network-drive]] [[arcana-pdp-deny-unlabeled-gap]] [[powershell-constraints-arcana]] [[bash-tool-gated-goal-set]] [[arcana-git-no-timeout]] [[arcana-validate-ancestors-fail-open]] [[arcana-stray-db-files]] [[verify-enforcement-gap-with-rg]] [[verify-untracked-before-deletion]] [[arcana-tui-diff-hang-root-cause]] [[arcana-bash-tool-gated]] [[arcana-powershell-not-bash]] [[arcana-agents-md-export-namespace]] [[arcana-agents-md-branding]] [[arcana-governance-deny-unlabeled-gap]] [[effect-timeoutfail-kills-child-process]] [[arcana-verify-trash-untracked]] [[arcana-shell-is-powershell]] [[verify-claims-repo-wide-before-asserting]] [[trace-client-and-server-for-hang]] [[asserted-effect-timeout-kills-child-unverified]] [[inferred-root-cause-without-reproduction]] [[agts-md-tui-strings]] [[createresource-memo-equals]] [[arcana-runtime-architecture]] [[arcana-ai-npm-package]]
