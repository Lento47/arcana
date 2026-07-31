---
title: Arcana Comprehensive Guide
date: 2026-07-24
status: current
type: documentation
tags:
  - arcana
  - architecture
  - cli
  - ai-agent
  - documentation
  - guide
aliases:
  - Arcana Guide
  - Arcana Documentation
---

# Arcana Comprehensive Guide

> **Arcana** is a self-improving AI agent CLI that combines skills, memory, gateway, coding, and cron in one terminal. It's a terminal-native runtime for programmable autonomous work.

## Overview

Arcana began as an OpenCode fork. It's now faster, leaner, and more capable — providing a complete AI development toolkit optimized for context window management and autonomous agent workflows.

### Key Capabilities

| Capability | Description |
|------------|-------------|
| **Context Curation** | Automatically curates relevant "skills" into active context within token budgets |
| **Skill Management** | 74+ production-ready skill modules across 28 categories |
| **Output Compression** | Reduces token usage from shell commands (git status, npm test, etc.) |
| **Cross-Session Memory** | SQLite-backed memory with FTS5 search and fact deduplication |
| **Platform Compatibility** | Works with Claude Code, Cursor, Codex, Gemini CLI, Windsurf, Aider |
| **Session Intelligence** | Snapshot, trim, and audit sessions to prevent context bloat |

---

## Architecture

### System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        arcana CLI                                │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │   TUI Shell  │  │  Subcommands │  │   Gateway   │             │
│  │  (OpenTUI)   │  │  (yargs)     │  │  (Telegram) │             │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘             │
│         │                │                │                      │
│  ┌──────▼────────────────▼────────────────▼──────┐             │
│  │              @arcana/engine                     │             │
│  │  ┌─────────────────────────────────────────┐  │             │
│  │  │           Agent Runner                   │  │             │
│  │  │  ┌──────────┐  ┌──────────┐  ┌────────┐ │  │             │
│  │  │  │  Tools   │  │ Guard/   │  │ Memory │ │  │             │
│  │  │  │ Pipeline │  │ Redact   │  │ Store  │ │  │             │
│  │  │  └──────────┘  └──────────┘  └────────┘ │  │             │
│  │  └─────────────────────────────────────────┘  │             │
│  └───────────────────────────────────────────────┘             │
│                                                                 │
│  ┌───────────────────────────────────────────────┐             │
│  │              @arcana/core                       │             │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐    │             │
│  │  │  Effect  │  │ Drizzle  │  │ Provider │    │             │
│  │  │ Runtime  │  │ + SQLite │  │ Adapters │    │             │
│  │  └──────────┘  └──────────┘  └──────────┘    │             │
│  └───────────────────────────────────────────────┘             │
└─────────────────────────────────────────────────────────────────┘
```

### Package Ecosystem

| Package | Description |
|---------|-------------|
| `@arcana/arcana` | CLI subcommand entry — run, skills, cron, memory, gateway, doctor |
| `@arcana/engine` | Main CLI/TUI engine — yargs dispatch, agent runner, tools, permissions |
| `@arcana/core` | Effect-based agent runtime, V2 session, tools, project, database |
| `@arcana/llm` | Schema-first LLM core — typed requests, provider adapters, caching |
| `@arcana/tui` | Terminal UI components, branding, command-spine shell |
| `@arcana/ui` | Web UI component library (SolidJS) — markdown, diffs, dialogs |
| `@arcana/sdk` | JS SDK — typed API client + server spawner |
| `@arcana/server` | Hono + Effect HTTP API server |
| `@arcana/gateway` | Chat platform adapters (Telegram, Discord, Slack, WhatsApp) |
| `@arcana/memory` | SQLite-backed conversation memory + FTS5 search + fact dedup |
| `@arcana/cron` | Scheduled agent jobs (cron-parser, persistent JSON store) |
| `@arcana/skills` | Skill catalog (loaded from `skills/` + `~/.arcana/skills/`) |
| `@arcana/ml` | Signal engine — turn/tool signals, quality gate, AI-slop detector |
| `@arcana/plugin` | Plugin system — hooks for auth, provider, chat, commands, tools |
| `@arcana/enterprise` | SolidJS/Start web dashboard with i18n (en/zh) |
| `@arcana/function` | Cloudflare Worker with DurableObjects for share/sync |
| `@arcana/http-recorder` | VCR-style HTTP cassette recorder for Effect-based testing |

---

## CLI Commands

### Core Commands

```bash
arcana doctor            # Check system health
arcana run "query"       # Agent session / TUI
arcana console login     # Pair with Arcana account (device flow)
arcana trust             # Trust this workspace for project plugins/tools
arcana models            # List available models
arcana providers         # Manage provider credentials
arcana session list      # Past sessions
arcana history list      # Browse past sessions (with resume)
arcana stats             # Usage statistics
arcana serve             # Local headless server (loopback by default)
```

### Memory Commands

```bash
arcana memory search "deployment config"    # Search past sessions
arcana memory sessions --limit 10           # List recent sessions
arcana memory facts                         # Show extracted facts
arcana memory stats                         # Memory statistics
```

### Learning Commands

```bash
arcana learn list                           # List learned knowledge
arcana learn show --slug kebab-case-slug    # Show specific learning
arcana learn moc                            # Map of consciousness
```

### History Commands

```bash
arcana history list                         # List past sessions
arcana history show --id <session-id>       # Show session details
arcana history resume --id <session-id>     # Resume a session
```

### Cron Commands

```bash
# Add scheduled jobs
arcana cron add --name "review PRs" --schedule "0 */4 * * *" --prompt "review open PRs for bugs"
arcana cron add --name "daily digest" --schedule "@daily" --prompt "summarize today's changes"

# Manage jobs
arcana cron list                            # List all jobs
arcana cron remove --id <job-id>            # Remove a job
arcana cron pause --id <job-id>             # Pause a job
arcana cron resume --id <job-id>            # Resume a job
arcana cron run --id <job-id>               # Run job immediately
arcana cron start                           # Run daemon (blocking)
```

### Gateway Commands

```bash
arcana gateway                              # Start chat platform adapters
```

Configure gateway in `~/.arcana/config.json`:
```json
{
  "gateway": {
    "telegram": { "token": "111:xxx" },
    "discord": { "token": "xxx" },
    "slack": { "botToken": "xoxb-xxx", "signingSecret": "xxx" }
  }
}
```

---

## Configuration

### Main Config (`~/.arcana/config.json`)

```json
{
  "$schema": "https://arcana.otnelhq.com/schema/config.json",
  "provider": "openai",
  "model": "gpt-4o",
  "apiKey": "sk-...",
  "dataDir": "~/.arcana/data",
  "skillsDirs": ["~/.arcana/skills"],
  "memory": { "enabled": true, "maxSessions": 1000 },
  "cron": { "enabled": true, "intervalSeconds": 60 },
  "gateway": {
    "telegram": { "token": "xxx" }
  }
}
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `ARCANA_PROVIDER` | Override provider selection |
| `ARCANA_MODEL` | Override model selection |
| `ARCANA_API_KEY` | Override API key |
| `OPENAI_API_KEY` | OpenAI API key |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `GEMINI_API_KEY` | Google Gemini API key |
| `ARCANA_LOG_LEVEL` | Log level (DEBUG, INFO, WARN, ERROR) |
| `ARCANA_CONFIG` | Custom config path |
| `ARCANA_ML_RUNTIME` | Enable ML signal engine (1 to enable) |
| `ARCANA_SERVER_PASSWORD` | Password for non-loopback server access |

### Supported Providers

Arcana auto-detects providers from available API keys using the models.dev catalog (200+ models across 33 providers):

- OpenAI
- Anthropic
- Google Gemini
- Amazon Bedrock
- Azure
- Cohere
- Groq
- Mistral
- xAI
- Perplexity
- Together AI
- DeepInfra
- Cerebras
- OpenRouter
- And many more...

---

## Skills System

### Skill Structure

Skills are structured markdown files with YAML frontmatter stored in:
- `skills/` (project-level)
- `~/.arcana/skills/` (user-level)

Example skill format:
```markdown
---
name: git-workflow
description: Best practices for Git workflows
category: software-development
tags: [git, version-control, workflow]
---

# Git Workflow

## Branch Strategy
...
```

### Skill Categories (28 total)

- Software Development
- DevOps
- Security
- Data Science
- Blockchain
- Web Development
- Creative
- Productivity
- And more...

### Skill Commands

```bash
arcana skills list                           # List available skills
arcana skills search "python testing"        # Search by keyword
arcana install <skill>                       # Install a skill
```

---

## Memory System

### Features

- **SQLite-backed storage** with FTS5 full-text search
- **Fact extraction** and deduplication
- **Confidence decay** for aging memories
- **Cross-session persistence**

### Memory Architecture

```
┌─────────────────────────────────────────┐
│            Memory Store                 │
├─────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐      │
│  │  Sessions   │  │   Facts     │      │
│  │  (FTS5)     │  │  (deduped)  │      │
│  └─────────────┘  └─────────────┘      │
│  ┌─────────────┐  ┌─────────────┐      │
│  │  Artifacts  │  │   Skills    │      │
│  │  (files)    │  │  (usage)    │      │
│  └─────────────┘  └─────────────┘      │
└─────────────────────────────────────────┘
```

---

## Security Features

### PII Redaction Layer

Arcana includes a comprehensive PII redaction system that automatically strips sensitive information from tool output before it reaches LLM context:

| Function | Purpose |
|----------|---------|
| `redactSecrets()` | Strips API keys, tokens, passwords |
| `redactGitEmails()` | Strips personal emails from git output |
| `redactPII()` | Strips IP addresses, phone numbers, street addresses |
| `redactGitAuthorNames()` | Strips personal names from git author fields |

### Workspace Trust

```bash
arcana trust                                 # Trust current workspace
```

A one-time per-repo decision that whitelists the workspace for:
- **Project plugins** — custom plugin hooks defined in the repo
- **Local MCP servers** — Model Context Protocol servers configured in the project
- **Custom tools** — project-specific tool definitions

Once trusted, Arcana will load project-level extensions automatically without prompting. Trust state is stored in `~/.arcana/data/trusted.json`.

### Security Hardening (v0.3.5)

- Gateway allowlists
- WhatsApp signature verification
- Non-loopback server authentication (requires `ARCANA_SERVER_PASSWORD`)
- Environment write sandboxing

See [[security-posture-2026-07-20]] for the full remediation status and [[independent-security-audit-2026-07-14]] for the audit findings.

---

## TUI (Terminal User Interface)

### Themes

7 arcane themes available:

| Theme | Description |
|-------|-------------|
| `arcana` | Default theme |
| `bloodmoon` | Red-tinted theme |
| `coven` | Purple/mystical theme |
| `crypt` | Dark/gothic theme |
| `dragon` | Fiery theme |
| `lich` | Ghostly theme |
| `wraith` | Ethereal theme |

### Theme Configuration

Press `⛧ themes` in TUI or configure in `~/.config/arcana/tui.json`:
```json
{ "theme": "dragon" }
```

### Background Image

Set custom full-screen background (truecolor terminals):
```json
{
  "background": {
    "enabled": true,
    "image": "~/wallpapers/space.png",
    "opacity": 0.4,
    "fit": "cover"
  }
}
```

---

## Development

### Package Manager

Arcana uses Bun as its primary runtime and package manager.

### Development Commands

```bash
bun install                                  # Install dependencies
bun run typecheck                           # Turbo typecheck (16 packages)
bun run lint                                # Oxlint (warnings only)
bun run test                                # Turbo test
bun run ml:eval                             # ML evaluation fixtures
bun run smoke                               # CLI/TUI/ML/web sanity check
bun run verify                              # lint + typecheck + test + ml:eval + build
bun run build                               # Turbo build
```

### TUI Development

```bash
bun run dev:tui                             # From repo root
# or
bun run --cwd packages/engine --conditions=browser packages/engine/src/index.ts
```

### CLI Development (no TUI)

```bash
bun packages/arcana/src/index.ts run "hello"
```

---

## Installation

### Quick Start (Shim)

```bash
npx arcana-ai
```

### Global Install

```bash
npm install -g arcana-ai
arcana
```

### From Source

```bash
git clone https://github.com/Lento47/arcana && cd arcana
bun install
bun link                 # from packages/arcana/ — creates global `arcana` bin
```

---

## Provider Setup

### BYOK (Bring Your Own Key)

```bash
# Set any supported provider key
export OPENAI_API_KEY=sk-...
export ANTHROPIC_API_KEY=sk-ant-...
export GEMINI_API_KEY=...

# Run - Arcana auto-detects
arcana run "explain this codebase"
```

### Arcana Console (Optional)

```bash
arcana console login     # Pair with https://arcana.otnelhq.com
```

---

## Gateway (Chat Bots)

### Supported Platforms

- Telegram
- Discord
- Slack
- WhatsApp (Cloud API webhook)

### Configuration

```json
{
  "gateway": {
    "telegram": { "token": "111:xxx" },
    "discord": { "token": "xxx" },
    "slack": { "botToken": "xoxb-xxx", "signingSecret": "xxx" }
  }
}
```

### Start Gateway

```bash
arcana gateway
```

---

## ML Signal Engine

### Features

- **Quality gate** + expectation contract
- **AI-slop detector** (generic filler detection)
- **Silent revision** (up to one round before showing answer)
- **Turn/tool signals** for routing decisions

### Enable

```bash
ARCANA_ML_RUNTIME=1 arcana run "explain this codebase"
```

### Evaluation

```bash
bun run ml:eval         # 12 eval fixtures, exits non-zero on regression
```

---

## Enterprise Features

### Web Dashboard

Optional SolidJS web app in `packages/enterprise`:

```bash
bun run dev:web         # Vite dev on http://localhost:3002
bun run web:build       # Production build
arcana web --host 127.0.0.1 --port 3000 --open
arcana web --build
arcana doctor --web     # Checks enterprise pkg + source + build + vite + port
```

### i18n Support

- English (en)
- Chinese (zh)

---

## Extensibility

### Plugin System

30+ hooks for:
- Agent lifecycle
- Tool execution
- Configuration
- Authentication
- Chat integration
- Permissions
- Workspace events

### Custom Skills

Create your own skills by adding `.md` files with YAML frontmatter to `skills/` or `~/.arcana/skills/`.

### MCP Integration

```bash
arcana mcp install <server>                 # Install MCP server
```

---

## Related Documents

- [[arcana-updates-v0.3.5]] - Recent updates and changelog
- [[git-pii-redaction]] - PII redaction architecture
- [[security-posture-2026-07-20]] - Security hardening status
- [[independent-security-audit-2026-07-14]] - Independent security audit findings
- [[agent-operating-layer]] - Agent operating layer design
- [[adoption-levels]] - Graduated adoption levels for Arcana features
- [[configuration]] - Detailed configuration reference
- [CONTRACTS.md](../CONTRACTS.md) - Agent contracts for bounded autonomous work

---

## Resources

- **Documentation:** https://arcana.otnelhq.com/docs
- **GitHub:** https://github.com/Lento47/arcana
- **NPM:** https://www.npmjs.com/package/arcana-ai
- **License:** MIT + Commercial
