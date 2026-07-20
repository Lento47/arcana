# arcana-ai

Self-improving AI agent CLI — TUI, skills, memory, and proxy login.

```bash
npx arcana-ai
npm install -g arcana-ai
arcana --version
```

## Quick start

```bash
export OPENAI_API_KEY=sk-...   # or ANTHROPIC_API_KEY, etc.
arcana console login           # optional: pair with https://arcana.otnelhq.com
arcana trust                   # optional: trust project plugins/tools in this repo
arcana run "explain this codebase"
```

## Docs

- User reference: https://arcana.otnelhq.com/docs
- Source: https://github.com/Lento47/arcana

## What's inside

- TUI (command spine, themes) + agent tools
- Skills, memory, sessions, stats
- Console device-flow login and hosted proxy
- CLI: `run`, `console`, `models`, `providers`, `session`, `serve`, `trust`, …

## Update

```bash
npx arcana-ai@latest
# or
npm install -g arcana-ai@latest
```

## Thanks

Arcana builds on open-source giants:

- **[OpenCode](https://github.com/anomalyco/opencode)** — TUI engine, provider system, tools, CLI architecture
- **[Hermes Agent](https://github.com/Lento47/hermes-agent)** — autonomous AI agent framework
- **[Bun](https://bun.sh)** — runtime + compiler producing the standalone binary
- **[models.dev](https://models.dev)** — community model catalog (200+ models, 33 providers)
- **[Effect](https://effect.website)** — typed functional effect system
- **[AI SDK](https://sdk.vercel.ai)** — unified LLM provider interface
- 174 community-contributed skills
