# Arcana Core Engine Vision

Arcana should not evolve as a CLI wrapped around an agent loop. It should become an execution kernel for governed software autonomy.

The current engine already has the raw ingredients:

- `packages/engine/src/cli/cmd/run.ts` orchestrates non-interactive, attached, and interactive sessions through an SDK client and an event stream.
- `packages/engine/src/permission/index.ts` centralizes permission evaluation, pending approvals, replies, and permission events.
- `packages/engine/src/tool/tool.ts` wraps tool definitions, argument validation, execution, truncation, and tracing.
- `packages/engine/src/session/session.ts` owns session records, messages, diffs, summaries, token/cost accounting, and session lifecycle state.
- `packages/engine/src/agent/agent.ts` defines built-in agent modes and permission profiles.

That means the future architecture should not bolt governance onto the UI. It should promote the engine into a first-class control plane.

## North Star

Arcana Core Engine is a deterministic execution kernel between models, tools, files, shell, MCP, and the user.

Every meaningful action becomes:

1. Intent
2. Plan
3. Action envelope
4. Risk assessment
5. Policy decision
6. Optional approval
7. Execution
8. Evidence capture
9. Verification
10. Rollback capability
11. RunProof event

No tool call should be “just a tool call.” Every call should be a typed action with policy, evidence, reversibility, and verification metadata.

## Architectural Direction

### 1. Action Envelope Layer

Introduce a canonical action wrapper before any tool, shell command, file operation, MCP call, or session mutation executes.

```ts
type EngineAction = {
  id: string
  sessionID: string
  messageID?: string
  source: "user" | "agent" | "subagent" | "system" | "verifier"
  kind: "tool" | "mcp" | "file_read" | "file_write" | "shell" | "network" | "session" | "model"
  name: string
  input: unknown
  cwd?: string
  risk: RiskAssessment
  policy: PolicyDecision
  reversible: boolean
  proof_event_id?: string
}
```

This should sit below CLI/TUI and above concrete tool execution.

### 2. Policy Decision Layer

The current permission service is good, but it is still too close to ask/allow/deny. Future Arcana needs richer policy decisions:

```ts
type PolicyDecision =
  | { action: "allow"; reason: string; evidence_required: string[] }
  | { action: "deny"; reason: string }
  | { action: "ask"; reason: string; approval_scope: "once" | "session" | "project" }
  | { action: "sandbox"; reason: string; constraints: SandboxConstraint[] }
  | { action: "propose_diff"; reason: string }
  | { action: "require_verifier"; reason: string }
```

This makes approval, sandboxing, diff-first mutation, and verifier gating native engine concepts instead of UI behaviors.

### 3. Diff Gate as Mutation Authority

File writes should not be performed directly by edit/write tools in governed modes. They should emit proposed diffs into a mutation authority:

```ts
type MutationProposal = {
  id: string
  sessionID: string
  actionID: string
  files: ProposedFileDiff[]
  risk: RiskAssessment
  approval: PolicyDecision
  checkpoint_id?: string
}
```

The engine should support:

- propose only
- auto-approve low-risk diffs
- require approval for medium/high-risk diffs
- apply approved diffs
- reject diffs
- rollback applied diffs

The TUI then becomes a cockpit for this state, not the source of it.

### 4. Verifier as Completion Authority

The agent that performs work should not be allowed to self-certify completion.

Add a verifier pass after meaningful changes:

```ts
type VerifierPass = {
  id: string
  sessionID: string
  actionIDs: string[]
  diffIDs: string[]
  model?: string
  status: "passed" | "failed" | "inconclusive"
  concerns: string[]
  required_followups: string[]
}
```

Completion should require either:

- verifier passed, or
- explicit unresolved limitations recorded, or
- human override recorded in RunProof.

### 5. Event-Sourced Execution Timeline

The engine already emits session and permission events. Extend this into an event-sourced execution timeline:

```ts
type EngineEvent =
  | { type: "action.proposed"; action: EngineAction }
  | { type: "policy.decided"; actionID: string; decision: PolicyDecision }
  | { type: "action.started"; actionID: string }
  | { type: "action.completed"; actionID: string; output: unknown }
  | { type: "action.failed"; actionID: string; error: unknown }
  | { type: "diff.proposed"; proposal: MutationProposal }
  | { type: "diff.applied"; proposalID: string }
  | { type: "verification.completed"; verifier: VerifierPass }
  | { type: "rollback.created"; checkpointID: string }
  | { type: "runproof.updated"; runproofID: string }
```

The TUI should subscribe to this timeline. `RunProof` should be a projection over these events.

### 6. Risk Engine

Risk cannot be a static tool label. It must be computed from multiple dimensions:

- tool kind
- target path
- file sensitivity
- command class
- network access
- package manager usage
- deletion / rename / chmod / credential access
- repo dirty state
- test coverage impact
- number of files changed
- whether rollback exists
- whether verifier passed

```ts
type RiskAssessment = {
  level: "low" | "medium" | "high" | "critical"
  reasons: string[]
  required_controls: Array<"approval" | "diff" | "checkpoint" | "sandbox" | "verifier" | "human_review">
}
```

### 7. Subagents as Bounded Workers

Subagents should not be free autonomous actors. They should be bounded workers with delegated scopes:

```ts
type DelegationContract = {
  parent_action_id: string
  subagent: string
  allowed_tools: string[]
  allowed_paths: string[]
  budget: { steps: number; tokens?: number; wall_time_ms?: number }
  expected_output: "analysis" | "diff" | "test_result" | "verifier_report"
  cannot_apply_mutations: boolean
}
```

A subagent may propose, inspect, verify, or test. Applying mutations should remain centralized.

## Concrete First Milestones

### Milestone 1 — Engine Action Contracts

Add `packages/engine/src/execution/action.ts` with the canonical `EngineAction`, `RiskAssessment`, and `PolicyDecision` types.

No behavior change yet. This is the new language of the engine.

### Milestone 2 — Tool Execution Bridge

Update `packages/engine/src/tool/tool.ts` so every tool invocation can be represented as an `EngineAction` before execution.

Initially this can be observational only:

- create action
- classify basic risk
- emit/log action
- execute as before

### Milestone 3 — Policy Bridge

Bridge `EngineAction` into the existing `Permission.ask` flow.

Do not replace the permission system immediately. Wrap it.

### Milestone 4 — Diff Gate Interface

Add mutation proposal types and route file-writing tools through the proposal path in governed mode.

### Milestone 5 — RunProof Projection

RunProof should become a projection over engine events, not manually assembled by random call sites.

## What Not To Do

- Do not make the TUI the authority.
- Do not let each tool invent its own risk handling.
- Do not make verifier a chat prompt only; make it an engine phase.
- Do not let subagents apply mutations directly in governed mode.
- Do not make `run.ts` own proof or policy details.

## Product Differentiation

Cursor, Claude Code, Aider, and OpenCode are mostly chat/edit loops.

Arcana should become a governed execution environment:

- CLI is protocol.
- TUI is cockpit.
- Engine is kernel.
- RunProof is canonical state.
- Policy is native.
- Diff gate owns mutation.
- Verifier owns completion.
- Rollback owns trust.

This is how Arcana becomes more than a fork: it becomes the first local agent runtime where autonomy is treated as controlled execution, not model confidence.
