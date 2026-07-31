---
title: Team Onboarding
date: 2026-07-24
status: current
type: guide
tags:
  - onboarding
  - team
  - checklist
  - setup
  - guide
aliases:
  - Team Setup
  - New User Guide
  - Onboarding Checklist
cssclasses:
  - wide-page
---

# Team Onboarding

A step-by-step checklist for getting your team up and running with Arcana. Each section is designed to be completed in order, with estimated time for each step.

## Prerequisites Checklist

Before starting, ensure each team member has:

| Requirement | How to Check | Notes |
|-------------|--------------|-------|
| Node.js v18+ | `node --version` | Bun v1.1+ recommended (source install only) |
| Terminal emulator | Kitty, iTerm2, WezTerm, or Windows Terminal | For full theme support |
| Git | `git --version` | For workspace trust |
| LLM API key | Any supported provider | See [[providers-comparison]] for options |

## Step 1: Install Arcana (~2 minutes)

Each team member runs one of:

```sh
# Quick start (recommended — shim downloads binary)
npx arcana-ai

# Or global install
npm install -g arcana-ai

# Or from source (contributors)
git clone https://github.com/Lento47/arcana && cd arcana
bun install
bun link
```

**Verify installation:**

```sh
arcana --version
arcana doctor
```

## Step 2: Configure Provider (~1 minute)

Each team member sets their API key:

```sh
# Choose one provider (or more)
export OPENAI_API_KEY=sk-...        # OpenAI
export ANTHROPIC_API_KEY=sk-ant-... # Anthropic
export GEMINI_API_KEY=...           # Google
export XAI_API_KEY=...              # xAI (Grok)
```

**Team decision:** Which provider(s) will the team use? Document the choice here:

```
Primary provider: _______________
Model: _______________
Fallback provider: _______________
```

**Optional: Persistent config**

Create `~/.arcana/config.json` for settings that don't change:

```json
{
  "provider": "openai",
  "model": "gpt-4o"
}
```

See [[configuration]] for all options.

## Step 3: Verify Health (~1 minute)

```sh
arcana doctor
```

Expected output: all checks pass (✅). If any fail:

| Check | Fix |
|-------|-----|
| `API key: not set` | Set the env var for your provider |
| `node_modules: missing` | Run `bun install` from repo root |
| `Models cache: missing` | First launch will auto-fetch — wait 10s |

## Step 4: First Session (~2 minutes)

Run a test session to confirm everything works:

```sh
arcana run "hello, what can you do?"
```

Or launch the full TUI:

```sh
arcana
```

**Verify these work:**
- [ ] Agent responds to prompts
- [ ] Tool calls execute (e.g., file reading)
- [ ] No authentication errors

## Step 5: Trust the Workspace (~1 minute)

For repos with project plugins, MCP servers, or custom tools:

```sh
cd /path/to/your/repo
arcana trust
```

This whitelists the repo so project-level extensions can run. One-time per repo.

**Team decision:** Which repos should be trusted? Common choices:

- [ ] Main application repo
- [ ] Shared libraries/packages
- [ ] Infrastructure/deployment repos
- [ ] Documentation repos

## Step 6: Set Up Shared Skills (~5 minutes)

### Option A: Use built-in skills

```sh
arcana skills list                    # browse all 174+ skills
arcana skills list --query "python"   # search by topic
arcana run --skill git "review changes"  # activate a skill
```

### Option B: Create team skills

Create a shared skills directory in your repo:

```sh
mkdir -p .arcana/skills
```

Create a team skill (e.g., `.arcana/skills/code-review/SKILL.md`):

```markdown
---
name: Team Code Review
description: Code review standards and checklist for our team
---

# Team Code Review

## Standards
- All PRs require 2 approvals
- Run `bun run typecheck` before merging
- No `any` types allowed
- Tests required for new features

## Checklist
- [ ] Types are correct
- [ ] Tests pass
- [ ] Documentation updated
- [ ] Security implications considered
```

### Option C: Install community skills

```sh
# From the command line
npx skills find "python testing"
npx skills add owner/repo --skill skill-name --yes
```

See [[skills]] for full skill authoring guide.

## Step 7: Gateway Setup (Optional, ~10 minutes)

For teams that want Arcana available in chat platforms.

### Telegram

1. Message [@BotFather](https://t.me/BotFather), create a bot
2. Copy the bot token
3. Find your team's Telegram user IDs
4. Configure:

```json
{
  "gateway": {
    "telegram": {
      "token": "111:xxx",
      "allowedUsers": ["12345678", "87654321"]
    }
  }
}
```

### Discord

1. Create app at [discord.com/developers](https://discord.com/developers/applications)
2. Bot → copy token, enable Message Content Intent
3. Invite bot with `Send Messages` + `Read Message History`
4. Configure:

```json
{
  "gateway": {
    "discord": {
      "token": "xxx",
      "allowedChannels": ["987654321"]
    }
  }
}
```

### Slack

1. Create app at [api.slack.com/apps](https://api.slack.com/apps)
2. Add `chat:write`, `channels:history`, `im:history` scopes
3. Install, copy Bot Token (`xoxb-...`) and Signing Secret
4. Enable Event Subscriptions for `message.channels` and `message.im`
5. Configure:

```json
{
  "gateway": {
    "slack": {
      "botToken": "xoxb-xxx",
      "signingSecret": "xxx",
      "allowedChannels": ["C0123ABC"]
    }
  }
}
```

### Start the Gateway

> **Note:** Gateway requires a **Pro** or **Enterprise** license. Run `arcana console login` or set `ARCANA_LICENSE_KEY` before starting.

```sh
arcana gateway
```

See [[gateway]] for full setup details including WhatsApp.

## Step 8: Optional Enhancements

### Pair with Arcana Console

```sh
arcana console login
```

Unlocks usage stats, team features, and the Arcana proxy.

### Enable ML Quality Gate

```sh
ARCANA_ML_RUNTIME=1 arcana run "explain this codebase"
```

### Set Up Cron Jobs

```sh
# Daily code review
arcana cron add --name "daily review" --schedule "0 9 * * *" --prompt "review open PRs for bugs"

# Weekly summary
arcana cron add --name "weekly digest" --schedule "0 9 * * 1" --prompt "summarize this week's changes"
```

See [[cron]] for scheduling options.

## Team Configuration Template

Create a shared `.arcana/team.json` in your repo root (suggested convention):

```json
{
  "team": {
    "name": "Your Team",
    "defaultProvider": "openai",
    "defaultModel": "gpt-4o",
    "trustedSkills": ["code-review", "testing", "security"],
    "gateway": {
      "platform": "slack",
      "channel": "C0123ABC"
    },
    "cron": {
      "dailyReview": "0 9 * * *",
      "weeklyDigest": "0 9 * * 1"
    }
  }
}
```

## Onboarding Checklist Template

Copy this checklist for each new team member:

```markdown
## Onboarding: [Name]

### Setup
- [ ] Installed Arcana (`arcana --version`)
- [ ] Configured API key (`arcana doctor`)
- [ ] Ran first session (`arcana run "hello"`)
- [ ] Trusted workspace (`arcana trust`)

### Team Integration
- [ ] Joined team Slack/Discord channel
- [ ] Reviewed shared skills
- [ ] Tested gateway (if applicable)
- [ ] Read [[quickstart]] and [[arcana-comprehensive-guide]]

### First Week
- [ ] Completed 3 sessions
- [ ] Used 1 skill
- [ ] Asked 1 question in team channel
- [ ] Provided feedback on workflow

Completed by: _______________
Date: _______________
```

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `No provider configured` | Set an API key: `export OPENAI_API_KEY=sk-...` |
| `arcana doctor` fails | Run `bun install` from repo root |
| Gateway won't start | Check allowlists are configured |
| Skill not found | Run `arcana skills list` to see available skills |
| Memory not working | Check `~/.arcana/data/` exists |
| TUI looks broken | Use a modern terminal (Kitty, iTerm2, WezTerm) |

## Next Steps

- [[quickstart]] — Step-by-step getting started tutorial
- [[arcana-comprehensive-guide]] — Complete usage guide
- [[providers-comparison]] — Choose the right LLM provider
- [[configuration]] — Full config reference
- [[skills]] — Create and share team skills
- [[gateway]] — Set up chat bots

## Changelog

| Date | Change |
|------|--------|
| 2026-07-24 | Initial creation — team onboarding checklist |
