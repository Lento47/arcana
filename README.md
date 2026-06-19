# ⛧ arcana

**Self-improving AI agent CLI** — skills, memory, gateway, coding, and cron in one terminal.

```sh
arcana                  # launch the TUI
arcana run "query"      # one-shot agent session
arcana run              # interactive REPL (streaming)
arcana skills list      # browse 174 available skills
arcana gateway          # start chat bots (Telegram, Discord, Slack)
arcana cron             # scheduled agent tasks
```

## Install

```sh
git clone <repo-url> arcana && cd arcana
bun install
bun link                 # from packages/arcana/ — creates global `arcana` bin
```

Requires **Bun** ≥1.3. [Get Bun](https://bun.sh).

## Quick start

```sh
# Set your API key (or use provider-specific env var)
export OPENAI_API_KEY=sk-...

# Launch the terminal UI
arcana

# Or use the CLI
arcana run "explain this codebase"
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
bun run typecheck   # 19/20 packages green
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

22 arcane themes. `⛧ themes` in the TUI or set in `~/.config/arcana/tui.json`:
```json
{ "theme": "dragon" }
```

Themes: alchemist, bloodmoon, cauldron, coven, crypt, demon, dragon, fae, golem, graveyard, hex, lich, necromancer, oracle, potion, rune, specter, vampire, werewolf, wraith + arcana (default).

## License

MIT
