---
title: OpenAI Provider Setup
date: 2026-07-24
status: current
type: guide
tags:
  - openai
  - provider
  - setup
  - api-key
aliases:
  - GPT-4o Setup
  - OpenAI Configuration
---

# OpenAI Provider Setup

OpenAI provides GPT-4o, GPT-4o-mini, o1, o3, and other models through Arcana.

## Quick Start

```sh
# 1. Get your API key from https://platform.openai.com/api-keys

# 2. Set the environment variable
export OPENAI_API_KEY=sk-...

# 3. Verify detection
arcana doctor

# 4. Run a session
arcana run "hello"
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Yes | Your OpenAI API key |

Arcana auto-detects OpenAI when this variable is set.

## Config File

```json
{
  "provider": "openai",
  "model": "gpt-4o",
  "utilityModel": "gpt-4o-mini",
  "apiKey": "sk-..."
}
```

> **Tip:** Prefer env vars over config file for API keys to avoid committing secrets.

## Supported Models

| Model | Context | Best For | Cost Tier |
|-------|---------|----------|-----------|
| `gpt-4o` | 128K | General purpose, coding, analysis | $$ |
| `gpt-4o-mini` | 128K | Budget tasks, bulk processing | $ |
| `o1` | 200K | Complex reasoning, math | $$$$ |
| `o3` | 200K | Advanced reasoning | $$$$$ |
| `o3-mini` | 200K | Fast reasoning, budget | $$ |
| `o4-mini` | 200K | Latest reasoning model | $$ |

## Available Protocols

OpenAI supports three request protocols in Arcana:

1. **Responses API** (`openai-responses`) — Default for supported models. Structured output, tool calling, reasoning tokens.
2. **WebSocket Responses** (`openai-responses-websocket`) — Persistent connection for lower latency.
3. **Chat Completions** (`openai-chat`) — Fallback for models not supporting Responses API.

Arcana auto-selects the best protocol per model.

## Custom Base URL

Override the API endpoint for proxies or local setups:

```json
{
  "provider": "openai",
  "baseURL": "https://your-proxy.example.com/v1"
}
```

Or via environment:

```sh
export OPENAI_BASE_URL=https://your-proxy.example.com/v1
```

## Provider Options

OpenAI supports additional provider options in config.json:

```json
{
  "provider": "openai",
  "providerOptions": {
    "openai": {
      "store": false,
      "serviceTier": "auto"
    }
  }
}
```

| Option | Type | Description |
|--------|------|-------------|
| `store` | `boolean` | Store responses for audit (default: `false`) |
| `serviceTier` | `string` | Service tier (`auto`, `default`, `flex`) |
| `include` | `string[]` | Response include fields |

## Pricing (as of July 2026)

| Model | Input | Output |
|-------|-------|--------|
| GPT-4o | $2.50/M | $10.00/M |
| GPT-4o-mini | $0.15/M | $0.60/M |
| o1 | $15.00/M | $60.00/M |
| o3 | $10.00/M | $40.00/M |
| o3-mini | $1.10/M | $4.40/M |

## Troubleshooting

### "No API key found"

```sh
# Verify the variable is set
echo $OPENAI_API_KEY

# Re-export if needed
export OPENAI_API_KEY=sk-...
```

### "Rate limit exceeded"

OpenAI has per-minute rate limits. Arcana handles retries automatically with exponential backoff. For higher limits, upgrade your OpenAI plan.

### "Model not found"

Ensure you're using a valid model ID. Run `arcana models openai` to list available models.

## Related

- [[providers-comparison]] — Compare OpenAI with other providers
- [[model-recommendations]] — Which OpenAI model to use for each task
- [[configuration]] — Full config reference
