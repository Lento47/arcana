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

## Arcana Infra — Site + Deploy
- [[arcana-site-seo-spa]] — Preact SPA, SEO (JSON-LD, OG, Twitter), CSP, changelog, Cloudflare Pages
- [[r2-release-pipeline]] — Binary build → R2 → releases.otnelhq.com → launcher download + verify
- [[proxy-origin-check]] — PayPal endpoint Origin check, CF Function proxy, client never sees proxy URL

## Project: arcana
- [[branding-ts-voice-source]] — branding.ts is the single source for voice/theme/lexicon/glyphs
- [[session-slugs-core-util]] — session slugs generated in packages/core/src/util/slug.ts
- [[scramble-reruns-on-text-change]] — Scramble component re-animates on text prop change
- [[edit-tool-exact-match]] — Edit tool requires exact string match for old_string
- [[corrupt-glyphs-error-effect]] — CORRUPT_GLYPHS pool used for error "unencrypt" effect

## Patterns
- [[opentui-solidjs-reactivity]] — OpenTUI uses SolidJS (createMemo, createEffect, createSignal)
- [[effect-ts-patterns]] — Server uses Effect.ts for dependency injection + error handling
- [[caveman-compression]] — Tool/system prompts compressed ~40% by dropping articles/filler

## Mistakes
- [[bun-transpiler-transformSync-not-available]] — Bun.Transpiler.transformSync not in Bun 1.3.11; use `bun build`
