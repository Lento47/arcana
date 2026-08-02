---
document_class: security_boundary
authority: reference
status: current
last_verified: 2026-08-02
status_source: docs/STATUS.md
---

# Effect Coverage — Logical and Physical Boundaries

## Boundary definitions

**Logical enforcement boundary** — the Arcana PEP makes the final
authorization decision and calls the protected adapter.

**Physical containment boundary** — the operating system, sandbox, container,
credential broker or network mediator prevents alternative execution outside
the approved path.

```text
Strong Effect Assurance = Logical PEP Enforcement
                         ∧ Physical Bypass Resistance
                         ∧ Complete Evidence
```

A TypeScript wrapper is logical enforcement; it is not physical containment.
This matrix records what each effect path actually has. The central question:
which real effects can still occur without passing Arcana?

## Effect matrix

| Effect | Entry point | Canonicalized | PDP | PEP | OS-enforced | Receipt | Known bypass | Status |
|---|---|:--:|:--:|:--:|:--:|:--:|---|---|
| File read | `read` tool / bounded file reader | Yes | Yes | Yes | Partial (handle-bound identity; openat2 pending) | Yes | Raw fs outside PEP; external CLIs | PARTIAL |
| File write | `edit`/`write`/patch tools | Yes | Yes | Yes | Partial | Yes | Raw fs outside PEP; external editors | PARTIAL |
| Shell process | `run`/shell tool | Yes | Yes | Yes | Partial (no seccomp/job objects) | Yes | Subprocess spawn outside effect boundary | PARTIAL |
| Network request | `webfetch`/`websearch` tools | Yes | Yes | Yes | No | Yes | Direct sockets outside PEP; egress mediation absent | PARTIAL |
| MCP invocation | MCP gateway | Yes | Yes | Yes | Gateway boundary | Yes | Native MCP client outside gateway | PARTIAL |
| Git push | git via shell tool | Yes (shell path) | Yes | Yes | No | Yes | `git push` outside Arcana session | PARTIAL |
| Secret retrieval | TARGET (no dedicated secret broker) | — | — | — | — | — | All ambient secrets | NOT IMPLEMENTED |
| Child process | task/subagent tools | Yes | Yes | Yes | No | Yes | Direct child spawn outside PEP | PARTIAL |
| Approval execution | `governed-executor.ts` | Yes | Yes | Yes | No | Yes | — | PRODUCTION-MOUNTED |

## Current nonclaims

- No kernel-enforced filesystem/process/network containment (D-7.1 pending).
- No universal governance of external CLIs (A0–A3 levels are a product
  contract, not implemented surfaces).
- No hostile-host resistance without hardware-backed attestation and an
  explicitly evaluated trust model.

See `docs/security/TRUSTED-COMPUTING-BASE.md` for the trusted components and
`docs/STATUS.md` for live status.
