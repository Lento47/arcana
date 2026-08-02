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

- **Hermes Agent** — autonomous AI agent framework
- **Bun** — runtime + compiler producing the standalone binary
- **models.dev** — community model catalog (200+ models, 33 providers)
- **Effect** — typed functional effect system
- **AI SDK** — unified LLM provider interface
- 174 community-contributed skills
