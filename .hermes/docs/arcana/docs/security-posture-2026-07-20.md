# Security posture progress — 2026-07-20

Tracks remediation against [independent-security-audit-2026-07-14.md](./independent-security-audit-2026-07-14.md).

This is a living status, not a claim that Arcana is fully hardened.

## Critical findings (I01–I08)

| ID | Topic | Status | Notes |
| --- | --- | --- | --- |
| ARC-SEC-I01 | Default host-authority shell | **Partial** | Default `bash` permission is now `ask` (was covered by `*": "allow"`). Users may set `permission.bash = "allow"`. Full “no shell until exact plan approval” + OS sandbox still open. |
| ARC-SEC-I02 | Untrusted project code exec | **Partial → Fixed (MVP)** | Workspace trust gate: project plugins, agents, commands, custom tools, local MCP, and project npm install require `arcana trust`. Data-only JSON keys still load. Escape: `ARCANA_DISABLE_WORKSPACE_TRUST` / `ARCANA_TRUST_WORKSPACE`. Fingerprint invalidates trust when executable surfaces change. |
| ARC-SEC-I03 | Git command injection | **Fixed** (prior) | Built-in Git tools use `execFileSync` + argv arrays + `--` end-of-options. Tests in `packages/arcana/src/agent/tools.test.ts`. |
| ARC-SEC-I04 | Batch policy bypass | **Partial** (prior) | Nested batch sub-calls go through `executeAuthorizedTool` (safeMode, allowlist, sandbox, proof gates). Full effect-typed middleware + conformance matrix still open. |
| ARC-SEC-I05 | `env_write` sandbox escape | **Fixed** | Basename-only resolution; rejects absolute paths, `..`, null bytes. `resolveSandboxScriptPath` + tests. |
| ARC-SEC-I06 | Gateway empty allowlist | **Fixed** | `assertGatewayAllowlist` refuses empty lists unless `ARCANA_GATEWAY_OPEN=1`. |
| ARC-SEC-I07 | WhatsApp missing signatures | **Fixed** | `appSecret` required (or `ARCANA_WHATSAPP_INSECURE=1`); missing/invalid `x-hub-signature-256` rejected with timing-safe compare. |
| ARC-SEC-I08 | Non-loopback server unauthenticated | **Fixed** | `arcana serve` refuses non-loopback bind without `ARCANA_SERVER_PASSWORD`. Loopback without password still allowed (with warning). |

## Dev escape hatches (document in release notes)

| Env / CLI | Effect |
| --- | --- |
| `arcana trust` | Trust current workspace (store fingerprint under `~/.arcana/workspace-trust.json`). |
| `arcana trust status` / `revoke` / `list` | Inspect or revoke trust. |
| `ARCANA_DISABLE_WORKSPACE_TRUST=1` | Legacy open mode — load project executable config without trust. |
| `ARCANA_TRUST_WORKSPACE=1` | Force-trust for this process (CI). |
| `ARCANA_GATEWAY_OPEN=1` | Allow empty platform allowlists (local dev only). |
| `ARCANA_WHATSAPP_INSECURE=1` | Start WhatsApp without `appSecret` (no signature verify). |
| `permission.bash = "allow"` (config) | Restore silent shell for trusted local workflows. |

## Public ship guidance

- **Local CLI + own API keys:** improved posture; still not a sandboxed multi-tenant runtime.
- **Gateways / `arcana serve` on LAN:** require allowlists + password; still treat as experimental.
- **Untrusted repos:** use `arcana trust` before loading project plugins/tools/MCP. Without trust, executable project config stays disabled (I02 MVP). Do not open hostile repos with `ARCANA_DISABLE_WORKSPACE_TRUST=1`.
- **User docs:** https://arcana.otnelhq.com/docs

## Next priority

1. I02 polish: interactive TUI trust prompt on first open; bind trust to git remote identity.
2. I01 OS-level shell isolation / exact command-plan approval.
3. I04 full authorization conformance matrix (cron, gateway, MCP, batch).
4. High findings I09–I24 as capacity allows.
5. Gateway remote-safe capability profile (I06 residual — allowlist done; full tool catalog still open).
