# Arcana Native Runtime Architecture

Arcana must stop being a renamed fork by changing where authority lives.

A fork usually keeps the same center of gravity:

- chat loop owns work
- tools execute directly
- UI renders conversation state
- permission is a popup
- tests are optional confirmation
- proof is a report after the fact

Arcana's center of gravity should be different:

- kernel owns execution authority
- policies decide action controls
- diff gate owns mutation
- verifier owns completion
- RunProof owns evidence
- TUI is a cockpit over engine truth
- CLI is a protocol surface, not the product itself

## Doctrine

Arcana is a governed runtime for software autonomy.

The model may propose. The engine decides. The proof records.

No meaningful action should happen as an invisible side effect of a chat response.

## Runtime Layers

```txt
User Intent
  ↓
CLI / TUI Protocol Surface
  ↓
Arcana Kernel Contract
  ↓
Pipeline Planner
  ↓
EngineAction Envelope
  ↓
Risk Engine
  ↓
Policy / Permission Bridge
  ↓
Diff Gate / Tool Execution / MCP / Shell
  ↓
Verifier
  ↓
RunProof Projection
  ↓
Cockpit Timeline
```

## Native Arcana Authorities

Arcana should have explicit authorities. These are not UI components. They are runtime responsibilities.

| Authority | Owner | Meaning |
|---|---|---|
| Intent | CLI/TUI | Capture what the user asked without claiming completion. |
| Plan | Pipeline planner | Convert intent into stages and acceptance criteria. |
| Risk | Risk engine | Classify action danger from command, path, network, dependency, and security context. |
| Policy | Permission service | Decide allow, ask, deny, sandbox, diff gate, verifier, or human review. |
| Mutation | Diff gate | Own proposed, approved, applied, rejected, and rolled-back changes. |
| Verification | Verifier | Decide whether evidence supports completion. |
| Rollback | Checkpoint manager | Make applied changes reversible where possible. |
| Proof | RunProof projector | Export the evidence trail. |

A feature that does not map to one of these authorities is probably UI noise or fork residue.

## Compatibility Boundary

Arcana should not identify as upstream fork lineage by default.

The engine now sets:

```txt
ARCANA_ENGINE=1
ARCANA_RUNTIME=engine
ARCANA_PID=<pid>
```

Legacy compatibility is explicit:

```sh
arcana --compat-opencode-env ...
# or
ARCANA_COMPAT_OPENCODE=1 arcana ...
```

That means old plugins/scripts can still be supported, but Arcana's default runtime identity is Arcana-native.

## What Makes This Not Just a Fork

### 1. Runtime Identity

The default process identity is Arcana, not inherited fork identity.

### 2. Kernel Contract

`packages/engine/src/kernel` defines Arcana's own kernel vocabulary:

- runtime identity
- runtime surface
- authority boundaries
- kernel contract

This gives future code a native architecture to import instead of scattering concepts across CLI, tools, and permissions.

### 3. Execution Contract

`packages/engine/src/execution` defines action envelopes, risk, policies, pipelines, candidates, verifier passes, security context, and engine events.

This turns the engine from an agent loop into a controlled execution substrate.

### 4. Proof Authority

RunProof is not branding. It is the portable evidence layer. The long-term target is to make RunProof a projection over engine events rather than a manually assembled report.

### 5. Mutation Authority

Direct writes should become an implementation detail behind a diff gate. The agent proposes. The diff gate applies.

## Architectural Rules

1. The TUI must never be the source of truth.
2. `run.ts` must not own governance logic.
3. Tool calls must become `EngineAction`s before execution.
4. File writes must become mutation proposals in governed mode.
5. High-risk actions require fresh approval.
6. Human-review controls cannot be bypassed by broad allow rules.
7. Verifier results must be represented as engine state, not prose.
8. RunProof must contain enough evidence for replay, audit, or rejection.
9. Compatibility shims must be explicit and removable.
10. New architecture must be represented in code, not only docs.

## Migration Plan

### Phase 1 — Native Runtime Identity

- Replace default fork runtime env with Arcana env.
- Keep fork compatibility behind explicit flag.
- Add kernel contracts.

### Phase 2 — Kernel Integration

- Instantiate `ArcanaKernelContract` at engine startup.
- Attach kernel identity to logs, spans, and RunProof.
- Surface kernel authority state in TUI.

### Phase 3 — Event Projection

- Emit `EngineEvent`s from tool execution, permissions, verifier, and diff gate.
- Make RunProof consume those events.
- Stop manually updating proof state from scattered call sites.

### Phase 4 — Diff Gate

- Route edit/write/apply-patch tools through mutation proposals.
- Require proposed → approved → applied state transitions.
- Add rollback checkpoints.

### Phase 5 — Verifier Authority

- Add verifier pass after meaningful mutations.
- Require verifier pass, explicit limitation, or human override before completed state.

## Non-Goals

- Do not rewrite the entire fork at once.
- Do not rename every file just for optics.
- Do not break compatibility without an explicit migration path.
- Do not hide fork lineage in licenses or attribution.
- Do not let marketing language replace runtime boundaries.

## Strategic Outcome

Arcana becomes a governed autonomy runtime, not a forked coding assistant.

The product distinction is architectural:

```txt
Fork-style assistant:
  prompt → tool call → output

Arcana:
  intent → plan → action → risk → policy → approval/diff → execution → verifier → proof
```

That is the shift that matters.
