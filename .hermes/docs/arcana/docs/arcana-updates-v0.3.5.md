---
title: Arcana Updates — v0.3.0 through v0.3.5
date: 2026-07-24
version: 0.3.5
status: current
type: changelog
tags:
  - arcana
  - updates
  - changelog
  - v0.3.0
  - v0.3.4
  - v0.3.5
  - security
  - tui
  - engine
  - runproof
  - workspace-trust
  - privacy
aliases:
  - Arcana Changelog
  - Release Notes
cssclasses:
  - wide-page
---

# Arcana Updates — v0.3.0 through v0.3.5

> **Scope:** Comprehensive record of shipped features, security hardening, QA fixes, and architecture evolution from v0.3.0 (2026-07-01) through v0.3.5 (2026-07-20), plus post-release work on RunProof binding, git PII redaction, and TUI performance.

---

## v0.3.5 — 2026-07-20

### Added

#### Workspace Trust (`arcana trust`)
- **New command:** `arcana trust` trusts the current workspace for project plugins, tools, and local MCP.
- Security gate: untrusted project code cannot execute automatically.
- Fingerprint invalidates trust when executable surfaces change.
- Escape hatches: `ARCANA_DISABLE_WORKSPACE_TRUST` / `ARCANA_TRUST_WORKSPACE`.
- **Security impact:** Partially addresses ARC-SEC-I02 (untrusted project code execution).

#### Console Login Ceremony
- New device-flow resilience for `arcana console login`.
- Improved retry and error handling for device authorization flows.

#### Goals MVP
- Initial implementation of goals feature for tracking agent objectives.

### Security

#### Gateway Allowlists
- `assertGatewayAllowlist` refuses empty lists unless `ARCANA_GATEWAY_OPEN=1`.
- **Security impact:** Fixes ARC-SEC-I06 (gateway empty allowlist).

#### WhatsApp Signatures
- `appSecret` is now required (or `ARCANA_WHATSAPP_INSECURE=1`).
- Missing/invalid `x-hub-signature-256` rejected with timing-safe compare.
- **Security impact:** Fixes ARC-SEC-I07 (WhatsApp missing signatures).

#### Non-loopback Server Auth
- `arcana serve` refuses non-loopback bind without `ARCANA_SERVER_PASSWORD`.
- Loopback without password still allowed (with warning).
- **Security impact:** Fixes ARC-SEC-I08 (non-loopback server unauthenticated).

#### `env_write` Sandbox Escape
- Basename-only resolution; rejects absolute paths, `..`, null bytes.
- `resolveSandboxScriptPath` + tests.
- **Security impact:** Fixes ARC-SEC-I05 (env_write sandbox escape).

### Changed

#### Command-Spine + Theme Polish
- Various UI/UX improvements to the command-spine shell and theme system.
- See [[architecture/command-spine-ui]] for design details.

#### Public Docs
- Launched public documentation at https://arcana.otnelhq.com/docs.

---

## v0.3.4 — 2026-07-10

### Fixed

#### Session Lock TOCTOU Race — OS-Level Atomic Locking
- **File:** `packages/engine/src/session/session-lock.ts`
- Added `tryAtomicLock()` using `fs.openSync(path, O_WRONLY | O_CREAT | O_EXCL)` — atomic check-and-create in a single kernel operation.
- Cross-platform: works on Unix + Windows (Node 18+).
- Refactored `acquireLock()` to use atomic O_EXCL as primary path.
- Added `acquireLockFallback()` for PID-heuristic fallback on EACCES/EPERM.

#### Stale opencode → arcana Rebrand
- **Files:** `packages/core/src/installation/version.ts` + 8 engine source files.
- Added shared `USER_AGENT = \`arcana/${InstallationVersion}\`` constant.
- Replaced 17 literal `opencode/${InstallationVersion}` occurrences.
- Renamed LLM request headers: `x-opencode-project` → `x-arcana-project`, etc.

#### Raw SDK Error JSON → errorMessage()
- **File:** `packages/tui/src/component/dialog-provider.tsx`
- Replaced 3 `JSON.stringify(result.error)` calls with `errorMessage(result.error)`.

#### Streaming Timeout
- **File:** `packages/arcana/src/agent/runner.ts`
- Added `AbortSignal.timeout(LLM_STREAM_TIMEOUT_MS)` to `streamText()`.
- Per-chunk inactivity guard via `Promise.race` with timeout promise.

#### Compaction Over-budget Fallback
- **File:** `packages/engine/src/session/compaction.ts`
- Proportional content truncation when compaction exceeds budget.
- Preserves tool and non-text parts; floor at 50 chars per message.

#### Env Filter Hybrid Matching
- **File:** `packages/engine/src/tool/shell.ts`
- Substring match for high-confidence words: TOKEN, SECRET, PASSWORD, etc.
- Boundary match for ambiguous words: KEY, AUTH, SSH, etc.
- Prevents `MYAPITOKEN`, `TOKENID`, `AUTHORIZATION` bypasses.

#### 20+ Layout Overflow Fixes (M13–M20)
- Spine header overflow (`minWidth={0}` + `overflow="hidden"`).
- UserMessage overflow (`minWidth={0}`).
- Patch receipt path truncation (`maxWidth={36}`).
- Subagent footer overflow (`maxWidth={60}`).
- AssistantMessage overflow (`minWidth={0}`).
- Dialog wrapper constraints (conditionally mounted).
- Glow border layout shift (always render border, toggle color).
- Spine breakpoint hysteresis (±5px dead zone).

### Changed

#### OpenTUI Pin
- Pinned OpenTUI to version 0.3.4 (0.4.3 broke mouse on Windows).

#### QA Fixes
- 101 findings fixed across LOW, MEDIUM, HIGH, and CRITICAL severities.
- See [[qa-fixes-2026-07-10]] for complete change log.

---

## v0.3.0 — 2026-07-01

### Added

#### Command Spine Shell
- New shell abstraction with a "command-spine" UI.
- Row model: `STATUS · actor/tool · action · target · outcome · +time`.
- Inline outcome summaries, group by operation, file path deduplication.
- Severity tokens: `◆` ask/report, `◇` think, `▸` actions, `◎` done, `×` fail.
- See [[architecture/command-spine-ui]] for design details.

#### Plugin System
- Introduced a plugin system with 30+ lifecycle hooks.
- See [[plugin-extension-model]] for design details.

#### Cron Daemon
- Persistent scheduler for autonomous agent jobs.
- See [[cron]] for configuration and usage.

#### Web Dashboard
- Optional SolidJS web application for enterprise features.

---

## Post-Release: RunProof Architecture (2026-07)

### RunProof Shell-Command Evidence
- **Files:** `packages/arcana/src/agent/types.ts`, `runner.ts`, `proof-runtime.ts`
- Agent runner records shell tool outcomes into RunProof after execution.
- `ProofRuntime.recordShellCommand(...)` delegates to `ProofManager.recordShellCommand(...)`.
- Evaluates command through shell policy gate; replaces `risk: "unknown"` with real policy risk.
- TUI `/actions` timeline normalizes and renders `execution.shell_commands` with status and risk.

### Rollback Staging, Approval, and Execution
- **Files:** `packages/arcana/src/proof/types.ts`, `proof-manager.ts`, `render.ts`
- RunProof rollback carries `restore_status`, `staged_at`, `approval_required`, `approved_at`, `approved_by`.
- `ProofManager.stageRollbackRestore()` records `rollback.staged`, raises risk to at least `high`.
- `ProofManager.approveRollbackRestore()` requires staged restore, sets `restore_status = "approved"`.
- `ProofManager.recordRollbackRestoreExecution()` requires approved restore before execution.
- Execution transitions run lifecycle to `rolled_back`.
- TUI `/contract`, `/actions`, `/diffgate` show restore status, approval state, and copy restore command.

### Model Route Accountability
- **Files:** `packages/arcana/src/cli/run/proof-runtime.ts`, `cli/cmd/run.ts`
- `ProofRuntime.recordModelRoute()` persists: selection source, fallback provider/model, data boundary, estimated cost, latency.
- `arcana run` records whether route came from CLI args, config, or autodetect.
- `/sovereignty` reads active RunProof event and displays all accountability fields.

### Verification Evidence Persistence
- **Files:** `packages/arcana/src/cli/run/proof-runtime.ts`
- `ProofRuntime.recordCheck()` persists typecheck, lint, and build results to active RunProof path.
- `ProofRuntime.recordTestResult()` persists focused test evidence.
- Produces `verification.started`, `verification.passed`, or `verification.failed` ledger events.

---

## Post-Release: TUI Performance & Contrast (2026-07)

### TUI Reactivity Optimizations
- **Session route:** Combined repeated `messages()` scans into single-pass memos; precomputed `AssistantMessage` duration Map; rewrote `findNextVisibleMessage` to build a single `Set`.
- **DialogSelect:** Replaced remeda `pipe`/`groupBy`/`flatMap`/`filter` with native Map/loops; precomputed `flatIndexByOption` and `currentIndex`.
- **Command palette:** Memoized option list; `DialogSelect` no longer receives brand-new options array every render.

### TUI Contrast Fallbacks
- Dimmer overlay derives from theme background luminance instead of fixed black.
- Inactive option/action rows use opaque theme fallback when backgrounds are transparent.
- Fatal error UI uses theme tokens with mode-based emergency fallbacks.
- Spinner defaults derive from explicit color, theme primary/text, or neutral fallback.
- Which-key plugin reads resolved theme tokens directly.
- Logo peak highlight switches black/white by ink luminance.
- **File:** `packages/tui/src/context/theme.tsx` — exports `ThemeContext` for optional theme reads outside normal provider flow.

---

## Post-Release: Git PII Redaction (2026-07-24)

### `redactGitEmails()` Function
- **File:** `packages/arcana/src/agent/guard.ts`
- Strips personal email addresses from git tool output.
- Pattern-matches `<email@domain>` (canonical git format used by `git log`, `git blame`, `git show`).
- Preserves `@users.noreply.github.com` emails (already privacy-safe).
- Preserves system/bot emails (`noreply@`, `bot@`, `support@`, etc.).
- Applied alongside existing `redactSecrets()` in `executeAuthorizedTool()`.

### `redactPII()` Function
- **File:** `packages/arcana/src/agent/guard.ts`
- Strips common PII patterns: IP addresses (IPv4/IPv6), US phone numbers, and physical street addresses.
- Phone regex requires explicit formatting (dashes, dots, parens) to avoid false positives on version/build numbers.
- Street address regex requires a suffix (`Street`, `St`, `Ave`, `Boulevard`, `Rd`, `Dr`, `Ln`, `Ct`, `Pl`, `Way`, `Cir`) to avoid false positives on code metrics.
- Applied after `redactGitEmails()` in the tool output pipeline.

### `redactGitAuthorNames()` Function
- **File:** `packages/arcana/src/agent/guard.ts`
- Strips personal names from git Author/Committer metadata.
- Redacts name in `Author: Real Name <email>` → `Author: <NAME_REDACTED> <email>`.
- Redacts name in `Committer: Real Name <email>` → `Committer: <NAME_REDACTED> <email>`.
- Redacts name in git blame output: `abc1234 (Real Name 2026-07-20)` → `abc1234 (<NAME_REDACTED> 2026-07-20)`.
- Preserves system accounts (`github`, `dependabot`, `bot`, `actions`, `noreply`).
- Applied after `redactPII()` in the tool output pipeline.

### Output Redaction Pipeline
- **File:** `packages/arcana/src/agent/runner.ts`
- Every tool result passes through both `redactSecrets()` and `redactGitEmails()`.
- Redaction happens automatically before LLM context, audit log, or session history.

### Test Coverage
- **File:** `packages/arcana/src/agent/tools.test.ts`
- **redactGitEmails:** 8 tests covering: personal email in `git log`, email in `git blame`, email in `git show`, GitHub noreply preservation, bot email preservation, multiple personal emails on one line, non-git text, URLs.
- **redactPII:** 7 tests covering: IPv4, IPv6, phone (formatted), street address, multiple PII types, false positives (bare 10-digit numbers, version strings).
- **redactGitAuthorNames:** 6 tests covering: Author line, Committer line, blame format, blame with email, system accounts (GitHub, dependabot, bot), non-git text.

### Audit Results
- No `git log`, `git blame`, or `git show` (with commit metadata) commands exist in source code.
- All git calls are `rev-parse`, `status`, `diff`, `rev-list`, or `cat-file`/`show <ref>:<file>` (file content only).
- `redactGitEmails()` in `runner.ts` covers every path where PII could enter LLM context.

---

## Security Hardening Summary

| Finding | Status | Fix |
|---------|--------|-----|
| ARC-SEC-I01: Default host-authority shell | Partial | Default `bash` permission now `ask` |
| ARC-SEC-I02: Untrusted project code exec | Fixed (MVP) | Workspace trust gate (`arcana trust`) |
| ARC-SEC-I03: Git command injection | Fixed | `execFileSync` + argv arrays + `--` end-of-options |
| ARC-SEC-I04: Batch policy bypass | Partial | Nested batch sub-calls go through `executeAuthorizedTool` |
| ARC-SEC-I05: `env_write` sandbox escape | Fixed | Basename-only resolution; rejects `..`, null bytes |
| ARC-SEC-I06: Gateway empty allowlist | Fixed | `assertGatewayAllowlist` refuses empty lists |
| ARC-SEC-I07: WhatsApp missing signatures | Fixed | `appSecret` required; timing-safe compare |
| ARC-SEC-I08: Non-loopback server unauth | Fixed | Refuses non-loopback bind without password |

See [[security-posture-2026-07-20]] and [[independent-security-audit-2026-07-14]] for full details.

---

## Key Metrics

- **QA findings fixed (v0.3.4):** 101 across CRITICAL, HIGH, MEDIUM, LOW
- **Layout overflow fixes:** 20+ (M13–M20)
- **Branding references updated:** 17 `opencode` → `arcana` replacements
- **Plugin lifecycle hooks:** 30+
- **TUI test suite:** 206 pass, 1 skip, 0 fail (44 files)
- **Security findings resolved:** 6 of 8 critical findings fixed or partially addressed

---

## Related Documents

- [[qa-fixes-2026-07-10]] — Complete QA change log
- [[security-posture-2026-07-20]] — Security audit remediation status
- [[independent-security-audit-2026-07-14]] — Full security audit
- [[architecture/command-spine-ui]] — Command Spine design
- [[architecture/arcana-error-taxonomy]] — Error code taxonomy
- [[architecture/arcana-performance-optimization-foundation]] — Performance foundation
- [[session-compaction]] — Auto-compact and hysteresis
- [[prompt-architecture]] — System prompt assembly
