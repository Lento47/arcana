# ⛧ arcana

**Self-improving AI agent CLI** — skills, memory, gateway, coding, and cron in one terminal.

[![npm](https://img.shields.io/npm/v/arcana-ai?label=npm)](https://www.npmjs.com/package/arcana-ai)
[![license](https://img.shields.io/badge/license-MIT%20%2B%20Commercial-blue)](LICENSE)

```sh
arcana doctor            # check system health
arcana run "query"       # one-shot agent session
arcana skills list       # browse 174 available skills
arcana memory sessions   # view past sessions
arcana cron list         # list scheduled jobs
arcana gateway           # start chat bots (Telegram, Discord, Slack, WhatsApp)
arcana learn list        # view accumulated knowledge
```

## Install

```sh
# Quick start (shim downloads binary on first run)
npx arcana-ai

# Or global install
npm install -g arcana-ai
arcana

# From source (dev)
git clone https://github.com/Lento47/arcana && cd arcana
bun install
bun link                 # from packages/arcana/ — creates global `arcana` bin
```

Single binary distribution; source build requires Node.js/Bun dependencies.

## Quick start

```sh
# Set your API key (or use provider-specific env var)
export OPENAI_API_KEY=sk-...

# Verify everything is ready
arcana doctor

# Launch the terminal UI
arcana

# Or use the CLI
arcana run "explain this codebase"

# Browse and resume past sessions
arcana history list
arcana history resume --id <session-id>

# Search memory
arcana memory search --query "deployment config"
```

### Gateway (chat bots)

Configure in `~/.arcana/config.json`:
```json
{
  "provider": "openai",
  "model": "gpt-4o",
  "gateway": {
    "telegram": { "token": "111:xxx" },
    "discord": { "token": "xxx" },
    "slack": { "botToken": "xoxb-xxx", "signingSecret": "xxx" }
  }
}
```

```sh
arcana gateway
```

### Cron

```sh
# Every 4 hours: run code review
arcana cron add "review PRs" "0 */4 * * *" "review open PRs for bugs"

# Daily summary
arcana cron add "daily digest" "@daily" "summarize today's changes"

# List / remove
arcana cron list
arcana cron remove <job-id>
```

## Packages

| Package | Description |
|---------|-------------|
| `@arcana/arcana` | CLI entry + agent runner |
| `@arcana/core` | Effect-based agent runtime, tools, session, database |
| `@arcana/opencode` | Forked OpenCode TUI (SolidJS + OpenTUI) |
| `@arcana/tui` | Terminal UI components, branding, theme |
| `@arcana/ui` | Web UI component library (SolidJS) |
| `@arcana/llm` | Multi-provider LLM routing (OpenAI, Anthropic, Gemini, Bedrock, etc.) |
| `@arcana/sdk` | JS SDK — typed API client + server spawner |
| `@arcana/server` | Hono + Effect HTTP API server |
| `@arcana/gateway` | Chat platform adapters (Telegram, Discord, Slack) |
| `@arcana/memory` | SQLite-backed conversation memory + FTS5 search |
| `@arcana/cron` | Scheduled agent jobs |
| `@arcana/skills` | 174 skill files across 28 categories |
| `@arcana/plugin` | Plugin system (30+ lifecycle hooks) |
| `@arcana/enterprise` | SolidJS/Start web dashboard |
| `@arcana/http-recorder` | VCR-style HTTP cassette recorder for Effect-based testing |

## Deep Dive

Undocumented features that are ready to use:

### `arcana memory` — FTS5-powered session memory

Search past session conversations, extracted facts, artifacts, and skill observations:
```sh
arcana memory search "deployment config"
arcana memory sessions --limit 10
arcana memory facts
arcana memory stats
```

### `arcana history` — browse and resume past sessions

List, inspect, and resume previous agent sessions:
```sh
arcana history list
arcana history show --id <session-id>
arcana history resume --id <session-id>
```

### `arcana learn` — self-improving knowledge pipeline

After sessions with 2+ turns, the agent extracts learnings into wiki files and a map of consciousness:
```sh
arcana learn list
arcana learn show --slug kebab-case-slug
arcana learn moc       # show map of consciousness
```

### `arcana doctor` — system health diagnostics

Check config, API keys, cache files, and runtime environment:
```sh
arcana doctor
```

### Gateway — Telegram, Discord, Slack, and WhatsApp

Four chat platform adapters with per-chat agent sessions. WhatsApp runs via Cloud API webhook (self-hosted HTTP server on port 3100):
```sh
arcana gateway
```

Configure in `~/.arcana/config.json` (see Gateway section below).

### `@arcana/http-recorder` — VCR-style HTTP cassette testing

Record and replay Effect HTTP client traffic with deterministic cassettes. Secret redaction, request matching, auto record/replay mode detection:
```ts
import { HttpRecorder } from "@arcana/http-recorder"
```

### `@arcana/function` — Cloudflare Worker with DurableObjects

Share/sync server using Cloudflare DurableObjects, GitHub App JWT token exchange, R2 storage, and a Feishu-to-Discord bridge. Deployed via SST.

### Cron daemon — scheduled autonomous agents

The cron scheduler runs as a persistent daemon, evaluating jobs every 60s. Jobs persist to a JSON store and integrate with memory:
```sh
arcana cron add "daily-review" --schedule "0 9 * * *" --prompt "review today's changes"
arcana cron list
arcana cron start     # run daemon (blocking)
```

### Plugin lifecycle — 30+ hooks

The plugin system defines hooks for agent, tool, config, auth, chat, permissions, and workspace lifecycle events. Types and examples in `@arcana/plugin`:
```sh
arcana skills list          # 174 available
arcana skills search "git"  # search by keyword
```

## Skills

174 skills across categories: software-development, devops, security, data-science, blockchain, web-development, creative, productivity, and more.

```sh
arcana skills list
arcana skills search "python testing"
```

Skills live in `skills/` and `~/.arcana/skills/`. Each is a `SKILL.md` with YAML frontmatter — add your own.

## Configuration

`~/.arcana/config.json`:
```json
{
  "provider": "openai",
  "model": "gpt-4o",
  "apiKey": "sk-...",
  "dataDir": "~/.arcana/data",
  "memory": { "enabled": true, "maxSessions": 1000 },
  "cron": { "enabled": true, "intervalSeconds": 60 }
}
```

Env overrides: `ARCANA_PROVIDER`, `ARCANA_MODEL`, `ARCANA_API_KEY`, `OPENAI_API_KEY`.

## Dev

```sh
bun install
bun run typecheck   # build status: restored for v0.2.6
bun run build
bun run test
```

### Arcana TUI

```sh
bun run dev:tui          # from repo root
# or
bun run --conditions=browser packages/opencode/src/index.ts
```

### Arcana CLI (standalone, no TUI)

```sh
bun packages/arcana/src/index.ts run "hello"
```

## Themes

7 arcane themes. `⛧ themes` in the TUI or set in `~/.config/arcana/tui.json`:
```json
{ "theme": "dragon" }
```

Themes: arcana (default), bloodmoon, coven, crypt, dragon, lich, wraith.

## Thanks

Arcana builds on incredible open-source work:

- **[OpenCode](https://github.com/anomalyco/opencode)** — the TUI engine (SolidJS + OpenTUI), provider system, tools, and CLI architecture. Arcana began as a fork and would not exist without it.
- **[Hermes Agent](https://github.com/Lento47/hermes-agent)** — autonomous AI agent framework with sandboxing, memory, and multi-provider routing. Powers arcana's non-interactive agent mode.
- **[models.dev](https://models.dev)** — community model catalog powering arcana's provider auto-discovery (200+ models across 33 providers).
- **[Effect](https://effect.website)** — typed functional effect system for reliable concurrency, error handling, and dependency injection.
- **[Bun](https://bun.sh)** — JavaScript runtime, bundler, and compiler. The zero-dependency standalone binary is produced by `Bun.build({ compile })`.
- **[SolidJS](https://solidjs.com)** + **[OpenTUI](https://github.com/opentui/core)** — reactive UI framework + terminal rendering engine.
- **[AI SDK](https://sdk.vercel.ai)** — unified LLM provider interface (OpenAI, Anthropic, Google, Bedrock, and 30+ more).
- 174 skills from the open-source community across 28 categories.

All arcana modifications are MIT-licensed and upstreamable.

## License

Dual-licensed under MIT (non-commercial) and Commercial. See [LICENSE](LICENSE).
