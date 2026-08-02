# Phase E — Arcana Protocol, SDKs, and External Adapters: Blocker Register

**Status: PLANNED / PARTIAL — no frozen protocol, no certified adapters, no
stable SDK 1.0.**

## Open blockers

| ID | Task | Gap evidence | Acceptance evidence required |
|---|---|---|---|
| BLK-E-01 | E1 freeze protocol specifications | **Freeze draft published 2026-08-02** (`docs/protocol/PROTOCOL-1.0-SPEC.md`): serialization rules, signature domains, object registry, labels, reason codes, version negotiation. Remaining: public release, external review, third-party implementation | Versioned public specs (DRAFT DONE); external review + public release |
| BLK-E-02 | E2 independent conformance suite | **Independent implementations DONE 2026-08-02**: TS production + Rust verifier agree on 46 vectors (`script/conformance.ts` runner, 3/3 suites). Remaining: L3 external reproduction | Two independent implementations produce matching vectors (DONE in-repo); external reproduction |
| BLK-E-03 | E3 TypeScript/JavaScript SDK 1.0 | **Governance + proof verification DONE 2026-08-02** (`@arcana/sdk/v2/governance` + `@arcana/sdk/v2/proof`; SDK suite 15/15). Remaining: stable error model, semver/compat policy, SDK conformance pass | SDK 1.0 API + semver/compat policy + conformance pass |
| BLK-E-04 | E4 additional language SDK | none (Rust tooling is conformance/containment scaffolding, not an SDK) | One additional SDK passing the same conformance suite |
| BLK-E-05 | E5 external CLI adapters (Codex/Claude/Gemini) | `arcana launch *` not implemented | Three adapters at declared certification levels; hostile escape fixture blocked at declared boundaries |
| BLK-E-06 | E6 framework adapters (Mastra/AI SDK/LangGraph/MCP apps) | none | Framework tool calls map to canonical AuthorizationRequest; PEP cannot be bypassed |
| BLK-E-07 | E7 adapter certification levels | A0–A3 described only | Published certification contract with boundaries/bypasses/test version/OS |
| BLK-E-08 | E8 developer experience and examples | no quickstarts/examples/test node/policy samples | DX package + security checklist |
| BLK-E-09 | E9 protocol governance and compatibility | version lifecycle/deprecation/advisory process not defined | Governance doc + extension registry |
| BLK-E-10 | E10 ecosystem evaluation and freeze | no cross-runtime matrix | Matrix across runtimes/languages/OSes/levels; SDK 1.0 + protocol milestone frozen |

## Existing partial evidence

- `tools/acep-conformance-rust` — canonical node-identity + 46-vector conformance (2/2 tests).
- `docs/protocol/SCHEMA-VERSION-REGISTRY.md` — schema version registry draft.
- `packages/sdk/js` — typed client and server spawner (7/7).
- `docs/competitive/2026-08-02-market-assessment.md` — external adapter analysis.
