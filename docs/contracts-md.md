# CONTRACTS.md Convention

`CONTRACTS.md` is the human-readable autonomy guide for a repository.

It explains how Arcana should behave in the project, which contracts exist, which mode is expected, and what kinds of agent work are safe or risky.

## One-line definition

```txt
CONTRACTS.md explains the repo's autonomy rules in language humans can review.
```

## Why it exists

Machine-readable contracts are powerful, but users and teams need a readable file that explains the intent.

`CONTRACTS.md` should answer:

```txt
What can agents do here?
What should they avoid?
Which contracts are available?
Which mode is default?
What needs verification?
What requires confirmation?
What is never allowed?
```

## Relationship to `.arcana/contracts`

`CONTRACTS.md` is not the only source of truth.

```txt
CONTRACTS.md
  human-readable explanation

.arcana/contracts/*.contract.json
  machine-readable contracts

.arcana/modes.json
  selected default strictness

.arcana/policies/*.policy.json
  workspace-level rules
```

Arcana should eventually be able to cross-check these files and warn if the prose and machine contracts disagree.

## Recommended sections

```md
# Arcana Contracts

## Default Mode

## Available Contracts

## Safe Work

## Risky Work

## Forbidden Work

## Verification Requirements

## Dependency Rules

## Model Routing Rules

## Memory and Context Rules

## Override Rules
```

## Example CONTRACTS.md

```md
# Arcana Contracts

This repository uses Arcana to run autonomous work with progressive control.

## Default Mode

Default mode: advise

Arcana should warn about risk and continue by default unless a run explicitly selects ask, enforce, or locked mode.

## Available Contracts

- safe-refactor
- dependency-change
- security-review
- docs-update
- release-check

## Safe Work

Agents may:

- read repository files
- summarize code
- update documentation
- modify tests within the active contract scope
- run local verification commands

## Risky Work

Agents should warn or ask before:

- adding dependencies
- changing lockfiles
- editing CI/CD files
- deleting files
- sending code context to external providers
- modifying authentication, billing, or deployment code

## Forbidden Work

Agents may not:

- access secrets
- push directly to main
- publish packages
- deploy production changes
- delete tests to make verification pass
- disable security checks

## Verification Requirements

Code-changing runs should record verification status.

Required for proven success:

- typecheck passes
- relevant tests pass
- contract constraints are satisfied

If verification is missing, Arcana should mark the result as unproven.

## Dependency Rules

Dependency additions require a dependency-change contract or confirmation in ask mode.

Every dependency addition should include intent:

- why this dependency?
- why not existing code?
- license/maintenance risk?
- transitive risk?

## Model Routing Rules

Default routing policy: local-first for read-only summaries, approved external model for complex coding tasks.

External providers should be confirmed for sensitive files in ask mode.

## Memory and Context Rules

Memory must have receipts.

Context should include provenance, trust, staleness, and scope when used for important decisions.

## Override Rules

In advise mode, Arcana may continue with warnings.

In ask mode, Arcana should request confirmation at risk boundaries.

In enforce or locked mode, Arcana should block violations and show recovery options.
```

## QA checklist

A `CONTRACTS.md` file is good if it answers:

```txt
What mode is default?
Which contracts exist?
What is safe?
What is risky?
What is forbidden?
What must be verified?
How are dependencies handled?
How are models routed?
How is memory allowed?
How can users override?
```

## Failure modes

### Failure mode: prose-only governance

Risk:

```txt
The file says rules exist, but Arcana cannot enforce or validate them.
```

Mitigation:

```txt
Pair CONTRACTS.md with .arcana/contracts/*.contract.json.
```

### Failure mode: too strict by default

Risk:

```txt
Users remove Arcana because it interrupts normal work.
```

Mitigation:

```txt
Default to advise unless the repo is enterprise/regulated.
```

### Failure mode: stale rules

Risk:

```txt
CONTRACTS.md says one thing, .arcana contracts say another.
```

Mitigation:

```txt
Eventually add arcana contracts check.
```

## Product claim

```txt
CONTRACTS.md lets every repo explain its autonomy model before agents act.
```
