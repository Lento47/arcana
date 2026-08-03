# Arcana Contracts

This file documents the proposed autonomy model for this repository.

It is human-readable guidance for Arcana's Agent Operating Layer. Machine-readable examples live under `.arcana/` in this branch.

## Default Mode

Default mode: `advise`

Arcana should warn about risk and continue by default unless a run explicitly selects `ask`, `enforce`, or `locked` mode.

## Available Contract Types

Planned contract types:

- `safe-refactor`
- `dependency-change`
- `security-review`
- `docs-update`
- `release-check`

## Safe Work

Agents may:

- read repository files
- summarize code
- update documentation
- propose architecture changes
- modify tests within active contract scope
- run local verification commands
- create Run Capsules and Verification Records

## Risky Work

Agents should warn or ask before:

- adding dependencies
- changing lockfiles
- editing CI/CD files
- deleting files
- sending code context to external providers
- modifying authentication, billing, licensing, release, or deployment code
- using low-confidence memory for important decisions

## Forbidden Work

Agents may not silently:

- access secrets
- publish packages
- deploy production changes
- push directly to protected branches
- delete tests to make verification pass
- disable security checks
- use unapproved external providers in locked mode

## Verification Requirements

Code-changing runs should record verification status.

Required for proven success:

- relevant tests pass
- typecheck passes when applicable
- contract constraints are satisfied
- skipped checks are explicitly marked

If verification is missing, Arcana should mark the result as `unproven`, not `successful`.

## Dependency Rules

Dependency additions require intent.

Every dependency addition should answer:

- why this dependency?
- why not existing code or an existing package?
- what license/maintenance risk exists?
- what transitive risk exists?
- does it change package size or runtime behavior?

## Model Routing Rules

Default routing behavior:

- local-first for read-only summaries and low-risk analysis
- approved external route for complex coding tasks when policy allows
- ask before external routing for sensitive files in `ask` mode
- block unapproved providers in `enforce` or `locked` mode

## Memory and Context Rules

Memory must have receipts.

Context should include provenance, trust, staleness, and scope when used for important decisions.

## Override Rules

In `observe` mode, Arcana records without blocking.

In `advise` mode, Arcana warns and continues.

In `ask` mode, Arcana confirms at risk boundaries.

In `enforce` mode, Arcana blocks policy and contract violations.

In `locked` mode, Arcana allows only pre-approved paths.

## Current Status

This branch documents the model and templates. Runtime implementation is not added in this branch.
