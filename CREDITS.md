# Credits

Arcana builds on incredible open-source work. This file lists the projects, libraries, and communities that make arcana possible.

## Foundational

- **[OpenCode](https://github.com/anomalyco/opencode)** — the TUI engine (SolidJS + OpenTUI), provider system, tools, and CLI architecture. Arcana began as a fork and would not exist without it.
- **[Hermes Agent](https://github.com/Lento47/hermes-agent)** — autonomous AI agent framework with sandboxing, memory, and multi-provider routing. Powers arcana's non-interactive agent mode.

## Runtime & Language

- **[Bun](https://bun.sh)** — JavaScript runtime, bundler, and compiler. The zero-dependency standalone binary is produced by `Bun.build({ compile })`.
- **[TypeScript](https://www.typescriptlang.org)** — typed JavaScript at scale. Arcana is written in TypeScript 7.x with ECMAScript modules.

## Effect System & Concurrency

- **[Effect](https://effect.website)** — typed functional effect system for reliable concurrency, error handling, and dependency injection.

## UI & Terminal

- **[SolidJS](https://solidjs.com)** — reactive UI framework powering the TUI and web dashboard.
- **[OpenTUI](https://github.com/opentui/core)** — terminal rendering engine.
- **[SolidStart](https://start.solidjs.com)** — full-stack SolidJS framework for the enterprise dashboard.

## LLM & AI

- **[AI SDK](https://sdk.vercel.ai)** — unified LLM provider interface (OpenAI, Anthropic, Google, Bedrock, and 30+ more).
- **[models.dev](https://models.dev)** — community model catalog powering arcana's provider auto-discovery (200+ models across 33 providers).

## Data & Persistence

- **[SQLite](https://sqlite.org)** — embedded SQL database engine for memory, sessions, and proof storage.
- **[Drizzle ORM](https://orm.drizzle.team)** — type-safe SQL ORM and schema management.
- **[FTS5](https://sqlite.org/fts5.html)** — full-text search extension for SQLite, powering memory search.

## Web & API

- **[Hono](https://hono.dev)** — lightweight, fast web framework for the HTTP API server.
- **[Zod](https://zod.dev)** — TypeScript-first schema declaration and runtime validation.

## Build & Tooling

- **[Turborepo](https://turbo.build/repo)** — monorepo build system and cross-package task graph.
- **[oxlint](https://oxc.rs)** — linter used in CI (`bun run lint`).

## Messaging Gateways

- **[Telegram Bot API](https://core.telegram.org/bots/api)** — Telegram adapter.
- **[Discord.js](https://discord.js.org)** — Discord adapter.
- **[Slack SDK](https://slack.dev/node-slack-sdk)** — Slack adapter.
- **[WhatsApp Cloud API](https://developers.facebook.com/docs/whatsapp)** — WhatsApp adapter.

## Community

- 174 skills from the open-source community across 28 categories.
- The many contributors to the libraries above who maintain the foundations arcana is built on.

---

All arcana modifications are MIT-licensed and upstreamable. See [LICENSE](LICENSE) for details.
