# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.3.5] - 2026-07-20

### Added
- **Workspace Trust (`arcana trust`)**: New command to trust the current workspace for project plugins, tools, and local MCP. This is a security feature to prevent untrusted project code from executing automatically.
- **Console Login Ceremony**: New device-flow resilience for `arcana console login`.
- **Goals MVP**: Initial implementation of goals feature.

### Security
- **Gateway Allowlists**: Implemented `assertGatewayAllowlist` to refuse empty lists unless `ARCANA_GATEWAY_OPEN=1`.
- **WhatsApp Signatures**: `appSecret` is now required (or `ARCANA_WHATSAPP_INSECURE=1`); missing/invalid `x-hub-signature-256` is rejected with timing-safe compare.
- **Non-loopback Server Auth**: `arcana serve` refuses non-loopback bind without `ARCANA_SERVER_PASSWORD`.
- **`env_write` Sandbox Escape**: Basename-only resolution; rejects absolute paths, `..`, null bytes.

### Changed
- **Command-Spine + Theme Polish**: Various UI/UX improvements to the command-spine shell and theme system.
- **Public Docs**: Launched public documentation at https://arcana.otnelhq.com/docs.

## [0.3.4] - 2026-07-10

### Fixed
- **Session Lock TOCTOU Race**: Implemented OS-level atomic locking using `fs.openSync(path, O_WRONLY | O_CREAT | O_EXCL)` to prevent race conditions in session management.
- **Stale opencode User-Agent + Headers**: Centralized rebrand from `opencode` to `arcana` across 8 engine source files, replacing 17 literal occurrences.
- **Raw SDK Error JSON → errorMessage()**: Replaced raw JSON stringification with a user-friendly error message formatter in the provider dialog.
- **Tips View Branding**: Updated 3 stale branding references from `opencode` to `arcana` in the tips view.
- **Error Component Branding**: Replaced `opentui: fatal:` with `APP_NAME: fatal:` for consistent branding.
- **Session Delete Failure**: Added "Force delete session" and "Dismiss" options to the delete failed dialog with improved keyboard navigation.
- **Streaming Timeout**: Added `AbortSignal.timeout(LLM_STREAM_TIMEOUT_MS)` to `streamText()` and a per-chunk inactivity guard to prevent hanging requests.
- **Compaction Over-budget Fallback**: Added proportional content truncation when compaction exceeds budget, preserving tool and non-text parts.
- **Env Filter Hybrid Matching**: Improved secret detection to prevent false negatives for environment variables like `MYAPITOKEN` using substring and boundary matching.
- **Spine UX Improvements**: Row model (`STATUS · actor/tool · action · target · outcome · +time`), inline outcome summaries, group by operation, unified timestamps, file path deduplication, severity tokens, fixed verbs, and ShimmerText component.
- **Mouse/Console/Renderer Fixes**: Enabled mouse interaction in the engine (`useMouse: true`), added console overlay for error capture, and fixed various layout and rendering issues.
- **M13-Spine header overflow**: Added `minWidth={0}` and `overflow="hidden"` to SegmentList.
- **M14-UserMessage overflow**: Added `minWidth={0}` to outer box and flex row.
- **M15-Patch receipt path truncation**: Changed `width={36}` to `maxWidth={36}` with clipping.
- **M16-Subagent footer overflow**: Removed `wrapMode="none"`, added `maxWidth={60}`.
- **M17-AssistantMessage overflow**: Added `minWidth={0}` to AssistantMessage wrapper.
- **M18-Dialog wrapper constraints**: Added `width="100%"`, `height="100%"`, `left={0}`, `top={0}` to Provider wrapper (conditionally mounted).
- **M19-Glow border layout shift**: Always render `border={["left"]}`, toggle `borderColor` between glow color and `"transparent"`.
- **M20-Spine breakpoint hysteresis**: Added ±5px dead zone parameter to `getSpineLayout()` and updated callers.

### Changed
- **OpenTUI Pin**: Pinned OpenTUI to version 0.3.4 due to a mouse regression in 0.4.3 on Windows.
- **QA Fixes**: Comprehensive QA sweep fixing 101 findings across LOW, MEDIUM, HIGH, and CRITICAL severities.

## [0.3.0] - 2026-07-01

### Added
- **Command Spine Shell**: New shell abstraction with a "command-spine" UI.
- **OpenTUI Pin**: Pinned to OpenTUI for terminal rendering.
- **Plugin System**: Introduced a plugin system with 30+ lifecycle hooks.
- **Cron Daemon**: Added a persistent scheduler for autonomous agent jobs.
- **Web Dashboard**: Optional SolidJS web application for enterprise features.

## [Unreleased]

### Added
- **Git PII Redaction** (`packages/arcana/src/agent/guard.ts`): Complete guard pipeline with `redactGitEmails()` (strips personal emails from git output), `redactPII()` (IP addresses, phone numbers, street addresses), and `redactGitAuthorNames()` (strips personal names from git Author/Committer lines). Tightened regex patterns to reduce false positives. 21+ tests covering redaction, false positives, and edge cases. Applied automatically in the tool execution pipeline alongside existing `redactSecrets()`.
- **Gateway documentation** (`docs/gateway.md`): Full setup guide for Telegram, Discord, Slack, and WhatsApp adapters with configuration, security, and platform setup instructions.
- **Cron documentation** (`docs/cron.md`): Scheduled agent jobs documentation covering job management, cron syntax, daemon mode, and configuration.
- **Skills documentation** (`docs/skills.md`): Skill system documentation covering browsing, activation, categories, custom skill creation, and SKILL.md format.
- **Configuration reference** (`docs/configuration.md`): Complete config.json reference with all options, environment variables, defaults, and data directory paths.
- **System architecture documentation** (`docs/architecture/system-architecture.md`): Comprehensive architecture document with 12 expanded ASCII diagrams covering layered package architecture, workspace dependency graph, agent session data flow, LLM provider routing, tool execution pipeline, multi-surface architecture, gateway integration, data persistence, security trust boundaries, kernel runtime law chain, pipeline types, ML signal engine, plugin system, and external integrations.
- **Quickstart guide** (`docs/quickstart.md`): Step-by-step getting started tutorial with 7 steps (install, API key, health check, first session, core features, workspace trust, optional enhancements), plus troubleshooting and common workflows.
- **Comprehensive guide** (`docs/arcana-comprehensive-guide.md`): Complete Arcana guide covering architecture, packages, commands, configuration, skills, memory, security, TUI, development, installation, providers, gateway, ML, enterprise, and extensibility.
- **Arcana updates v0.3.5** (`docs/arcana-updates-v0.3.5.md`): Comprehensive updates document covering v0.3.0–v0.3.5, RunProof architecture, TUI performance, git PII redaction, and security hardening.
- **Git PII redaction architecture** (`docs/architecture/git-pii-redaction.md`): Architecture document for the PII redaction layer covering threat model, pipeline design, guard functions, extension points, and testing.
- **Providers comparison** (`docs/providers-comparison.md`): LLM provider comparison covering 33+ providers with pricing tiers, speed rankings, quality assessments, feature matrix, cost optimization guide, and recommended use cases.
<<<<<<< Updated upstream
- **Model recommendations** (`docs/model-recommendations.md`): Task-specific model recommendations for coding, writing, analysis, creative, and general use with benchmarks, cost estimates, Arcana-specific guidance, benchmark/cost disclaimers, and `@arcana/ml` signal engine section (env: `ARCANA_ML_RUNTIME`).
- **Team onboarding** (`docs/onboarding.md`): Step-by-step team onboarding checklist covering install, provider config, workspace trust, shared skills, gateway setup, and a reusable onboarding template.
- **Provider setup guides** (`docs/providers/`): Individual setup guides for the top 5 providers — OpenAI, Anthropic, Google Gemini, xAI Grok, and Amazon Bedrock — with env vars, model lists, pricing, custom base URLs, provider options, and troubleshooting.
- **Database schema** (`docs/architecture/database-schema.md`): Complete SQLite schema documentation with Drizzle ORM tables, FTS5 indexes, trigger SQL examples, PRAGMA timing, and entity relationship diagrams.
=======
- **Team onboarding** (`docs/onboarding.md`): Step-by-step team onboarding checklist covering install, provider config, workspace trust, shared skills, gateway setup, and a reusable onboarding template.
>>>>>>> Stashed changes

### Changed
- **Docs index update** (`docs/README.md`): Updated with links to all new documentation files.
- **README simplification** (`README.md`): Replaced 21-row package table with 6-row layer-based format linking to architecture docs. Replaced Deep Dive section with compact feature table linking to docs. Added doc links to Skills and Configuration sections.

---

For more details, see the full commit history and the detailed QA fixes log in `docs/qa-fixes-2026-07-10.md`.
Security posture progress is tracked in `docs/security-posture-2026-07-20.md`.
