---
tags: [arcana, tech-stack, effect, solidjs, bun]
date: 2026-09-01
source: ses_fa52c980affeoUPY2HdsfJ8A2o
---
# arcana tech stack

Arcana uses Effect + SolidJS + Bun stack with Drizzle ORM and Hono

Arcana's tech stack: TypeScript 7.x (ESM), Bun 1.3+, Effect (typed DI, concurrency, resource safety), SQLite + Drizzle ORM + FTS5 memory, OpenTUI + SolidJS for TUI, Hono for HTTP, AI SDK 6 with 33+ LLM providers, and Turborepo for builds. The project spans 20+ packages organized into layers including entry (`arcana`, `engine`, `enterprise`).

**Why:** Understanding the full stack is essential for contributing. Effect's typed DI and resource safety are central to the runtime's reliability guarantees.

**How to apply:** When onboarding to arcana, start with the Effect type system and SolidJS patterns before touching the protocol or security layers.
