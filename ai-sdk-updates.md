# AI SDK Dependency Update Report

**Date:** 2026-08-24
**Scope:** minor + patch upgrades ONLY within each package's current major. Major-version jumps (AI SDK v7 line) are listed for awareness but excluded per instruction.

**Context:** The AI SDK ecosystem shipped a new major (v7 / provider 4.x / provider-utils 5.x) in August 2026. Every `latest` dist-tag therefore points at a major we are NOT taking. All upgrade targets below are the newest same-major release, verified against the npm registry on this date.

---

## Summary table

| Package | Current | Upgrade target | Same-major? | Last publish | Used by |
|---|---|---|---|---|---|
| ai | 6.0.168 | **6.0.264** | yes | 2026-08-21 | arcana (catalog) |
| @ai-sdk/anthropic | 3.0.82 | **3.0.111** | yes | 2026-08-14 | catalog |
| @ai-sdk/openai | 3.0.67 (catalog) / 3.0.53 (engine pin) | **3.0.99** | yes | 2026-08-20 | catalog + engine external |
| @ai-sdk/google | 3.0.73 | **3.0.111** | yes | 2026-08-20 | catalog |
| @ai-sdk/openai-compatible | 2.0.47 (catalog) / 2.0.41 (engine) | **2.0.70** | yes | 2026-08-21 | catalog + engine external |
| @ai-sdk/provider | 3.0.8 | **3.0.15** | yes | 2026-08-11 | core, engine |
| @ai-sdk/provider-utils | 4.0.23 | **4.0.46** | yes | 2026-08-14 | core |
| @ai-sdk/alibaba | 1.0.17 | **1.0.48** | yes | 2026-08-21 | engine |
| @ai-sdk/amazon-bedrock | 4.0.112 | **4.0.159** | yes | 2026-08-20 | engine |
| @ai-sdk/azure | 3.0.49 | **3.0.105** | yes | 2026-08-21 | engine |
| @ai-sdk/cerebras | 2.0.41 | **2.0.76** | yes | 2026-08-21 | engine |
| @ai-sdk/cohere | 3.0.27 | **3.0.55** | yes | 2026-08-14 | engine |
| @ai-sdk/deepinfra | 2.0.41 | **2.0.74** | yes | 2026-08-21 | engine |
| @ai-sdk/gateway | 3.0.104 | **3.0.179** | yes | 2026-08-21 | engine |
| @ai-sdk/google-vertex | 4.0.128 | **4.0.186** | yes | 2026-08-21 | engine |
| @ai-sdk/groq | 3.0.31 | **3.0.60** | yes | 2026-08-14 | engine |
| @ai-sdk/mistral | 3.0.27 | **3.0.59** | yes | 2026-08-20 | engine |
| @ai-sdk/perplexity | 3.0.26 | **3.0.54** | yes | 2026-08-14 | engine |
| @ai-sdk/togetherai | 2.0.41 | **2.0.76** | yes | 2026-08-21 | engine |
| @ai-sdk/vercel | 2.0.39 | **2.0.72** | yes | 2026-08-21 | engine |
| @ai-sdk/xai | 3.0.82 | **3.0.124** | yes | 2026-08-21 | engine |
| @openrouter/ai-sdk-provider | 2.9.0 | **2.10.0** | yes (minor) | 2026-06-26 | engine |
| ai-gateway-provider | 3.1.2 | **3.2.0** | yes (minor) | 2026-06-29 | engine |

All 23 dependencies have same-major upgrades available. None are blocked.

**Intra-repo version skew (flag):** `packages/engine/package.json` pins `@ai-sdk/openai` at **3.0.53** and `@ai-sdk/openai-compatible` at **2.0.41**, both *behind* the catalog versions used elsewhere (3.0.67 / 2.0.47). The engine-external providers load these pinned copies at runtime via node_modules symlinks, so the engine currently runs older OpenAI/openai-compatible code than the catalog intends. Upgrading the catalog entries alone will NOT fix the engine copies — bump the two engine pins in the same PR.

---

## Change summaries

### Core (`ai` 6.0.168 → 6.0.264)
~96 patch releases. Highlights from the v6-line release notes:
- **fix:** prevent duplicate text and reasoning part ids (6.0.264)
- **fix:** prevent exceptions in streaming `onChunk`/`onError` callbacks from terminating the stream or masking provider errors
- **fix:** reject `streamObject` result promises and report failed completion when the provider stream errors
- **fix:** filter preliminary tool outputs when `ignoreIncompleteToolCalls` is enabled
- **fix:** prevent automatic tool execution when a model call ends with an unsafe finish reason
- **fix:** array-backed language model mocks now return configured results in order
- Pulls `@ai-sdk/gateway` 3.0.179 and `provider-utils` fixes transitively.

Changelog: https://github.com/vercel/ai/blob/main/packages/ai/CHANGELOG.md (releases tagged `ai@6.0.x`)

### Provider: Anthropic (@ai-sdk/anthropic 3.0.82 → 3.0.111)
- **fix:** preserve Anthropic server-tool caller metadata in multi-turn conversations
- Dependency refreshes (provider-utils 4.0.46)

Changelog: https://github.com/vercel/ai/blob/main/packages/anthropic/CHANGELOG.md

### Provider: OpenAI (@ai-sdk/openai 3.0.67 → 3.0.99; engine pins 3.0.53)
- **fix:** expand internal parallel tool-call wrappers from the Responses API while preserving stateful continuation and streaming fallbacks
- **feat/fix:** support built-in and provider-defined tools in the Responses `allowedTools` option

Changelog: https://github.com/vercel/ai/blob/main/packages/openai/CHANGELOG.md

### Provider: Google (@ai-sdk/google 3.0.73 → 3.0.111)
- **fix:** inline local JSON Schema references ($ref/$defs) in Google tool and structured-output schemas — relevant if you pass zod-to-schema tool defs with nested refs

Changelog: https://github.com/vercel/ai/blob/main/packages/google/CHANGELOG.md

### Provider: openai-compatible (2.0.47 → 2.0.70)
- **fix:** report truncated chat streams as errors instead of silently ending — affects every OpenAI-compatible route including your `arcana-proxy` council calls

Changelog: https://github.com/vercel/ai/blob/main/packages/openai-compatible/CHANGELOG.md

### Provider: Amazon Bedrock (4.0.112 → 4.0.159)
- **fix:** surface modeled event-stream exceptions (previously swallowed as generic errors)
- **fix:** support `reasoningContent.redactedContent` from the Converse API and replay it on subsequent turns

Changelog: https://github.com/vercel/ai/blob/main/packages/amazon-bedrock/CHANGELOG.md

### Provider: Google Vertex (4.0.128 → 4.0.186)
- Dependency refreshes only (google 3.0.111, openai-compatible 2.0.70); no independent feature notes in range.

Changelog: https://github.com/vercel/ai/blob/main/packages/google-vertex/CHANGELOG.md

### Provider: xAI (3.0.82 → 3.0.124)
- Picks up openai-compatible 2.0.70 truncated-stream fix; no independent changes noted.

Changelog: https://github.com/vercel/ai/blob/main/packages/xai/CHANGELOG.md

### Gateway (@ai-sdk/gateway 3.0.104 → 3.0.179)
- Model settings/catalog updates (multiple backported refreshes)
- **feat:** DeepSeek V4 Flash Vision Exp image-input support

Changelog: https://github.com/vercel/ai/blob/main/packages/gateway/CHANGELOG.md

### Low-level (@ai-sdk/provider 3.0.8 → 3.0.15, @ai-sdk/provider-utils 4.0.23 → 4.0.46)
- provider 3.0.15 is a dependency-bump release; intermediate versions are internal type/transport maintenance with no published notes.
- provider-utils picks up the shared fixes consumed by all providers above (notably the stream-truncation detection).

Changelogs: https://github.com/vercel/ai/blob/main/packages/provider/CHANGELOG.md , .../provider-utils/CHANGELOG.md

### Smaller providers (engine externals)
| Package | Target | Notes in range |
|---|---|---|
| alibaba → 1.0.48 | dep refreshes | changelog via vercel/ai releases (`@ai-sdk/alibaba@1.0.x`) |
| azure → 3.0.105 | dep refreshes | ... |
| cerebras → 2.0.76 | dep refreshes | ... |
| cohere → 3.0.55 | dep refreshes | ... |
| deepinfra → 2.0.74 | dep refreshes | ... |
| groq → 3.0.60 | dep refreshes | ... |
| mistral → 3.0.59 | dep refreshes | ... |
| perplexity → 3.0.54 | dep refreshes | ... |
| togetherai → 2.0.76 | dep refreshes | ... |
| vercel → 2.0.72 | dep refreshes | ... |

These are mostly lockstep dependency-refresh patches off the shared openai-compatible/provider-utils base.

### Third-party providers
- **@openrouter/ai-sdk-provider 2.9.0 → 2.10.0**
  - 2.10.0 (minor): image generation moved to dedicated `/api/v1/images` endpoint — new request/response shape, batch generation up to 10 images, `aspect_ratio` passthrough. Only matters if you use OpenRouter image models.
    - Changelog: https://github.com/OpenRouterTeam/ai-sdk-provider/blob/main/CHANGELOG.md
- **ai-gateway-provider 3.1.2 → 3.2.0**
    - Minor bump; June monorepo activity includes gateway-core sharing refactor, Workers-AI reasoning-block fix (close reasoning before tool calls), maxTokens support for Workers-AI chat. Gateway-provider-specific user-facing notes were sparse in the window.
    - Repo: https://github.com/cloudflare/ai (packages/ai-gateway-provider), tags `ai-gateway-provider@*`

---

## Majors intentionally excluded (awareness)

`ai@7.0.77`, all `@ai-sdk/*` next-majors (anthropic 4.x, google 4.x, openai 4.x, bedrock 5.x, vertex 5.x, provider 4.x, provider-utils 5.x), `@openrouter/ai-sdk-provider@3.0.0`, `ai-gateway-provider@4.0.0`. These correspond to the AI SDK v7 release train (see https://ai-sdk.dev/changelog and the migrate-ai-sdk-v6-to-v7 guide). A coordinated major-bump PR should follow separately.

## Recommended upgrade groups (when you're ready to execute)

1. **Low-risk sweep:** all engine-external providers + gateway + smaller providers (pure dep refreshes).
2. **Core pair:** `ai` + `@ai-sdk/provider` + `@ai-sdk/provider-utils` together (they move in lockstep).
3. **Behavior-relevant providers:** openai-compatible (truncated-stream fix — directly improves council/proxy reliability), anthropic, openai, google, bedrock.
4. **Third-party:** openrouter 2.10.0 only if image-gen via OpenRouter matters; cloudflare gateway-provider at will.

After any group: `bun install`, then `bun test packages/engine packages/arcana` + typecheck, and smoke one live provider call per group.
