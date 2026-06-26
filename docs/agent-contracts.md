# Agent Contracts

An Agent Contract is Arcana's object for constrained autonomous work.

It turns vague prompts into bounded work orders with allowed scope, forbidden actions, success criteria, risk limits, and verification expectations.

## One-line definition

```txt
An Agent Contract turns a prompt into an executable boundary for autonomous work.
```

## Why it exists

Most agent failures begin with vague intent.

Bad prompt:

```txt
Fix the auth tests.
```

Better contract:

```txt
Goal:
  Fix flaky auth tests.

Allowed:
  edit auth tests
  edit auth/session.ts if needed

Forbidden:
  change public API
  add dependency
  disable tests
  delete snapshots

Success:
  auth tests pass repeatedly
  no public API change
  no new dependency

Budget:
  low-risk local run
```

Arcana should make the boundary visible before the agent acts.

## Contract lifecycle

```txt
drafted
  ↓
validated
  ↓
approved | rejected
  ↓
bound_to_run
  ↓
checked_during_execution
  ↓
satisfied | violated | inconclusive
```

## Minimum contract fields

```txt
id
name
goal
scope
allowed_actions
forbidden_actions
success_criteria
verification
budget
risk
model_policy
tool_policy
memory_policy
context_policy
```

## Conceptual schema

```ts
type AgentContract = {
  id: string
  name: string
  goal: string
  scope: ScopeRule[]
  allowed: ActionRule[]
  forbidden: ActionRule[]
  success: SuccessCriterion[]
  verification: VerificationRequirement[]
  budget: BudgetRule
  risk: RiskRule
  modelPolicy: ModelPolicy
  toolPolicy: ToolPolicy
  memoryPolicy: MemoryPolicy
  contextPolicy: ContextPolicy
}
```

This is documentation only. It does not define an implementation contract yet.

## Contract sections

### Goal

The target outcome.

Good:

```txt
Reduce duplicate route handling in packages/server without changing public API behavior.
```

Weak:

```txt
Clean up server.
```

### Scope

What the agent may inspect or modify.

```txt
read: packages/server/**
write: packages/server/src/routes/**
write: packages/server/test/**
```

### Allowed actions

Examples:

```txt
read files
edit tests
run local tests
create patch
summarize alternatives
```

### Forbidden actions

Examples:

```txt
add dependency
modify lockfile
delete tests
change public API
send network request
access secrets
push commits
open PR
```

### Success criteria

Success should be testable or reviewable.

```txt
bun test packages/server passes
public API files unchanged
no dependency changes
patch under 300 lines unless justified
```

### Verification

Verification requirements should be explicit.

```txt
required:
  bun test packages/server
  bun run typecheck
optional:
  explain public API impact
```

### Budget

Budget is not only money.

```txt
max_model_cost
max_runtime_minutes
max_tool_calls
max_files_changed
max_patch_lines
max_retries
```

### Risk

Risk gates autonomy.

```txt
low:
  read and summarize

medium:
  local file edits

high:
  dependency changes, secrets, network writes, publish, deploy
```

## Contract operations

Potential commands:

```sh
arcana contract new
arcana contract validate auth-fix.contract.json
arcana contract explain auth-fix.contract.json
arcana contract run auth-fix.contract.json
arcana contract check run_123
arcana contract diff old.contract.json new.contract.json
```

## Contract satisfaction

Every Run Capsule bound to a contract should produce a satisfaction report.

```txt
Goal: satisfied | unsatisfied | inconclusive
Scope: respected | violated
Forbidden actions: none | violated
Success criteria: passed | failed | skipped
Verification: complete | incomplete
Budget: within_limit | exceeded
```

## QA checklist

An Agent Contract is acceptable only if it answers:

```txt
What is the goal?
What can the agent read?
What can the agent change?
What is forbidden?
What does success mean?
How will success be checked?
What budget applies?
What risk level applies?
What model/tool policy applies?
What happens if the contract is violated?
```

## Contract quality levels

```txt
Level 0: prompt only
Level 1: prompt + allowed files
Level 2: allowed + forbidden actions
Level 3: success criteria + verification
Level 4: model/tool/context/memory policies
Level 5: continuously checked during execution and attached to capsule proof
```

Arcana should target Level 3 first, then Level 5.

## Failure modes

### Failure mode: policy prose

Risk:

```txt
The contract is just instructions the agent may ignore.
```

Avoid by making contracts machine-checkable where possible.

### Failure mode: too much ceremony

Risk:

```txt
Users avoid contracts because they are too verbose.
```

Avoid by supporting contract presets and prompt-to-contract drafting.

### Failure mode: fake success

Risk:

```txt
The run reports success without satisfying verification.
```

Avoid by separating:

```txt
agent_claimed_success
verification_proven_success
human_accepted_success
```

### Failure mode: hidden escalation

Risk:

```txt
Agent silently moves from low-risk read into high-risk write behavior.
```

Avoid by requiring state transitions and approval for risk escalation.

## Contract presets

Useful presets:

```txt
safe-refactor
bugfix-local
security-review-readonly
docs-update
dependency-review
test-improvement
release-check
smart-contract-audit
```

Each preset defines default scope, forbidden actions, verification requirements, and risk level.

## Product claim

```txt
Arcana turns prompts into contracts: bounded autonomous work with explicit success criteria.
```
