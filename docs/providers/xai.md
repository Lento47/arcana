---
title: xAI (Grok) Provider Setup
date: 2026-07-24
status: current
type: guide
tags:
  - xai
  - grok
  - provider
  - setup
  - api-key
aliases:
  - Grok Setup
  - xAI Configuration
---

# xAI (Grok) Provider Setup

xAI provides Grok models through Arcana — known for real-time information access and conversational ability.

## Quick Start

```sh
# 1. Get your API key from https://console.x.ai/team/default/api-keys

# 2. Set the environment variable
export XAI_API_KEY=xai-...

# 3. Verify detection
arcana doctor

# 4. Run a session
arcana run "hello"
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `XAI_API_KEY` | Yes | Your xAI API key |

Arcana auto-detects xAI when this variable is set.

## Config File

```json
{
  "provider": "xai",
  "model": "grok-3",
  "utilityModel": "grok-3-mini",
  "apiKey": "xai-..."
}
```

## Supported Models

| Model | Context | Best For | Cost Tier |
|-------|---------|----------|-----------|
| `grok-3` | 128K | General purpose, real-time info | $$$ |
| `grok-3-mini` | 128K | Fast reasoning, budget | $$ |
| `grok-3-fast` | 128K | Speed-optimized inference | $$ |
| `grok-2` | 128K | Previous gen (legacy) | $$ |

## Available Protocols

xAI uses two protocols:

1. **Responses API** (`openai-responses`) — Structured output, tool calling. Default for Grok-3+.
2. **OpenAI-Compatible Chat** (`openai-compatible-chat`) — Standard chat completions. Fallback.

Both connect to `https://api.x.ai/v1`.

## Custom Base URL

```json
{
  "provider": "xai",
  "baseURL": "https://your-proxy.example.com/v1"
}
```

## Provider Options

xAI inherits OpenAI-compatible provider options:

```json
{
  "provider": "xai",
  "providerOptions": {
    "openai": {
      "store": false
    }
  }
}
```

## Pricing (as of July 2026)

| Model | Input | Output |
|-------|-------|--------|
| Grok-3 | $3.00/M | $15.00/M |
| Grok-3-mini | $0.30/M | $0.50/M |
| Grok-3-fast | $5.00/M | $25.00/M |

**Note:** xAI offers occasional free credits for new accounts.

## Troubleshooting

### "No API key found"

```sh
echo $XAI_API_KEY
export XAI_API_KEY=xai-...
```

### "Connection refused"

xAI API endpoint is `https://api.x.ai/v1`. Ensure your network can reach this endpoint.

### "Model not found"

Run `arcana models xai` to list available models. xAI model IDs are lowercase.

## Related

- [[providers-comparison]] — Compare xAI with other providers
- [[model-recommendations]] — Which Grok model to use for each task
- [[configuration]] — Full config reference
