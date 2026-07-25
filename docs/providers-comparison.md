---
title: Providers Comparison
date: 2026-07-24
status: current
type: reference
tags:
  - providers
  - llm
  - comparison
  - pricing
  - routing
aliases:
  - LLM Providers
  - Provider Guide
cssclasses:
  - wide-page
---

# Providers Comparison

Arcana supports 33+ LLM providers via BYOK (Bring Your Own Key). This document compares providers by cost, speed, quality, and recommended use cases to help you choose the right model.

> **⚠️ Note:** Pricing and speed figures are estimates as of July 2026. Check each provider's pricing page for current rates — costs change frequently.

## Quick Decision Matrix

| Provider | Best For | Cost Tier | Speed | Quality | Context Window |
|----------|----------|-----------|-------|---------|----------------|
| **OpenAI** | General coding, multimodal | $$  | Fast | High | 128K–1M |
| **Anthropic** | Long context, analysis | $$$ | Fast | Very High | 200K |
| **Google Gemini** | Large context, multimodal | $   | Fast | High | 1M–2M |
| **xAI (Grok)** | Real-time info, coding | $$  | Fast | High | 128K |
| **Azure OpenAI** | Enterprise, compliance | $$$ | Fast | High | 128K–1M |
| **Amazon Bedrock** | AWS ecosystem, enterprise | $$$ | Medium | High | 200K |
| **Groq** | Ultra-fast inference | $   | Very Fast | Good | 128K |
| **Cohere** | RAG, enterprise search | $$  | Medium | Good | 128K |
| **Mistral** | European compliance, cost | $   | Fast | Good | 128K |
| **Together AI** | Open models, cost | $   | Fast | Good | 128K |
| **Perplexity** | Web-augmented search | $$  | Medium | Good | 128K |
| **DeepInfra** | Open models, cost | $   | Fast | Good | 128K |
| **Cerebras** | Ultra-fast inference | $   | Very Fast | Good | 128K |
| **Alibaba (Qwen)** | Chinese language, cost | $   | Fast | Good | 128K |
| **OpenRouter** | Multi-model routing | $$  | Varies | Varies | Varies |
| **GitHub Copilot** | IDE integration | $   | Fast | Good | 128K |
| **Venice** | Privacy-focused | $$  | Medium | Good | 128K |
| **Cloudflare** | Edge inference | $   | Fast | Good | 128K |
| **Vertex AI** | Google Cloud enterprise | $$$ | Fast | High | 1M+ |

## Provider Details

### Tier 1: Premium (Best Quality)

#### OpenAI

```sh
export OPENAI_API_KEY=sk-...
```

| Model | Context | Output | Cost (per 1M tokens) | Speed |
|-------|---------|--------|----------------------|-------|
| gpt-4o | 128K | 16K | $2.50 / $10.00 | Fast |
| gpt-4o-mini | 128K | 16K | $0.15 / $0.60 | Very Fast |
| o3 | 200K | 100K | $10.00 / $40.00 | Medium |
| gpt-4.1 | 1M | 32K | $2.00 / $8.00 | Fast |

**Best for:** General coding, multimodal tasks, tool calling, production workloads.

#### Anthropic

```sh
export ANTHROPIC_API_KEY=sk-ant-...
```

| Model | Context | Output | Cost (per 1M tokens) | Speed |
|-------|---------|--------|----------------------|-------|
| claude-sonnet-4 | 200K | 64K | $3.00 / $15.00 | Fast |
| claude-opus-4 | 200K | 32K | $15.00 / $75.00 | Medium |
| claude-haiku-3.5 | 200K | 8K | $0.80 / $4.00 | Very Fast |

**Best for:** Long-context analysis, code review, nuanced reasoning, safety-sensitive tasks.

#### Google Gemini

```sh
export GEMINI_API_KEY=...
```

| Model | Context | Output | Cost (per 1M tokens) | Speed |
|-------|---------|--------|----------------------|-------|
| gemini-2.5-pro | 1M | 64K | $1.25 / $10.00 | Fast |
| gemini-2.5-flash | 1M | 64K | $0.15 / $0.60 | Very Fast |
| gemini-2.0-flash | 1M | 8K | $0.10 / $0.40 | Very Fast |

**Best for:** Massive context windows, multimodal, cost-effective large-scale processing.

### Tier 2: Fast & Cost-Effective

#### xAI (Grok)

```sh
export XAI_API_KEY=...
```

| Model | Context | Output | Cost (per 1M tokens) | Speed |
|-------|---------|--------|----------------------|-------|
| grok-3 | 128K | 16K | $3.00 / $15.00 | Fast |
| grok-3-mini | 128K | 16K | $0.30 / $0.50 | Very Fast |

**Best for:** Real-time information, coding, fast inference at moderate cost.

#### Groq

```sh
export GROQ_API_KEY=...
```

| Model | Context | Output | Cost (per 1M tokens) | Speed |
|-------|---------|--------|----------------------|-------|
| llama-3.3-70b | 128K | 8K | $0.59 / $0.79 | Ultra Fast |
| mixtral-8x7b | 32K | 8K | $0.24 / $0.24 | Ultra Fast |

**Best for:** Ultra-low latency, high-throughput workloads, cost-sensitive applications.

#### Mistral

```sh
export MISTRAL_API_KEY=...
```

| Model | Context | Output | Cost (per 1M tokens) | Speed |
|-------|---------|--------|----------------------|-------|
| mistral-large | 128K | 32K | $2.00 / $6.00 | Fast |
| codestral | 128K | 32K | $0.30 / $0.90 | Fast |

**Best for:** European data residency, code generation, cost-effective general tasks.

#### Cerebras

```sh
export CEREBRAS_API_KEY=...
```

| Model | Context | Output | Cost (per 1M tokens) | Speed |
|-------|---------|--------|----------------------|-------|
| llama-3.3-70b | 128K | 8K | $0.60 / $0.60 | Ultra Fast |

**Best for:** Ultra-fast inference (fastest in class), high-throughput batch processing.

### Tier 3: Enterprise & Specialized

#### Amazon Bedrock

```sh
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
```

| Model | Context | Output | Cost (per 1M tokens) | Speed |
|-------|---------|--------|----------------------|-------|
| claude-sonnet-4 | 200K | 64K | $3.00 / $15.00 | Fast |
| titan-text | 128K | 8K | $0.80 / $1.00 | Medium |

**Best for:** AWS-native workloads, HIPAA/SOC2 compliance, VPC isolation.

#### Azure OpenAI

```sh
export AZURE_RESOURCE_NAME=...
export AZURE_API_KEY=...
```

**Best for:** Enterprise compliance, data residency, Azure AD integration, private endpoints.

#### Vertex AI (Google Cloud)

```sh
export GOOGLE_APPLICATION_CREDENTIALS=...
```

**Best for:** GCP-native workloads, enterprise compliance, private API access.

### Tier 4: Routing & Aggregation

#### OpenRouter

```sh
export OPENROUTER_API_KEY=...
```

**Best for:** Multi-model access through a single API key, model comparison, fallback routing.

#### Arcana Proxy

```sh
arcana console login   # or set ARCANA_PROXY_KEY
```

**Best for:** Licensed Arcana users — unified access to multiple providers through a single proxy with usage tracking.

## Cost Optimization Guide

### Budget-Conscious (< $10/month)

| Recommendation | Provider | Model | Monthly Cost (est.) |
|----------------|----------|-------|---------------------|
| General use | Google | gemini-2.5-flash | $1–5 |
| Code generation | Mistral | codestral | $1–3 |
| High throughput | Groq | llama-3.3-70b | $2–5 |

### Professional ($10–50/month)

| Recommendation | Provider | Model | Monthly Cost (est.) |
|----------------|----------|-------|---------------------|
| Balanced quality/cost | OpenAI | gpt-4o-mini | $5–20 |
| Long context | Anthropic | claude-haiku-3.5 | $5–15 |
| Fast iteration | xAI | grok-3-mini | $3–10 |

### Premium ($50+/month)

| Recommendation | Provider | Model | Monthly Cost (est.) |
|----------------|----------|-------|---------------------|
| Best quality | OpenAI | gpt-4o | $20–100 |
| Complex reasoning | Anthropic | claude-sonnet-4 | $30–80 |
| Massive context | Google | gemini-2.5-pro | $15–50 |

## Speed Rankings

Relative speed ranking based on reported throughput and community benchmarks:

| Rank | Provider | Model | Relative Speed |
|------|----------|-------|----------------|
| 1 | Groq | llama-3.3-70b | Ultra Fast |
| 2 | Cerebras | llama-3.3-70b | Ultra Fast |
| 3 | Google | gemini-2.0-flash | Very Fast |
| 4 | xAI | grok-3-mini | Very Fast |
| 5 | OpenAI | gpt-4o-mini | Very Fast |

## Feature Comparison

| Feature | OpenAI | Anthropic | Google | xAI | Groq | Mistral | Cerebras |
|---------|--------|-----------|--------|-----|------|---------|----------|
| Tool calling | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Streaming | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Vision | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| JSON mode | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Structured output | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| System prompts | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Free tier | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ |
| EU data residency | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| 128K+ context | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

## Auto-Detection

Arcana auto-detects your provider from environment variables:

```sh
# Just set a key — Arcana detects it
export OPENAI_API_KEY=sk-...
arcana doctor   # confirms detection
arcana run "hello"  # uses OpenAI automatically
```

Override with CLI flags:

```sh
arcana run --provider anthropic --model claude-sonnet-4 "hello"
```

Or in `~/.arcana/config.json`:

```json
{
  "provider": "openai",
  "model": "gpt-4o"
}
```

## Related Documents

- [[configuration]] — Full config reference and env var mapping
- [[system-architecture]] — LLM provider routing architecture
- [[arcana-comprehensive-guide]] — Complete usage guide

## Changelog

| Date | Change |
|------|--------|
| 2026-07-24 | Initial creation — provider comparison with pricing, speed, quality, and use cases |
