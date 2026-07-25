---
title: System Architecture
date: 2026-07-24
status: current
type: architecture
tags:
  - architecture
  - system-design
  - packages
  - data-flow
  - dependency-graph
aliases:
  - Package Architecture
  - System Design
  - Data Flow
cssclasses:
  - wide-page
---

# System Architecture

## Overview

Arcana is a **monorepo with 20+ packages** organized in a layered architecture. The system flows data upward from LLM providers through the core runtime to user-facing surfaces (TUI, CLI, Web). Every privileged operation passes through a governed kernel with security controls, verification, and proof recording.

## Package Dependency Graph

### Layered Architecture

```txt
┌─────────────────────────────────────────────────────────────────────────┐
│                         ENTRY POINTS                                    │
│                                                                         │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐   │
│  │  @arcana/arcana  │    │  @arcana/engine  │    │ @arcana/enterprise│  │
│  │  CLI Entry       │◄───│  TUI + CLI Core  │◄───│  Web Dashboard   │   │
│  │  yargs dispatch  │    │  SolidJS + TUI   │    │  SolidJS + Hono  │   │
│  └──────────────────┘    └──────────────────┘    └──────────────────┘   │
│            │                     │                       │              │
│            ▼                     ▼                       ▼              │
├─────────────────────────────────────────────────────────────────────────┤
│                       PRESENTATION LAYER                                │
│                                                                         │
│  ┌──────────────────┐    ┌──────────────────┐                           │
│  │    @arcana/tui   │    │    @arcana/ui    │                           │
│  │  Terminal UI      │    │  Web Components  │                           │
│  │  OpenTUI + Solid  │    │  SolidJS + i18n  │                           │
│  │  7 themes         │    │  20+ locales     │                           │
│  └──────────────────┘    └──────────────────┘                           │
│            │                       │                                     │
│            ▼                       ▼                                     │
├─────────────────────────────────────────────────────────────────────────┤
│                        SERVICE LAYER                                    │
│                                                                         │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐           │
│  │ @arcana/   │ │ @arcana/   │ │ @arcana/   │ │ @arcana/   │           │
│  │ server     │ │ gateway    │ │ plugin     │ │ sdk        │           │
│  │ Hono+Effect│ │ TG/Discord │ │ 30+ hooks  │ │ JS Client  │           │
│  │ HTTP API   │ │ Slack/WA   │ │ Auth, Tool │ │ + Spawner  │           │
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘           │
│            │            │            │            │                      │
│            ▼            ▼            ▼            ▼                      │
├─────────────────────────────────────────────────────────────────────────┤
│                        CORE RUNTIME                                     │
│                                                                         │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐           │
│  │ @arcana/   │ │ @arcana/   │ │ @arcana/   │ │ @arcana/   │           │
│  │ core       │ │ memory     │ │ cron       │ │ skills     │           │
│  │ Effect+Drizzle│ │ SQLite+FTS5│ │ Scheduler  │ │ Catalog   │           │
│  │ Sessions   │ │ Facts      │ │ Jobs       │ │ SKILL.md   │           │
│  │ Tools, Git │ │ Recall     │ │ Persistent │ │ Discovery  │           │
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘           │
│            │                                                             │
│            ▼                                                             │
├─────────────────────────────────────────────────────────────────────────┤
│                        FOUNDATION LAYER                                  │
│                                                                         │
│  ┌────────────┐ ┌──────────────────────┐ ┌──────────────────────┐      │
│  │ @arcana/   │ │ @arcana/effect-      │ │ @arcana/effect-      │      │
│  │ llm        │ │ drizzle-sqlite       │ │ sqlite-node          │      │
│  │ 33+ LLM    │ │ Effect-Drizzle Bridge│ │ SQLite Node Binding  │      │
│  │ Providers  │ │                      │ │                      │      │
│  │ Protocols  │ │                      │ │                      │      │
│  └────────────┘ └──────────────────────┘ └──────────────────────┘      │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│                      INFRASTRUCTURE                                     │
│                                                                         │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐                          │
│  │ @arcana/   │ │ @arcana/   │ │ @arcana/   │                          │
│  │ http-      │ │ function   │ │ script     │                          │
│  │ recorder   │ │ CF Worker  │ │ Build/Release│                        │
│  │ VCR Casset │ │ + DurableObj│ │ Version Bumps│                        │
│  └────────────┘ └────────────┘ └────────────┘                          │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Workspace Dependency Graph

```txt
Package                          Depends On (workspace:*)
──────────────────────────────── ───────────────────────────────────────
@arcana/arcana (public)        → memory, cron, gateway, ml
@arcana/engine (private)       → arcana, core, llm, ml, plugin, sdk,
                                  server, tui, script
@arcana/core (private)         → llm, effect-drizzle-sqlite,
                                  effect-sqlite-node
@arcana/llm (private)          → (effect)
@arcana/tui (private)          → core, plugin, sdk
@arcana/ui (public)            → core, sdk
@arcana/sdk (public)           → (effect)
@arcana/server (private)       → core
@arcana/gateway (public)       → memory
@arcana/memory (public)        → (zod)
@arcana/cron (public)          → (cron-parser)
@arcana/skills (public)        → (gray-matter, fuzzysort)
@arcana/ml (public)            → (standalone)
@arcana/plugin (public)        → sdk, effect
@arcana/enterprise (private)   → core, sdk, ui
@arcana/function (public)      → (cloudflare)
@arcana/http-recorder (public) → (effect-platform-node)
@arcana/script (public)        → (semver)
```

> **Note:** `private: true` packages are internal-only and not published to npm. Public packages are published under `@arcana/*`.

## Core Data Flow

### Agent Session Flow

The primary data path when a user runs `arcana run "explain this codebase"`:

```txt
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  User    │     │  CLI     │     │  Engine  │     │  Core    │
│  Input   │     │  Entry   │     │  Runtime │     │  Runtime │
└────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘
     │                │                │                │
     │  "explain      │                │                │
     │   codebase"    │                │                │
     ├───────────────►│                │                │
     │                │                │                │
     │                │  spawn engine  │                │
     │                ├───────────────►│                │
     │                │                │                │
     │                │                │  load session  │
     │                │                ├───────────────►│
     │                │                │                │
     │                │                │  session data  │
     │                │                │◄───────────────┤
     │                │                │                │
     │                │                │  ┌─────────────┤
     │                │                │  │ Kernel      │
     │                │                │  │ Contract    │
     │                │                │  └─────────────┤
     │                │                │                │
     │                │                │  build system  │
     │                │                │  context       │
     │                │                ├───────────────►│
     │                │                │                │
     │                │                │  context       │
     │                │                │◄───────────────┤
     │                │                │                │
     │                │                │  ┌─────────────┤
     │                │                │  │ LLM Call    │
     │                │                │  └─────────────┤
     │                │                │                │
     │                │                │  ┌─────────────┤
     │                │                │  │ Tool Exec   │
     │                │                │  │ → Guard     │
     │                │                │  │ → Redact    │
     │                │                │  └─────────────┤
     │                │                │                │
     │                │                │  ┌─────────────┤
     │                │                │  │ ML Signal   │
     │                │                │  │ Quality Gate│
     │                │                │  └─────────────┤
     │                │                │                │
     │                │                │  record proof  │
     │                │                ├───────────────►│
     │                │                │                │
     │                │                │  save session  │
     │                │                ├───────────────►│
     │                │                │                │
     │                │                │  stream to UI  │
     │                │                ├───────────────►│
     │                │                │                │
     │  rendered      │  forward       │  projection    │
     │  response      │  to stdout     │  to TUI        │
     │◄───────────────┤◄───────────────┤◄───────────────┤
     │                │                │                │
```

### LLM Provider Routing

```txt
┌──────────────────────────────────────────────────────────────────────┐
│                    LLM Provider Routing (@arcana/llm)                │
│                                                                      │
│  ┌─────────────┐                                                     │
│  │ User Request│                                                     │
│  └──────┬──────┘                                                     │
│         │                                                            │
│         ▼                                                            │
│  ┌─────────────┐     ┌──────────────────────────────────────────┐    │
│  │ Route       │────►│ Provider Selection                       │    │
│  │ Decision    │     │                                          │    │
│  └─────────────┘     │  ┌────────────────────────────────────┐  │    │
│                      │  │ BYOK (Bring Your Own Key)          │  │    │
│                      │  │  OPENAI_API_KEY  → openai adapter   │  │    │
│                      │  │  ANTHROPIC_API_KEY → anthropic      │  │    │
│                      │  │  GEMINI_API_KEY → google            │  │    │
│                      │  │  + 30 more providers                │  │    │
│                      │  └────────────────────────────────────┘  │    │
│                      │                                          │    │
│                      │  ┌────────────────────────────────────┐  │    │
│                      │  │ Arcana Proxy                       │  │    │
│                      │  │  ARCANA_PROXY_KEY → arcana-proxy   │  │    │
│                      │  └────────────────────────────────────┘  │    │
│                      │                                          │    │
│                      │  ┌────────────────────────────────────┐  │    │
│                      │  │ Model Catalog (200+ models)        │  │    │
│                      │  │  Auto-discovery via env vars       │  │    │
│                      │  └────────────────────────────────────┘  │    │
│                      └──────────────────────────────────────────┘    │
│         │                                                            │
│         ▼                                                            │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │ Protocol Adapters                                            │    │
│  │                                                              │    │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐           │    │
│  │  │ OpenAI Chat │ │ Anthropic   │ │ Gemini      │           │    │
│  │  │             │ │ Messages    │ │             │           │    │
│  │  └─────────────┘ └─────────────┘ └─────────────┘           │    │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐           │    │
│  │  │ OpenAI      │ │ Bedrock     │ │ OpenCompat  │           │    │
│  │  │ Responses   │ │ Converse    │ │             │           │    │
│  │  └─────────────┘ └─────────────┘ └─────────────┘           │    │
│  └──────────────────────────────────────────────────────────────┘    │
│         │                                                            │
│         ▼                                                            │
│  ┌─────────────┐                                                     │
│  │ Typed       │                                                     │
│  │ Response    │                                                     │
│  │ (streaming) │                                                     │
│  └─────────────┘                                                     │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### Tool Execution Pipeline

```txt
┌──────────────────────────────────────────────────────────────────────┐
│                   Tool Execution Pipeline                             │
│                                                                      │
│  ┌─────────────┐                                                     │
│  │ LLM Request │                                                     │
│  │ Tool Call   │                                                     │
│  └──────┬──────┘                                                     │
│         │                                                            │
│         ▼                                                            │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │ Tool Registry (@arcana/engine)                               │    │
│  │                                                              │    │
│  │  Built-in: shell, read, write, edit, git_status, git_diff,  │    │
│  │            git_commit, web_fetch, web_search, todo_write,   │    │
│  │            skill, question, apply_patch, glob, grep         │    │
│  │                                                              │    │
│  │  Plugins:  30+ hooks via @arcana/plugin                      │    │
│  │  MCP:      Model Context Protocol tools                      │    │
│  └──────┬───────────────────────────────────────────────────────┘    │
│         │                                                            │
│         ▼                                                            │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │ Permission Gate (@arcana/core)                               │    │
│  │                                                              │    │
│  │  SecurityContext → PolicyDecision → Permission               │    │
│  │                                                              │    │
│  │  Risk levels: low | medium | high | critical                 │    │
│  │  Modes:       normal | trust | godlike                       │    │
│  └──────┬───────────────────────────────────────────────────────┘    │
│         │                                                            │
│         ▼                                                            │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │ Tool Handler (executeAuthorizedTool)                         │    │
│  │                                                              │    │
│  │  ┌─────────────┐                                             │    │
│  │  │ Execute     │  shell → execSync                           │    │
│  │  │ Tool        │  read  → readFile                           │    │
│  │  │             │  write → writeFile                          │    │
│  │  │             │  git   → runGit                             │    │
│  │  └──────┬──────┘                                             │    │
│  │         │                                                    │    │
│  │         ▼                                                    │    │
│  │  ┌─────────────────────────────────────────────────────┐     │    │
│  │  │ Guard Pipeline (@arcana/agent/guard.ts)             │     │    │
│  │  │                                                     │     │    │
│  │  │  1. redactSecrets()      — API keys, tokens        │     │    │
│  │  │  2. redactGitEmails()    — Personal emails         │     │    │
│  │  │  3. redactPII()          — IP, phone, addresses    │     │    │
│  │  │  4. redactGitAuthorNames() — Personal names        │     │    │
│  │  │  5. detectInjection()    — Prompt injection        │     │    │
│  │  │                                                     │     │    │
│  │  │  Bypassed when: godlike mode                        │     │    │
│  │  └─────────────────────────────────────────────────────┘     │    │
│  │         │                                                    │    │
│  │         ▼                                                    │    │
│  │  ┌─────────────────────────────────────────────────────┐     │    │
│  │  │ Audit Log (redacted output)                         │     │    │
│  │  └─────────────────────────────────────────────────────┘     │    │
│  └──────┬───────────────────────────────────────────────────────┘    │
│         │                                                            │
│         ▼                                                            │
│  ┌─────────────┐                                                     │
│  │ Tool Result │                                                     │
│  │ to LLM     │                                                     │
│  └─────────────┘                                                     │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

## Multi-Surface Architecture

### CLI / TUI / Web Surface Flow

```txt
┌──────────────────────────────────────────────────────────────────────┐
│                    Multi-Surface Architecture                         │
│                                                                      │
│  User Interface Surfaces                                             │
│  ──────────────────────                                              │
│                                                                      │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐              │
│  │   TUI       │    │   CLI       │    │   Web       │              │
│  │   (OpenTUI) │    │   (yargs)   │    │   (SolidJS) │              │
│  │   SolidJS   │    │   stdin/out │    │   Vite+Hono │              │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘              │
│         │                  │                  │                      │
│         │    ┌─────────────┘                  │                      │
│         │    │                                │                      │
│         ▼    ▼                                ▼                      │
│  ┌─────────────────┐              ┌─────────────────┐               │
│  │ @arcana/tui     │              │ @arcana/enterprise│              │
│  │                 │              │                  │               │
│  │ • Command Spine │              │ • SolidJS Router │               │
│  │ • Theme Engine  │              │ • Hono API       │               │
│  │ • Brand Glyphs  │              │ • Nitro Server   │               │
│  │ • Plugin Slots  │              │ • i18n (20 loc)  │               │
│  └────────┬────────┘              └────────┬────────┘               │
│           │                                │                        │
│           └──────────────┬─────────────────┘                        │
│                          │                                          │
│                          ▼                                          │
│                 ┌─────────────────┐                                  │
│                 │ @arcana/engine  │                                  │
│                 │                 │                                  │
│                 │ • Yargs dispatch│                                  │
│                 │ • Agent runner  │                                  │
│                 │ • Tool registry │                                  │
│                 │ • Kernel contract│                                 │
│                 │ • Server (Hono) │                                  │
│                 └────────┬────────┘                                  │
│                          │                                          │
│                          ▼                                          │
│                 ┌─────────────────┐                                  │
│                 │ @arcana/core    │                                  │
│                 │                 │                                  │
│                 │ • Session mgmt  │                                  │
│                 │ • Effect runtime│                                  │
│                 │ • Drizzle+SQLite│                                  │
│                 │ • Tool pipeline │                                  │
│                 └────────┬────────┘                                  │
│                          │                                          │
│                          ▼                                          │
│                 ┌─────────────────┐                                  │
│                 │ @arcana/llm     │                                  │
│                 │                 │                                  │
│                 │ • 33+ providers │                                  │
│                 │ • 6 protocols   │                                  │
│                 │ • Streaming     │                                  │
│                 │ • Tool calling  │                                  │
│                 └─────────────────┘                                  │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### Gateway Integration Flow

```txt
┌──────────────────────────────────────────────────────────────────────┐
│                    Gateway Integration Flow                           │
│                                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐            │
│  │ Telegram │  │ Discord  │  │  Slack   │  │ WhatsApp │            │
│  │ Bot API  │  │    JS    │  │  Bolt    │  │ Cloud API│            │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘            │
│       │              │              │              │                  │
│       └──────────────┼──────────────┼──────────────┘                  │
│                      │              │                                 │
│                      ▼              ▼                                 │
│              ┌───────────────────────────┐                           │
│              │   @arcana/gateway         │                           │
│              │                           │                           │
│              │   Platform Adapters       │                           │
│              │   • Webhook receivers     │                           │
│              │   • Message formatting    │                           │
│              │   • Chat session routing  │                           │
│              └────────────┬──────────────┘                           │
│                           │                                          │
│                           ▼                                          │
│              ┌───────────────────────────┐                           │
│              │   @arcana/memory          │                           │
│              │                           │                           │
│              │   Per-chat sessions       │                           │
│              │   Conversation history    │                           │
│              │   FTS5 search             │                           │
│              └────────────┬──────────────┘                           │
│                           │                                          │
│                           ▼                                          │
│              ┌───────────────────────────┐                           │
│              │   @arcana/core            │                           │
│              │                           │                           │
│              │   Agent execution         │                           │
│              │   Tool pipeline           │                           │
│              │   Guard + redaction       │                           │
│              └───────────────────────────┘                           │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

## Data Persistence

### Storage Architecture

```txt
┌──────────────────────────────────────────────────────────────────────┐
│                    Data Persistence Layer                             │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │ File System (~/.arcana/)                                     │    │
│  │                                                              │    │
│  │  ~/.arcana/config.json        — Provider, model, gateway    │    │
│  │  ~/.arcana/data/              — SQLite databases             │    │
│  │  ~/.arcana/sessions/          — Session logs (JSONL)         │    │
│  │  ~/.arcana/skills/            — User-installed skills        │    │
│  │  ~/.arcana/goals/             — Session goals                │    │
│  │  ~/.arcana/proofs/            — RunProof evidence            │    │
│  │  ~/.arcana/proxy_key          — Arcana proxy license         │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │ SQLite Database (Drizzle ORM)                                │    │
│  │                                                              │    │
│  │  Tables:                                                     │    │
│  │  ├── sessions        — Session metadata + state              │    │
│  │  ├── turns           — Conversation turns                    │    │
│  │  ├── messages        — Individual messages                   │    │
│  │  ├── tool_calls      — Tool invocation records               │    │
│  │  ├── facts           — Extracted facts (FTS5 indexed)        │    │
│  │  ├── learnings       — Self-improvement observations        │    │
│  │  ├── skills          — Skill registry                        │    │
│  │  ├── plugins         — Plugin registry                       │    │
│  │  ├── credentials     — Encrypted provider keys               │    │
│  │  ├── jobs            — Cron job definitions                  │    │
│  │  └── proofs          — RunProof evidence chain               │    │
│  │                                                              │    │
│  │  Search: FTS5 for full-text search on messages + facts       │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │ Memory System (@arcana/memory)                               │    │
│  │                                                              │    │
│  │  FTS5 Index ──── Conversation search                         │    │
│  │  Fact Extraction ──── Structured knowledge                   │    │
│  │  Confidence Decay ──── Relevance scoring                     │    │
│  │  Deduplication ──── Merge similar facts                      │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │ VCR Cassettes (@arcana/http-recorder)                       │    │
│  │                                                              │    │
│  │  Record: HTTP request/response pairs                         │    │
│  │  Replay: Deterministic test execution                        │    │
│  │  Redact: Secrets stripped from cassettes                     │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

## Security Architecture

### Trust Boundaries

```txt
┌──────────────────────────────────────────────────────────────────────┐
│                    Security Trust Boundaries                          │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │ UNTRUSTED ZONE                                               │    │
│  │                                                              │    │
│  │  • LLM Provider API responses                                │    │
│  │  • User input (prompts, commands)                            │    │
│  │  • External tool output (shell, web_fetch)                   │    │
│  │  • Plugin/MCP tool output                                    │    │
│  │  • Git repository content                                    │    │
│  └───────────────────────────┬──────────────────────────────────┘    │
│                              │                                       │
│                              ▼                                       │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │ GUARD PIPELINE (Trust Boundary)                              │    │
│  │                                                              │    │
│  │  redactSecrets() ─── redactGitEmails() ─── redactPII()      │    │
│  │       │                    │                    │            │    │
│  │       ▼                    ▼                    ▼            │    │
│  │  redactGitAuthorNames() ── detectInjection()                 │    │
│  │                              │                               │    │
│  │  All output passes through before reaching LLM context       │    │
│  └───────────────────────────┬──────────────────────────────────┘    │
│                              │                                       │
│                              ▼                                       │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │ TRUSTED ZONE                                                 │    │
│  │                                                              │    │
│  │  • LLM context (system prompts, tool results)                │    │
│  │  • Session history                                           │    │
│  │  • Audit logs                                                │    │
│  │  • UI projection                                             │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  Workspace Trust (arcana trust)                                      │
│  ────────────────────────────────                                    │
│  • Whitelists project plugins/MCP tools per-repo                    │
│  • Stored in ~/.arcana/trusted-workspaces/                          │
│  • One-time decision per repository                                 │
│                                                                      │
│  Godlike Mode                                                       │
│  ─────────────                                                      │
│  • Bypasses ALL guard pipeline checks                               │
│  • User accepts full risk                                           │
│  • Used for: development, testing, expert users                     │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

## Kernel Architecture

### Runtime Law Chain

```txt
┌──────────────────────────────────────────────────────────────────────┐
│                    Kernel Runtime Law                                 │
│                                                                      │
│  Every privileged operation must satisfy this chain:                 │
│                                                                      │
│  ┌─────────────┐                                                     │
│  │   Intent    │  User request or model proposal                     │
│  └──────┬──────┘                                                     │
│         │                                                            │
│         ▼                                                            │
│  ┌─────────────┐                                                     │
│  │ PipelinePlan│  Typed stages instead of wandering loops            │
│  └──────┬──────┘                                                     │
│         │                                                            │
│         ▼                                                            │
│  ┌─────────────┐                                                     │
│  │ EngineAction│  Risk, policy, controls, evidence                   │
│  └──────┬──────┘                                                     │
│         │                                                            │
│         ▼                                                            │
│  ┌─────────────┐                                                     │
│  │ SecurityCtx │  Risk classification + required controls            │
│  └──────┬──────┘                                                     │
│         │                                                            │
│         ▼                                                            │
│  ┌─────────────┐                                                     │
│  │ PolicyDecision│ Allow / deny / require approval                  │
│  └──────┬──────┘                                                     │
│         │                                                            │
│         ▼                                                            │
│  ┌─────────────┐                                                     │
│  │  Permission │  Human approval for high-risk operations            │
│  └──────┬──────┘                                                     │
│         │                                                            │
│         ▼                                                            │
│  ┌─────────────┐                                                     │
│  │CandidateSet │  Multiple solutions scored and ranked               │
│  └──────┬──────┘                                                     │
│         │                                                            │
│         ▼                                                            │
│  ┌─────────────┐                                                     │
│  │MutationAuth │  Proposed → Approved → Applied → Verified           │
│  └──────┬──────┘                                                     │
│         │                                                            │
│         ▼                                                            │
│  ┌─────────────┐                                                     │
│  │  Verifier   │  Evidence-based completion certification           │
│  └──────┬──────┘                                                     │
│         │                                                            │
│         ▼                                                            │
│  ┌─────────────┐                                                     │
│  │  RunProof   │  Durable evidence chain                            │
│  └──────┬──────┘                                                     │
│         │                                                            │
│         ▼                                                            │
│  ┌─────────────┐                                                     │
│  │   TUI       │  Projection of kernel truth (not authority)         │
│  └─────────────┘                                                     │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### Pipeline Types

```txt
┌──────────────────────────────────────────────────────────────────────┐
│                    Pipeline Types                                     │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │ FIX Pipeline                                                 │    │
│  │                                                              │    │
│  │  reproduce → localize → candidates → DiffGate → tests →     │    │
│  │  verifier → proof                                            │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │ FEATURE Pipeline                                             │    │
│  │                                                              │    │
│  │  intent contract → architecture map → plan search →          │    │
│  │  candidates → compat checks → verifier → proof               │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │ SECURITY Pipeline                                            │    │
│  │                                                              │    │
│  │  threat model → abuse cases → secure patch → scans →         │    │
│  │  human review → verifier → proof                             │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │ FORGE Pipeline                                               │    │
│  │                                                              │    │
│  │  baseline → candidate search → benchmark →                   │    │
│  │  property/security checks → verifier → proof                 │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │ MIGRATION Pipeline                                           │    │
│  │                                                              │    │
│  │  architecture map → expand-contract slice → replay checks →  │    │
│  │  shim decay → verifier → proof                               │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │ RESEARCH Pipeline                                            │    │
│  │                                                              │    │
│  │  evidence standard → source strategy → hypotheses →          │    │
│  │  claim verification → proof                                  │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

## ML Signal Engine

### Quality Gate Flow

```txt
┌──────────────────────────────────────────────────────────────────────┐
│                    ML Signal Engine (@arcana/ml)                      │
│                                                                      │
│  ┌─────────────┐                                                     │
│  │ LLM Response│                                                     │
│  └──────┬──────┘                                                     │
│         │                                                            │
│         ▼                                                            │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │ Signal Collection                                            │    │
│  │                                                              │    │
│  │  • Turn signals    — response quality, length, timing        │    │
│  │  • Tool signals    — execution success, error rates          │    │
│  │  • Token signals   — usage patterns, cost                    │    │
│  │  • Semantic signals — topic relevance, specificity           │    │
│  └──────┬───────────────────────────────────────────────────────┘    │
│         │                                                            │
│         ▼                                                            │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │ Quality Gate                                                 │    │
│  │                                                              │    │
│  │  • AI-slop detector — generic filler (best practices,       │    │
│  │    robust, scalable, …)                                      │    │
│  │  • Specificity check — anchored to file/command names        │    │
│  │  • Expectation contracts — verifiable claims                 │    │
│  └──────┬───────────────────────────────────────────────────────┘    │
│         │                                                            │
│         ▼                                                            │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │ Response Pipeline                                            │    │
│  │                                                              │    │
│  │  • Silent revision — up to 1 round before showing answer     │    │
│  │  • Reranking — candidate quality scoring                     │    │
│  │  • Feedback loop — improvement signals                       │    │
│  └──────┬───────────────────────────────────────────────────────┘    │
│         │                                                            │
│         ▼                                                            │
│  ┌─────────────┐                                                     │
│  │  Verified   │                                                     │
│  │  Response   │                                                     │
│  └─────────────┘                                                     │
│                                                                      │
│  Enable: ARCANA_ML_RUNTIME=1                                         │
│  Verify: bun run ml:eval (12 fixtures)                               │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

## Plugin System

### Plugin Architecture

```txt
┌──────────────────────────────────────────────────────────────────────┐
│                    Plugin System (@arcana/plugin)                     │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │ Plugin Registry                                              │    │
│  │                                                              │    │
│  │  Built-in Plugins:                                           │    │
│  │  ├── Auth providers (OAuth, device flow)                     │    │
│  │  ├── Provider adapters (OpenRouter, Bedrock, …)              │    │
│  │  ├── Chat commands (slash commands)                          │    │
│  │  ├── Tool extensions (custom tools)                          │    │
│  │  └── TUI slots (header, footer, panels)                     │    │
│  │                                                              │    │
│  │  External Plugins:                                           │    │
│  │  ├── MCP servers (Model Context Protocol)                   │    │
│  │  ├── Custom skills (SKILL.md files)                          │    │
│  │  └── Project plugins (.arcana/plugins/)                     │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │ 30+ Hook Points                                             │    │
│  │                                                              │    │
│  │  Lifecycle:                                                  │    │
│  │  ├── onStartup / onShutdown                                  │    │
│  │  ├── onSessionCreate / onSessionEnd                          │    │
│  │  └── onConfigLoad / onConfigSave                             │    │
│  │                                                              │    │
│  │  Runtime:                                                    │    │
│  │  ├── onToolRegister / onToolExecute / onToolResult           │    │
│  │  ├── onMessage / onAssistantMessage                          │    │
│  │  ├── onPermissionRequest / onPermissionGrant                 │    │
│  │  └── onModelError / onProviderError                          │    │
│  │                                                              │    │
│  │  UI:                                                         │    │
│  │  ├── renderHeader / renderFooter / renderPanel                │    │
│  │  ├── onKeybind / onCommand                                   │    │
│  │  └── onThemeChange                                           │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

## External Integrations

### Integration Surface Map

```txt
┌──────────────────────────────────────────────────────────────────────┐
│                    External Integrations                              │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │ Version Control                                              │    │
│  │                                                              │    │
│  │  • GitHub — PR creation, issue linking, Actions              │    │
│  │  • GitLab — CI/CD integration                                │    │
│  │  • Git — Local operations (status, diff, commit)             │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │ LLM Providers (33+)                                         │    │
│  │                                                              │    │
│  │  OpenAI, Anthropic, Google, Azure, Bedrock, Groq,           │    │
│  │  Cohere, Mistral, xAI, Together, Perplexity, DeepInfra,     │    │
│  │  Cerebras, Alibaba, Vertex, OpenRouter, GitHub Copilot,     │    │
│  │  Venice, GitLab, Cloudflare, + more                          │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │ Chat Platforms                                               │    │
│  │                                                              │    │
│  │  • Telegram — Bot API webhooks                               │    │
│  │  • Discord — discord.js bot                                  │    │
│  │  • Slack — Bolt framework                                    │    │
│  │  • WhatsApp — Cloud API webhook                              │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │ IDE Extensions                                               │    │
│  │                                                              │    │
│  │  • VS Code — Session panel, sidebar integration              │    │
│  │  • JetBrains — Arcana tool window                            │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │ Cloud & Infrastructure                                      │    │
│  │                                                              │    │
│  │  • Cloudflare — Workers, DurableObjects, R2, KV              │    │
│  │  • Docker — Container-based MCP servers                      │    │
│  │  • Kubernetes — Deployment target                            │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │ Observability                                               │    │
│  │                                                              │    │
│  │  • OpenTelemetry — Traces, metrics                          │    │
│  │  • RunProof — Evidence chain                                 │    │
│  │  • Audit logs — Security events                              │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

## Package Quick Reference

| Package | Purpose | Key Dependencies |
|---------|---------|------------------|
| `@arcana/arcana` | CLI entry point, yargs dispatch | memory, cron, gateway, ml |
| `@arcana/engine` | TUI + CLI core, agent runner | core, llm, ml, plugin, sdk, server, tui |
| `@arcana/core` | Effect runtime, sessions, tools, DB | llm, effect-drizzle-sqlite, effect-sqlite-node |
| `@arcana/llm` | LLM provider adapters, protocols | effect |
| `@arcana/tui` | Terminal UI, themes, command spine | core, plugin, sdk, opentui |
| `@arcana/ui` | Web components, i18n, markdown | core, sdk, solid-js |
| `@arcana/sdk` | JS client, server spawner | effect |
| `@arcana/server` | Hono HTTP API, auth, CORS | core, drizzle-orm, effect |
| `@arcana/gateway` | Telegram/Discord/Slack adapters | memory |
| `@arcana/memory` | SQLite + FTS5, facts, recall | zod |
| `@arcana/cron` | Scheduled jobs, persistent store | cron-parser |
| `@arcana/skills` | Skill catalog, discovery | gray-matter, fuzzysort |
| `@arcana/ml` | Quality gate, AI-slop detector | (standalone) |
| `@arcana/plugin` | 30+ hooks, auth, tools, TUI slots | sdk, effect |
| `@arcana/enterprise` | Web dashboard, SolidJS+Hono | core, sdk, ui |
| `@arcana/function` | CF Worker + DurableObjects | (cloudflare) |
| `@arcana/http-recorder` | VCR HTTP cassettes for testing | effect-platform-node |
| `@arcana/script` | Build/release scripts, version bumps | semver |

## Related Documents

- [[command-spine-ui]] — TUI layout zones and theming
- [[arcana-revolutionary-runtime]] — Runtime law and kernel design
- [[git-pii-redaction]] — Security guard pipeline
- [[security-posture-2026-07-20]] — Security hardening status
- [[arcana-updates-v0.3.5]] — Recent feature updates
- [[arcana-comprehensive-guide]] — Full usage guide
- [[arcana-native-runtime]] — Native runtime identity and authorities
- [[free-quality-routing]] — LLM quality routing

## Changelog

| Date | Change |
|------|--------|
| 2026-07-24 | Initial creation — comprehensive system architecture with ASCII diagrams |
