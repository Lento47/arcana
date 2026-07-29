# Arcana documentation

## Public user docs

The product reference for install, device login, CLI commands, and proxy APIs lives on the site:

**https://arcana.otnelhq.com/docs**

Source for that page: [Lento47/arcana-site](https://github.com/Lento47/arcana-site) (`public/docs/`).

## In-repo docs (this tree)

| Doc | Audience |
|-----|----------|
| [../README.md](../README.md) | Install, quick start, packages overview |
| [operations.md](./operations.md) | Release pipeline, CI, npm publishing, URL policy |
| [configuration.md](./configuration.md) | Config file, env vars, data directory |
| [gateway.md](./gateway.md) | Chat platform adapters (Telegram, Discord, Slack, WhatsApp) |
| [cron.md](./cron.md) | Scheduled agent jobs |
| [skills.md](./skills.md) | Skill system — list, search, use, write custom skills |
| [session-compaction.md](./session-compaction.md) | Auto-compact, hysteresis, config knobs, code map |
| [prompt-architecture.md](./prompt-architecture.md) | System prompt assembly, model-specific prompts, base.txt |
| [prompt-refactoring-summary.md](./prompt-refactoring-summary.md) | Summary of prompt changes |
| [security-posture-2026-07-20.md](./security-posture-2026-07-20.md) | Security audit remediation status (I01–I08) |
| [independent-security-audit-2026-07-14.md](./independent-security-audit-2026-07-14.md) | Full independent security audit |
| [threat-model.md](./threat-model.md) | Threat model, attack surfaces, risk matrix |
| [tool-risk-model.md](./tool-risk-model.md) | Tool risk classification per autonomy mode |
| [trust-boundaries.md](./trust-boundaries.md) | What Arcana may read, write, remember, expose |
| [verification-records.md](./verification-records.md) | Verification record specification |
| [route-decisions.md](./route-decisions.md) | Route decision specification |
| [quickstart.md](./quickstart.md) | Step-by-step getting started tutorial for new users |
| [providers-comparison.md](./providers-comparison.md) | LLM provider comparison — cost, speed, quality, and use cases |
| [providers/openai.md](./providers/openai.md) | OpenAI setup guide — GPT-4o, o1, o3, env vars, pricing |
| [providers/anthropic.md](./providers/anthropic.md) | Anthropic setup guide — Claude models, caching, thinking |
| [providers/google.md](./providers/google.md) | Google Gemini setup guide — 1M context, Flash pricing |
| [providers/xai.md](./providers/xai.md) | xAI Grok setup guide — OpenAI-compatible, Grok-3 |
| [providers/amazon-bedrock.md](./providers/amazon-bedrock.md) | AWS Bedrock setup guide — IAM auth, region config |
| [model-recommendations.md](./model-recommendations.md) | Model recommendations by task type — coding, writing, analysis, creative |
| [onboarding.md](./onboarding.md) | Team onboarding checklist — install, config, trust, skills, gateway |
| [arcana-comprehensive-guide.md](./arcana-comprehensive-guide.md) | Complete Arcana guide — architecture, packages, commands, configuration, usage |
| [arcana-updates-v0.3.5.md](./arcana-updates-v0.3.5.md) | Comprehensive updates v0.3.0–v0.3.5, RunProof, TUI perf, git PII redaction |
| [qa-fixes-2026-07-10.md](./qa-fixes-2026-07-10.md) | QA fixes log |
| [resolution-and-recovery.md](./resolution-and-recovery.md) | Error resolution and recovery UX |
| [agent-operating-layer-index.md](./agent-operating-layer-index.md) | Agent operating layer index |
| [agent-operating-layer.md](./agent-operating-layer.md) | Agent operating layer design |
| [agent-operating-layer-qa.md](./agent-operating-layer-qa.md) | AOL QA checklist |
| [agent-operating-layer-review.md](./agent-operating-layer-review.md) | AOL review |
| [agent-operating-layer-evolution.md](./agent-operating-layer-evolution.md) | AOL evolution history |
| [free-usage-weekly-session-plan.md](./free-usage-weekly-session-plan.md) | Free-tier usage plan |
| [case-usage-cookbook.md](./case-usage-cookbook.md) | Usage patterns |
| [end-to-end-examples.md](./end-to-end-examples.md) | E2E flow examples |
| [progressive-mode-examples.md](./progressive-mode-examples.md) | Progressive mode examples |

### Future Architecture

The future architecture consolidates Arcana's path from governed runtime to execution platform and, eventually, an implementation-independent execution protocol.

| Doc | Scope |
|-----|-------|
| [future/README.md](./future/README.md) | Future architecture index and system thesis |
| [future/vision-and-principles.md](./future/vision-and-principles.md) | Mission, positioning, trust model, and design principles |
| [future/governance-layer.md](./future/governance-layer.md) | Principals, capabilities, PDP/PEP, policy, risk, approvals, budgets, delegation |
| [future/execution-platform.md](./future/execution-platform.md) | Durable runtime, scheduler, capabilities, verification, evidence, recovery, replay |
| [future/execution-protocol.md](./future/execution-protocol.md) | Portable schemas, lifecycle, integrity, compatibility, and conformance |
| [future/epistemic-agent.md](./future/epistemic-agent.md) | Claims, uncertainty, provenance, contradiction, and epistemic completion |
| [future/sdk.md](./future/sdk.md) | SDK packages, APIs, adoption levels, and language strategy |
| [future/components.md](./future/components.md) | Component inventory, authority boundaries, and deployment profiles |
| [future/roadmap-2026-2031.md](./future/roadmap-2026-2031.md) | Capability-gated multi-year roadmap and exit criteria |
| [future/adoption-and-ecosystem.md](./future/adoption-and-ecosystem.md) | Open-source, integrations, registries, design partners, and business alignment |
| [future/risks-and-non-goals.md](./future/risks-and-non-goals.md) | Strategic risks, threat areas, non-goals, and architectural anti-patterns |

### Design / Aspirational Docs

These documents describe Arcana's north-star architecture. Some concepts are partially or fully implemented; others are design targets for future milestones.

| Doc | Concept | Status |
|-----|---------|--------|
| [core-engine-vision.md](./core-engine-vision.md) | Governed execution kernel, policy, verifier, diff gate | Design (milestones identified) |
| [autonomy-modes.md](./autonomy-modes.md) | Observe → Advise → Ask → Enforce → Locked modes | Concept (design only) |
| [agent-contracts.md](./agent-contracts.md) | Bounded work orders with scope, forbidden, success criteria | Concept (design only) |
| [run-capsules.md](./run-capsules.md) | Portable execution records | Concept (design only) |
| [memory-receipts.md](./memory-receipts.md) | Sourced, inspectable memory facts | Concept (design only) |
| [context-supply-chain.md](./context-supply-chain.md) | Traceable context provenance | Concept (design only) |
| [plugin-extension-model.md](./plugin-extension-model.md) | Advanced plugin hooks | Concept (design only) |
| [plugin-permissions.md](./plugin-permissions.md) | Plugin permission model | Concept (design only) |
| [object-schemas.md](./object-schemas.md) | Draft schema shapes for AOL objects | Draft (planning only) |
| [skill-extension-model.md](./skill-extension-model.md) | Skill extension design | Concept (design only) |
| [user-space-extension-model.md](./user-space-extension-model.md) | User extension model | Concept (design only) |

### Architecture Notes

| Doc | Topic |
|-----|-------|
| [architecture/command-spine-ui.md](./architecture/command-spine-ui.md) | Command Spine TUI design (living surface) |
| [architecture/arcana-native-runtime.md](./architecture/arcana-native-runtime.md) | Native runtime identity and authorities |
| [architecture/arcana-breaking-change-map.md](./architecture/arcana-breaking-change-map.md) | Required native breaks vs cosmetic rename |
| [architecture/arcana-durable-execution-memory-context-continuity.md](./architecture/arcana-durable-execution-memory-context-continuity.md) | Durable execution, prompt queue, memory, context continuity |
| [architecture/arcana-error-taxonomy.md](./architecture/arcana-error-taxonomy.md) | Arcana error codes (`ARC_*`) and user/internal layers |
| [architecture/arcana-performance-optimization-foundation.md](./architecture/arcana-performance-optimization-foundation.md) | TUI + runtime perf, shipped surfaces, env knobs |
| [architecture/arcana-tui-cockpit-64-steps.md](./architecture/arcana-tui-cockpit-64-steps.md) | Aspirational multi-panel cockpit plan |
| [architecture/free-quality-routing.md](./architecture/free-quality-routing.md) | Free-tier model routing algorithm |
| [architecture/out-of-scope.md](./architecture/out-of-scope.md) | Out-of-scope work for Arcana |
| [architecture/token-kernel-missions.md](./architecture/token-kernel-missions.md) | Token ledger, budget, context pack contracts |
| [architecture/git-pii-redaction.md](./architecture/git-pii-redaction.md) | Git PII redaction layer: design, threat model, pipeline, extension points |
| [architecture/system-architecture.md](./architecture/system-architecture.md) | System architecture — package layers, data flow diagrams, kernel design, security |
| [architecture/database-schema.md](./architecture/database-schema.md) | Database schema — SQLite tables, Drizzle ORM, FTS5 indexes, entity relationships |

### ADRs (Architecture Decision Records)

| Doc | Topic |
|-----|-------|
| [adr/0001-agent-operating-layer.md](./adr/0001-agent-operating-layer.md) | Agent operating layer ADR |
| [adr/0002-tool-batch-scheduler.md](./adr/0002-tool-batch-scheduler.md) | Tool batch scheduler ADR |

### Vendor Docs

| Doc | Topic |
|-----|-------|
| [vendor/ai-sdk/6.0.168/README.arcana.md](./vendor/ai-sdk/6.0.168/README.arcana.md) | AI SDK 6.0.168 documentation (vendored reference) |

## Package-level docs

| Package | How to read |
|---------|-------------|
| [`@arcana/llm`](../packages/llm/README.md) | Schema-first LLM core: `LLM.request`, `LLMClient.generate/stream`, providers, caching, routes |
| [`@arcana/llm AGENTS.md`](../packages/llm/AGENTS.md) | LLM architecture, route construction, contributor guide |
| [`@arcana/engine AGENTS.md`](../packages/engine/AGENTS.md) | Effect patterns, module shape, database guide |
| [`@arcana/core`](../packages/core/) | Effect-based agent runtime, tools, session, database |

## Console & proxy (short)

```sh
# Pair CLI with Arcana account (device flow)
arcana console login          # default: https://arcana.otnelhq.com

# Trust this repo for project plugins / tools / local MCP
arcana trust

# Hosted proxy (after login)
# Base: https://proxy.arcana.otnelhq.com
# Auth: Authorization: Bearer <license_key>
```

See the public docs for full device-flow sequence and API tables.
