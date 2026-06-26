# Implementation Strengthening Plan

This document turns the Agent Operating Layer concept into an implementation-ready plan without adding runtime code in this branch.

The goal is clean, sharp willingness:

```txt
Arcana should help immediately, show risk clearly, and only block when the user-selected mode requires it.
```

## Implementation principle

Do not implement governance as a wall.

Implement it as a gradient:

```txt
record → warn → ask → block → lock
```

This maps to Autonomy Modes:

```txt
observe → advise → ask → enforce → locked
```

## Minimal viable implementation loop

The first working version should not try to implement every object fully.

It should implement the smallest loop that proves the model:

```txt
1. user starts a run
2. Arcana determines autonomy mode
3. Arcana records a lightweight capsule
4. Arcana records route decision
5. Arcana records command/tool/file events
6. Arcana records verification status if available
7. Arcana labels result as proven, unproven, failed, or blocked
```

This creates immediate value without blocking the user.

## Implementation levels

### Level 0: Shadow mode

Goal:

```txt
Record without changing behavior.
```

Behavior:

```txt
no blocking
no new prompts
no contract requirement
capsule created silently
route decisions recorded when possible
verification marked as missing if not run
```

Why:

```txt
Allows Arcana to collect structure before enforcement exists.
```

Exit criteria:

```txt
runs produce inspectable capsule summaries
no user flow regression
no new required decisions
```

### Level 1: Advisory mode

Goal:

```txt
Show value through warnings and summaries.
```

Behavior:

```txt
risk labels shown inline
missing verification shown as unproven
dependency changes highlighted
external route decisions explained
contract suggestions offered but not required
```

Why:

```txt
This is likely the best first user-facing version.
```

Exit criteria:

```txt
user can understand risk without being blocked
capsule summary is useful after a run
warnings are specific and actionable
```

### Level 2: Confirmation mode

Goal:

```txt
Ask only at risk boundaries.
```

Behavior:

```txt
confirm destructive commands
confirm dependency additions
confirm external provider use for sensitive context
confirm writes outside declared scope
confirm high-cost route escalation
```

Why:

```txt
Adds control without making normal work slow.
```

Exit criteria:

```txt
prompts happen rarely and only for meaningful risk
all confirmations are recorded in capsule
user can override intentionally
```

### Level 3: Enforcement mode

Goal:

```txt
Make contracts and policies enforceable.
```

Behavior:

```txt
forbidden actions are blocked
contract scope is enforced
required verification gates proven success
route policies block disallowed providers
memory/context influence must be visible
```

Why:

```txt
This is the enterprise beta foundation.
```

Exit criteria:

```txt
contract violations are reliably detected
blocked actions include clear recovery paths
users can revise contract instead of fighting the system
```

### Level 4: Locked mode

Goal:

```txt
Controlled execution for sensitive environments.
```

Behavior:

```txt
only allowlisted tools
only allowlisted providers
only signed or approved contracts
only approved workspaces
strict local/external data policy
no silent overrides
```

Why:

```txt
This supports high-trust enterprise, regulated, and airgapped environments.
```

Exit criteria:

```txt
policy is deterministic
blocked actions are explainable
capsules show policy basis
no accidental network/provider escape
```

## Progressive adoption path

Arcana should not require users to understand every primitive on day one.

Recommended rollout:

```txt
Phase 1:
  capsules in shadow mode

Phase 2:
  advisory risk labels and unproven/proven status

Phase 3:
  optional contracts for selected runs

Phase 4:
  ask mode for risky work

Phase 5:
  enforce mode for teams/workspaces

Phase 6:
  locked mode for enterprise/sensitive deployments
```

## UX rule: never block without recovery

Every block must answer:

```txt
what happened?
why was it blocked?
which mode/policy caused it?
what can the user do next?
```

Bad block:

```txt
Denied.
```

Good block:

```txt
Blocked by mode=enforce.
Reason: contract forbids new dependencies.
Recovery:
  1. remove dependency change
  2. revise contract to allow this package
  3. rerun in ask mode if allowed by workspace policy
```

## UX rule: warnings must be specific

Bad warning:

```txt
Risky action.
```

Good warning:

```txt
This changes package.json and bun.lock.
Risk: dependency surface changed.
Advice: justify the package or reuse an existing dependency.
Continuing because mode=advise.
```

## UX rule: proof language must be honest

Arcana should distinguish status clearly.

```txt
completed:
  agent finished actions, but proof may be missing

proven:
  declared verification passed

unproven:
  no verification or incomplete verification

failed:
  verification failed

blocked:
  mode/policy prevented action

inconclusive:
  checks ran but did not prove the claim
```

Never display `success` if required verification did not run.

## Implementation objects by level

| Object | Level 0 | Level 1 | Level 2 | Level 3 | Level 4 |
|---|---:|---:|---:|---:|---:|
| Run Capsule | lightweight | visible summary | approvals | policy blocks | signed/strict record |
| Agent Contract | absent/implicit | suggested | optional | required for enforce | required and approved |
| Route Decision | record selected route | explain risky routes | confirm risky routes | enforce policy | allowlist only |
| Verification Record | missing/pass/fail | proven/unproven labels | ask to verify | gate proven success | gate completion |
| Context Source | basic refs | trust/stale labels | confirm risky context | require provenance | allowlisted context only |
| Memory Receipt | no write or shadow write | proposed receipts | confirm durable memory | require source/scope | strict memory policy |

## Data model priority

Implementation should start with append-only event records, not perfect schemas.

Recommended first records:

```txt
run.started
mode.selected
route.selected
command.started
command.completed
tool.started
tool.completed
file.changed
verification.recorded
risk.warned
approval.requested
approval.granted
policy.blocked
run.completed
```

Then derive objects:

```txt
Run Capsule = projection over run events
Verification Record = projection over verification events
Route Decision = projection over route events
Memory Receipt = promoted durable fact
Context Source = referenced input metadata
```

This avoids overdesigning a database too early.

## Sharp willingness behavior

Arcana should behave like this:

```txt
I can do it.
Here is the risk.
Here is the clean path.
I will continue unless your selected mode says I must ask or block.
```

Examples:

### Low-risk read-only task

```txt
Mode: advise
Action: read files and summarize
Arcana: records capsule, no interruption.
```

### Medium-risk dependency addition

```txt
Mode: advise
Arcana: warns, records dependency intent, continues.

Mode: ask
Arcana: asks for confirmation.

Mode: enforce
Arcana: blocks unless contract allows dependency addition.
```

### High-risk destructive command

```txt
Mode: observe
Arcana: records risk.

Mode: advise
Arcana: strongly warns.

Mode: ask
Arcana: asks.

Mode: enforce/locked
Arcana: blocks unless explicitly allowed.
```

## Implementation acceptance criteria

Before calling this working, Arcana should support:

```txt
1. mode selection per run
2. mode status visible to user
3. lightweight capsule summary after run
4. route decision summary
5. verification status: proven/unproven/failed/skipped/inconclusive
6. risk warnings in advise mode
7. confirmations in ask mode
8. policy block with recovery message in enforce mode
9. no blocking in observe/advise mode
10. no vague success labels without proof
```

## What not to build first

Do not start with:

```txt
full marketplace
full multi-agent arena
full replay engine
perfect database schema
complex enterprise dashboard
signed policy system
public capsule sharing
```

Start with:

```txt
mode-aware run recording
clear risk labels
honest proof states
small capsule summaries
clean recovery messages
```

## Final implementation thesis

```txt
Arcana should work before it enforces.

First it records.
Then it advises.
Then it asks.
Then it enforces.
Then it locks down.

The user chooses the level.
```
