# Arcana Threat Model

**Date:** July 14, 2026
**Based on:** Security Audit 2026-07-14, independently reconciled
**Status:** Living document; peer-reviewed 2026-07-14

---

## 1. System Overview

Arcana is a locally-running AI coding agent that:
- Executes shell commands on the user's machine
- Reads and writes files in the user's workspace
- Sends context to external LLM providers
- Stores memory across sessions
- Loads and executes plugins
- Records audit logs

**Trust model:** Arcana runs with the user's full privileges. It is not sandboxed by default.

### Peer-review update

The first version of this threat model focused on natural-language detectors and catastrophic shell patterns. Independent source review showed that the more important boundary is authorization: default agents allow a host-authority shell, executable project configuration loads before workspace trust, and several remote or wrapper paths do not apply policy uniformly.

Use [Arcana Independent Security Audit](./independent-security-audit-2026-07-14.md) as the evidence and release-gate source. This threat model now assumes:

- Prompt injection will sometimes succeed and must not grant authority.
- A repository, fetched page, MCP result, stored memory, plugin, provider catalog, webhook, LAN client, and shared-chat participant may all be hostile.
- Direct, batch, delegated, cron, gateway, MCP, and server calls must pass one recursive capability policy.
- Remote metadata and downloaded code are separate trust classes.
- ARCANA_HOME may be a removable-device boundary, so any hard-coded home write is an escape from the user's chosen storage scope.

---

## 2. Actors

| Actor | Motivation | Capability | Trust Level |
|---|---|---|---|
| **User** | Productivity, code quality | Full access to machine | Trusted |
| **Malicious prompt injector** | Data exfiltration, code injection, system compromise | Can craft user messages or tool output | Untrusted |
| **Compromised LLM provider** | Data theft, behavior manipulation | Can inject instructions in responses | Untrusted |
| **Malicious plugin** | Code execution, data theft | Can execute code in Arcana context | Untrusted until explicitly approved and constrained |
| **Malicious MCP server** | Code execution, data theft | Can provide tool definitions and responses | Untrusted until explicitly approved and constrained |
| **Supply chain attacker** | Backdoor injection | Can modify dependencies or prompt files | Untrusted |
| **Local attacker** | Privilege escalation, data theft | Can modify files on the machine | Semi-trusted |
| **Malicious repository author** | Code execution, credential theft | Controls project config, tools, plugins, and content | Untrusted |
| **Unauthorized gateway user** | Host access, data theft, resource abuse | Can message a reachable bot or forge a webhook | Untrusted |
| **LAN or remote server client** | PTY access, file access, denial of service | Can reach a non-loopback Arcana server | Untrusted |
| **Catalog or package attacker** | Credential redirection, code execution | Influences provider metadata, plugins, LSPs, or updates | Untrusted |

---

## 3. Attack Surfaces

### 3.1 User Input (Highest Risk)

**Surface:** Chat messages, file attachments, image inputs

**Threats:**
| Threat | STRIDE | Risk | Current Mitigation |
|---|---|---|---|
| Prompt injection via chat | Tampering, Elevation of Privilege | Critical | `detectInjection()` provides a limited signal, not authorization |
| Prompt injection via file content | Tampering | High | Content is passed to the model; no origin-aware authorization boundary |
| Prompt injection via image OCR | Tampering | Medium | None |
| Unicode homoglyph injection | Tampering | High | None — no Unicode normalization |
| Multi-language injection | Tampering | Medium | None — English-only patterns |
| Base64-encoded instructions | Tampering | Medium | None |
| XML/HTML tag injection | Tampering | High | Prompt guidance warns about provenance; runtime does not cryptographically or structurally authenticate tag text |

**Gap:** The seven patterns are a telemetry signal, not an authorization control. Indirect, encoded, multilingual, multimodal, persistent, and best-of-N attacks make complete pattern coverage impossible. The design must assume some injections succeed and keep untrusted content from acquiring shell, filesystem, network, persistence, or publish authority.

### 3.2 Tool Output (High Risk)

**Surface:** Shell command output, file read results, web fetch responses, LLM responses

**Threats:**
| Threat | STRIDE | Risk | Current Mitigation |
|---|---|---|---|
| Injection via shell output | Tampering | High | Prompt guidance only; no runtime provenance enforcement |
| Injection via web content | Tampering | High | Web content is passed to the model; no origin-aware authorization boundary |
| Injection via LLM response (multi-turn) | Tampering | Medium | None — model output is trusted |
| Fake system reminders in tool output | Tampering | High | Warning in prompt, no runtime validation |

**Gap:** Tag text has no authenticated provenance. Prompt wording can reduce accidental obedience, but only recursive authorization and a runtime-controlled instruction channel can prevent a fake reminder from acquiring capabilities.

### 3.3 Shell Execution (Critical Risk)

**Surface:** `shell` tool runs arbitrary commands on the host OS

**Threats:**
| Threat | STRIDE | Risk | Current Mitigation |
|---|---|---|---|
| `rm -rf /` | Elevation of Privilege | Critical | Token-level guard in `guard.ts` |
| `sudo` commands | Elevation of Privilege | Critical | Blocked in `BLOCKED_COMMANDS` |
| `curl \| sh` | Code Execution | Critical | Blocked in `BLOCKED_COMMANDS` |
| Fork bombs | Denial of Service | High | Blocked in `BLOCKED_COMMANDS` |
| `mkfs`, `dd` | Data Destruction | Critical | Blocked in `BLOCKED_COMMANDS` |
| `git push --force main` | Data Destruction | High | Blocked in `BLOCKED_COMMANDS` |
| General interpreters (`python`, `node`, `perl`, and others) | Code Execution | Critical | Allowed by the general-purpose host shell |
| Background data exfiltration | Information Disclosure | High | Audit logging (post-hoc) |

**Gap:** A command-name blocklist cannot make a general-purpose host shell safe; interpreters, build tools, package managers, and ordinary binaries can reproduce blocked effects. The security boundary must be capability default-deny plus OS isolation, exact authorization, constrained network/filesystem access, and cancellation.

### 3.4 File System (High Risk)

**Surface:** `read`, `write`, `edit`, `glob`, `grep` tools

**Threats:**
| Threat | STRIDE | Risk | Current Mitigation |
|---|---|---|---|
| Read `.env` files | Information Disclosure | High | Path-risk detection exists, but does not uniformly deny access |
| Read SSH keys | Information Disclosure | Critical | Partial path detection; host-authority tools remain reachable |
| Modify `package.json` | Tampering | High | Some risk classification and approval paths; not uniform across tools |
| Modify `.gitconfig` | Tampering | Medium | Some risk classification; no single canonical mutation boundary |
| Modify installed prompt files | Tampering | Critical | OS permissions and the release chain only; no separate runtime trust anchor |
| Poison learned or persistent memory | Tampering | High | Some quarantine/confidence mechanisms; no uniform consent and provenance gate |
| Symlink or traversal escape | Elevation of Privilege | Critical | Inconsistent canonicalization; direct traversal is present in `env_write` |

**Gap:** File operations do not pass through one canonical, root-scoped authorization service. Signed releases and fail-closed update verification should protect installed prompts and code; runtime checksums stored beside mutable files are not a separate trust anchor.

### 3.5 Network Egress (High Risk)

**Surface:** `webfetch`, `websearch` tools, LLM provider calls

**Threats:**
| Threat | STRIDE | Risk | Current Mitigation |
|---|---|---|---|
| Data exfiltration via URL | Information Disclosure | High | Best-effort audit logging after the decision |
| Secret exfiltration via URL params | Information Disclosure | Critical | Partial redaction; no uniform destination-aware DLP boundary |
| SSRF via webfetch | Server-Side Request Forgery | High | Common private targets and one DNS result are blocked; connection pinning and redirect revalidation are incomplete |
| DNS exfiltration | Information Disclosure | Medium | None |
| Downgrade attack on LLM provider | Tampering | Medium | None — provider selection is model-based |

**Gap:** There is no uniform destination-aware egress policy. MCP remote URLs have weaker checks than web fetch, and one provider discovery path can send a credential to a fallback origin. Tool schemas do not replace effect authorization.

### 3.6 LLM Provider (Medium Risk)

**Surface:** API calls to OpenAI, Anthropic, Google, etc.

**Threats:**
| Threat | STRIDE | Risk | Current Mitigation |
|---|---|---|---|
| Provider sees full context | Information Disclosure | Medium | Provider choice is explicit, but context minimization is limited |
| Provider injects instructions | Tampering | Medium | Prompt guidance only (defense in depth) |
| Provider returns malicious tool calls | Tampering | Critical | Permission machinery exists, but defaults and nested paths bypass it |
| API key theft or origin confusion | Information Disclosure | Critical | Environment handling and redaction are partial; a cross-origin fallback path exists |
| Provider downtime | Denial of Service | Low | Fallback models |

**Gap:** Provider and model output must remain untrusted until every requested effect passes recursive capability authorization. Structured-output validation checks shape, not authority or intent.

### 3.7 Memory System (Medium Risk)

**Surface:** `~/.arcana/data/memory.db`, `~/.arcana/learned/*.md`

**Threats:**
| Threat | STRIDE | Risk | Current Mitigation |
|---|---|---|---|
| Memory poisoning | Tampering | High | Confidence scoring (partial) |
| Cross-session injection | Tampering | High | Memory is injected into system prompt |
| Memory DB corruption | Denial of Service | Medium | Corruption detection (skip-on-corrupt) |
| Memory DB theft | Information Disclosure | High | OS-level permissions only; storage roots and modes are not uniformly portable/private |

**Gap:** No memory expiration/TTL. No source attribution for memory entries. Poisoned memory persists indefinitely.

### 3.8 Plugin System (Medium Risk)

**Surface:** Plugin code execution, MCP servers

**Threats:**
| Threat | STRIDE | Risk | Current Mitigation |
|---|---|---|---|
| Malicious plugin reads secrets | Information Disclosure | High | Permission model (design doc only) |
| Malicious plugin sends network requests | Information Disclosure | High | Permission model (design doc only) |
| Malicious plugin modifies files | Tampering | High | Permission model (design doc only) |
| Malicious plugin executes shell | Code Execution | Critical | Permission model (design doc only) |
| MCP server injection | Tampering | High | None — MCP responses are trusted |

**Gap:** Plugin permission model is documented but appears to not be enforced in code.

### 3.9 Audit Log (Low Risk)

**Surface:** `~/.arcana/audit.jsonl`

**Threats:**
| Threat | STRIDE | Risk | Current Mitigation |
|---|---|---|---|
| Audit log deletion | Tampering | Medium | Ordinary mutable file; no protection |
| Audit log modification | Tampering | Medium | No integrity checksums |
| Audit log theft | Information Disclosure | High | Best-effort redaction; records can still contain sensitive context |

**Gap:** Audit log is not protected from deletion or modification.

---

## 4. Trust Boundary Map

```
┌─────────────────────────────────────────────────────────────┐
│                    USER'S MACHINE                            │
│                                                              │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │   Arcana    │───▶│  File System │    │  Audit Log  │     │
│  │   Engine    │    │  (read/write)│    │  (append)   │     │
│  └──────┬──────┘    └─────────────┘    └─────────────┘     │
│         │                                                    │
│         │ ◀── BOUNDARY 1: Local Filesystem                  │
│         │                                                    │
│  ┌──────▼──────┐    ┌─────────────┐    ┌─────────────┐     │
│  │   Shell     │    │  Memory DB  │    │  Plugins    │     │
│  │  (execute)  │    │  (SQLite)   │    │  (MCP)      │     │
│  └──────┬──────┘    └─────────────┘    └──────┬──────┘     │
│         │                                      │            │
│         │ ◀── BOUNDARY 2: Shell Execution      │            │
│         │                                      │            │
└─────────┼──────────────────────────────────────┼────────────┘
          │                                      │
          │ ◀── BOUNDARY 3: Network Egress       │
          │                                      │
   ┌──────▼──────┐                        ┌──────▼──────┐
   │   LLM       │                        │   MCP       │
   │  Providers  │                        │  Servers    │
   └─────────────┘                        └─────────────┘
          │
          │ ◀── BOUNDARY 4: External Provider
          │
   ┌──────▼──────┐
   │   Cloud     │
   │  Services   │
   └─────────────┘
```

---

## 5. Risk Matrix

| Threat | Likelihood | Impact | Risk Level | Priority |
|---|---|---|---|---|
| Prompt or tool injection reaching default host shell | High | Critical | **Critical** | P0 |
| Untrusted project executes custom tools, plugins, or MCP | High | Critical | **Critical** | P0 |
| Git tool command injection | High | Critical | **Critical** | P0 |
| Batch bypasses safe mode and tool policy | High | Critical | **Critical** | P0 |
| env_write path escape | High | Critical | **Critical** | P0 |
| Unauthorized gateway or forged WhatsApp event | Medium to High | Critical | **Critical** | P0 |
| Unauthenticated non-loopback server and PTY access | Configuration-dependent | Critical | **Critical** | P0 |
| Provider credential crosses origin | Medium | High | **High** | P0 |
| Package, plugin, provider, LSP, or update compromise | Medium | Critical | **High** | P1 |
| Persistent memory or skill poisoning | High | High | **High** | P1 |
| MCP SSRF or confused-deputy action | Medium | High | **High** | P1 |
| Unbounded queue or batch exhaustion | Medium | High | **High** | P1 |
| Sensitive state escapes configured portable root | High for portable use | High | **High** | P1 |
| Audit disclosure or tampering | Medium | High | **High** | P1 |
| Shared-session data disclosure | Configuration-dependent | Medium | **Medium** | P2 |

---

## 6. Mitigations by Priority

### P0 — Immediate

| # | Mitigation | Addresses | Effort |
|---|---|---|---|
| M1 | Default-deny shell, process, network, credential, persistence, and publish capabilities | Prompt injection impact and confused deputy | High |
| M2 | Add untrusted-workspace mode before config, tool, plugin, install, or MCP execution | Repository-open compromise | High |
| M3 | Replace Git shell strings with fixed argv and separate push approval | Command injection | Low to Medium |
| M4 | Route direct and nested calls through one recursive authorization service | Batch and wrapper bypasses | High — **done for agent batch, executeAuthorizedTool, cron/gateway `createDelegatedRunner`, MCP invoke path (ADR 0002)** |
| M5 | Canonicalize env_write and all mutation paths through one safe file service | Path traversal | Medium |
| M6 | Fail closed for gateway allowlists, WhatsApp signatures, and unauthenticated non-loopback binds | Remote compromise | Medium |
| M7 | Remove cross-origin API-key fallback and bind secrets to allowed origins | Credential disclosure | Low |

### P1 — Next Release

| # | Mitigation | Addresses | Effort |
|---|---|---|---|
| M8 | Add OS process isolation and mandatory cancellation | Shell, install, and resource impact | High |
| M9 | Require MCP trust, capabilities, sanitized environment, and egress policy | MCP execution and SSRF | High |
| M10 | Make memory opt-in with proposal, provenance, TTL, review, and purge | Persistent poisoning and privacy | Medium |
| M11 | Pin and verify plugins, provider packages, LSPs, actions, and every update path | Supply-chain compromise | High |
| M12 | Enforce one private, atomic, portable data root | Secret and context exposure | Medium |
| M13 | Bound PTY and event queues, batch fan-out, connections, and per-user cost | Denial of service | Medium — **batch fan-out bounded (size/pool/timeout/total budget); PTY/queues still open** |
| M14 | Give cron and gateways minimal capability profiles | Unattended and remote authority | Medium |

### P2 — Planned

| # | Mitigation | Addresses | Effort |
|---|---|---|---|
| M15 | Use bounded, tamper-evident, structured, redacted audit records | Privacy and repudiation | Medium |
| M16 | Add exact origins, scoped tokens, CSRF defense, and server RBAC | Control-plane abuse | High |
| M17 | Add redirect-safe, DNS-pinned egress or a network proxy | SSRF and exfiltration | High |
| M18 | Add sharing preview, secret scanning, expiry, and revocation | Session disclosure | Medium |

### P3 — Backlog

| # | Mitigation | Addresses | Effort |
|---|---|---|---|
| M19 | Improve injection detection for telemetry, not authorization | Detection and incident response | Medium |
| M20 | Add destination-aware secret classifiers and DLP signals | Accidental disclosure | Medium |
| M21 | Add exponential backoff and retry budgets | Service abuse | Low |
| M22 | Sanitize user-facing errors and terminal control characters | Information disclosure and UI spoofing | Low |

---

## 7. STRIDE Summary

| Category | Count | Highest Risk |
|---|---|---|
| **S**poofing | 2 | MCP server impersonation, plugin identity spoofing |
| **T**ampering | 12 | Prompt injection, memory poisoning |
| **R**epudiation | 1 | Audit log deletion |
| **I**nformation Disclosure | 10 | Secret leakage, data exfiltration |
| **D**enial of Service | 3 | Memory DB corruption, rate limits |
| **E**levation of Privilege | 4 | Shell command execution |

---

## 8. Open Questions

1. What exact capabilities should each local, remote, cron, and gateway profile receive?
2. Which project configuration fields remain safe to read before workspace trust?
3. What OS isolation backend and degraded behavior will be supported on macOS, Linux, and Windows?
4. Which origins may receive each credential type, and how is that policy represented and tested?
5. What retention, encryption, consent, residency, and deletion requirements apply to memory, audit, sharing, and Cloudflare metrics?
6. Which dynamic tests prove redirect, DNS, WebSocket, PTY, symlink-race, webhook-replay, and archive-extraction behavior?

---

## 9. References

| Document | Purpose |
|---|---|
| `docs/independent-security-audit-2026-07-14.md` | Primary source evidence, comparison, and release gates |
| `docs/security-audit-2026-07-14.md` | Full security audit with findings |
| `docs/trust-boundaries.md` | Trust boundary documentation |
| `docs/tool-risk-model.md` | Tool risk classification |
| `docs/plugin-permissions.md` | Plugin permission model |
| `SECURITY.md` | Security policy and reporting |
| `packages/arcana/src/agent/guard.ts` | Runtime guard implementation |
| `packages/engine/src/kernel/security-context.ts` | Security context engine |

---

## 10. Changelog

| Date | Change |
|---|---|
| 2026-07-14 | Peer-reviewed against independent source audit; corrected risk and mitigation priorities |
| 2026-07-14 | Initial threat model based on security audit |
