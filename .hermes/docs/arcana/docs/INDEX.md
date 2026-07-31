---
title: Documentation Index
date: 2026-07-24
status: current
type: index
tags:
  - index
  - navigation
  - wiki
  - search
aliases:
  - All Docs
  - Documentation Map
  - Doc Index
  - Wiki Index
cssclasses:
  - wide-page
---

# Documentation Index

Complete index of all Arcana documentation. Uses Obsidian `[[wiki-links]]` for cross-referencing. Search with FTS5-style queries: prefix matches, boolean operators, and `bm25()` ranking.

> **How to use:** Click any `[[wiki-link]]` to jump to that document. Documents are grouped by category and tagged for search.

---

## Getting Started

| Document | Tags | Description |
|----------|------|-------------|
| [[quickstart]] | `#quickstart` `#setup` `#beginner` | Step-by-step getting started tutorial — 7 steps from install to first session |
| [[arcana-comprehensive-guide]] | `#guide` `#architecture` `#packages` | Complete Arcana guide — architecture, packages, commands, configuration, usage |
| [[onboarding]] | `#onboarding` `#team` `#checklist` | Team onboarding checklist — install, config, trust, skills, gateway |
| [[configuration]] | `#config` `#env-vars` `#settings` | Config file, env vars, data directory, all options reference |

---

## Providers & Models

| Document | Tags | Description |
|----------|------|-------------|
| [[providers-comparison]] | `#providers` `#pricing` `#speed` `#quality` | LLM provider comparison — 33+ providers with cost, speed, quality |
| [[providers/openai]] | `#openai` `#gpt-4o` `#provider` `#setup` | OpenAI setup guide — `OPENAI_API_KEY`, GPT-4o, o1, o3 |
| [[providers/anthropic]] | `#anthropic` `#claude` `#provider` `#setup` | Anthropic setup guide — `ANTHROPIC_API_KEY`, Claude models, caching |
| [[providers/google]] | `#google` `#gemini` `#provider` `#setup` | Google Gemini setup — `GOOGLE_GENERATIVE_AI_API_KEY`, 1M context |
| [[providers/xai]] | `#xai` `#grok` `#provider` `#setup` | xAI Grok setup — `XAI_API_KEY`, OpenAI-compatible |
| [[providers/amazon-bedrock]] | `#aws` `#bedrock` `#provider` `#setup` | AWS Bedrock setup — IAM auth, SigV4, region config |
| [[model-recommendations]] | `#models` `#benchmarks` `#coding` `#writing` | Model recommendations by task — coding, writing, analysis, creative |

---

## Architecture

| Document | Tags | Description |
|----------|------|-------------|
| [[architecture/system-architecture]] | `#architecture` `#data-flow` `#packages` | System architecture — package layers, data flow, kernel, security diagrams |
| [[architecture/database-schema]] | `#database` `#sqlite` `#drizzle` `#fts5` | SQLite schema — Drizzle ORM tables, FTS5 indexes, ER diagrams |
| [[architecture/git-pii-redaction]] | `#security` `#pii` `#redaction` `#git` | Git PII redaction layer — threat model, pipeline, extension points |
| [[architecture/token-kernel-missions]] | `#kernel` `#tokens` `#budget` `#ledger` | Token ledger, budget, context pack contracts |
| [[architecture/free-quality-routing]] | `#routing` `#free-tier` `#quality` | Free-tier model routing algorithm |
| [[architecture/command-spine-ui]] | `#tui` `#command-spine` `#ui` `#openTUI` | Command Spine TUI design |
| [[architecture/arcana-native-runtime]] | `#runtime` `#native` `#identity` | Native runtime identity and authorities |
| [[architecture/arcana-native-migration-operating-model]] | `#runtime` `#migration` `#operating` | Native migration operating model |
| [[architecture/arcana-revolutionary-runtime]] | `#runtime` `#revolutionary` `#design` | Revolutionary runtime design |
| [[architecture/arcana-breaking-change-map]] | `#breaking` `#migration` `#rename` | Required native breaks vs cosmetic rename |
| [[architecture/arcana-durable-execution-memory-context-continuity]] | `#durable` `#execution` `#memory` `#continuity` | Durable execution, prompt queue, memory, context continuity |
| [[architecture/arcana-error-taxonomy]] | `#errors` `#arc-*` `#error-codes` | Arcana error codes and user/internal layers |
| [[architecture/arcana-performance-optimization-foundation]] | `#performance` `#optimization` `#tui` | TUI + runtime perf, shipped surfaces, env knobs |
| [[architecture/arcana-tui-cockpit-64-steps]] | `#tui` `#cockpit` `#aspirational` | Aspirational multi-panel cockpit plan |
| [[architecture/out-of-scope]] | `#scope` `#boundaries` `#exclusions` | Out-of-scope work for Arcana |

---

## Agent Operating Layer

| Document | Tags | Description |
|----------|------|-------------|
| [[agent-operating-layer-index]] | `#aol` `#index` `#agent` | Agent operating layer index |
| [[agent-operating-layer]] | `#aol` `#design` `#agent` | Agent operating layer design |
| [[agent-operating-layer-qa]] | `#aol` `#qa` `#checklist` | AOL QA checklist |
| [[agent-operating-layer-review]] | `#aol` `#review` | AOL review |
| [[agent-operating-layer-evolution]] | `#aol` `#history` `#evolution` | AOL evolution history |

---

## Security

| Document | Tags | Description |
|----------|------|-------------|
| [[independent-security-audit-2026-07-14]] | `#security` `#audit` `#independent` | Full independent security audit |
| [[security-audit-2026-07-14]] | `#security` `#audit` | Security audit |
| [[security-posture-2026-07-20]] | `#security` `#posture` `#status` | Security audit remediation status (I01–I08) |
| [[threat-model]] | `#security` `#threats` `#attack-surface` | Threat model, attack surfaces, risk matrix |
| [[tool-risk-model]] | `#security` `#tools` `#risk` | Tool risk classification per autonomy mode |
| [[trust-boundaries]] | `#security` `#trust` `#boundaries` | What Arcana may read, write, remember, expose |

---

## Skills & Plugins

| Document | Tags | Description |
|----------|------|-------------|
| [[skills]] | `#skills` `#plugins` `#custom` | Skill system — list, search, use, write custom skills |
| [[skill-extension-model]] | `#skills` `#extension` `#design` | Skill extension design |
| [[plugin-extension-model]] | `#plugins` `#extension` `#hooks` | Advanced plugin hooks |
| [[plugin-permissions]] | `#plugins` `#permissions` `#security` | Plugin permission model |
| [[user-space-extension-model]] | `#extensions` `#user-space` `#customization` | User extension model |

---

## Design & Aspirational

| Document | Tags | Status | Description |
|----------|------|--------|-------------|
| [[core-engine-vision]] | `#kernel` `#vision` `#design` | Design | Governed execution kernel, policy, verifier, diff gate |
| [[autonomy-modes]] | `#modes` `#autonomy` `#design` | Concept | Observe → Advise → Ask → Enforce → Locked modes |
| [[agent-contracts]] | `#contracts` `#scope` `#design` | Concept | Bounded work orders with scope, forbidden, success criteria |
| [[run-capsules]] | `#capsules` `#portable` `#design` | Concept | Portable execution records |
| [[memory-receipts]] | `#memory` `#receipts` `#sourcing` | Concept | Sourced, inspectable memory facts |
| [[context-supply-chain]] | `#context` `#provenance` `#design` | Concept | Traceable context provenance |
| [[object-schemas]] | `#schemas` `#draft` `#planning` | Draft | Draft schema shapes for AOL objects |

---

## Memory & Sessions

| Document | Tags | Description |
|----------|------|-------------|
| [[session-compaction]] | `#sessions` `#compaction` `#context` | Auto-compact, hysteresis, config knobs, code map |


---

## Prompts

| Document | Tags | Description |
|----------|------|-------------|
| [[prompt-architecture]] | `#prompts` `#system-prompt` `#assembly` | System prompt assembly, model-specific prompts, base.txt |
| [[prompt-refactoring-summary]] | `#prompts` `#refactoring` `#changes` | Summary of prompt changes |

---

## CLI & Gateway

| Document | Tags | Description |
|----------|------|-------------|
| [[gateway]] | `#gateway` `#telegram` `#discord` `#slack` `#whatsapp` | Chat platform adapters setup |
| [[cron]] | `#cron` `#scheduling` `#daemon` | Scheduled agent jobs |
| [[operations]] | `#operations` `#ci` `#npm` `#release` | Release pipeline, CI, npm publishing |

---

## Examples & Use Cases

| Document | Tags | Description |
|----------|------|-------------|
| [[end-to-end-examples]] | `#examples` `#e2e` `#flows` | E2E flow examples |
| [[progressive-mode-examples]] | `#examples` `#progressive` `#modes` | Progressive mode examples |
| [[case-usage-cookbook]] | `#cookbook` `#patterns` `#usage` | Usage patterns |
| [[free-usage-weekly-session-plan]] | `#free-tier` `#usage` `#plan` | Free-tier usage plan |

---

## Quality & Fixes

| Document | Tags | Description |
|----------|------|-------------|
| [[qa-fixes-2026-07-10]] | `#qa` `#fixes` `#log` | QA fixes log |
| [[resolution-and-recovery]] | `#errors` `#recovery` `#ux` | Error resolution and recovery UX |
| [[verification-records]] | `#verification` `#records` `#spec` | Verification record specification |
| [[route-decisions]] | `#routing` `#decisions` `#spec` | Route decision specification |

---

## TUI & Runtime

| Document | Tags | Description |
|----------|------|-------------|
| [[tui-interface-dialog-mouse-review]] | `#tui` `#mouse` `#review` | TUI dialog mouse interaction review |
| [[tui-runtime-adjacent-risk-audit]] | `#tui` `#risk` `#audit` | TUI runtime adjacent risk audit |
| [[tui-slash-command-audit]] | `#tui` `#slash-commands` `#audit` | TUI slash command audit |
| [[opentui-reference]] | `#tui` `#openTUI` `#reference` | OpenTUI reference |

---

## Updates & Changelogs

| Document | Tags | Description |
|----------|------|-------------|
| [[arcana-updates-v0.3.5]] | `#updates` `#changelog` `#v0.3.5` | Updates v0.3.0–v0.3.5, RunProof, TUI perf, git PII redaction |
| [[contracts-md]] | `#contracts` `#reference` | Contracts reference |
| [[implementation-strengthening-plan]] | `#plan` `#strengthening` `#implementation` | Implementation strengthening plan |
| [[adoption-levels]] | `#adoption` `#levels` `#progression` | Adoption levels |

---

## Vendor Reference

| Document | Tags | Description |
|----------|------|-------------|
| [[vendor/ai-sdk/6.0.168/README.arcana]] | `#vendor` `#ai-sdk` `#reference` | AI SDK 6.0.168 vendored documentation |

---

## Package-Level Docs

| Package | Tags | Description |
|---------|------|-------------|
| [LLM README](../packages/llm/README.md) | `#package` `#llm` `#providers` | Schema-first LLM core — `LLM.request`, providers, caching, routes |
| [LLM AGENTS](../packages/llm/AGENTS.md) | `#package` `#llm` `#architecture` | LLM architecture, route construction, contributor guide |
| [Engine AGENTS](../packages/engine/AGENTS.md) | `#package` `#engine` `#effect` | Effect patterns, module shape, database guide |
| [Core](../packages/core/) | `#package` `#core` `#runtime` | Effect-based agent runtime, tools, session, database |

---

## Related Projects

| Resource | Link | Description |
|----------|------|-------------|
| Public Docs | https://arcana.otnelhq.com/docs | Product reference — install, CLI, proxy APIs |
| Source | [Lento47/arcana-site](https://github.com/Lento47/arcana-site) | Public docs source (`public/docs/`) |
| Console | https://arcana.otnelhq.com | Arcana Console — device login, proxy |

---

## Search (Obsidian)

Obsidian search uses implicit AND for space-separated terms and supports tag filtering. Examples:

| Query | Finds |
|-------|-------|
| `#security` | All security documents |
| `#providers #setup` | Provider setup guides |
| `#architecture #data-flow` | Architecture docs with data flow diagrams |
| `#aol #qa` | Agent operating layer QA |
| `#tui #performance` | TUI performance docs |
| `#models #benchmarks` | Model benchmarks and recommendations |
| `kernel budget` | Token kernel and budget documents (implicit AND) |
| `provider pricing` | Provider pricing comparisons |

---

## Tags Reference

### Topic Tags
`#quickstart` · `#setup` · `#config` · `#providers` · `#models` · `#architecture` · `#security` · `#skills` · `#plugins` · `#tui` · `#prompts` · `#sessions` · `#memory` · `#gateway` · `#cron` · `#qa` · `#examples` · `#operations`

### Provider Tags
`#openai` · `#anthropic` · `#google` · `#gemini` · `#xai` · `#grok` · `#aws` · `#bedrock`

### Concept Tags
`#design` · `#concept` · `#draft` · `#aspirational` · `#aol` · `#kernel` · `#routing` · `#autonomy` · `#contracts` · `#durable`

### Status Tags
`#implemented` · `#design` · `#concept` · `#draft` · `#planning`

---

## Changelog

| Date | Change |
|------|--------|
| 2026-07-24 | Initial creation — comprehensive wiki-linked index of all documentation |
