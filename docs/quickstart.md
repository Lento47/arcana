---
title: Quickstart Guide
date: 2026-07-24
status: current
type: guide
tags:
  - quickstart
  - getting-started
  - tutorial
  - installation
aliases:
  - Getting Started
  - First Steps
  - Tutorial
cssclasses:
  - wide-page
---

# Quickstart Guide

Get Arcana running in under 5 minutes. This tutorial walks you through installation, configuration, your first session, and exploring the core features.

## Prerequisites

| Requirement | Details |
|-------------|---------|
| **OS** | macOS, Linux, or Windows (WSL/Git Bash/PowerShell) |
| **Node.js** | v18+ (Bun v1.1+ recommended) |
| **LLM API Key** | Any supported provider (OpenAI, Anthropic, Google, etc.) |
| **Terminal** | Kitty, iTerm2, WezTerm, or Windows Terminal for full theme support |

## Step 1: Install Arcana

Choose one installation method:

### Quick start (shim — recommended)

```sh
npx arcana-ai
```

The shim downloads the latest binary on first run. No global install needed.

### Global install

```sh
npm install -g arcana-ai
arcana
```

### From source (contributors)

```sh
git clone https://github.com/Lento47/arcana && cd arcana
bun install
bun link                 # creates global `arcana` bin
```

## Step 2: Set your API key

Arcana supports 33+ LLM providers via BYOK (Bring Your Own Key). Set at least one:

```sh
# OpenAI
export OPENAI_API_KEY=sk-...

# Anthropic
export ANTHROPIC_API_KEY=sk-ant-...

# Google Gemini
export GEMINI_API_KEY=...

# xAI (Grok)
export XAI_API_KEY=...

# Amazon Bedrock
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
```

> 💡 **Tip:** You don't need a config file — just set the env var and go. Arcana auto-detects the provider from your API key.

> Run `arcana doctor` to confirm your key is detected.

### Optional: Write a config file

For persistent settings (provider, model, gateway), create `~/.arcana/config.json`:

```json
{
  "$schema": "https://arcana.otnelhq.com/schema/config.json",
  "provider": "openai",
  "model": "gpt-4o"
}
```

See [[configuration]] for the full config reference.

## Step 3: Run a health check

```sh
arcana doctor
```

You should see something like:

```
  arcana doctor — 5/5 checks pass

  ✅ Bun runtime: v1.1.0
  ✅ node_modules: found
  ✅ Config file: provider=openai, model=gpt-4o
  ✅ API key: set (....abcd)
  ✅ Models cache: /home/user/.cache/arcana/models-dev.json
```

If any check fails, follow the suggested fix (usually setting an API key or running `bun install`).

## Step 4: Start your first session

### Interactive REPL (TUI)

```sh
arcana
```

This launches the full terminal UI with:
- Command Spine shell (Grok-like composer)
- 7 arcane themes (press `⛧ themes` to switch)
- Markdown rendering, syntax highlighting, diffs
- Tool execution with permission gates

Type your question and press Enter:

```
you> explain this codebase
```

### One-shot (CLI only)

```sh
arcana run "what is the project structure?"
```

The agent reads your project files and gives a concise answer.

### Resume a session

```sh
arcana history list              # see past sessions
arcana history resume --id abc123  # continue where you left off
```

## Step 5: Explore core features

### Skills — domain expertise

Arcana has 174+ skills across 28 categories. The agent auto-selects relevant skills, or you can activate one manually:

```sh
# In the TUI:
/skills                          # list all skills
/skill python-testing            # activate a specific skill

# From the CLI:
arcana run --skill git "review my recent changes"
```

Browse skills:

```sh
arcana skills list               # all skills
arcana skills list --query "docker"  # search
arcana skills info --skill "python-testing"  # details
```

See [[skills]] for creating custom skills.

### Memory — conversation recall

Arcana remembers facts across sessions:

```sh
# In the TUI, the agent stores facts automatically.
# You can also store them explicitly:

arcana memory search "deployment config"  # search past sessions
arcana memory sessions --limit 5          # list recent sessions
arcana memory facts                       # view stored facts
arcana memory stats                       # memory statistics
```

See [[session-compaction]] for how long sessions are managed.

### Learning — self-improvement

After conversations with 2+ turns, Arcana extracts learnings:

```sh
arcana learn list                # see extracted learnings
arcana learn show --slug my-topic  # read a specific learning
arcana learn moc                 # map of consciousness
```

### Cron — scheduled agents

Set up recurring tasks:

```sh
# Daily code review at 9am
arcana cron add \
  --name "daily review" \
  --schedule "0 9 * * *" \
  --prompt "review open PRs for bugs"

# Every 4 hours
arcana cron add \
  --name "check PRs" \
  --schedule "0 */4 * * *" \
  --prompt "check for new PRs and summarize"

arcana cron list                 # view scheduled jobs
arcana cron start                # run the scheduler daemon
```

See [[cron]] for full scheduling options.

### Gateway — chat bots

Connect Arcana to Telegram, Discord, Slack, or WhatsApp:

```sh
# Add to ~/.arcana/config.json:
{
  "gateway": {
    "telegram": { "token": "111:xxx", "allowedUsers": ["12345678"] }
  }
}

# Start the gateway
arcana gateway
```

See [[gateway]] for platform-specific setup guides.

## Step 6: Trust your workspace

If your project has custom plugins, MCP servers, or tools:

```sh
arcana trust
```

This whitelists the current repository so project-level extensions can run. Stored in `~/.arcana/trusted-workspaces/`. One-time per repo.

## Step 7: Optional enhancements

### Pair with Arcana Console

```sh
arcana console login             # device flow pairing
```

Unlocks the Arcana proxy, usage stats, and team features. See https://arcana.otnelhq.com.

### Enable ML quality gate

```sh
ARCANA_ML_RUNTIME=1 arcana run "explain this codebase"
```

The ML signal engine detects generic filler and forces specific, verifiable output.

### Run the web dashboard

```sh
bun run dev:web                  # Vite dev server on http://localhost:3002
```

Requires the `@arcana/enterprise` package.

## Common workflows

### Code review

```sh
arcana run --skill git "review my recent changes for bugs"
```

### Debug an error

```sh
arcana run "I'm getting this error: $(cat error.log). What's wrong?"
```

### Generate tests

```sh
arcana run "write tests for src/utils.ts covering edge cases"
```

### Refactor code

```sh
arcana run "refactor the auth module to use Effect instead of try/catch"
```

### Search past sessions

```sh
arcana memory search "how did we fix the database connection issue"
```

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `No provider configured` | Set an API key: `export OPENAI_API_KEY=sk-...` |
| `arcana doctor` shows missing modules | Run `bun install` from the repo root |
| TUI looks broken | Use a modern terminal (Kitty, iTerm2, WezTerm) |
| Memory not working | Check `~/.arcana/data/` exists; run `arcana doctor` |
| Gateway won't start | Ensure allowlists are configured and license is valid |
| `node_modules` missing | Run `bun install` or `npm install` |
| Model not found | Pass `--model` explicitly: `arcana run --model gpt-4o "hello"` |

## Next steps

- [[arcana-comprehensive-guide]] — Complete guide covering all features
- [[configuration]] — Full config reference and environment variables
- [[skills]] — Create custom skills for your workflow
- [[gateway]] — Set up chat bots on Telegram, Discord, Slack, WhatsApp
- [[session-compaction]] — Manage long sessions and context limits
- [[arcana-updates-v0.3.5]] — Recent feature updates

## Changelog

| Date | Change |
|------|--------|
| 2026-07-24 | Initial creation — step-by-step getting started tutorial |
