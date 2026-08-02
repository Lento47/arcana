# Ecosystem Evaluation Matrix (E10 draft)

**Status:** DRAFT — evidence-backed matrix over implemented surfaces; the
Phase E freeze is NOT authorized until adapter certification fixtures and L3
reproduction close.

## Runtime matrix

| Runtime | Adapter | Enforcement level | Status | Evidence |
|---|---|---|---|---|
| Arcana native engine | native PEP path | A3 | IMPLEMENTED | Phase C/D suites (1373 core tests + D-10 matrix) |
| AI SDK-style tools | `governedTool` (SDK) | A3 scaffold | DRAFT | `packages/sdk/js/src/v2/adapters/ai-sdk.ts` (3 tests) |
| MCP tools | `governedMcpTool` (SDK) | A3 scaffold | DRAFT | `packages/sdk/js/src/v2/adapters/mcp.ts` (2 tests) |
| Codex / Claude / Gemini CLIs | `arcana launch` | A1 declaration | SCAFFOLD | launch declaration + dry-run; no sandbox claim |
| Mastra / LangGraph | — | — | NOT STARTED | — |

## Language matrix

| Language | Surface | Status | Evidence |
|---|---|---|---|
| TypeScript/JS | SDK v2 (client, governance, proof, errors, adapters) | 20/20 tests | `packages/sdk/js` |
| Rust | canonical serializer + verifier + request hashing | 5/5 tests | `tools/acep-conformance-rust` |
| Python / Go | — | NOT STARTED | — |

## OS matrix

| OS | Verified | Notes |
|---|---|---|
| Windows 10/11 | YES | full suites + conformance runner 4/4 |
| Linux | PARTIAL | openat2 scaffold; live workload validation pending (BLK-D-03) |
| macOS | NO | pending |

## Enforcement-level matrix

| Level | Claimed by | Fixtures |
|---|---|---|
| A3 | SDK hooks (native tool calls) | ALLOW-only + exact binding tests; live PEP transport pending |
| A2 | none | — |
| A1 | `arcana launch` (declared, not certified) | declaration only; hostile-escape fixtures pending |
| A0 | none | — |

## Phase E freeze gates

- Canonical test-vector disagreements: 0 (46 vectors + request-hash golden
  vector across TS/Rust).
- Certified-adapter false boundary claims: pending per-adapter fixtures.
- SDK conformance failures: 0 in-repo (4/4 conformance runner).
- Approval bypass through framework adapter: hook-level 0; live transport
  pending.
- Child authority amplification through adapter: hook-level 0 (exact
  request/grant binding); live tests pending.
- Unsupported mandatory protocol fields accepted: 0 (strict schema).
- Unversioned public security schemas: registry published (1.0-draft).

Remaining before E10 can pass: certified adapter fixtures, live PEP transport
for the SDK hooks, Mastra/LangGraph adapters, macOS/Linux validation, and
independent (L3) reproduction.
