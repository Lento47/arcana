# Resolution and Recovery

Arcana should never stop at a bare denial.

When Arcana warns, asks, blocks, or denies, it should explain the reason and show approved paths forward.

## One-line definition

```txt
Resolution and recovery is the UX layer that turns control decisions into clear next steps.
```

## Core UX rule

```txt
Arcana should not say no first.
Arcana should say: here is the risk, here is the clean path, here is what your mode allows.
```

## Message anatomy

Every warning, confirmation, or block should include:

```txt
status
risk
reason
mode
policy or contract source
approved next options
capsule record
```

## Warning template

```txt
Arcana: Warning.
Risk: medium.
Reason: this changes package.json and bun.lock.
Mode: advise, so Arcana will continue.
Advice: record dependency intent or reuse an existing dependency.
Capsule: warning will be recorded.
```

## Confirmation template

```txt
Arcana: Confirmation required.
Risk: high.
Reason: command affects files outside the declared scope.
Mode: ask.
Proceed and record this decision? [y/N]
```

## Block template

```txt
Arcana: Blocked.
Reason: contract forbids dependency additions.
Mode: enforce.
Contract: safe-refactor.
Approved next options:
  1. remove dependency change
  2. switch to dependency-change contract
  3. revise contract if workspace policy allows
Capsule: blocked action recorded.
```

## Locked denial template

```txt
Arcana: Denied by locked policy.
Reason: provider is not allowlisted.
Policy: locked-local.
Approved next options:
  1. use an approved local route
  2. request a policy update outside this run
Capsule: denied route recorded.
```

## Proof language

Do not use vague success.

Use precise status:

```txt
completed:
  actions finished

proven:
  declared verification passed

unproven:
  verification is missing or incomplete

failed:
  verification failed

blocked:
  mode or policy prevented action

inconclusive:
  verification ran but did not prove the claim
```

## Approved change types

```txt
mode change:
  run this task in a different autonomy mode when policy allows

contract change:
  revise allowed or forbidden scope through an explicit contract update

route change:
  select a different approved provider or model path

verification decision:
  run verification now or keep the result marked unproven

policy change:
  handled outside the run through the workspace's approved process
```

## Decision recording

Every approved change should record:

```txt
who or what requested it
which mode was active
what risk was acknowledged
which policy or contract was updated
what approved option was selected
whether the result remains proven or unproven
```

## Recovery examples

### Dependency blocked

```txt
Blocked by mode=enforce.
Reason: safe-refactor forbids dependency additions.
Approved next options:
  1. use existing dependency
  2. switch to dependency-change contract
  3. revise contract and rerun
```

### Missing verification

```txt
Status: unproven.
Reason: required tests did not run.
Approved next options:
  1. run required verification
  2. keep capsule as unproven
  3. request human review
```

### External provider denied

```txt
Denied by routing policy.
Reason: selected provider would expose code externally.
Approved next options:
  1. use local-first route
  2. use approved private provider
  3. request policy update
```

### Scope drift

```txt
Blocked by contract scope.
Reason: attempted edit outside allowed write paths.
Approved next options:
  1. keep edits inside declared scope
  2. revise contract scope
  3. split into a new contract
```

## Bad UX to avoid

```txt
Denied.
Invalid.
Operation failed.
Policy violation.
Cannot continue.
```

These are weak because they give no path forward.

## Good UX principles

```txt
specific reason
clear risk
mode-aware behavior
approved next step
capsule recording
honest proof state
```

## Product claim

```txt
Arcana control should feel like a clean path forward, not a wall.
```
