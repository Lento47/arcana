---
title: Git PII Redaction Layer
date: 2026-07-23
version: "1.0"
status: stable
type: architecture
tags:
  - security
  - privacy
  - pii
  - redaction
  - guard
  - git
aliases:
  - PII Redaction
  - Guard Pipeline
cssclasses:
  - wide-page
---

# Git PII Redaction Layer

## Overview

The Git PII Redaction Layer is a defense-in-depth system that strips personally identifiable information (PII) from all tool output before it reaches the LLM context, session history, audit logs, or UI. It was introduced in response to discovering that `git log` output contained the developer's personal email address (`lejzerv@gmail.com`) directly in agent context.

The layer is part of the broader **Guard Pipeline** in `packages/arcana/src/agent/guard.ts` and is applied transparently via `packages/arcana/src/agent/runner.ts`.

## Threat Model

### Threats Addressed

| Threat | Impact | Mitigation |
|--------|--------|------------|
| Personal email leaked to LLM provider | PII exposure to third-party API | `redactGitEmails()` strips emails in angle brackets |
| Developer name leaked to LLM | Identity exposure | `redactGitAuthorNames()` strips Author/Committer names |
| IP addresses in tool output | Network location exposure | `redactPII()` strips IPv4/IPv6 |
| Phone numbers in tool output | Contact info exposure | `redactPII()` strips US phone patterns |
| Physical addresses in tool output | Location exposure | `redactPII()` strips street addresses |
| API keys/secrets in output | Credential exposure | `redactSecrets()` strips known key patterns |
| Prompt injection via tool output | Agent manipulation | `detectInjection()` flags injection attempts |

### Trust Boundaries

```
User Input → Agent Runner → Tool Handler → [UNTRUSTED OUTPUT] → Guard Pipeline → [TRUSTED OUTPUT] → LLM Context
```

The guard pipeline operates at the **sole exit point** of tool execution (`executeAuthorizedTool`), ensuring no unredacted output escapes to the LLM context or session history.

### Assumptions

- Tool handlers (shell, read, git, web_fetch, etc.) may return arbitrary text containing PII
- LLM providers are treated as untrusted recipients — no PII should reach them
- Audit logs may be synced to enterprise systems — must be redacted before storage
- The `godlike` mode bypasses all redaction (user accepts full risk)

## Architecture

### Pipeline Order

The redaction pipeline in `executeAuthorizedTool` runs in this exact order:

```
1. redactSecrets()      — API keys, tokens, passwords
2. redactGitEmails()    — Email addresses in <angle brackets>
3. redactPII()          — IP addresses, phone numbers, street addresses
4. redactGitAuthorNames() — Personal names in git Author/Committer lines
5. detectInjection()    — Prompt injection attempts (advisory, prepends warning)
```

**Order rationale:**
- `redactSecrets` runs first to prevent secret patterns from interfering with later regex matching
- `redactGitEmails` runs before `redactGitAuthorNames` so the email is already stripped when author name matching operates on git blame lines
- `redactPII` runs independently on the full text
- `redactGitAuthorNames` runs last among the redactors to handle the cleanest possible text

### Code Location

```
packages/arcana/src/agent/
├── guard.ts          — All redaction functions, patterns, and detection logic
├── runner.ts         — Pipeline integration in executeAuthorizedTool()
└── tools.test.ts     — 19+ test cases covering redaction, false positives, and edge cases
```

## Redaction Functions

### `redactSecrets(text: string): string`

Strips API keys, tokens, and high-entropy secrets. Uses pattern matching with entropy filtering to avoid false positives on git SHAs and JWT segments.

**Patterns:**
- OpenAI keys: `sk-[a-zA-Z0-9]{20,}`
- GitHub tokens: `ghp_*`, `github_pat_*`
- Slack tokens: `xox[bp]-*`
- AWS keys: `AKIA*`
- Bearer tokens: `bearer [a-zA-Z0-9._-]{20,}`
- Password fields: `password/passwd/pwd [:|=] ...`
- Generic high-entropy strings: `[a-zA-Z0-9+/]{60,}={0,2}` (entropy > 3.5, non-hex only)

**Output:** `` `***REDACTED***` ``

### `redactGitEmails(text: string): string`

Strips personal email addresses from git output while preserving privacy-safe addresses.

**Targets:**
- `<user@personal-domain.com>` → `<REDACTED>`

**Preserves:**
- `@users.noreply.github.com` (already anonymized by GitHub)
- Bot emails: `bot@`, `noreply@`, `support@`, `admin@`, `info@`

**Output:** `<REDACTED>` (maintains angle bracket format)

### `redactPII(text: string): string`

Strips common PII patterns that are not git-specific.

**Targets:**
- IPv4 addresses: `\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b`
- IPv6 addresses: `\b(?:[0-9a-fA-F]{1,4}:){2,7}[0-9a-fA-F]{1,4}\b`
- US phone numbers (formatted only): `(\d{3}) \d{3}-\d{4}`, `555-555-5555`, `555.555.5555`
- Street addresses (with suffix): `123 Main Street`, `456 Oak Ave`, `789 Pine Blvd`

**False positive guards:**
- Phone regex requires explicit separators (dashes, dots, parens) — bare 10-digit numbers are NOT matched
- Street address regex requires a suffix (`Street`, `St`, `Ave`, `Boulevard`, `Rd`, `Dr`, `Ln`, `Ct`, `Pl`, `Way`, `Cir`)

**Outputs:** `<IP_REDACTED>`, `<PHONE_REDACTED>`, `<ADDRESS_REDACTED>`

### `redactGitAuthorNames(text: string): string`

Strips personal names from git Author/Committer metadata.

**Targets:**
- `Author: Real Name <email>` → `Author: <NAME_REDACTED> <email>`
- `Committer: Real Name <email>` → `Committer: <NAME_REDACTED> <email>`
- `abc1234 (Real Name 2026-07-20)` → `abc1234 (<NAME_REDACTED> 2026-07-20)`
- `abc1234 (Real Name <email> 2026-07-20)` → `abc1234 (<NAME_REDACTED> <email> 2026-07-20)`

**Preserves:**
- System accounts: `github`, `dependabot`, `bot`, `actions`, `noreply`

**Output:** `<NAME_REDACTED>`

## Pipeline Integration

The pipeline is applied in `AgentRunner.executeAuthorizedTool()`:

```typescript
resultStr = this.config.godlike ? resultStr : redactSecrets(resultStr)
resultStr = this.config.godlike ? resultStr : redactGitEmails(resultStr)
resultStr = this.config.godlike ? resultStr : redactPII(resultStr)
resultStr = this.config.godlike ? resultStr : redactGitAuthorNames(resultStr)
```

**Key properties:**
- Single execution path — all tools (shell, git, read, web_fetch, etc.) flow through the same pipeline
- Godlike mode bypass — users can opt out of all redaction
- Non-blocking — redaction failures do not prevent tool execution
- Applied before audit logging — audit logs are also redacted
- Applied before session history — session context is clean

## Git Execution Audit

An audit of all git command execution sites confirmed that personal email PII only enters the system through the tool pipeline:

| File | Commands | PII Risk |
|------|----------|----------|
| `agent/tools.ts` (`runGit`) | `status`, `diff`, `commit`, `rev-parse` | **Covered** — via tool pipeline |
| `agent/tools.ts` (`execSync`) | `git branch` in `diagnose()` | **Covered** — via tool pipeline |
| `cli/run/proof-runtime.ts` | `rev-parse HEAD` | None — commit hash only |
| `proof/create.ts` | `rev-parse HEAD`, `rev-parse --abbrev-ref HEAD` | None — hash/branch only |
| `core/src/git.ts` | `rev-parse`, `rev-list --max-parents=0` | None — path/count only |
| `engine/src/git/index.ts` | `rev-parse`, `git show <ref>:<file>` | None — file content only |
| `engine/src/snapshot/index.ts` | `git show`, `cat-file --batch` | None — file content diff only |

No `git log`, `git blame`, or `git show` (with commit metadata) commands exist in the source code. The only way personal email enters is through the **shell tool** where a user or model runs `git log` manually.

## Extension Points

### Adding New PII Patterns

To add a new redaction pattern:

1. **Define the regex** in `guard.ts`:
```typescript
const NEW_PATTERN = /your-regex-here/g
const NEW_REDACTED = "<NEW_REDACTED>"
```

2. **Create the function** (or extend `redactPII`):
```typescript
export function redactNewPII(text: string): string {
  return text.replace(NEW_PATTERN, NEW_REDACTED)
}
```

3. **Wire into the pipeline** in `runner.ts`:
```typescript
import { redactNewPII } from "./guard.js"
// ... in executeAuthorizedTool:
resultStr = this.config.godlike ? resultStr : redactNewPII(resultStr)
```

4. **Add tests** in `tools.test.ts`:
```typescript
describe("redactNewPII", () => {
  test("redacts target pattern", () => {
    expect(redactNewPII(input)).toBe(expected)
  })
  test("preserves non-PII text", () => {
    expect(redactNewPII(safeInput)).toBe(safeInput)
  })
})
```

### Adding System/Bot Preserves

To preserve a new system account or pattern:

1. Add the pattern to the appropriate `BOT_EMAIL` or `NOREPLY_DOMAIN` regex
2. Or add a new preserve check in the replacement callback:
```typescript
if (/^(new-system-account)/i.test(name)) return match
```

### Disabling Redaction

- **Per-session:** Set `godlike: true` in `AgentConfig`
- **Per-call:** The pipeline checks `this.config.godlike` before each redactor

## Testing

The test suite in `tools.test.ts` covers:

- **redactGitEmails:** Personal email, noreply preserve, bot preserve, multiple emails, non-git text
- **redactPII:** IPv4, IPv6, phone (formatted), street address, multiple PII, false positives (bare numbers, version strings)
- **redactGitAuthorNames:** Author line, Committer line, blame format, system accounts, blame with email
- **redactSecrets:** OpenAI keys, GitHub tokens, high-entropy strings, low-entropy preservation

## Related Documents

- [[security-posture-2026-07-20]] — Security hardening summary
- [[independent-security-audit-2026-07-14]] — Security audit findings
- [[qa-fixes-2026-07-10]] — QA fixes including layout overflow and TUI fixes
- [[arcana-updates-v0.3.5]] — Feature updates including PII redaction

## Changelog

| Date | Change |
|------|--------|
| 2026-07-22 | Initial implementation: `redactGitEmails()` for email redaction |
| 2026-07-23 | Extended: Added `redactPII()` (IP, phone, address) and `redactGitAuthorNames()` |
| 2026-07-23 | Hardened: Tightened phone/address regex to reduce false positives |
