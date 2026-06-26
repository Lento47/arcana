# Autonomy Modes

Arcana should not block the user immediately by default.

The system should support progressive autonomy modes so the same operating layer can feel fast for solo developers, careful for security work, and strict for enterprise environments.

## One-line definition

```txt
Autonomy Modes control how strongly Arcana observes, warns, asks, blocks, or enforces during autonomous work.
```

## Why this matters

Governance that blocks everything becomes unusable.

Autonomy that allows everything becomes unsafe.

Arcana needs a gradient:

```txt
fast when the user wants speed
careful when the user wants review
strict when the work is risky
locked when the environment demands control
```

The user should feel that Arcana is willing to help, not eager to interrupt.

## Core principle

```txt
Arcana should start by making risk visible before it makes risk blocking.
```

Blocking is a mode, not the default personality.

## Mode ladder

```txt
observe → advise → ask → enforce → locked
```

| Mode | Behavior | Best for |
|---|---|---|
| Observe | Records everything, blocks nothing. | exploration, solo prototyping, low-risk work |
| Advise | Warns and suggests safer paths, but allows progress. | normal development |
| Ask | Requests confirmation for risky actions. | security-sensitive repos, dependency changes, destructive commands |
| Enforce | Blocks policy violations and requires contract satisfaction. | teams, production-adjacent work, enterprise workflows |
| Locked | Only pre-approved actions, tools, models, and scopes are allowed. | regulated environments, airgapped mode, high-trust enterprise |

## Mode details

### Observe

Arcana watches and records.

Behavior:

```txt
no blocking
no approval prompts
records commands, route decisions, context, diffs, and verification if available
marks risks after the fact
creates low-friction capsules
```

Use when:

```txt
user is exploring
repo is disposable
task is read-only
speed matters more than control
```

Product feel:

```txt
Arcana is quiet but aware.
```

### Advise

Arcana warns without stopping the user.

Behavior:

```txt
shows risk labels
suggests safer alternatives
warns about missing tests or broad file edits
records warnings into the capsule
continues unless the user cancels
```

Use when:

```txt
normal coding
local-only work
early feature development
solo founder mode
```

Product feel:

```txt
Arcana is helpful, not bureaucratic.
```

### Ask

Arcana asks before risky transitions.

Behavior:

```txt
asks before dependency additions
asks before destructive commands
asks before external data exposure
asks before editing files outside contract scope
asks before high-cost model routes
```

Use when:

```txt
important repo
security work
shared codebase
unknown agent action
```

Product feel:

```txt
Arcana asks at the edge of risk.
```

### Enforce

Arcana blocks violations.

Behavior:

```txt
blocks forbidden actions
requires contract validation
requires verification for proven success
blocks unapproved provider routes
blocks hidden memory influence
requires explicit overrides
```

Use when:

```txt
team workflows
production-adjacent changes
enterprise beta
security-sensitive environments
```

Product feel:

```txt
Arcana is strict because the work demands it.
```

### Locked

Arcana allows only pre-approved paths.

Behavior:

```txt
only approved tools
only approved models
only approved contracts
only approved workspaces
no external providers unless allowlisted
no write actions without signed policy
no hidden network access
```

Use when:

```txt
regulated workflows
airgapped deployments
customer environments
red-team controlled labs
highly sensitive repos
```

Product feel:

```txt
Arcana is a controlled execution environment.
```

## Default mode recommendation

Arcana should default to:

```txt
Advise
```

Reason:

```txt
Observe may feel too invisible.
Ask may feel too interruptive.
Enforce may feel too heavy.
Advise gives immediate value without blocking user flow.
```

## Mode switching

Potential commands:

```sh
arcana mode observe
arcana mode advise
arcana mode ask
arcana mode enforce
arcana mode locked
arcana mode status
arcana mode explain
```

Potential run-level overrides:

```sh
arcana run "fix auth tests" --mode advise
arcana run "audit auth module" --mode ask
arcana run --contract release.contract.json --mode enforce
```

Potential profile defaults:

```sh
arcana profile set founder-operator --mode advise
arcana profile set security-researcher --mode ask
arcana profile set enterprise-admin --mode enforce
```

## Interaction with Agent Contracts

Contracts should behave differently per mode.

| Contract event | Observe | Advise | Ask | Enforce | Locked |
|---|---|---|---|---|---|
| Missing contract | continue | suggest contract | ask to draft | block unless override | block |
| Scope drift | record | warn | ask | block | block |
| Forbidden action | record | warn strongly | ask with risk | block | block |
| Missing verification | mark unproven | warn | ask to verify | block proven-success claim | block completion |
| Dependency added | record | warn | ask | block unless justified | block unless allowlisted |

## Interaction with Run Capsules

All modes should produce capsules.

Difference by mode:

```txt
Observe:
  capsule records facts after the run

Advise:
  capsule records warnings and ignored advice

Ask:
  capsule records approvals and confirmations

Enforce:
  capsule records blocked actions and policy decisions

Locked:
  capsule records allowed path, denied path, and signed policy basis
```

## Interaction with Verification Records

Verification should not always block progress.

```txt
Observe:
  verification is optional and marked if missing

Advise:
  missing verification produces warning

Ask:
  missing verification asks before final success claim

Enforce:
  required verification blocks proven-success status

Locked:
  required verification blocks completion state
```

## Interaction with Route Decisions

Routing should respect mode intensity.

```txt
Observe:
  route is recorded

Advise:
  route is explained if risky

Ask:
  user confirms external/high-cost/sensitive routes

Enforce:
  policy blocks disallowed providers

Locked:
  only allowlisted providers and local runtimes
```

## Clean willingness model

Arcana should feel willing, sharp, and controlled.

The personality is:

```txt
I will help you move fast.
I will show risk clearly.
I will only stop you when the selected mode says stopping is part of the job.
```

Bad behavior:

```txt
blocking every action
asking for confirmation too early
hiding risk until after damage
using vague warnings
turning governance into bureaucracy
```

Good behavior:

```txt
show risk inline
suggest a safe path
continue when allowed
ask only at risk boundaries
block only when configured
record everything cleanly
```

## Example UX

### Advise mode

```txt
Arcana: This adds a new dependency and changes bun.lock.
Risk: medium
Advice: justify the dependency or reuse existing glob tooling.
Continuing because mode=advise.
```

### Ask mode

```txt
Arcana: This command deletes files outside the contract scope.
Risk: high
Proceed? [y/N]
```

### Enforce mode

```txt
Arcana: Blocked.
Reason: contract forbids dependency additions.
Options:
  1. revise contract
  2. run in ask mode
  3. remove dependency change
```

### Locked mode

```txt
Arcana: Denied by locked policy.
Reason: provider is not allowlisted for this workspace.
```

## QA checklist

An Autonomy Mode design is acceptable only if it answers:

```txt
What does this mode observe?
What does it warn about?
What does it ask about?
What does it block?
What does it record?
How does the user override?
How does the mode affect contracts?
How does the mode affect verification?
How does the mode affect routing?
How does the mode avoid annoying the user?
```

## Product claim

```txt
Arcana governance is progressive: permissive when you want speed, strict when the work demands control.
```
