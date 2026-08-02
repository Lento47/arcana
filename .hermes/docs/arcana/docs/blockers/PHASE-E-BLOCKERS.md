# Phase E — Arcana Protocol, SDKs, and External Adapters: Blocker Register

**Status: PLANNED / PARTIAL — no frozen protocol, no certified adapters, no
stable SDK 1.0.**

## Open blockers

| ID | Task | Gap evidence | Acceptance evidence required |
|---|---|---|---|
| BLK-E-01 | E1 freeze protocol specifications | **Freeze draft published 2026-08-02** (`docs/protocol/PROTOCOL-1.0-SPEC.md`): serialization rules, signature domains, object registry, labels, reason codes, version negotiation. Remaining: public release, external review, third-party implementation | Versioned public specs (DRAFT DONE); external review + public release |
| BLK-E-02 | E2 independent conformance suite | **Independent implementations DONE 2026-08-02**: TS production + Rust verifier agree on 46 vectors (`script/conformance.ts` runner, 3/3 suites). Remaining: L3 external reproduction | Two independent implementations produce matching vectors (DONE in-repo); external reproduction |
| BLK-E-03 | E3 TypeScript/JavaScript SDK 1.0 | **Governance + proof + error model + conformance wiring DONE 2026-08-02** (`@arcana/sdk/v2/*`; SDK suite 17/17; conformance runner 4/4; `SDK-1.0-COMPATIBILITY.md`). Remaining: release freeze + external-vector conformance | SDK 1.0 release + external conformance |
| BLK-E-04 | E4 additional language SDK | **Rust foundation DONE 2026-08-02**: canonical serializer + verifier + request hashing with cross-language golden vector (TS ↔ Rust identical hash). Remaining: full Rust SDK surface | One additional SDK passing the same conformance suite (request-hash vector PASS; full surface pending) |
| BLK-E-05 | E5 external CLI adapters (Codex/Claude/Gemini) | **A1 launch scaffold DONE 2026-08-02** (`arcana launch <runtime>`: declaration, dry-run, supervision + evidence; no sandbox claim). **Hostile-escape fixtures runnable 2026-08-02** (`bounded-file-reader.test.ts`, 7 fixtures: traversal, absolute path, null byte, directory, size budget, junction escape). Remaining: OS-level containment engine integration + live Linux validation before any enforcement-level claim | Three adapters at declared levels; hostile escape fixtures for the declared boundary |
| BLK-E-06 | E6 framework adapters (Mastra/AI SDK/LangGraph/MCP apps) | **AI SDK-style + MCP hooks DONE 2026-08-02** (`governedTool` + `governedMcpTool`). **Mastra + LangGraph hooks DONE 2026-08-02** (`governedMastraTool` + `governedLangGraphTool`; 6 new tests, SDK suite 28/28). Remaining: live PEP transport integration | Framework tool calls map to canonical requests (DONE); PEP cannot be bypassed (hook-level DONE for AI SDK/MCP/Mastra/LangGraph, live transport pending) |
| BLK-E-07 | E7 adapter certification levels | **Registry published 2026-08-02** (`ADAPTER-CERTIFICATION.md`: A0–A3, procedure, nonclaims). Remaining: fixtures per adapter | Certification contract (DONE); per-adapter fixture results |
| BLK-E-08 | E8 developer experience and examples | `docs/protocol/QUICKSTART.md` published; reference apps + test-node/policy samples pending | DX package + security checklist |
| BLK-E-09 | E9 protocol governance and compatibility | `docs/protocol/PROTOCOL-GOVERNANCE.md` published (lifecycle, deprecation, advisory, extensions, matrix); registry enforcement pending | Governance doc (DRAFT DONE) + registry enforcement |
| BLK-E-10 | E10 ecosystem evaluation and freeze | **Matrix published 2026-08-02** (`ECOSYSTEM-EVALUATION.md`: runtimes, languages, OSes, levels + freeze-gate status). **Certified adapter fixtures DONE 2026-08-02** (`src/v2/adapters/vectors.test.ts`: 4 frozen request-hash golden vectors — AI SDK/MCP/Mastra/LangGraph naming, pinned request identity; wired into `script/conformance.ts` as suite 5/5; `GovernanceContext` gained deterministic `requestId`/`nonce`/`requestedAt`). Remaining: live PEP transport, macOS/Linux validation, L3 | Matrix (DRAFT DONE); certified fixtures DONE; freeze pending live/L3 |

## Existing partial evidence

- `tools/acep-conformance-rust` — canonical node-identity + 46-vector conformance (2/2 tests).
- `docs/protocol/SCHEMA-VERSION-REGISTRY.md` — schema version registry draft.
- `packages/sdk/js` — typed client and server spawner (7/7).
- `docs/competitive/2026-08-02-market-assessment.md` — external adapter analysis.
