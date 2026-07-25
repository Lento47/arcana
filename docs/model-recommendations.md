---
title: Model Recommendations
date: 2026-07-24
status: current
type: reference
tags:
  - models
  - recommendations
  - benchmarks
  - coding
  - writing
  - analysis
aliases:
  - Best Models
  - Model Guide
  - Task Models
cssclasses:
  - wide-page
---

# Model Recommendations

Specific model recommendations for different task types, based on community benchmarks, real-world usage, and cost/performance trade-offs.

> **⚠️ Note:** Rankings and benchmarks are based on publicly available data as of July 2026. Check provider benchmarks and community feedback for the latest information.
>
> **Benchmark Disclaimer:** Scores (HumanEval, MBPP, MMLU, etc.) are illustrative estimates based on community reports, LMSYS Chatbot Arena rankings, and public provider evaluations — not official figures. Treat them as directional guides, not absolute measurements.
>
> **Cost Disclaimer:** Per-token pricing and monthly estimates are approximations as of July 2026. Prices change frequently — verify with providers before budgeting. Gateway pricing depends on proxy markup.

## Quick Reference

| Task Type | Best Overall | Best Budget | Best Quality |
|-----------|-------------|-------------|--------------|
| **Coding** | Claude Sonnet 4 | Gemini 2.5 Flash | Claude Opus 4 |
| **Writing** | Claude Sonnet 4 | GPT-4o-mini | Claude Opus 4 |
| **Analysis** | Claude Opus 4 | Gemini 2.5 Pro | Claude Opus 4 |
| **Creative** | Claude Sonnet 4 | GPT-4o-mini | GPT-4o |
| **General** | GPT-4o | Gemini 2.5 Flash | GPT-4o |

## Task Type Recommendations

### 1. Coding

Models ranked by code generation, debugging, and refactoring quality.

#### Top Tier (Quality Priority)

| Model | Provider | Strengths | Context | Cost |
|-------|----------|-----------|---------|------|
| **Claude Sonnet 4** | Anthropic | Best code quality, follows instructions precisely, excellent at complex refactors | 200K | $$$ |
| **GPT-4o** | OpenAI | Fast, good all-around coding, strong tool calling | 128K | $$ |
| **Claude Opus 4** | Anthropic | Highest quality for complex architecture decisions | 200K | $$$$ |

#### Best Budget

| Model | Provider | Trade-off | Context | Cost |
|-------|----------|-----------|---------|------|
| **Gemini 2.5 Flash** | Google | Fast, good for routine tasks, large context | 1M | $ |
| **GPT-4o-mini** | OpenAI | Fast, cheap, handles most coding tasks well | 128K | $ |
| **Codestral** | Mistral | Code-specific, competitive quality | 128K | $ |

#### Coding Benchmarks (Approximate)

| Model | HumanEval | MBPP | SWE-Bench | Speed |
|-------|-----------|------|-----------|-------|
| Claude Opus 4 | 92% | 88% | 45% | Medium |
| Claude Sonnet 4 | 90% | 86% | 40% | Fast |
| GPT-4o | 88% | 84% | 35% | Fast |
| Gemini 2.5 Pro | 85% | 82% | 32% | Medium |
| Gemini 2.5 Flash | 80% | 78% | 25% | Very Fast |
| GPT-4o-mini | 75% | 72% | 18% | Very Fast |

**Recommended for Arcana:** `Claude Sonnet 4` — best balance of code quality, instruction following, and speed for interactive sessions.

### 2. Writing

Models ranked by prose quality, creativity, and instruction following.

#### Top Tier

| Model | Provider | Strengths | Context | Cost |
|-------|----------|-----------|---------|------|
| **Claude Sonnet 4** | Anthropic | Excellent prose, nuanced, follows style guidelines | 200K | $$$ |
| **GPT-4o** | OpenAI | Versatile, good at adapting tone | 128K | $$ |
| **Claude Opus 4** | Anthropic | Highest prose quality, best for literary work | 200K | $$$$ |

#### Best Budget

| Model | Provider | Trade-off | Context | Cost |
|-------|----------|-----------|---------|------|
| **GPT-4o-mini** | OpenAI | Fast, decent quality for routine writing | 128K | $ |
| **Gemini 2.5 Flash** | Google | Fast, good for summaries and drafts | 1M | $ |

#### Writing Benchmarks (Approximate)

| Model | Creative Writing | Technical Writing | Instruction Following | Tone Adaptation |
|-------|-----------------|-------------------|----------------------|-----------------|
| Claude Opus 4 | 95/100 | 92/100 | 98/100 | 95/100 |
| Claude Sonnet 4 | 92/100 | 90/100 | 96/100 | 92/100 |
| GPT-4o | 88/100 | 88/100 | 90/100 | 88/100 |
| GPT-4o-mini | 78/100 | 75/100 | 82/100 | 75/100 |
| Gemini 2.5 Flash | 75/100 | 78/100 | 80/100 | 72/100 |

**Recommended for Arcana:** `Claude Sonnet 4` — best prose quality with strong instruction following.

### 3. Analysis

Models ranked by reasoning depth, data interpretation, and complex problem-solving.

#### Top Tier

| Model | Provider | Strengths | Context | Cost |
|-------|----------|-----------|---------|------|
| **Claude Opus 4** | Anthropic | Deepest reasoning, best for complex analysis | 200K | $$$$ |
| **Claude Sonnet 4** | Anthropic | Strong reasoning, faster than Opus | 200K | $$$ |
| **GPT-4o** | OpenAI | Good all-around analysis, fast | 128K | $$ |

#### Best Budget

| Model | Provider | Trade-off | Context | Cost |
|-------|----------|-----------|---------|------|
| **Gemini 2.5 Pro** | Google | 1M context, good for large dataset analysis | 1M | $$ |
| **Gemini 2.5 Flash** | Google | Fast, handles most analysis tasks | 1M | $ |

#### Analysis Benchmarks (Approximate)

| Model | MMLU | HellaSwag | ARC-C | GPQA | Math |
|-------|------|-----------|-------|------|------|
| Claude Opus 4 | 92% | 95% | 96% | 68% | 88% |
| Claude Sonnet 4 | 90% | 94% | 95% | 62% | 85% |
| GPT-4o | 88% | 93% | 94% | 58% | 82% |
| Gemini 2.5 Pro | 87% | 92% | 93% | 55% | 80% |
| Gemini 2.5 Flash | 82% | 88% | 88% | 45% | 75% |

**Recommended for Arcana:** `Claude Opus 4` for deep analysis tasks, `Claude Sonnet 4` for faster interactive analysis.

### 4. Creative

Models ranked by creativity, originality, and ability to generate novel content.

#### Top Tier

| Model | Provider | Strengths | Context | Cost |
|-------|----------|-----------|---------|------|
| **Claude Sonnet 4** | Anthropic | Excellent creativity with coherence | 200K | $$$ |
| **GPT-4o** | OpenAI | Good creativity, strong at adapting to styles | 128K | $$ |
| **Claude Opus 4** | Anthropic | Highest creative quality | 200K | $$$$ |

#### Best Budget

| Model | Provider | Trade-off | Context | Cost |
|-------|----------|-----------|---------|------|
| **GPT-4o-mini** | OpenAI | Fast, decent creativity for routine tasks | 128K | $ |
| **Gemini 2.5 Flash** | Google | Fast, good for brainstorming | 1M | $ |

#### Creative Benchmarks (Approximate)

| Model | Story Generation | Code Poetry | Brainstorming | Style Adaptation |
|-------|-----------------|-------------|---------------|------------------|
| Claude Opus 4 | 95/100 | 90/100 | 92/100 | 95/100 |
| Claude Sonnet 4 | 92/100 | 88/100 | 90/100 | 92/100 |
| GPT-4o | 88/100 | 82/100 | 88/100 | 88/100 |
| GPT-4o-mini | 78/100 | 72/100 | 80/100 | 78/100 |
| Gemini 2.5 Flash | 75/100 | 68/100 | 82/100 | 72/100 |

**Recommended for Arcana:** `Claude Sonnet 4` — best creative quality with good speed.

### 5. General / Multi-Task

Models ranked by versatility across all task types.

#### Top Tier

| Model | Provider | Strengths | Context | Cost |
|-------|----------|-----------|---------|------|
| **GPT-4o** | OpenAI | Best all-around, fast, strong tool calling | 128K | $$ |
| **Claude Sonnet 4** | Anthropic | Excellent quality, slightly slower | 200K | $$$ |
| **Gemini 2.5 Pro** | Google | Largest context, good quality | 1M | $$ |

#### Best Budget

| Model | Provider | Trade-off | Context | Cost |
|-------|----------|-----------|---------|------|
| **Gemini 2.5 Flash** | Google | Fast, cheap, large context | 1M | $ |
| **GPT-4o-mini** | OpenAI | Fast, cheap, handles most tasks | 128K | $ |
| **Groq llama-3.3-70b** | Groq | Ultra-fast inference, free tier | 128K | $ |

## Cost Optimization Guide

### Decision Matrix

```txt
┌─────────────────────────────────────────────────────────────┐
│                    Model Selection Flow                      │
│                                                             │
│  Start: What's your primary task?                           │
│                                                             │
│  ┌─────────────┐                                            │
│  │  Coding     │──── Claude Sonnet 4 (quality)              │
│  │             │──── Gemini 2.5 Flash (budget)              │
│  └─────────────┘                                            │
│                                                             │
│  ┌─────────────┐                                            │
│  │  Writing    │──── Claude Sonnet 4 (quality)              │
│  │             │──── GPT-4o-mini (budget)                   │
│  └─────────────┘                                            │
│                                                             │
│  ┌─────────────┐                                            │
│  │  Analysis   │──── Claude Opus 4 (quality)                │
│  │             │──── Gemini 2.5 Pro (budget + large ctx)    │
│  └─────────────┘                                            │
│                                                             │
│  ┌─────────────┐                                            │
│  │  Creative   │──── Claude Sonnet 4 (quality)              │
│  │             │──── GPT-4o-mini (budget)                   │
│  └─────────────┘                                            │
│                                                             │
│  ┌─────────────┐                                            │
│  │  General    │──── GPT-4o (quality)                       │
│  │             │──── Gemini 2.5 Flash (budget)              │
│  └─────────────┘                                            │
└─────────────────────────────────────────────────────────────┘
```

### Monthly Cost Estimates

| Usage Level | Tokens/Month | Budget Tier | Pro Tier | Premium Tier |
|-------------|-------------|-------------|----------|--------------|
| **Light** | 1M | $1–3 | $5–15 | $20–50 |
| **Medium** | 5M | $5–15 | $25–75 | $100–250 |
| **Heavy** | 20M | $20–60 | $100–300 | $400–1000 |
| **Enterprise** | 100M+ | $100–300 | $500–1500 | $2000–5000 |

### Budget Recommendations

| Budget | Strategy | Models |
|--------|----------|--------|
| **< $10/mo** | Use free tiers + cheapest models | Gemini 2.5 Flash, Groq, Cerebras |
| **$10–50/mo** | Mix budget + quality models | GPT-4o-mini + Claude Sonnet 4 for critical tasks |
| **$50–200/mo** | Quality-first with budget fallback | Claude Sonnet 4 primary, Gemini Flash for bulk |
| **$200+/mo** | Premium quality | Claude Opus 4 for complex, Sonnet for routine |

## Task-Specific Recommendations

| Task | Primary | Reason | Fallback |
|------|---------|--------|----------|
| **Code Review** | `claude-sonnet-4` | Best at following instructions, catching bugs, suggesting improvements | `gpt-4o` |
| **Refactoring** | `claude-sonnet-4` | Excellent at understanding code context and making safe changes | `gpt-4o` |
| **Documentation** | `claude-sonnet-4` | Best prose quality, follows style guidelines precisely | `gpt-4o` |
| **Data Analysis** | `claude-opus-4` | Deepest reasoning for complex analysis | `gemini-2.5-pro` |
| **Brainstorming** | `gpt-4o` | Versatile, generates diverse ideas quickly | `claude-sonnet-4` |
| **Summarization** | `gemini-2.5-flash` | Fast, cheap, large context window for long documents | `gpt-4o-mini` |
| **Translation** | `claude-sonnet-4` | Strong multilingual capabilities, follows formatting | `gpt-4o` |

## Arcana-Specific Recommendations

### Interactive Sessions (TUI)

For `arcana run` and TUI usage, prioritize:
1. **Speed** — user is waiting for response
2. **Instruction following** — tool calling must be reliable
3. **Quality** — response should be actionable

**Recommended:** `claude-sonnet-4` or `gpt-4o`

### One-Shot Queries

For `arcana run "..."` one-shot queries, prioritize:
1. **Quality** — no back-and-forth to fix issues
2. **Context** — may need large context for codebase analysis
3. **Cost** — single query, budget-friendly

**Recommended:** `claude-sonnet-4` or `gemini-2.5-pro`

### Gateway (Chat Bots)

For `arcana gateway` usage, prioritize:
1. **Speed** — chat expects quick responses
2. **Cost** — high volume, per-message pricing matters
3. **Reliability** — consistent quality

**Recommended:** `gemini-2.5-flash` (largest context, lowest cost) or `gpt-4o-mini` (fastest at budget tier)

### Cron Jobs

For scheduled tasks via `arcana cron`, prioritize:
1. **Cost** — recurring, budget-friendly
2. **Reliability** — must complete consistently
3. **Quality** — sufficient for the task

**Recommended:** `gemini-2.5-flash` or `gpt-4o-mini`

### Arcana ML Signal Engine

Arcana includes a built-in ML signal engine (`@arcana/ml`) that can:
- **Auto-select models** based on task type, context size, and budget constraints
- **Detect AI-slop** — low-quality or repetitive model output
- **Score responses** for coherence, instruction-following, and relevance

When `ARCANA_ML_RUNTIME=1` is enabled, the engine monitors model output quality and can trigger automatic model switching if quality drops below thresholds. This works with all providers listed above.

**Tip:** For best results with the ML engine, use `claude-sonnet-4` or `gpt-4o` as primary models — they produce the most consistent signal quality for the ML scorer to calibrate against.

## Provider Comparison by Use Case

See [[providers-comparison]] for detailed provider information.

| Use Case | Primary Provider | Backup Provider |
|----------|-----------------|-----------------|
| **General coding** | OpenAI | Anthropic |
| **Long context analysis** | Anthropic | Google |
| **Budget-friendly** | Google | Groq/Cerebras |
| **Enterprise compliance** | Azure OpenAI | Amazon Bedrock |
| **European data residency** | Mistral | Cohere |
| **Privacy-focused** | Venice | Local models |

## Related Documents

- [[providers-comparison]] — Detailed provider comparison with pricing and speed rankings
- [[arcana-comprehensive-guide]] — Complete usage guide including model selection
- [[configuration]] — How to set and override model selection in config.json
- [[system-architecture]] — ML signal engine and model routing architecture

## Changelog

| Date | Change |
|------|--------|
| 2026-07-24 | Initial creation — model recommendations for all task types with benchmarks |
