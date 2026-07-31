# Progressive Mode Examples

This document shows how Arcana should behave across autonomy modes.

The goal is to make the system feel sharp and willing instead of obstructive.

## Core behavior

```txt
Same task.
Different mode.
Different level of intervention.
Same clean recording.
```

Arcana should always record clearly.
It should only interrupt or block according to the selected mode.

## Example 1: read-only code explanation

Task:

```txt
Explain how authentication works in this repo.
```

Risk:

```txt
low
```

### Observe

```txt
Arcana reads files, answers, and records a capsule.
No warning.
No prompt.
```

### Advise

```txt
Arcana reads files, answers, and records a capsule.
If context is incomplete, it says so.
No blocking.
```

### Ask

```txt
Arcana does not ask because no risky action is happening.
```

### Enforce

```txt
Arcana allows read-only inspection if policy permits repo reads.
```

### Locked

```txt
Arcana allows only files inside approved workspace/scope.
```

Expected feel:

```txt
Fast. No bureaucracy.
```

## Example 2: dependency addition

Task:

```txt
Add a package to parse cron expressions.
```

Risk:

```txt
medium
```

### Observe

```txt
Arcana allows the change and records dependency addition.
Capsule status: completed, dependency intent unreviewed.
```

### Advise

```txt
Arcana: This adds a dependency and changes the lockfile.
Risk: medium.
Advice: justify why this package is needed and check existing alternatives.
Continuing because mode=advise.
```

### Ask

```txt
Arcana: This adds a new dependency and changes bun.lock.
Risk: medium.
Proceed? [y/N]
```

### Enforce

```txt
Arcana: Blocked by mode=enforce.
Reason: contract does not allow dependency additions.
Recovery:
  1. revise contract to allow dependency additions
  2. remove dependency change
  3. run in ask mode if workspace policy allows
```

### Locked

```txt
Arcana: Denied by locked policy.
Reason: package is not allowlisted.
```

Expected feel:

```txt
Helpful in normal mode. Strict only when configured.
```

## Example 3: destructive command

Task:

```txt
Clean generated files.
```

Command:

```sh
rm -rf dist .cache
```

Risk:

```txt
medium/high depending scope
```

### Observe

```txt
Arcana records command and exit code.
No prompt.
```

### Advise

```txt
Arcana: This removes directories: dist, .cache.
Risk: medium.
Advice: confirm these are generated paths.
Continuing because mode=advise.
```

### Ask

```txt
Arcana: This command deletes directories.
Paths: dist, .cache
Proceed? [y/N]
```

### Enforce

```txt
Arcana allows only if paths are inside contract-approved cleanup scope.
Otherwise blocked with recovery message.
```

### Locked

```txt
Arcana blocks unless the exact cleanup command or path pattern is allowlisted.
```

Expected feel:

```txt
Risk-aware but not paranoid.
```

## Example 4: external model route

Task:

```txt
Review this proprietary authentication module.
```

Risk:

```txt
high if code leaves machine
```

### Observe

```txt
Arcana records selected provider and data exposure.
No prompt.
```

### Advise

```txt
Arcana: This route may send code context to an external provider.
Risk: high data exposure.
Advice: use local-first or no-training policy.
Continuing because mode=advise.
```

### Ask

```txt
Arcana: This task may expose proprietary code to an external provider.
Selected route: external coding model.
Proceed? [y/N]
```

### Enforce

```txt
Arcana blocks if route policy forbids external code exposure.
```

### Locked

```txt
Arcana allows only approved local/private provider routes.
```

Expected feel:

```txt
Sovereignty is clear, not hidden.
```

## Example 5: missing verification

Task:

```txt
Fix flaky tests.
```

Agent changes files but does not run tests.

### Observe

```txt
Capsule status: completed.
Verification: missing.
Proof status: unproven.
```

### Advise

```txt
Arcana: Changes completed, but tests were not run.
Status: unproven.
Advice: run verification before trusting this patch.
```

### Ask

```txt
Arcana: Required verification is missing.
Run tests now? [Y/n]
```

### Enforce

```txt
Arcana: Cannot mark run as proven.
Reason: required verification did not run.
Status: unproven until verification passes.
```

### Locked

```txt
Arcana blocks completion if required verification is not performed.
```

Expected feel:

```txt
Honest proof language, not fake success.
```

## Example 6: scope drift

Contract:

```txt
Allowed write scope:
  packages/server/src/routes/**
```

Agent tries to edit:

```txt
packages/core/src/auth/session.ts
```

### Observe

```txt
Arcana records scope drift.
No block.
```

### Advise

```txt
Arcana: Edit is outside declared scope.
Risk: medium.
Continuing because mode=advise.
```

### Ask

```txt
Arcana: This edit is outside contract scope.
Proceed and record override? [y/N]
```

### Enforce

```txt
Arcana: Blocked by contract scope.
Recovery:
  1. revise contract scope
  2. keep edits inside packages/server/src/routes/**
```

### Locked

```txt
Arcana denies edit. Scope changes require approved contract update.
```

Expected feel:

```txt
Clear boundary, clean recovery.
```

## Example 7: memory influence

Memory:

```txt
Project uses Bun.
```

Source:

```txt
package.json packageManager field
```

### Observe

```txt
Arcana may use memory and records memory reference in capsule.
```

### Advise

```txt
Arcana shows memory source if it influences a suggestion.
```

### Ask

```txt
Arcana asks before using low-confidence or inferred memory for important decisions.
```

### Enforce

```txt
Arcana only uses sourced active memory receipts.
```

### Locked

```txt
Arcana only uses memory receipts approved for the workspace/profile.
```

Expected feel:

```txt
Memory is useful but never spooky.
```

## User-facing principle

```txt
Arcana should not say no first.
Arcana should say: here is the risk, here is the clean path, here is what your mode allows.
```

## Acceptance criteria

These examples are acceptable only if the UX preserves three things:

```txt
willingness:
  Arcana helps the user move forward.

clarity:
  Risk and proof status are explicit.

control:
  The selected mode decides whether to continue, ask, block, or lock.
```
