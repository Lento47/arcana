---
title: Anthropic Provider Setup
date: 2026-07-24
status: current
type: guide
tags:
  - anthropic
  - claude
  - provider
  - setup
  - api-key
aliases:
  - Claude Setup
  - Anthropic Configuration
---

# Anthropic Provider Setup

Anthropic provides Claude models through Arcana — widely regarded as the best coding and instruction-following models.

## Quick Start

```sh
# 1. Get your API key from https://console.anthropic.com/settings/keys

# 2. Set the environment variable
export ANTHROPIC_API_KEY=sk-ant-...

# 3. Verify detection
arcana doctor

# 4. Run a session
arcana run "hello"
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Your Anthropic API key |

Arcana auto-detects Anthropic when this variable is set.

## Config File

```json
{
  "provider": "anthropic",
  "model": "claude-sonnet-4",
  "utilityModel": "claude-haiku-3.5",
  "apiKey": "sk-ant-..."
}
```

## Supported Models

| Model | Context | Best For | Cost Tier |
|-------|---------|----------|-----------|
| `claude-opus-4` | 200K | Deep analysis, complex architecture | $$$$ |
| `claude-sonnet-4` | 200K | Coding, writing, general (recommended) | $$$ |
| `claude-3.5-haiku` | 200K | Budget tasks, fast responses | $ |
| `claude-3-opus` | 200K | Previous-gen premium (legacy) | $$$$ |
| `claude-3-sonnet` | 200K | Previous-gen mid-tier (legacy) | $$ |

**Recommended:** `claude-sonnet-4` — best balance of code quality, instruction following, and speed.

## Available Protocols

Anthropic uses the **Messages API** (`anthropic-messages`):

- Structured content blocks (text, tool-use, images)
- Extended thinking support with `budgetTokens`
- Prompt caching for long system prompts
- Server tool execution (web search, etc.)

## Custom Base URL

Override for proxies or enterprise deployments:

```json
{
  "provider": "anthropic",
  "baseURL": "https://your-proxy.example.com"
}
```

## Provider Options

```json
{
  "provider": "anthropic",
  "providerOptions": {
    "anthropic": {
      "thinking": {
        "type": "enabled",
        "budgetTokens": 10000
      }
    }
  }
}
```

| Option | Type | Description |
|--------|------|-------------|
| `thinking.type` | `"enabled"` | Enable extended thinking |
| `thinking.budgetTokens` | `number` | Token budget for reasoning |
| `cacheRetention` | `string` | Cache duration (`long` for 5min) |

## Prompt Caching

Anthropic supports prompt caching to reduce costs for long system prompts. Enable with:

```json
{
  "provider": "anthropic",
  "providerOptions": {
    "anthropic": {
      "cacheRetention": "long"
    }
  }
}
```

Cache hits reduce input token costs by up to 90%.

## Pricing (as of July 2026)

| Model | Input | Output | Cache Write | Cache Read |
|-------|-------|--------|-------------|------------|
| Claude Opus 4 | $15.00/M | $75.00/M | $18.75/M | $1.50/M |
| Claude Sonnet 4 | $3.00/M | $15.00/M | $3.75/M | $0.30/M |
| Claude 3.5 Haiku | $0.80/M | $4.00/M | $1.00/M | $0.08/M |

## Troubleshooting

### "No API key found"

```sh
echo $ANTHROPIC_API_KEY
export ANTHROPIC_API_KEY=sk-ant-...
```

### "x-api-key header required"

Anthropic uses `x-api-key` header (not `Authorization: Bearer`). Arcana handles this automatically.

### "Model not available"

Some models require specific API access. Check your Anthropic console for model availability.

## Related

- [[providers-comparison]] — Compare Anthropic with other providers
- [[model-recommendations]] — Which Claude model to use for each task
- [[configuration]] — Full config reference
