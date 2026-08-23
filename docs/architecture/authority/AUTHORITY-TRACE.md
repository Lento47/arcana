# AUTHORITY-TRACE — Empirical Authority Surface Baseline

> Step Zero of the [Authority Kernel](./AUTHORITY-KERNEL.md) plan.
> Generated: 2026-08-23 · Branch: `arcanagov` · HEAD: `00ab9050`
> Method: read-only source investigation. Bounds per plan §8.1: public surfaces
> (`arcana run`, engine session, TUI client, cron/gateway wiring); direct ambient
> calls + SDK-wrapped calls one level deep.
>
> **Verdict up front: review finding #1 is CONFIRMED.** The `arcana run` path is a
> parallel execution runtime with heuristic guardrails only. It mounts zero
> capability/PDP/PEP machinery. Authorization is conditional on `--proof`, and even
> then the gates are RunProof policy risk-scoring — not the deterministic PDP.

---

## 1. Surface inventory

| Surface | Entry | Runtime | Governed? |
| --- | --- | --- | --- |
| Engine session (TUI/server client) | `packages/engine/src/session/tools.ts` | `authorizeAndExecuteEffect` (@arcana/core/capability/pep) at lines 768, 973 | **YES** — full PDP/PEP stack |
| `arcana run` CLI agent | `packages/arcana/src/cli/cmd/run.ts` → `packages/arcana/src/agent/runner.ts` + `tools.ts` | custom AgentRunner loop | **NO** — heuristics only; see §2 |
| TUI | `packages/tui/src/routes/session` | engine-session client | YES (client of governed runtime) |
| Cron | `packages/cron/src/*` | job store/scheduler; no agent execution loop in scope | n/a (own fs persistence) |
| Gateway | `packages/gateway/src/*` | messaging adapters (telegram/discord/slack); no agent tool loop found | network egress for messaging only |

## 2. Finding #1 — `arcana run` executes without authorization

### 2.1 The conditional gate

| Site | Evidence |
| --- | --- |
| Flag default off | `run.ts:119–124` — `--proof`/`--evidence`, `default: false` |
| Gate object conditionally constructed | `run.ts:241` — `proofGate: proofRuntime.enabled ? proofRuntime : undefined` |
| Shell gate no-ops without it | `runner.ts:394` — `if (!command || !this.config.proofGate) return undefined` |
| File gate no-ops without it | `runner.ts:463` — same guard |

Without `--proof`: no shell/file gating, no receipts, no records. With `--proof`: gates engage, but they are RunProof *policy risk-scoring* (`gateShellCommand` / `gateFileMutation`) — not the capability PDP.

### 2.2 No authority machinery is mounted at all

`@arcana/core` imports across all of `packages/arcana/src`:

| Import | Nature |
| --- | --- |
| `core/util/self-awareness` | path heuristics |
| `core/util/file-edit-guard` | diff classification rules |
| `core/session/goal` | goal state (3 sites in tools.ts, 4 in run.ts) |

Zero imports of `capability/pep`, `capability/types`, grant stores, scoped approvals, or any decision machinery. The two runtimes share util helpers; they do not share authority.

### 2.3 What protects this path today (heuristics, unconditional)

safeMode allowlist · dangerous-command check (shell-named tools only — note: **no shell/bash tool is currently registered**, so this check has no primary target) · injection detection on user input · rate limiting · result caching. Sandbox path/network checks exist but are **opt-in** (`--sandbox`; `this.sandbox = null` otherwise).

## 3. Effect call-site classification (`packages/arcana/src/agent/tools.ts` unless noted)

| Site(s) | Tool(s) | Effect class | Mediated today | Credential owner |
| --- | --- | --- | --- | --- |
| tools.ts:1848–1871 | `write` → `writeFileSync(fp)` arbitrary path | FsMutation | N (RunProof file gate iff `--proof`) | — |
| tools.ts:1879–1911 | `edit` → read+replace+`writeFileSync` | FsMutation | N (same condition) | — |
| ~981/1014 (+ helper :92) | `git_commit`, `git_autocommit` → `execFileSync("git", …)` | GitMutation | N | git credentials via OS |
| 710 | `web_fetch` → `fetch(url)` | NetworkMutation | N | — |
| 421 | `web_search` → duckduckgo fetch | NetworkMutation | N | — |
| 479–501 | `speak` → elevenlabs fetch + `Bun.spawn(powershell/afplay/mpv)` | NetworkMutation + ProcessExecution | N | ELEVENLABS key (env) |
| 229 region | `image_generate` | NetworkMutation | N | provider key |
| 608–651 | `env_probe/env_caps/env_paths/env_network/env_install/env_write/env_clean` → `fetch`, `execSync`, `writeFileSync` test files, `chmod`, `rmSync` | Mixed: Network + Process + FsMutation | N | — |
| 515–545 | `skill_create` → writes `SKILL.md` into skillsDirs | FsMutation (self-modification adjacent) | N | — |
| runner MCP registration | MCP tools → external server processes | ExternalMutation + ProcessExecution | N (engine path mediates its MCP calls; CLI path does not) | MCP server configs |
| runner.ts:615–627 | dangerous-command check | — | heuristic; shell-shaped tool names only | — |

Supporting ambient sites outside the tool registry (all unmediated, by-design utility): memory DB open (`~/.arcana/memory.db`), learned-wiki writes (`.arcana/learned/`), reflection files (`~/.arcana/reflections/`), artifact JSON writes, shared-memory sync `fetch` to `api-arcana.otnelhq.com` (run.ts:650), account-snapshot fetch (run.ts:288).

## 4. Credential ownership

| Credential | Stored | Flows through unmediated path? |
| --- | --- | --- |
| Provider API key (`config.apiKey`) | `~/.arcana/config.json` | Yes — plain field on AgentRunner config; injected into system prompt context paths |
| Proxy license/account | env (`ARCANA_LICENSE_TIER`, …) + proxy-client | Yes — best-effort fetches at startup |
| ElevenLabs / provider keys | env vars | Yes — read directly inside tools |
| Git credentials | OS credential helper | Yes — `execFileSync("git")` |

## 5. Raw ambient-authority footprint (M0 manifest sizing)

Import sites matching `node:{child_process,fs,fs/promises,http,https,net,dgram,dns}` / `Bun.spawn` / `Bun.write`, non-test files:

```text
arcana        52    ← M1 target surface (CLI agent)
engine        53    ← governed core; many are kernel-side adapters (expected)
core          20    ← future kernel home (fs/process/net primitives live here)
tui           23
cron        2 · enterprise 1 · http-recorder 1 · memory 1 · ml 1 · plugin 1 · skills 1
```

≈152 sites total. Engine/core counts are expected to survive as kernel-owned adapters; the arcana-package count is the migration surface.

## 6. Contrast — what "governed" looks like (engine session)

`packages/engine/src/session/tools.ts` mounts the real stack:

- `authorizeAndExecuteEffect` (`@arcana/core/capability/pep`) at the two effect funnels (line 768 main tools, 973 MCP)
- `SqliteGrantStore` + `SessionPolicyProvider` (capability grants with expiry/depth)
- Scoped approvals persisted per-workspace (`.arcana/approvals.db`), 5-minute TTL, parked-call approval gates, desktop/operator routing
- IntentRuntime authority binding + epistemic event store

The migration question for M1 is therefore not "build mediation" — it is **"route `arcana run`'s effects into this existing machinery"** (or deprecate the parallel runner). Per the pre-committed rule (plan §8.1): `arcana run` shares no AgentRunner with the engine — it is a fully parallel runner — so the trace's initial recommendation is **client-ization or deprecation of the parallel runner, not a second mediation implementation**.

## 7. Immediate risks observed (feed M0/M1 backlog)

1. `write`/`edit` accept arbitrary absolute paths; with no `--sandbox` and no `--proof`, an instructed or injected write lands anywhere the user can write.
2. `git_commit`/`git_autocommit` execute signed-off commits with no exact-request record on the default path.
3. `skill_create` writes into skill load directories — a self-prompt-injection persistence vector that no gate inspects today.
4. `env_install` performs `chmod +x` and test-file writes in system locations under heuristic-only control.
5. Provider API keys sit as plain fields on the runner config reachable by every tool closure (secret-use class has no boundary).
6. The dangerous-command check keys on tool names `"shell"/"bash"` which are never registered — dead defense for the one class it was written for.

## 8. Disposition (per pre-committed rule)

Finding #1 confirmed ⇒ M1 proceeds as **ProcessExecution vertical slice**, with the parallel-runner disposition decided during M0 exit: prefer routing `arcana run` onto engine-session governance; if the runner's REPL semantics block that, gate the runner behind the kernel adapters rather than growing RunProof-policy gates. No new mediation implementations outside `@arcana/core/capability`.
