# Arcana User-Space Extension Model

Arcana should not be a fixed agent workflow.

Arcana should provide core primitives, while users define their own autonomy model through contracts, modes, policies, skills, and plugins.

## One-line definition

```txt
Arcana user space is where users define how autonomy should behave for their repo, machine, team, and risk model.
```

## Core idea

```txt
Arcana Core:
  runtime
  capsules
  contracts
  route decisions
  verification records
  memory receipts
  context sources
  mode enforcement

User Space:
  CONTRACTS.md
  .arcana/modes.json
  .arcana/contracts/*.contract.json
  .arcana/policies/*.policy.json
  .arcana/skills/*/SKILL.md
  .arcana/plugins/*.ts
  custom verifiers
  custom risk rules
```

The user should not need to patch Arcana internals to define their use case.

## Extension levels

### Level 1: Markdown

Human-readable intent.

Files:

```txt
CONTRACTS.md
.arcana/skills/*/SKILL.md
.arcana/README.md
```

Purpose:

```txt
explain repo autonomy rules
explain available contracts
explain skill behavior
explain team risk expectations
```

This level is easy to write and review, but should not be treated as the only executable source of truth.

### Level 2: JSON policies and contracts

Machine-readable boundaries.

Files:

```txt
.arcana/modes.json
.arcana/contracts/*.contract.json
.arcana/policies/*.policy.json
```

Purpose:

```txt
define mode defaults
define allowed and forbidden actions
define verification requirements
define routing policy
define tool permissions
define memory/context policy
```

This is where Arcana can eventually validate and enforce.

### Level 3: Plugins

Programmable extension.

Files:

```txt
.arcana/plugins/*.ts
```

Purpose:

```txt
custom risk detection
custom verification
custom dependency review
custom route scoring
custom memory filtering
custom context selection
custom enterprise checks
```

Plugins are advanced user space. They should be optional.

### Level 4: Locked policies

Enterprise or regulated control.

Files:

```txt
.arcana/policies/locked.policy.json
.arcana/policies/providers.allowlist.json
.arcana/policies/tools.allowlist.json
```

Purpose:

```txt
pre-approved tools
pre-approved models
pre-approved contracts
restricted network/provider behavior
strict memory/context policy
```

This is not the default. It is for teams and sensitive environments.

## Recommended directory layout

```txt
CONTRACTS.md
.arcana/
  README.md
  modes.json
  contracts/
    safe-refactor.contract.json
    dependency-change.contract.json
    security-review.contract.json
    docs-update.contract.json
  policies/
    routing.policy.json
    tools.policy.json
    memory.policy.json
    context.policy.json
  skills/
    security-review/
      SKILL.md
      contract.json
      verification.md
      failure-modes.md
      examples.md
  plugins/
    dependency-intent.plugin.ts
    custom-verifier.plugin.ts
```

## What each layer owns

| Layer | Owns | Example |
|---|---|---|
| `CONTRACTS.md` | human explanation | "security reviews are read-only by default" |
| `.arcana/contracts` | executable work boundaries | safe refactor, dependency change, release check |
| `.arcana/modes.json` | strictness levels | advise for default, ask for security, enforce for release |
| `.arcana/policies` | workspace rules | allowed providers, allowed tools, memory scope |
| `.arcana/skills` | reusable capabilities | security review, docs writer, smart contract audit |
| `.arcana/plugins` | custom logic | dependency scoring, Foundry verifier, enterprise checks |

## User-space examples by persona

### Solo founder

```txt
mode: advise
contracts: safe-refactor, docs-update, dependency-change
plugins: dependency intent, cheap route scorer
```

Goal:

```txt
move fast, show risks, don't interrupt too much
```

### Security researcher

```txt
mode: ask
contracts: readonly-security-review, exploit-validation
plugins: Foundry verifier, dependency risk scanner
```

Goal:

```txt
confirm risky actions, preserve evidence, avoid fake findings
```

### Enterprise admin

```txt
mode: enforce
contracts: approved workflow only
plugins: internal policy checker, ticket verifier
```

Goal:

```txt
block policy violations, record proof, require verification
```

### Locked customer environment

```txt
mode: locked
contracts: allowlisted
providers: local/private only
tools: allowlisted only
plugins: signed only
```

Goal:

```txt
controlled execution, no accidental external exposure
```

## Design principles

### Principle 1: local-first

User space should work from repo files before cloud services.

### Principle 2: human-readable first

Users should be able to understand the rules without reading code.

### Principle 3: machine-checkable second

Arcana should eventually validate and enforce what is declared.

### Principle 4: progressive strictness

The same user-space files should support permissive and strict modes.

### Principle 5: plugins are optional

The product must work without plugins. Plugins extend behavior, not replace the core.

## What not to do

Do not make users write plugins for basic safety.

Do not require a dashboard to define contracts.

Do not make `CONTRACTS.md` the only source of truth for enforcement.

Do not force strict mode by default.

Do not hide the active mode, contract, policy, or plugin effects from the user.

## Product claim

```txt
Arcana ships the operating layer. Users own their autonomy model.
```
