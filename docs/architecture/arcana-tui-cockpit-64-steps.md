# Arcana Kernel-Native TUI Cockpit — 64-Step Implementation Plan

Branch: `architecture/arcana-tui-cockpit`
Base: `architecture/token-kernel-missions`

## North Star

Arcana TUI must stop being a chat-first fork-shaped interface and become a kernel cockpit.

```txt
Model proposes.
Kernel decides.
TUI observes kernel truth.
RunProof records what happened.
Verifier decides whether done is real.
```

## Hard Invariant

If the kernel does not know it, the TUI cannot pretend it is true.

## Non-Goals

- No OpenCode skinning.
- No chat transcript as primary surface.
- No tool-log-only runtime view.
- No UI state that bypasses kernel projection.
- No provider/model display without sovereignty context.
- No done state without verifier/proof state.

## Mission 1 — TUI Command / Runtime Audit

1. Inventory current TUI commands.
2. Inventory current keyboard handlers.
3. Inventory footer/header/sidebar state.
4. Inventory tool output renderers.
5. Inventory permission prompt renderers.
6. Add command coverage snapshot.

Outcome:

```txt
Arcana knows exactly what TUI behavior exists before replacing it.
```

## Mission 2 — KernelProjectionStore

7. Add `KernelProjectionStore` contract.
8. Ingest `TuiProjection` state.
9. Ingest `EngineAction` records.
10. Ingest `SecurityContext` records.
11. Ingest `MutationProposal` records.
12. Ingest `VerifierRecord` records.
13. Ingest RunProof, token, rollout, and compat state.

Outcome:

```txt
Every panel reads projection state, not random runtime objects.
```

## Mission 3 — Arcana Visual Shell

14. Replace default layout with Mission Header.
15. Add Action Timeline area.
16. Add DiffGate Queue area.
17. Add Risk Cockpit area.
18. Add Verifier Board area.
19. Add Proof Ledger area.
20. Add Token Console area.
21. Add Sovereignty / Compat area.

Outcome:

```txt
Default TUI no longer looks or behaves like a chat interface.
```

## Mission 4 — Arcana Command System

22. Add `:mission` command.
23. Add `:actions` command.
24. Add `:risk` command.
25. Add `:diffgate` command.
26. Add `:verify` command.
27. Add `:proof` command.
28. Add `:tokens` command.

Secondary command coverage:

- `:candidate`
- `:rollback`
- `:sovereignty`
- `:compat`
- `:layout`
- `:focus`
- `:help`

Outcome:

```txt
Every Arcana runtime authority has a TUI command surface.
```

## Mission 5 — Runtime Cockpit Panels

29. Add `MissionHeader` component.
30. Add `PipelineBoard` component.
31. Add `ActionTimeline` component.
32. Add `ActionDetailDrawer` component.
33. Add `RiskCockpit` component.
34. Add `PermissionRiskCard` component.
35. Add `DiffGateQueue` component.
36. Add `MutationDetailDrawer` component.
37. Add `CandidateBoard` component.
38. Add `CandidateCompareDrawer` component.
39. Add `VerifierBoard` component.
40. Add `ProofLedger` component.
41. Add `TokenConsole` component.
42. Add `SovereigntyCompatPanel` component.

Outcome:

```txt
Arcana authorities become visible instruments.
```

## Mission 6 — Governance Interactions

43. Approve/reject permission from Risk Cockpit.
44. Approve/reject mutation from DiffGate Queue.
45. Open diff from mutation card.
46. Stage rollback from mutation card.
47. Rerun verifier from Verifier Board.
48. Accept limitation with explicit proof note.
49. Export RunProof receipt.
50. Show blocked state when verifier/proof is incomplete.

Outcome:

```txt
The TUI becomes an operator cockpit, not just a monitor.
```

## Mission 7 — Token, Sovereignty, Compat, Context

51. Show estimated vs actual token burn.
52. Show cache-hit ratio.
53. Show context pressure and compaction state.
54. Show provider route, region, and local/cloud mode.
55. Show opaque provider-state indicator.
56. Show compat shim blocker meter.

Outcome:

```txt
Arcana surfaces cost, context, provider route, and migration truth as runtime state.
```

## Mission 8 — Accessibility, Performance, Testing, Telemetry

57. Add global focus model.
58. Add panel-local selection model.
59. Add keyboard navigation tests.
60. Add high-contrast and dense modes.
61. Add render snapshot tests.
62. Add projection replay tests.
63. Add TUI performance metrics.
64. Add command coverage CI gate.

Outcome:

```txt
Arcana TUI is fast, keyboard-first, testable, accessible, and projection-backed.
```

## PR Sequence

### PR 1 — Audit + Projection Store

Steps 1-13.

Expected outcome:

```txt
Command coverage and kernel projection state exist.
```

### PR 2 — Cockpit Shell

Steps 14-21.

Expected outcome:

```txt
The default visual shell is Arcana-native.
```

### PR 3 — Commands

Steps 22-28 plus secondary commands.

Expected outcome:

```txt
Every runtime authority has a command surface.
```

### PR 4 — Runtime Panels

Steps 29-42.

Expected outcome:

```txt
Kernel state becomes visible as cockpit instruments.
```

### PR 5 — Governance Interactions

Steps 43-50.

Expected outcome:

```txt
The TUI can operate approvals, mutations, verifier, rollback, and proof.
```

### PR 6 — Token / Sovereignty / Compat / Context

Steps 51-56.

Expected outcome:

```txt
Token pressure, context pressure, provider sovereignty, and compat decay are visible.
```

### PR 7 — Accessibility / Performance / Tests

Steps 57-64.

Expected outcome:

```txt
The cockpit is production-grade and regression-tested.
```

## Canonical Panel Ownership

| Runtime concept | TUI surface |
|---|---|
| `EngineAction` | Action Timeline |
| `SecurityContext` | Risk Cockpit |
| `Permission` | Permission Risk Card |
| `MutationProposal` | DiffGate Queue |
| `CandidateSet` | Candidate Board |
| `VerifierRecord` | Verifier Board |
| `RunProofProjection` | Proof Ledger |
| `TokenLedger` / `TokenBudget` | Token Console |
| Provider/model registry | Sovereignty Panel |
| Compat metrics | Compat Meter |
| Rollout flags | Rollout Strip |
| Context pack / compaction | Context Pressure Meter |

## Visual Direction

```txt
terminal precision
thin borders
proof-ledger density
labels before color
minimal motion
high contrast optional
no chat bubbles
no cyberpunk noise
no fork-shaped side identity
```

## First Implementation Slice

```txt
1. Add command audit contract.
2. Add kernel projection store contract.
3. Add projection reducer tests.
4. Add initial command coverage tests.
5. Export the new TUI cockpit primitives.
```

First code commit:

```txt
feat(tui): add command audit and kernel projection store
```
