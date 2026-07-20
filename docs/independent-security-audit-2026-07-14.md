# Arcana Independent Security Audit

Date: 2026-07-14

Status: independent findings frozen before cross-audit comparison

Review type: documentation-only static source review

## Independence and provenance

This report was produced without opening any pre-existing Arcana security-audit report. The repository public disclosure policy in SECURITY.md and general design documents had been seen before the request to conduct an independent review; no existing audit report was consulted when deriving the findings below. The findings came from direct inspection of runtime, tool, gateway, server, plugin, MCP, persistence, installation, and release source.

The independent portion of this document is intentionally frozen before the later comparison. Any result learned from another audit must be recorded in a separate cross-audit section, not silently blended into these findings.

## Scope

Reviewed areas:

- Agent permissions, tool dispatch, shell execution, and path controls
- Arcana CLI built-in tools, batching, safe mode, and the advertised sandbox
- Project configuration, plugins, custom tools, MCP, and LSP boot paths
- HTTP server authentication, CORS, workspace routing, PTY, and event streaming
- Telegram, Discord, Slack, and WhatsApp gateways
- Provider discovery, API-key routing, updates, package installation, and release CI
- Persistent memory, learned skills, cron, sharing, local storage, audit logs, and telemetry

Not performed:

- No installation, dependency update, build, or package vulnerability scan
- No exploitation, fuzzing, traffic interception, or dynamic penetration test
- No validation of deployed DNS, Cloudflare, GitHub, R2, OAuth, or messaging-platform configuration
- No confirmation that apparent tokens in fixtures or documentation are live
- No review of a prior Arcana security audit before the independent findings were frozen

This is therefore a source audit, not a claim that every reachable deployment has been penetrated or that unreviewed code is safe.

## Executive assessment

Arcana should not presently be exposed as a network or messaging control plane, and it should not open untrusted repositories with its normal executable configuration enabled. The central problem is compositional: model-controlled text can reach host-authority tools, while several entry points either default to allow or apply policy only at the outermost call.

The most urgent defects are concrete code paths:

1. The default agent permission is allow-all, including a shell that explicitly has the host user's filesystem, process, and network authority.
2. Opening a project can import project JavaScript or TypeScript, install dependencies, load plugins, and start local MCP commands before any workspace-trust decision.
3. Built-in Git tools interpolate model-controlled values into a shell command.
4. The batch tool invokes nested tools without reapplying safe mode, allowed-tool restrictions, or sandbox checks.
5. env_write accepts a traversal path and can write executable content outside its advertised sandbox.
6. Messaging gateways give remote conversations the normal built-in and MCP tool catalog while allowlists are optional.
7. The WhatsApp webhook accepts unsigned POST requests when a signature is missing.
8. The server can bind beyond loopback without authentication and then expose workspace-selectable APIs and PTY creation.

Finding count in the independent snapshot:

- Critical: 8
- High: 16
- Medium: 2
- Total: 26

## Threat model

### Assets

- Source code, Git history, local files, and writable repositories
- Shell authority and the user's OS account
- Provider API keys, proxy keys, OAuth tokens, messaging tokens, and environment secrets
- Conversations, persistent facts, learned instructions, artifacts, and audit records
- Release signing keys, Cloudflare credentials, artifacts, and update channels
- Remote users reached through the server, gateways, MCP, and shared sessions

### Plausible attackers

- A malicious or compromised repository opened by a developer
- Indirect prompt injection in fetched pages, tool output, issues, source comments, or MCP results
- An unauthorized LAN client when the server is exposed
- An unauthorized user or forged webhook event reaching a messaging gateway
- A compromised plugin, MCP server, package, LSP binary, provider catalog, or release dependency
- Another user in a shared chat or channel
- A local process able to tamper with permissively stored state

### Security boundaries Arcana must enforce

- Model intent versus user-approved authority
- Repository data versus executable workspace configuration
- Nested tool calls versus the same policy applied to top-level calls
- Workspace paths versus the rest of the host filesystem
- Public or remote input versus authenticated, rate-limited control-plane access
- Untrusted tool and memory content versus trusted system instructions
- Remote metadata versus executable packages, endpoints, and credential destinations
- Configured Arcana storage versus the user's home directory and removable-device boundary

## Findings summary

| ID | Severity | Finding | Confidence |
| --- | --- | --- | --- |
| ARC-SEC-I01 | Critical | Default agents allow a host-authority shell | Source-confirmed |
| ARC-SEC-I02 | Critical | Opening an untrusted project can execute project-controlled code | Source-confirmed |
| ARC-SEC-I03 | Critical | Built-in Git tools contain command injection | Source-confirmed |
| ARC-SEC-I04 | Critical | Batch calls bypass top-level authorization policy | Source-confirmed |
| ARC-SEC-I05 | Critical | env_write can escape its advertised sandbox | Source-confirmed |
| ARC-SEC-I06 | Critical | Remote gateways inherit full agent authority and fail open without allowlists | Source-confirmed |
| ARC-SEC-I07 | Critical | WhatsApp accepts missing webhook signatures | Source-confirmed |
| ARC-SEC-I08 | Critical | Non-loopback server operation does not require authentication | Source-confirmed; reachability is deployment-dependent |
| ARC-SEC-I09 | High | The Arcana CLI sandbox is a path filter, not process containment | Source-confirmed |
| ARC-SEC-I10 | High | env_install is not sandbox-only and executes package installation code | Source-confirmed |
| ARC-SEC-I11 | High | Server authentication relies on reusable Basic credentials and accepts them in URLs | Source-confirmed |
| ARC-SEC-I12 | High | CORS trusts broad localhost and vendor-origin classes | Source-confirmed |
| ARC-SEC-I13 | High | MCP can auto-start local commands and reach arbitrary remote URLs | Source-confirmed |
| ARC-SEC-I14 | High | Web-fetch SSRF defenses do not pin DNS or visibly revalidate redirects | Defense gap source-confirmed; exploitability needs a dynamic test |
| ARC-SEC-I15 | High | Unsigned provider metadata influences endpoints and executable provider packages | Source-confirmed |
| ARC-SEC-I16 | High | Model discovery can forward a provider API key to a different origin | Source-confirmed |
| ARC-SEC-I17 | High | One self-update path continues when verification metadata is absent | Source-confirmed |
| ARC-SEC-I18 | High | LSP bootstrap downloads or installs executable code without uniform verification | Source-confirmed |
| ARC-SEC-I19 | High | Persistent memory and self-created skills form a durable prompt-poisoning path | Source-confirmed |
| ARC-SEC-I20 | High | Unbounded queues and unbounded batch fan-out enable resource exhaustion | Source-confirmed |
| ARC-SEC-I21 | High | Sensitive state is not consistently private, atomic, or confined to ARCANA_HOME | Source-confirmed |
| ARC-SEC-I22 | High | Audit and telemetry paths can disclose data and fail open | Source-confirmed |
| ARC-SEC-I23 | High | Release workflows use mutable actions and unpinned privileged tooling | Source-confirmed |
| ARC-SEC-I24 | High | Scheduled jobs run unattended with the complete tool and MCP catalog | Source-confirmed |
| ARC-SEC-I25 | Medium | Session sharing can export broad conversation and diff content | Source-confirmed; requires sharing configuration |
| ARC-SEC-I26 | Medium | The disclosure policy permits public reporting of vulnerabilities | Source-confirmed |

## Critical findings

### ARC-SEC-I01 — Default agents allow a host-authority shell

Impact: indirect prompt injection can become code execution, secret access, data exfiltration, source modification, or remote actions as the logged-in user.

Evidence:

- packages/engine/src/agent/agent.ts:136-153 establishes a wildcard allow rule and only narrows selected actions.
- packages/core/src/plugin/agent.ts:212-221 repeats the allow-all default for the V2 agent.
- packages/core/src/tool/bash.ts:118-165 states that the shell uses the host user's filesystem, process, and network authority.
- packages/engine/src/permission/risk-policy.ts:49-69 does not force a fresh approval for ordinary medium-risk commands after an allow rule.

The command blocklist is not a security boundary. A non-destructive-looking command can read credentials, run an interpreter, make a network request, push code, or delegate to another executable without matching a catastrophic-command pattern.

Required remediation:

- Change the default from wildcard allow to explicit capabilities.
- Require a fresh, human-origin approval for shell, process, network, credential access, publish, and remote-write effects.
- Scrub the child environment by allowlist and run commands inside an OS sandbox or dedicated low-privilege worker.
- Bind approval to an exact command plan, working directory, environment class, destination, expiry, and one execution.
- Do not let a model create a reusable or wildcard approval.

Verification:

- A new install cannot execute shell or network actions until a user approves the exact effect.
- Tool output containing hostile instructions cannot cause shell execution without a new trusted-user action.
- Both legacy and V2 agent paths pass the same authorization conformance tests.

### ARC-SEC-I02 — Opening an untrusted project can execute project-controlled code

Impact: cloning and opening a repository can execute code as the user before the repository has been trusted.

Evidence:

- packages/engine/src/config/config.ts:464-470 automatically loads project configuration unless an environment flag disables it.
- packages/engine/src/config/config.ts:485-529 scans project Arcana/OpenCode directories, starts dependency installation, and loads commands, agents, and plugins.
- packages/engine/src/tool/registry.ts:173-185 scans JavaScript and TypeScript custom tools with symlink following and dynamically imports them.
- packages/engine/src/plugin/shared.ts:207-212 turns an unversioned plugin into the latest package and installs it.
- packages/engine/src/mcp/index.ts:341-382 starts enabled local MCP commands.

No trust-on-first-use workspace gate was found on these paths. Environment opt-outs are not a safe default for an unsuspecting user.

Required remediation:

- Introduce an untrusted-workspace mode before reading executable configuration.
- Treat data-only settings separately from plugins, tools, commands, MCP processes, hooks, and package installation.
- Display the executable configuration diff and require local approval.
- Bind trust to repository identity plus the relevant configuration and commit hashes.
- Ignore project symlinks while untrusted, and invalidate trust when executable configuration changes.

Verification:

- Opening a newly cloned test repository causes no import, spawn, install, hook, or network activity.
- Data-only configuration can be inspected without executing it.
- Changing a trusted executable config requires a new approval.

### ARC-SEC-I03 — Built-in Git tools contain command injection

Impact: model-controlled tool arguments can execute arbitrary shell syntax under the Arcana process account.

Evidence:

- packages/arcana/src/agent/tools.ts:771-777 interpolates the Git diff file argument into an execSync shell string.
- packages/arcana/src/agent/tools.ts:805-812 interpolates files and the commit message into shell strings.
- packages/arcana/src/agent/tools.ts:839-857 interpolates an optional commit message and can push afterward.
- packages/arcana/src/agent/tools.ts:1424-1433 repeats interpolation in code review.
- packages/arcana/src/agent/runner.ts:635-640 applies the dangerous-command check only to shell-like tool names, not these Git tools.

Escaping only double quotes does not make shell interpolation safe. The file and working-directory arguments also require containment checks.

Required remediation:

- Replace shell strings with a process API and fixed argument arrays.
- Insert the Git end-of-options marker before paths.
- Pass commit messages through an argument or temporary message file, never a shell.
- Canonicalize the repository root and all supplied paths.
- Make push a separate high-impact operation with its own fresh approval.

Verification:

- Metacharacters, option-like filenames, substitutions, newlines, and Unicode edge cases remain literal arguments.
- Injection regression tests run on POSIX and Windows.

### ARC-SEC-I04 — Batch calls bypass top-level authorization policy

Impact: a model can place a prohibited tool inside batch and bypass safe mode, license or allowed-tool restrictions, and sandbox checks.

Evidence:

- packages/arcana/src/agent/runner.ts:572-610 applies safe mode, allowed-tool, path, and network policy only to the outer tool request.
- packages/arcana/src/agent/runner.ts:655-704 looks up arbitrary nested tool names and calls their handlers directly.
- Nested calls repeat selected proof and command guards but do not repeat safe mode, allowedTools, or sandbox authorization.
- The batch description in packages/arcana/src/agent/tools.ts advertises a read-oriented subset, but the handler does not enforce that subset.

The nested calls also use unbounded Promise.all fan-out and lack the normal per-tool timeout path.

Required remediation:

- Route every invocation, including nested and delegated calls, through one authorization middleware.
- Give each tool machine-readable effects such as read, write, process, network, credential, publish, and persistence.
- Enforce a server-side batch allowlist and bounded concurrency.
- Apply per-subcall cancellation, timeout, audit, redaction, and result limits.

Verification:

- A policy-conformance matrix proves that direct, batch, cron, gateway, MCP, and delegated calls receive identical decisions.
- Safe mode rejects every write effect regardless of wrapper tool.

### ARC-SEC-I05 — env_write can escape its advertised sandbox

Impact: a model can write executable content outside the expected directory, including user configuration or startup locations writable by the current account.

Evidence:

- packages/arcana/src/agent/tools.ts:691-697 joins the sandbox directory with an unvalidated model-provided filename, writes it, and marks it executable.
- packages/arcana/src/agent/runner.ts:596-608 applies path checks to only read, write, edit, and apply_patch; env_write is omitted.

Required remediation:

- Accept a basename only, or validate a strict relative path after canonicalizing the deepest existing parent.
- Reject absolute paths, parent components, alternate separators, device paths, and symlink traversal.
- Open files atomically with no-follow semantics and an explicit restrictive mode.
- Put env_write behind the same canonical file-mutation service as every other write.

Verification:

- Traversal, absolute path, symlink swap, and race-condition tests cannot write outside the configured root.

### ARC-SEC-I06 — Remote gateways inherit full authority and fail open without allowlists

Impact: an unauthorized messaging user, compromised account, or malicious participant in a shared channel can drive a host-authority agent and access another participant's conversation context.

Evidence:

- packages/gateway/src/gateway.ts:6-10 warns about a missing paid license but continues to start.
- Platform allowlists are optional; for example packages/gateway/src/platforms/discord.ts:19-31 and packages/gateway/src/platforms/whatsapp.ts:83-98 accept all users or channels when no list is configured.
- packages/arcana/src/cli/cmd/gateway.ts:32-51 creates a normal AgentRunner and registers all built-in and MCP tools.
- Sessions are keyed only by chat ID, so users in a shared channel share history.
- No gateway-specific approval, cost, turn, concurrency, or effect policy is applied.

Required remediation:

- Refuse to start a gateway with an empty allowlist unless an explicit development-only flag is present.
- Key sessions by platform, tenant, chat, and user; define deliberate group-chat semantics.
- Use a remote-safe capability profile with no shell, file mutation, install, Git write, secret, or arbitrary MCP capability by default.
- Require a trusted local approval channel for high-impact effects.
- Add per-user and per-chat rate, turn, token, spend, concurrency, and output limits.

Verification:

- An unknown user cannot create a session or consume model/tool resources.
- Group users cannot read or poison one another's private context.
- Remote sessions cannot gain a local capability by wrapping it in batch or MCP.

### ARC-SEC-I07 — WhatsApp accepts missing webhook signatures

Impact: anyone able to reach the webhook can forge incoming messages. Combined with the gateway's full tool catalog, this can become remote host compromise.

Evidence:

- packages/gateway/src/platforms/whatsapp.ts:70-75 verifies a signature only when both an app secret and a signature header are present.
- A missing signature therefore bypasses verification even when an app secret is configured.
- If no app secret is configured, every POST is accepted.
- packages/gateway/src/platforms/whatsapp.ts:114-116 listens without specifying a loopback host.
- Direct string equality is used for the MAC.

The one-megabyte request-body cap is a useful control and should remain.

Required remediation:

- Require the app secret at startup and reject missing, duplicate, malformed, or invalid signatures.
- Verify the exact raw request bytes with a length-safe constant-time comparison.
- Add replay and timestamp controls where the platform protocol permits.
- Restrict method, route, host, and content type, and deploy behind TLS.
- Bind to loopback or an explicitly configured private interface by default.

Verification:

- Missing and malformed signatures always return an authentication error before JSON parsing or agent work.
- Official signed webhook fixtures pass; modified bodies fail.

### ARC-SEC-I08 — Non-loopback server operation does not require authentication

Impact: a LAN or network client can reach Arcana APIs and PTY functionality as the Arcana OS user when an operator enables mDNS or otherwise binds beyond loopback without a password.

Evidence:

- packages/engine/src/cli/network.ts:45-62 changes the default hostname to 0.0.0.0 when mDNS is enabled.
- packages/engine/src/cli/cmd/serve.ts:13-20 only prints a warning when the server password is absent.
- packages/server/src/auth.ts:40-45 logs a localhost-only assumption but does not verify the actual bind address.
- packages/engine/src/server/routes/instance/httpapi/middleware/workspace-routing.ts:86-88 accepts a request-selected directory.
- packages/server/src/handlers/pty.ts:35-50 creates a PTY from request parameters, working directory, and environment.

Required remediation:

- Fail startup if the effective bind address is not loopback and strong authentication is absent.
- Require TLS or a mutually authenticated local reverse proxy for non-loopback use.
- Restrict all request-selected locations to configured roots.
- Separate read-only APIs from PTY, process, mutation, secret, and administration scopes.
- Run a remotely exposed server as a dedicated, sandboxed OS account.

Verification:

- Every non-loopback bind test fails closed without authentication and transport protection.
- An authenticated low-privilege client cannot create a PTY or select an arbitrary host directory.

## High findings

### ARC-SEC-I09 — The sandbox is not process containment

packages/arcana/src/agent/sandbox.ts:1-12 explicitly states that shell is not jailed and that there is no process, memory, CPU, or OS isolation. packages/arcana/src/agent/runner.ts applies path and network checks to a small named subset of tools. A shell, MCP process, installer, Git helper, or newly registered tool can bypass those checks.

The normal timeout at packages/arcana/src/agent/runner.ts:711-720 races a timer against the handler but does not cancel the losing handler, so a timed-out side effect can continue in the background.

Required action: rename this feature to workspace path guard unless and until it is backed by OS isolation. Require AbortSignal propagation, kill subprocess groups on timeout, and mediate filesystem and network access through capability-aware services.

### ARC-SEC-I10 — env_install is not sandbox-only

packages/arcana/src/agent/tools.ts:633-670 says env_install requires sandbox mode, but the handler does not test for sandbox mode. It installs model-selected npm or pip package specifications into a hard-coded home-directory path. npm lifecycle scripts are not disabled on this path, and Python build/install steps can execute code.

Required action: remove env_install from the default model catalog. Make installation an explicit local-user workflow with pinned packages, integrity verification, disabled lifecycle scripts where possible, isolated builds, and a real filesystem/network sandbox.

### ARC-SEC-I11 — Server authentication is replayable and can leak through URLs

packages/server/src/middleware/authorization.ts:8 and 32-38 accepts a reusable base64 Basic credential in the auth_token query parameter. Query credentials can leak through histories, logs, diagnostics, proxies, screenshots, and referrers. packages/server/src/auth.ts:48-53 uses ordinary string equality. No server-level authentication throttling or lockout was established in this review. A single shared password grants the entire API.

Required action: remove reusable query credentials. Keep the existing short-lived, single-use PTY ticket pattern for WebSocket connection bootstrap. Use TLS, scoped bearer or session tokens with expiry and rotation, constant-time secret comparison, rate limiting, and role-based authorization.

### ARC-SEC-I12 — CORS trusts broad origin classes

packages/server/src/cors.ts:3-19 permits any localhost port, any 127.0.0.1 port, renderer schemes, and every HTTPS subdomain of opencode.ai. A malicious local web origin or compromised vendor subdomain can issue browser requests when it also obtains or inherits usable credentials. CORS must not be treated as authentication.

Required action: allow only exact UI origins negotiated for the running instance, add CSRF protection for state-changing browser requests, and do not use a wildcard vendor-domain trust relationship.

### ARC-SEC-I13 — MCP crosses process and network trust boundaries without a strong default

The engine starts enabled local MCP commands in packages/engine/src/mcp/index.ts:341-382. Remote MCP URL validation in the same file at 134-136 only checks whether a URL parses; it does not restrict scheme, destination, or internal-network access. MCP tools call the permission layer in packages/engine/src/session/tools.ts:122-140, but wildcard agent allow rules mean this often produces no human prompt.

The Arcana CLI path at packages/arcana/src/agent/mcp.ts:23-88 starts configured local commands, can inherit the parent environment, connects to arbitrary remote URLs, and registers returned tools directly with AgentRunner.

Required action: require explicit MCP trust, a declared capability manifest, sanitized environment, network destination policy, SSRF controls, per-server scopes, and default ask or deny for every newly discovered tool. Treat MCP descriptions and results as untrusted data.

### ARC-SEC-I14 — Web-fetch SSRF protection is incomplete

Both web-fetch implementations block common literal private addresses, perform one DNS lookup, cap responses at five megabytes, and set timeouts. These are meaningful positive controls.

However, packages/core/src/tool/webfetch.ts:188-200 and packages/engine/src/tool/webfetch.ts:79-92 validate a lookup result but do not bind the subsequent connection to that result. The source does not visibly revalidate each redirect destination. IPv6 and special-purpose address coverage is also incomplete. The engine implementation collects the response before enforcing the measured size at packages/engine/src/tool/webfetch.ts:150-158.

Required action: use an egress proxy or a resolver that validates every A and AAAA address and pins the selected public address to the connection. Disable automatic redirects and manually validate every hop. Deny cloud metadata and special-purpose ranges, and enforce a streaming byte limit.

### ARC-SEC-I15 — Provider metadata is an executable trust root

packages/arcana/src/agent/models-dev.ts:12 and 60-76 downloads unsigned JSON and caches it without an explicit restrictive mode. packages/arcana/src/agent/providers.ts:38-47 uses that metadata to select API endpoints and environment-variable names. In the engine, packages/engine/src/provider/provider.ts:1782-1804 uses catalog endpoint data, while 1889-1905 can install and dynamically import the catalog-selected npm package.

Even though the shared npm helper disables lifecycle scripts on its installation path, imported package code still executes.

Required action: ship or verify a signed provider catalog, strictly allowlist provider IDs, API origins, environment keys, and package names, and separate metadata updates from executable package selection. Never accept a catalog-selected package without a pinned version and integrity value.

### ARC-SEC-I16 — API key can be forwarded to an unrelated fallback origin

packages/arcana/src/agent/runner.ts:79-91 tries the configured provider origin and then a Workers.dev fallback while sending the same Authorization bearer value to both. This logic is not restricted to a provider whose credential was issued for that fallback.

Required action: bind secret types to allowed origins. Use the fallback only for the exact Arcana proxy provider and only with a proxy-specific credential. Add a regression test proving that a provider key is never sent across origins.

### ARC-SEC-I17 — Curl-based self-update can skip verification

The npm launcher in packages/arcana/npm/bin/arcana.js:82-126 has strong behavior: checksum retrieval is mandatory, and the checksum is verified with an embedded Ed25519 public key before execution.

The curl upgrade path in packages/engine/src/installation/index.ts:21-64 verifies a checksum only if the checksum download succeeds and is non-empty. It otherwise extracts and replaces the running binary, and it does not verify the available signature.

Required action: use one verifier for all installation paths. Make signature and checksum mandatory, fail closed, validate archive entries before extraction, replace atomically, and retain rollback metadata.

### ARC-SEC-I18 — LSP bootstrap lacks uniform artifact verification

packages/engine/src/lsp/server.ts contains multiple automatic downloads, latest-version package installs, branch archive fetches, chmod operations, and execution paths for language servers. The review did not find a uniform checksum or signature requirement.

Required action: make each download opt-in, pin immutable versions, require published checksums or signatures, validate archive paths, and run language servers with limited filesystem and network authority.

### ARC-SEC-I19 — Persistent memory can preserve an attack across sessions

Memory is enabled by default at packages/arcana/src/config.ts:33-46. The model can store facts through packages/arcana/src/agent/tools.ts:144-165 and create a SKILL.md that is loaded in a later session through 341-377. packages/engine/src/session/system.ts:181-208 injects stored facts and learned entries into the system prompt as persistent memory.

This lets hostile external content become a durable instruction or false fact. Some separate learning paths use quarantine, but the direct fact and skill tools do not provide a comparable user-consent gate.

Required action: make durable memory opt-in, distinguish user-authored facts from model proposals, retain provenance and scope, apply TTL and sensitivity filters, and require review before a proposal becomes active. Render memory as quoted untrusted data, never as privileged instruction. Provide inspect, export, correct, and purge controls.

### ARC-SEC-I20 — Resource-exhaustion controls are incomplete

packages/server/src/handlers/pty.ts:172-180 and equivalent engine event and PTY handlers use unbounded queues. A slow client and noisy producer can grow memory without bound. The batch tool uses unbounded Promise.all fan-out and bypasses normal per-tool timeout handling.

The PTY service's retained-output and exited-session caps are positive controls, but they do not bound each live socket queue.

Required action: use byte-bounded queues with backpressure or disconnect behavior, bound input frames and connections, limit batch size and concurrency, and apply per-user resource budgets.

### ARC-SEC-I21 — Local sensitive state is inconsistently protected and portable

Positive controls exist: engine auth and MCP token files use restrictive modes, and the core database repairs permissions on its database, WAL, and shared-memory files.

Gaps remain:

- packages/memory/src/db.ts:223-241 creates the memory database and directory without an explicit private mode.
- packages/cron/src/jobs.ts:100-104 writes prompts non-atomically with default permissions.
- Many packages/arcana paths write directly beneath the user's home directory instead of using getArcanaHome or configured dataDir.
- Audit logs, skills, speech, prompts, reflections, artifacts, caches, and the advertised sandbox can therefore escape an ARCANA_HOME located on a removable drive.
- API and gateway credentials may be stored as plaintext configuration protected only by filesystem permissions.

Required action: route all state through one canonical data-root service, use 0700 directories and 0600 files, write atomically with safe replacement, support an OS keychain or encrypted portable vault, and provide a migration and permission-repair command. A USB-only configuration must produce no Arcana writes outside the selected device.

### ARC-SEC-I22 — Audit and telemetry can leak content and fail open

packages/arcana/src/agent/guard.ts:191-226 writes to a hard-coded home path. It redacts serialized arguments, but the spread object can retain result data, and enterprise synchronization uses the original result field rather than a centrally typed redaction pipeline. Errors are swallowed, so a required audit trail can silently disappear.

Required action: redact structured fields before any persistence or export, default to metadata rather than prompts or results, use the configured data root and restrictive permissions, document retention and destinations, and make audit failure visible. High-impact enterprise actions should be able to require a healthy tamper-evident audit sink.

### ARC-SEC-I23 — Release CI has mutable privileged dependencies

The GitHub workflows use major-version action tags rather than immutable commit SHAs. The privileged build workflow runs non-frozen installs and globally installs an unpinned wrangler package in a job that also has Cloudflare and signing authority. The security-audit workflow uses a non-frozen install and treats important audit output as advisory.

Required action: pin actions to reviewed commit SHAs, use frozen lockfiles, pin wrangler exactly, separate build, sign, and publish jobs, use short-lived OIDC credentials, generate provenance and attestations, and fail release on policy-defined critical findings.

### ARC-SEC-I24 — Cron runs complete authority without a user present

packages/arcana/src/cli/cmd/cron.ts:15-41 creates a normal AgentRunner and registers every built-in and MCP tool for scheduled prompts. There is no cron-specific capability profile or interactive approval path. Cron is enabled in default configuration at packages/arcana/src/config.ts:44-45.

Required action: disable unattended execution by default, require a signed capability lease per job, deny shell, install, arbitrary MCP, secrets, and remote mutation unless explicitly granted, and limit time, cost, network destinations, and files. A job that needs new authority must pause for local approval.

## Medium findings

### ARC-SEC-I25 — Sharing exports a broad session data set

The session-sharing path can upload messages, parts, diffs, and model metadata to a configured enterprise endpoint or the default sharing service. It has disable, manual, secret, and unshare controls, which reduce risk. Auto-sharing configuration and the breadth of content can nevertheless disclose source, prompts, or credentials.

Required action: keep sharing off by default, show a content preview, scan and redact secrets, identify the destination, set an expiry, support revocation, and log exactly what left the machine.

### ARC-SEC-I26 — Public vulnerability reporting is permitted

SECURITY.md offers a public GitHub issue as a reporting route. Public disclosure before triage can expose users while a fix is not available.

Required action: make a private security advisory or private security address the exclusive initial route, publish acknowledgement and remediation targets, provide encryption details, and define coordinated disclosure and CVE handling.

## Positive controls worth preserving

- Canonical path resolution and external-directory checks exist in the engine location-mutation service.
- File mutation is serialized and supports conditional writes.
- Legacy local MCP spawning filters environment variable names commonly associated with secrets.
- Engine auth and MCP OAuth state use restrictive local file permissions.
- MCP OAuth tokens are bound to a server URL, and OAuth state is high entropy and short lived.
- PTY connection tickets are scoped, single use, and expire quickly.
- Retained PTY output and exited PTY sessions are capped.
- Web fetch blocks common private targets and includes time and size limits; the core implementation streams the size cap.
- The shared npm installation service disables lifecycle scripts.
- The npm launcher verifies a mandatory checksum and Ed25519 signature.
- Some self-learning paths quarantine unverified output.
- Normal CI uses a frozen lockfile and read-only repository contents permission.
- The ordinary server hostname defaults to loopback when mDNS and overriding configuration are not used.
- Sharing has disable and unshare controls.

These controls should be centralized and reused rather than reimplemented differently across the Arcana CLI, engine, core, gateways, and scheduled execution.

## Required remediation order

### Stop-ship before remote or untrusted use

1. Replace allow-all agent permissions with capability-deny defaults.
2. Add an untrusted-workspace gate before executable project configuration.
3. Replace all Git shell interpolation with fixed argument arrays.
4. Route batch and every other wrapper through one recursive authorization layer.
5. Fix env_write containment and remove env_install from the default tool set.
6. Fail closed for empty gateway allowlists and give gateways a remote-safe tool profile.
7. Require and correctly verify WhatsApp webhook signatures.
8. Refuse unauthenticated non-loopback server binds.
9. Remove cross-origin provider-key fallback.

### Next hardening milestone

1. Build a capability model shared by direct, nested, delegated, MCP, gateway, cron, and server execution.
2. Add OS-level process isolation and honest UI naming for weaker path guards.
3. Make memory opt-in with proposal, provenance, expiry, review, and purge.
4. Enforce a single portable data root with private and atomic storage.
5. Add destination-aware network egress and complete SSRF defense.
6. Pin and verify plugins, provider packages, LSP binaries, installers, actions, and release tooling.
7. Split the server into read, mutation, process, and administration roles.

## Security acceptance gates

A release should not be considered hardened until automated tests prove:

- No executable project behavior occurs before workspace trust.
- Every tool effect receives the same policy in direct, batch, gateway, cron, delegated, and MCP paths.
- No shell or process effect is possible under default permissions.
- All non-loopback services fail closed without authentication and transport protection.
- Webhooks reject absent, malformed, replayed, and invalid authentication.
- Provider secrets cannot cross an origin boundary.
- Every download-to-execute path verifies an immutable version and integrity or signature.
- ARCANA_HOME on a test removable root produces no Arcana writes elsewhere.
- Slow sockets, large tool output, and batch fan-out stay within fixed memory and concurrency budgets.
- Persistent memory cannot become active without explicit consent and remains inspectable and erasable.

## Limitations and follow-up validation

The following require controlled dynamic work in a separate, authorized test session:

- Confirm redirect and DNS-rebinding behavior of both HTTP-client stacks.
- Exercise WebSocket, PTY, event-stream, and gateway exhaustion limits.
- Verify bind behavior and route authorization for every server implementation.
- Fuzz path handling on POSIX and Windows, including symlink races and device paths.
- Inspect generated packages and archives for traversal and replacement behavior.
- Run secret scanning, dependency advisories, SBOM validation, and provenance verification.
- Test prompt injection through web, MCP, Git content, memory, skills, gateway groups, and compressed context.
- Validate deployed Cloudflare, R2, OAuth, and messaging webhook configuration.

## Cross-audit comparison

### Freeze record

The independent snapshot above was completed before opening the prior audit reports.

- Frozen independent-section SHA-256: 5b5810c74d8037e39105025e753cb92a60423fb5526b7a60f734de34b6215bf5
- Frozen independent-section length: 533 lines
- Hash scope: every line before the `## Cross-audit comparison` heading, including the terminating blank line
- Reproduction: `sed '/^## Cross-audit comparison$/,$d' docs/independent-security-audit-2026-07-14.md | shasum -a 256`
- Comparison date: 2026-07-14

No independent finding was removed or downgraded after reading the other reports. This appendix records agreement, omissions, and corrections.

### Documents compared

- docs/security-audit-2026-07-14.md
- docs/threat-model.md
- docs/tui-runtime-adjacent-risk-audit.md
- docs/tui-slash-command-audit.md
- SECURITY.md

The two TUI audits are primarily product/runtime reviews. They add useful context about externally dispatched commands, prompt insertion, MCP autocomplete, and arbitrary toast content, but they do not materially change the host-compromise priorities in this report.

### Areas of agreement

| Shared conclusion | Earlier audit | Independent result |
| --- | --- | --- |
| Host shell lacks real isolation | Critical C1 | ARC-SEC-I01 and I09 |
| A blocklist cannot cover interpreters and alternate execution paths | Critical C1 and High H3 | ARC-SEC-I01 and I09 |
| Network egress needs policy | High H4 | ARC-SEC-I13, I14, and I16 |
| Plugin permissions are documented more strongly than they are isolated | Medium M2 | ARC-SEC-I02, I13, and I15 |
| Memory can preserve hostile content across sessions | Medium M3 | ARC-SEC-I19 |
| Audit records need integrity and privacy controls | Medium M4 | ARC-SEC-I21 and I22 |
| User-facing errors can expose internals | Low L3 | Included in gateway and server remediation |

These agreements increase confidence in the shared themes, but the independent source trace changes their priority. Unsandboxed shell is not merely a fallback after a detector fails: it is broadly allowed by default. Plugin and memory risk also begins during ordinary project and agent startup, not only after an explicitly installed extension.

### Critical gaps missed by the earlier audit

The earlier security audit and its derived threat model did not identify:

1. Default wildcard permission for the host-authority shell in both agent implementations.
2. Project-open code execution through custom tool import, plugin installation, and local MCP startup.
3. Direct shell injection in Git diff, commit, autocommit, and code-review tools.
4. Safe-mode, allowed-tool, and sandbox bypass through nested batch calls.
5. Path traversal in env_write.
6. Full host tool authority exposed through messaging gateways with optional allowlists.
7. Missing-signature acceptance in the WhatsApp webhook.
8. Unauthenticated non-loopback server operation with workspace routing and PTY access.
9. Cross-origin forwarding of a provider key to a Workers.dev fallback.
10. Unsigned provider metadata selecting endpoints and executable provider packages.
11. Verification that is optional in one self-update path.
12. Automatic LSP download and execution without a uniform integrity policy.
13. Unbounded live socket/event queues and batch fan-out.
14. Unattended cron jobs with the complete tool and MCP catalog.
15. Writes outside ARCANA_HOME, which conflicts with a removable-device deployment boundary.

These omissions make the earlier B+ rating and its implementation priority unsafe to use as a release decision. The independent report's stop-ship list should control remediation order.

### Corrections to earlier conclusions

#### Prompt-injection regex is a signal, not a boundary

The earlier audit makes expanding from seven to thirty or more patterns its top recommendation. More detection can improve telemetry, but it cannot safely authorize tools. Encodings, other languages, indirect content, best-of-N variation, and future attacks make natural-language pattern coverage open ended. The security objective must be to keep untrusted content from acquiring authority: least-privilege tools, recursive policy, intent-bound approvals, isolation, and output-to-action separation.

The OWASP LLM Prompt Injection Prevention guidance describes indirect, encoded, typoglycemic, multimodal, RAG, tool-manipulation, and persistent attacks and recommends defense in depth, least privilege, and human oversight rather than a regex-only boundary.

#### Blocking interpreters is not a complete shell fix

Adding Python, Node, Perl, or Ruby to a denylist leaves many other binaries, shell built-ins, compilers, package managers, network clients, and indirect execution routes. The durable fix is capability default-deny plus process isolation and exact approval. A command detector may remain as a warning and emergency stop layer.

#### Secret scanning cannot prove that output is safe

Lowering an entropy threshold trades missed secrets for large false-positive and data-corruption rates. Redaction needs typed secret sources, destination policy, structured fields, provider-specific detectors, and a conservative fallback. The default rule should be that shell output, prompts, and results are not exported or logged merely because a detector did not match.

#### Prompt checksums alone do not establish integrity

A checksum stored beside mutable prompt files can be changed by the same attacker. Prompt integrity belongs to the signed release and package-verification chain. Runtime measurement can detect accidental drift, but the trust anchor must be outside the mutable payload and updates must fail closed.

#### Standard TLS validation is not a missing control

The earlier report labels absence of certificate pinning as a vulnerability. The reviewed fetch path uses the runtime's normal HTTPS validation; no disabled certificate check was found. Pinning can be an optional high-assurance control, but key rotation and recovery must be designed. More immediate issues are endpoint authorization, scoped credentials, data minimization, and signed requests where appropriate.

#### Existing SSRF controls should be credited but completed

The threat model states that web fetch has no SSRF mitigation. Source shows literal private-address checks, a DNS check, timeouts, and response-size limits. The remaining gap is DNS binding, complete address classification, redirect revalidation, and network-level egress defense.

#### Some guard descriptions were too strong

The earlier audit calls command blocking, audit logging, and rate limiting solid. Batch bypasses several of these paths, audit output is best-effort, and rate limiting is per runner. These controls are useful signals and limits, but they are not uniformly enforced security boundaries.

### TUI audit contribution

The TUI reports identify three inputs that should be included in later dynamic security validation:

- tui.command.execute must authorize the resolved command, not trust an event name.
- tui.prompt.append and server/MCP autocomplete insert untrusted prompt text and must not be treated as trusted system directives.
- Toast and terminal rendering should neutralize control characters and never disclose raw server or tool errors.

No source path in those reports changes the critical TUI dialog/mouse conclusion, and no dialog file is identified as the cause of a security boundary failure. The dialog interaction issue remains a QA regression risk, separate from this security audit.

### Remediation status in this audit worktree

- ARC-SEC-I26 is addressed at the documentation-policy level: `SECURITY.md` now directs reporters to private email and explicitly forbids public issues or discussions for suspected vulnerabilities.
- The shared and Anthropic prompt text no longer treats `<system-reminder>` tag text as authoritative by itself; the shared prompt now requires runtime-controlled provenance and treats copies in untrusted content as data.
- The architecture documents now state that `batch` has only a descriptive read-only restriction and must receive recursive authorization before parallel execution expands.
- No critical runtime authorization, sandbox, gateway, server, webhook, path, update, or supply-chain finding is fixed by these documentation and prompt corrections. Those findings remain open until code and dynamic tests satisfy the acceptance gates above.

### Post-audit code progress (pointer, not a re-audit)

As of tool-batch Phases 0–3 ([ADR 0002](./adr/0002-tool-batch-scheduler.md)):

| Finding | Snapshot claim | Later code note |
|---------|----------------|-----------------|
| **ARC-SEC-I04** | Batch bypasses top-level authorization | Agent path: nested tools go through `executeAuthorizedTool`; nested batch denied. Confirm with tests before closing as release-gate. |
| **ARC-SEC-I20** | Unbounded batch fan-out | Agent batch: maxCalls, capability pools, timeouts, synthesis caps; engine multi-tool admission + path locks. Queue/session global caps may still be incomplete. |

This table is a **navigation pointer**. It does not re-grade the independent audit or claim stop-ship clearance. Re-verify acceptance gates in the finding bodies before treating I04/I20 as closed for a release.

### Unified remediation baseline

The audits are reconciled around five non-negotiable principles:

1. Assume prompt injection will sometimes succeed; constrain the effect rather than trusting detection.
2. Apply one capability authorization path recursively to every execution surface.
3. Do not execute project, plugin, MCP, package, LSP, or update code before trust and integrity checks.
4. Fail closed whenever a remote boundary lacks authentication, allowlisting, scoped authorization, or resource limits.
5. Keep credentials and persistent context origin-bound, consented, minimal, private, and erasable.

### Standards mapping and primary references

| Arcana area | Reference |
| --- | --- |
| Git shell interpolation | MITRE CWE-78, OS Command Injection: https://cwe.mitre.org/data/definitions/78.html |
| env_write escape | MITRE CWE-22, Path Traversal: https://cwe.mitre.org/data/definitions/22.html |
| Unauthenticated server and webhook paths | MITRE CWE-306, Missing Authentication for Critical Function: https://cwe.mitre.org/data/definitions/306.html |
| Update, LSP, provider, and plugin downloads | MITRE CWE-494, Download of Code Without Integrity Check: https://cwe.mitre.org/data/definitions/494.html |
| Web and MCP network destinations | OWASP SSRF Prevention Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html |
| Agent, tool, and persistent-context injection | OWASP LLM Prompt Injection Prevention Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html |
| MCP trust and confused-deputy risks | OWASP MCP Security Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/MCP_Security_Cheat_Sheet.html |
| Secure development and release gates | NIST SP 800-218 SSDF: https://csrc.nist.gov/pubs/sp/800/218/final |
| Immutable GitHub Action references | GitHub guidance on protecting against security threats: https://docs.github.com/en/code-security/tutorials/secure-your-organization/protect-against-threats |

## Cross-audit decision

Use this independent report as the primary remediation and release-gate document. Preserve the earlier audit as a historical first pass, but mark it as peer-reviewed and superseded for severity, priority, and claims about guard strength. Update the threat model to use capabilities and trust boundaries rather than lists of phrases or executable names.
