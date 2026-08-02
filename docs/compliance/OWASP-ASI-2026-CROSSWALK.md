---
document_class: compliance_crosswalk
authority: reference
status: current
last_verified: 2026-08-02
status_source: docs/STATUS.md
---

# OWASP Agentic AI 2026 — Arcana Control Crosswalk

This crosswalk maps OWASP Agentic Top 10 2026 risks and the AIUC-1 crosswalk
priority gaps to Arcana mechanisms. It never claims compliance; each row
states the mechanism, the production path, the evidence, the coverage, and
the gap.

Status vocabulary:

```text
IMPLEMENTED · PRODUCTION-MOUNTED · INTERNALLY-VALIDATED ·
INDEPENDENTLY-VALIDATED · PARTIAL · NOT IMPLEMENTED · NOT APPLICABLE
```

| Risk / control | Arcana mechanism | Production path | Evidence | Coverage | Gap | Status |
|---|---|---|---|---|---|---|
| Goal hijacking / prompt injection | Intent-bound authorization: contract + revision + criteria binding; no auto-binding for remote/MCP/tool-output content | `IntentRuntime` + `contract-admission.ts` + PEP | intent/PDP suites, 617 capability tests | L1–L2 | Probabilistic injection detection is out of scope | PRODUCTION-MOUNTED / INTERNALLY-VALIDATED |
| Tool misuse | Exact request hash + capability action/resource constraints + use-limits | PEP at effect boundary (`tool.ts`) | PEP use-claim adversarial suite | L1–L2 | Physical bypass outside effect boundary | PRODUCTION-MOUNTED / INTERNALLY-VALIDATED |
| Privilege abuse | Delegation with attenuation + ancestry + cascade revocation | capability grant store | revocation cascade tests (unit/SQLite/HTTP) | L1–L2 | Node/fleet enforcement pending | PRODUCTION-MOUNTED / INTERNALLY-VALIDATED |
| Supply-chain compromise | Lockfile pinning; dompurify 3.4.12 patched; unreachable dev deps classified | package manifests + dependabot triage | TUI-2.1 freeze report WS4 | L1 | No SBOM/attestation; `docs/security/SUPPLY-CHAIN-TRUST.md` | PARTIAL |
| Unexpected code execution | Shell/process effects go through PEP; deterministic replay records intent | session tools + RunProof | adversarial fixtures (95 / 0 false allows) | L1–L2 | External CLIs and raw subprocesses not intercepted | PARTIAL |
| Memory poisoning | Durable event store + RunProof integrity + replay refusal on drift | epistemic event store | event-store concurrency suites | L1–L2 | Cross-session memory policy not a separate control | PARTIAL |
| Insecure inter-agent communication | Signed envelopes + verifier (audience/freshness/domain separation) | `signed-envelopes.ts` / `verifier.ts` | 46 conformance vectors (41 negative) | L1–L2 | D-6B-T production transport pending | PARTIAL |
| Cascading failures | Fail-closed intent store; degraded/UNAVAILABLE trace health | PEP + trace health | intent store unavailable tests | L1–L2 | Fleet orchestration not deployed | PRODUCTION-MOUNTED / INTERNALLY-VALIDATED |
| Human trust exploitation | Exact scoped approvals: immutable request, single-use, expiry, atomic claim | approval lifecycle + operator service | approval suites | L1–L2 | Manual WS1 smoke pending | PRODUCTION-MOUNTED / INTERNALLY-VALIDATED |
| Rogue agents | Subagent authority inherits attenuated parent scope; no ambient authority | agent/task tools + delegation | delegation tests | L1–L2 | External runtime adapters absent | PARTIAL |
| Agent identity (crosswalk gap) | `NodeIdentityCertificate` + identity contracts (3-layer) | crypto identity layer | D-7I suites | L1–L2 | Enrollment ceremony + key rotation pending | PARTIAL |
| Runtime containment (crosswalk gap) | `SafeBoundedFileReader` v2; openat2/Windows handle scaffold | bounded file reader | D-7.1 scaffold tests | L1–L2 | Kernel enforcement + process/network containment pending | PARTIAL |
| Architectural monitoring | Governance event families + SSE + Command Spine + RunProof | engine HTTP + TUI | governance/HTTP suites | L1–L2 | Full live restart validation pending | PRODUCTION-MOUNTED / INTERNALLY-VALIDATED |
| Supply-chain attestation | None | — | — | — | Requires SBOM + signature verification pipeline | NOT IMPLEMENTED |
| Schema controls | Zod schemas + canonical serializer + conformance vectors | core schemas | crypto conformance | L1–L2 | Public protocol registry not published | PARTIAL |
