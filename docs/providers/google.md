---
title: Google Gemini Provider Setup
date: 2026-07-24
status: current
type: guide
tags:
  - google
  - gemini
  - provider
  - setup
  - api-key
aliases:
  - Gemini Setup
  - Google AI Configuration
---

# Google Gemini Provider Setup

Google provides Gemini models through Arcana — known for large context windows (1M tokens) and competitive pricing.

## Quick Start

```sh
# 1. Get your API key from https://aistudio.google.com/apikey

# 2. Set the environment variable
export GOOGLE_GENERATIVE_AI_API_KEY=AIza...

# 3. Verify detection
arcana doctor

# 4. Run a session
arcana run "hello"
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_GENERATIVE_AI_API_KEY` | Yes | Your Google AI API key |

Arcana auto-detects Google when this variable is set.

## Config File

```json
{
  "provider": "google",
  "model": "gemini-2.5-pro",
  "utilityModel": "gemini-2.5-flash",
  "apiKey": "AIza..."
}
```

## Supported Models

| Model | Context | Best For | Cost Tier |
|-------|---------|----------|-----------|
| `gemini-2.5-pro` | 1M | Analysis, large codebase tasks | $$ |
| `gemini-2.5-flash` | 1M | Budget, fast, general purpose | $ |
| `gemini-2.0-flash` | 1M | Previous gen fast model | $ |
| `gemini-2.0-flash-lite` | 1M | Ultra-budget tasks | $ |

**Key advantage:** 1M token context window — 5–8× larger than competitors. Ideal for large codebase analysis, long document processing, and multi-file refactors.

## Available Protocols

Google uses the **Gemini API** (`gemini`):

- Native multimodal support (text, images, video, audio)
- Thinking tokens for reasoning tasks
- Function calling with structured schemas
- Prompt caching for repeated contexts

## Custom Base URL

Override for Vertex AI or proxies:

```json
{
  "provider": "google",
  "baseURL": "https://us-central1-aiplatform.googleapis.com/v1/projects/YOUR_PROJECT/locations/us-central1/publishers/google"
}
```

## Provider Options

```json
{
  "provider": "google",
  "providerOptions": {
    "google": {
      "thinkingConfig": {
        "thinkingBudget": 8192
      },
      "safetySettings": "off"
    }
  }
}
```

| Option | Type | Description |
|--------|------|-------------|
| `thinkingConfig.thinkingBudget` | `number` | Token budget for reasoning |
| `safetySettings` | `string` | Safety filter level (`off`, `block_only_high`) |

## Prompt Caching

Google supports context caching for long documents:

```json
{
  "provider": "google",
  "providerOptions": {
    "google": {
      "cacheRetention": "long"
    }
  }
}
```

## Pricing (as of July 2026)

| Model | Input | Output |
|-------|-------|--------|
| Gemini 2.5 Pro | $1.25/M | $10.00/M |
| Gemini 2.5 Flash | $0.15/M | $0.60/M |
| Gemini 2.0 Flash | $0.10/M | $0.40/M |
| Gemini 2.0 Flash Lite | $0.075/M | $0.30/M |

**Budget pick:** Gemini 2.5 Flash offers the best cost-per-token of any frontier model with 1M context.

## Troubleshooting

### "No API key found"

```sh
echo $GOOGLE_GENERATIVE_AI_API_KEY
export GOOGLE_GENERATIVE_AI_API_KEY=AIza...
```

### "API key not valid"

Google API keys are project-scoped. Ensure the Generative Language API is enabled in your Google Cloud project.

### "Model not found"

Run `arcana models google` to list available Gemini models. Model IDs are case-sensitive.

## Related

- [[providers-comparison]] — Compare Google with other providers
- [[model-recommendations]] — Which Gemini model to use for each task
- [[configuration]] — Full config reference
