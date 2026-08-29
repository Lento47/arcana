# LEARNED — Accumulated Knowledge Index

> Map of Content (MOC) for the arcana knowledge base.
> Each entry links to a wiki file in `.arcana/learned/{slug}.md`.
> Auto-updated by the self-learning loop.

## Arcana Core — Proof-Driven TUI
- [[ghost-preview-system]] — Ghost plan preview, risk labels [SAFE..DANGER], confidence [CONF:LOW..HIGH], per-line approve/reject, plan state machine, all 15 failure modes
- [[prompt-injection-guard]] — `<file-content>` wrapper marks all file reads as untrusted DATA, not instructions
- [[negative-memory-system]] — Anti-patterns stored as wiki files, checked before proposals, `/anti` command
- [[confidence-decay-pipeline]] — Model trust tracking, baseline-adjusted [CONF:LOW]*, >3 mismatches → auto-decay
- [[run-budgets]] — Per-session safety limits (destructive ops, files, LOC, external calls, duration)
- [[session-lock]] — `.arcana/.session-lock` PID file prevents concurrent session conflicts
- [[transactional-engineering-skill]] — Lazy skill: `/prove`, `/brief`, `/recap`, `/anti`, `/contract`, risk labels, evidence log
- [[session-compaction]] — Auto-compact, hysteresis, multi-pass strategy (P0/P4, inter/intra/manual)

## Arcana Architecture — Engine & Routing
- [[arcana-native-runtime]] — ARCANA_ENGINE=1, kernel contract, native authorities, explicit compat shim
- [[command-spine-ui]] — Default TUI shell (timeline + composer + status), layout breakpoints, themes
- [[free-quality-routing]] — Free-tier model pool, progressive budgets, OpenRouter catalog classification
- [[arcana-error-taxonomy]] — `ARC_*` error codes, dual-layer (user/internal), mapping rules

## Arcana LLM — Schema-First Provider Adapters
- [[llm-request-stream]] — `LLM.request()`, `LLMClient.generate/stream`, Effect-based, provider-neutral
- [[llm-caching]] — Auto cache placement (tools/system/latest-user), granular policy, provider behavior table
- [[llm-providers]] — OpenAI, Anthropic, Google, Bedrock, Azure, Cloudflare, GitHub Copilot, OpenRouter, xAI, OpenAI-compatible
- [[llm-generate-object]] — `generateObject` via forced tool call, works on every protocol

## Arcana Infra — Site + Deploy
- [[arcana-site-seo-spa]] — Preact SPA, SEO (JSON-LD, OG, Twitter), CSP, changelog, Cloudflare Pages
- [[r2-release-pipeline]] — Binary build → R2 → releases.otnelhq.com → launcher download + verify
- [[proxy-origin-check]] — PayPal endpoint Origin check, CF Function proxy, client never sees proxy URL

## Project: arcana
- [[arcana-runtime-architecture]] — Arcana is a governed autonomy runtime on TypeScript/Bun with Effect and SolidJS
- [[remote-search-blocked]] — Web search and remote content fetching are blocked by DENY_REMOTE_CONTENT_INJECTION policy
- [[arcana-ai-npm-package]] — arcana-ai is a self-improving AI agent CLI on npm v0.3.68
- [[deny-remote-content-injection-policy]] — DENY_REMOTE_CONTENT_INJECTION policy blocks websearch, webfetch, and bash in this environment
- [[skill-installation-permission-blocks]] — Skill installation can be blocked by system permissions, requiring alternative methods.
- [[find-skills-hyphenated-name]] — The skill for discovering other skills is named 'find-skills' with a hyphen.
- [[find-skills-pre-installed]] — The find-skills skill is pre-installed and available for use.
- [[l-drive-is-local-volume]] — L: drive on Windows is local FileSystem, not network (git fast)
- [[vcs-diff-hang-root-cause]] — TUI /diff hang caused by missing process timeout in Git.run
- [[agts-md-tui-strings]] — AGENTS.md: TUI strings from `branding.ts`; killing dev daemon auto-respawns
- [[git-run-no-timeout]] — `Git.run` (packages/engine/src/git/index.ts) has no process timeout/kill
- [[vcs-diff-ignores-directory]] — Server `vcs.diff` ignores `directory` TUI sends, uses ctx.directory from InstanceState
- [[effect-beta-version]] — `effect` resolved version is 4.0.0-beta.74 (beta), verify API names against it
- [[powershell-environment]] — Shell is PowerShell not bash; `for`/`>` fail, use `rg` + PS loops
- [[arcana-shell-is-powershell]] — Arcana dev shell is PowerShell, not bash; for loops and > redirects fail with ParserError
- [[arcana-governance-deny-unlabeled-gap]] — DENY_UNLABELED_CONSEQUENTIAL is in the type union but never pushed/enforced in pdp.ts evaluate()
- [[arcana-agents-md-branding]] — All TUI display strings must come from packages/tui/src/branding.ts
- [[arcana-agents-md-export-namespace]] — AGENTS.md forbids export namespace Foo {}; requires flat self-reexport export * as Foo from "./foo"
- [[arcana-powershell-not-bash]] — Shell is PowerShell, not bash; for loops and > redirects fail with ParserError
- [[arcana-bash-tool-gated]] — bash tool is gated and only runs when an active goal_set is present
- [[arcana-tui-diff-hang-root-cause]] — TUI /diff hangs: git mode over L:\ network drive + server Git.run has no timeout/kill
- [[arcana-stray-db-files]] — Stray .db files present in Arcana source tree
- [[arcana-validate-ancestors-fail-open]] — Arcana PDP validateAncestors/intentBindings enforced only if provider populates
- [[arcana-git-no-timeout]] — Arcana server-side Git.run lacks process timeout/kill
- [[bash-tool-gated-goal-set]] — Arcana bash tool requires active goal_set before running
- [[powershell-constraints-arcana]] — Arcana shell is PowerShell: for loops and > redirects fail; use rg and PS loops
- [[arcana-pdp-deny-unlabeled-gap]] — Arcana PDP declares DENY_UNLABELED_CONSEQUENTIAL but never enforces it in evaluate()
- [[arcana-tui-diff-hang-network-drive]] — Arcana TUI /diff hangs on network drives due to git mode and missing server-side git timeout
- [[arcana-tui-recovery-esc-daemon]] — Arcana TUI diff hang recovers via Esc; killing dev daemon is safe (TUI wrapper auto-respawns per AGENTS.md).
- [[arcana-repo-on-network-drive]] — Arcana project working dir is L:\PROJECTS\arcana (mapped network drive), making git operations prone to blocking.
- [[arcana-server-git-no-timeout]] — Arcana server-side Vcs.diff shells out to git with no per-call timeout or process kill; client 15s abort doesn't terminate the server git process.
- [[arcana-diff-viewer-git-mode-default]] — Arcana TUI /diff opens DiffViewer in git mode by default (hardcoded), fetching via createResource which can block on network drives.
- [[arcana-diff-freeze-suspect-opentui-renderable]] — Unconfirmed prime suspect for /diff freeze: OpenTUI <diff> renderable implementation (investigation incomplete)
- [[arcana-diffviewer-no-reactive-loop]] — Arcana DiffViewer memos/effects have no infinite reactive loop; sameDiffRequest equals prevents refetch churn
- [[arcana-diff-fetch-timeout-bounded]] — Arcana DiffViewer diff fetch is wrapped in 15s timeout + AbortController, so hung GET can't permanently freeze UI
- [[arcana-diff-command-flow]] — /diff in Arcana TUI routes via diff.open → navigate('diff',{mode:'git'}) → DiffViewer
- [[arcana-authorize-execute-sync-issues]] — authorizeAndExecuteSync skips claimUse, fragile extractApprovalId, stray .db files
- [[arcana-ancestors-intentbindings-failopen]] — validateAncestors/intentBindings only enforced if provider populates
- [[arcana-deny-unlabeled-consequential-unenforced]] — DENY_UNLABELED_CONSEQUENTIAL declared but no push site in pdp.ts
- [[arcana-agents-md-conventions]] — AGENTS.md: no export namespace, TUI strings from branding.ts
- [[bash-tool-gated-on-goal]] — bash tool requires active goal_set to run
- [[powershell-shell-constraints]] — Shell is PowerShell; bash loops/redirects fail, use rg + PS loops
- [[env-shell-is-powershell]] — Agent shell is PowerShell, not bash; UNIX syntax breaks
- [[arcana-tooling-stack]] — Arcana uses oxlint + Turborepo (bun turbo); no per-pkg typecheck script
- [[arcana-monorepo-layout]] — Arcana is a TS/Effect monorepo (engine, core, tui, llm); tests live in sibling test/ dirs, not src/
- [[arcana-audit-baseline]] — Audit baseline: 1766/4/7 tests, authority scan 148 sources OK, proof suite 19/19, secrets clean, one SHA-1 helper
- [[arcana-evalcondition-bypass]] — OPEN FINDING: workflow/engine.ts evalCondition runs model-authored JS via new Function, bypassing PDP/PEP
- [[arcana-slash-command-sources]] — Arcana slash commands are defined across app-commands.tsx, session-commands.tsx, prompt/index.tsx, voice.tsx, diff-viewer.tsx
- [[arcana-security-model]] — Arcana governance: model proposes, engine decides, proof records; risk-scaled intent binding per Master Design §8–15, §29
- [[arcana-shell-execution-goal-gate]] — Shell execution in Arcana requires an active session goal; refusal message: 'No active goal for this session'
- [[arcana-governance-model-location]] — Arcana security model is documented in Master Design §8–15 and §29; core invariant is ¬Authorized(q) ⇒ ¬Executed(q)
- [[arcana-workspace-overview]] — Workspace is L:\PROJECTS\arcana, a governed autonomy runtime with engine/tui/core/cli/llm packages, Bun tooling, and strict working rules
- [[arcana-slash-commands-source-files]] — Arcana TUI slash commands are registered across app-commands.tsx, session-commands.tsx, prompt/index.tsx, voice.tsx, diff-viewer.tsx
- [[arcana-project-overview]] — Workspace L:\PROJECTS\arcana is a governed autonomy runtime with packages engine, tui, core, arcana CLI, llm
- [[branding-ts-voice-source]] — branding.ts is the single source for voice/theme/lexicon/glyphs (packages/tui/src/branding.ts)
- [[session-slugs-core-util]] — session slugs generated in packages/core/src/util/slug.ts
- [[scramble-reruns-on-text-change]] — Scramble component re-animates on text prop change
- [[edit-tool-exact-match]] — Edit tool requires exact string match for old_string
- [[corrupt-glyphs-error-effect]] — CORRUPT_GLYPHS pool used for error "unencrypt" effect

## Patterns
- [[fallback-skill-installation-methods]] — When skill installation is blocked, use local install or manual fetch as fallbacks.
- [[list-skills-by-install-count]] — When searching for skills, present results sorted by install count to highlight popular options.
- [[verify-skill-status-first]] — Always verify the installation status of a skill before taking action.
- [[effect-timeout-propagates-to-child-kill]] — Use Effect.timeoutOrElse at higher level to kill spawned child via scope finalizer
- [[createresource-memo-equals]] — `createResource` uses memo `equals` (e.g., sameDiffRequest) to prevent refetch — sound design
- [[verify-environmental-assumptions]] — Verify environmental assumptions (e.g., network vs local drive) with commands before concluding
- [[trace-client-and-server-for-hang]] — For TUI/daemon hangs, inspect both client timeout and server-side process spawn/kill
- [[verify-claims-repo-wide-before-asserting]] — Use ripgrep to confirm a code gap exists repo-wide before asserting it in reviews
- [[arcana-verify-trash-untracked]] — Verify trash/old code is untracked via git check-ignore before recommending deletion
- [[effect-timeoutfail-kills-child-process]] — Wrap ChildProcess.run in Effect.timeoutFail to force-kill hanging subprocesses on fiber interrupt
- [[verify-untracked-before-deletion]] — Use git check-ignore to verify trash is untracked before recommending deletion
- [[powershell-rg-search]] — Use ripgrep (rg) with PowerShell loops for repo searches
- [[verify-enforcement-gap-with-rg]] — Verify declared but unenforced code by grepping for push sites with rg
- [[debug-tui-hang-trace-path]] — Debug TUI hang by tracing command → component resource → server VCS impl → check for missing timeout/kill.
- [[tui-command-trace-method]] — For TUI command bugs, trace: command → route → component → API client → engine → SDK → renderable
- [[repo-wide-grep-to-confirm-gaps]] — Confirm negative claims repo-wide with grep before asserting
- [[rg-output-token-collapse-artifact]] — ripgrep output may collapse tokens (e.g., to 'n'); empty result signals absence
- [[verify-trash-untracked-before-deletion]] — Use git check-ignore to verify trash untracked before recommending deletion
- [[pattern-count-tests-repo-wide]] — Count Arcana tests repo-wide via rg, not src-only glob
- [[pattern-set-goal-before-shell]] — Set active goal before invoking bash/shell tool
- [[pattern-rg-files-inventory]] — Use rg --files for fast, ignore-aware file inventory in monorepos
- [[governed-codebase-audit-method]] — Audit order: sensitive-file inventory → built-in harnesses → dangerous-pattern sweeps → triage each hit
- [[demo-gated-actions-via-minimal-goal]] — When demonstrating governed features, pre-bind a minimal goal so the gated action succeeds on first try
- [[enumerate-features-from-source]] — When asked about available commands/capabilities, enumerate them from the source files that define them, citing file locations and aliases
- [[enumerate-capabilities-from-source-not-memory]] — Answer 'what can you do / list commands' questions by grepping registration source files and reporting aliases
- [[keymash-noise-input-handling]] — Handle keyboard-mash/garbage input with a brief acknowledgment, then return to idle.
- [[opentui-solidjs-reactivity]] — OpenTUI uses SolidJS (createMemo, createEffect, createSignal)
- [[effect-ts-patterns]] — Server uses Effect.ts for dependency injection + error handling
- [[caveman-compression]] — Tool/system prompts compressed ~40% by dropping articles/filler

## Mistakes
- [[avoid-duplicate-messages]] — Sending duplicate messages in chat can confuse users and disrupt conversation flow.
- [[user-misconception-about-installed-skills]] — Users may incorrectly assume skills are not installed when they are.
- [[network-drive-theory-wrong]] — Incorrectly hypothesized `L:\` network drive caused slow git; actually local volume, git fast
- [[inferred-root-cause-without-reproduction]] — Presented TUI hang root cause as inferred from evidence, not reproduced
- [[asserted-effect-timeout-kills-child-unverified]] — Claimed Effect.timeoutFail kills child git process without verifying effect@4.0.0-beta.74 source
- [[assistant-gave-recovery-unasked]] — Assistant provided recovery steps instead of just root cause when user wanted only root cause
- [[scattered-investigation-hit-step-limit]] — Assistant used too many tiny sequential inspection calls, hit step limit before root cause
- [[mistake-bash-syntax-powershell]] — Used bash for/redirect syntax in PowerShell shell; commands broke
- [[mistake-bash-before-goal]] — Bash tool blocked because no active goal was set
- [[mistake-walked-node-modules]] — Inventory command recursively walked node_modules; timed out
- [[mistake-src-only-test-scan]] — Undercounted Arcana tests via src-only glob; missed sibling test/ dirs
- [[shell-exec-needs-active-goal]] — Shell commands are refused with 'No active goal' unless a session goal is bound first
- [[shell-run-before-binding-goal]] — First shell attempt ran without an active goal and was refused
- [[bun-transpiler-transformSync-not-available]] — Bun.Transpiler.transformSync not in Bun 1.3.11; use `bun build`
- [[engine-promise-all-batch]] — Batch tool used unbounded Promise.all fan-out; fixed with bounded mapPool + recursive auth
